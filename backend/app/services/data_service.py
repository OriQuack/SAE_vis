"""
High-performance data service using Polars for SAE feature analysis.

This module provides the main DataService class that handles data loading,
filtering, and visualization data generation for the SAE feature analysis project.
"""

import polars as pl
import numpy as np
import asyncio
import logging
from typing import Dict, List, Optional, Union, Any
from pathlib import Path

# Enable Polars string cache for categorical operations
pl.enable_string_cache()

from ..models.common import Filters, MetricType, ThresholdTree
from ..models.responses import (
    FilterOptionsResponse, HistogramResponse, SankeyResponse,
    ComparisonResponse, FeatureResponse
)
from .data_constants import *
from .utils import extract_thresholds_from_tree, build_sankey_nodes_and_links, filter_dataframe_for_node

logger = logging.getLogger(__name__)


class DataService:
    """High-performance data service using Polars for Parquet operations."""

    def __init__(self, data_path: str = "../data"):
        self.data_path = Path(data_path)
        self.master_file = self.data_path / "master" / "feature_analysis.parquet"
        self.detailed_json_dir = self.data_path / "detailed_json"

        # Cache for frequently accessed data
        self._filter_options_cache: Optional[Dict[str, List[str]]] = None
        self._df_lazy: Optional[pl.LazyFrame] = None
        self._ready = False

    async def initialize(self):
        """Initialize the data service with lazy loading."""
        try:
            if not self.master_file.exists():
                raise FileNotFoundError(f"Master parquet file not found: {self.master_file}")

            self._df_lazy = pl.scan_parquet(self.master_file)
            await self._cache_filter_options()
            self._ready = True
            logger.info(f"DataService initialized with {self.master_file}")

        except Exception as e:
            logger.error(f"Failed to initialize DataService: {e}")
            raise

    async def cleanup(self):
        """Clean up resources."""
        self._df_lazy = None
        self._filter_options_cache = None
        self._ready = False

    def is_ready(self) -> bool:
        """Check if the service is ready for queries."""
        return self._ready and self._df_lazy is not None

    async def _cache_filter_options(self):
        """Pre-compute and cache filter options for performance."""
        if self._df_lazy is None:
            raise RuntimeError("DataService not initialized")

        try:
            unique_values = {}
            for col in FILTER_COLUMNS:
                values = (
                    self._df_lazy
                    .select(pl.col(col).unique().sort())
                    .collect()
                    .get_column(col)
                    .to_list()
                )
                unique_values[col] = [v for v in values if v is not None]

            self._filter_options_cache = unique_values

        except Exception as e:
            logger.error(f"Failed to cache filter options: {e}")
            raise

    def _apply_filters(self, lazy_df: pl.LazyFrame, filters: Filters) -> pl.LazyFrame:
        """Apply filters to lazy DataFrame efficiently."""
        conditions = []

        filter_mapping = [
            (filters.sae_id, COL_SAE_ID),
            (filters.explanation_method, COL_EXPLANATION_METHOD),
            (filters.llm_explainer, COL_LLM_EXPLAINER),
            (filters.llm_scorer, COL_LLM_SCORER)
        ]

        for filter_value, column_name in filter_mapping:
            if filter_value:
                conditions.append(pl.col(column_name).is_in(filter_value))

        if conditions:
            combined_condition = conditions[0]
            for condition in conditions[1:]:
                combined_condition = combined_condition & condition
            return lazy_df.filter(combined_condition)

        return lazy_df


    def _classify_features(self, df: pl.DataFrame, threshold_tree: ThresholdTree) -> pl.DataFrame:
        """Classify features using simplified threshold system - single pass approach."""

        # Extract thresholds for all features
        threshold_columns = extract_thresholds_from_tree(df, threshold_tree)

        # Add threshold columns to DataFrame
        df_with_thresholds = df.with_columns([
            pl.Series(name, values) for name, values in threshold_columns.items()
        ])

        # Apply all classifications in a single pass
        return df_with_thresholds.with_columns([
            # Stage 1: Feature splitting classification
            pl.when(pl.col(COL_FEATURE_SPLITTING) >= pl.col("feature_splitting_threshold"))
            .then(pl.lit(SPLITTING_TRUE))
            .otherwise(pl.lit(SPLITTING_FALSE))
            .alias(COL_SPLITTING_CATEGORY),

            # Stage 2: Semantic distance classification
            pl.when(pl.col(COL_SEMDIST_MEAN) >= pl.col("semdist_mean_threshold"))
            .then(pl.lit(SEMDIST_HIGH))
            .otherwise(pl.lit(SEMDIST_LOW))
            .alias(COL_SEMDIST_CATEGORY),
        ]).with_columns([
            # Stage 3: Score agreement classification
            (
                (pl.col(COL_SCORE_FUZZ) >= pl.col(COL_THRESHOLD_FUZZ)).cast(pl.Int32) +
                (pl.col(COL_SCORE_SIMULATION) >= pl.col(COL_THRESHOLD_SIMULATION)).cast(pl.Int32) +
                (pl.col(COL_SCORE_DETECTION) >= pl.col(COL_THRESHOLD_DETECTION)).cast(pl.Int32)
            ).alias(COL_HIGH_SCORE_COUNT)
        ]).with_columns([
            # Create final score agreement category
            pl.when(pl.col(COL_HIGH_SCORE_COUNT) == 3)
            .then(pl.lit(AGREE_ALL))
            .when(pl.col(COL_HIGH_SCORE_COUNT) == 2)
            .then(pl.lit(AGREE_2OF3))
            .when(pl.col(COL_HIGH_SCORE_COUNT) == 1)
            .then(pl.lit(AGREE_1OF3))
            .otherwise(pl.lit(AGREE_NONE))
            .alias(COL_SCORE_AGREEMENT)
        ]).drop([
            # Clean up temporary columns
            "feature_splitting_threshold", "semdist_mean_threshold",
            COL_THRESHOLD_FUZZ, COL_THRESHOLD_SIMULATION, COL_THRESHOLD_DETECTION,
            COL_HIGH_SCORE_COUNT
        ])



    async def get_filter_options(self) -> FilterOptionsResponse:
        """Get all available filter options."""
        if not self._filter_options_cache:
            await self._cache_filter_options()
        return FilterOptionsResponse(**self._filter_options_cache)

    @staticmethod
    def calculate_optimal_bins(data_size: int, data_range: float, std_dev: float) -> int:
        """
        Calculate optimal histogram bins using statistical methods.

        Args:
            data_size: Number of data points
            data_range: Range of data (max - min)
            std_dev: Standard deviation of data

        Returns:
            Optimal number of bins (between 5 and 50)
        """
        # Method 1: Sturges' Rule (good for normal distributions)
        sturges = int(np.ceil(np.log2(data_size) + 1))

        # Method 2: Rice Rule (better for larger datasets)
        rice = int(np.ceil(2 * np.cbrt(data_size)))

        # Method 3: Freedman-Diaconis (robust to outliers)
        # Using approximation: IQR ≈ 1.35 * std for normal distribution
        iqr_approx = 1.35 * std_dev
        if iqr_approx > 0 and data_range > 0:
            bin_width = 2 * iqr_approx * (data_size ** (-1/3))
            freedman = int(np.ceil(data_range / bin_width))
        else:
            freedman = sturges

        # Choose based on data characteristics
        if data_size < 30:
            optimal = max(5, sturges)  # Small dataset - conservative
        elif data_size < 100:
            optimal = sturges  # Medium dataset - Sturges works well
        elif data_size < 1000:
            optimal = rice  # Large dataset - Rice provides more detail
        else:
            # Very large dataset - use Freedman if reasonable, else Rice
            optimal = min(freedman, rice) if freedman > 0 else rice

        # Apply constraints (between 5 and 50 bins)
        return max(5, min(50, optimal))

    async def get_histogram_data(
        self,
        filters: Filters,
        metric: MetricType,
        bins: Optional[int] = None,
        threshold_tree: Optional[ThresholdTree] = None,
        node_id: Optional[str] = None
    ) -> HistogramResponse:
        """Generate histogram data for a specific metric, optionally filtered by node."""
        if not self.is_ready():
            raise RuntimeError("DataService not ready")

        try:
            # Apply base filters
            filtered_df = self._apply_filters(self._df_lazy, filters).collect()

            if len(filtered_df) == 0:
                raise ValueError("No data available after applying filters")

            # Apply node-specific filtering if threshold tree and node ID are provided
            if threshold_tree and node_id:
                logger.debug(f"Applying node-specific filtering for node: {node_id}")
                filtered_df = filter_dataframe_for_node(filtered_df, threshold_tree, node_id)

                if len(filtered_df) == 0:
                    raise ValueError(f"No data available for node '{node_id}' after applying thresholds")

            # Extract metric values
            metric_data = filtered_df.select([pl.col(metric.value).alias("metric_value")])
            values = metric_data.get_column("metric_value").drop_nulls().to_numpy()

            if len(values) == 0:
                raise ValueError("No valid values found for the specified metric")

            # Calculate optimal bins if not specified
            if bins is None:
                data_range = float(np.max(values) - np.min(values))
                std_dev = float(np.std(values))
                bins = self.calculate_optimal_bins(len(values), data_range, std_dev)

                logger.info(f"Auto-calculated {bins} bins for {len(values)} data points " +
                           f"(range: {data_range:.3f}, std: {std_dev:.3f})")

            # Calculate histogram and statistics
            counts, bin_edges = np.histogram(values, bins=bins)
            bin_centers = (bin_edges[:-1] + bin_edges[1:]) / 2

            statistics = {
                "min": float(np.min(values)),
                "max": float(np.max(values)),
                "mean": float(np.mean(values)),
                "median": float(np.median(values)),
                "std": float(np.std(values))
            }

            return HistogramResponse(
                metric=metric.value,
                histogram={
                    "bins": bin_centers.tolist(),
                    "counts": counts.tolist(),
                    "bin_edges": bin_edges.tolist()
                },
                statistics=statistics,
                total_features=len(values)
            )

        except Exception as e:
            logger.error(f"Error generating histogram: {e}")
            raise

    async def get_sankey_data(
        self,
        filters: Filters,
        thresholdTree: ThresholdTree
    ) -> SankeyResponse:
        """Generate Sankey diagram data with hierarchical categorization."""
        if not self.is_ready():
            raise RuntimeError("DataService not ready")

        try:
            # Apply filters and collect data
            filtered_df = self._apply_filters(self._df_lazy, filters).collect()

            if len(filtered_df) == 0:
                raise ValueError("No data available after applying filters")

            # Classify features using simplified system
            categorized_df = self._classify_features(filtered_df, thresholdTree)

            # Build Sankey nodes and links
            nodes, links = build_sankey_nodes_and_links(categorized_df)

            # Build metadata
            applied_filters = {}
            if filters.sae_id:
                applied_filters[COL_SAE_ID] = filters.sae_id
            if filters.explanation_method:
                applied_filters[COL_EXPLANATION_METHOD] = filters.explanation_method
            if filters.llm_explainer:
                applied_filters[COL_LLM_EXPLAINER] = filters.llm_explainer
            if filters.llm_scorer:
                applied_filters[COL_LLM_SCORER] = filters.llm_scorer

            # Extract effective thresholds from tree
            effective_thresholds = {}
            if thresholdTree.root.metric and thresholdTree.root.split:
                effective_thresholds[thresholdTree.root.metric] = thresholdTree.root.split['thresholds'][0] if thresholdTree.root.split['thresholds'] else 0.0

            for metric in thresholdTree.metrics:
                if metric not in effective_thresholds:
                    effective_thresholds[metric] = DEFAULT_THRESHOLDS.get(metric, 0.0)

            metadata = {
                "total_features": len(categorized_df),
                "applied_filters": applied_filters,
                "applied_thresholds": effective_thresholds
            }

            return SankeyResponse(
                nodes=nodes,
                links=links,
                metadata=metadata
            )

        except Exception as e:
            logger.error(f"Error generating Sankey data: {e}")
            raise

    async def get_feature_data(
        self,
        feature_id: int,
        sae_id: Optional[str] = None,
        explanation_method: Optional[str] = None,
        llm_explainer: Optional[str] = None,
        llm_scorer: Optional[str] = None
    ) -> FeatureResponse:
        """Get detailed data for a specific feature."""
        if not self.is_ready():
            raise RuntimeError("DataService not ready")

        try:
            conditions = [pl.col(COL_FEATURE_ID) == feature_id]

            filter_params = [
                (sae_id, COL_SAE_ID),
                (explanation_method, COL_EXPLANATION_METHOD),
                (llm_explainer, COL_LLM_EXPLAINER),
                (llm_scorer, COL_LLM_SCORER)
            ]

            for param_value, column_name in filter_params:
                if param_value:
                    conditions.append(pl.col(column_name) == param_value)

            combined_condition = conditions[0]
            for condition in conditions[1:]:
                combined_condition = combined_condition & condition

            result_df = (
                self._df_lazy
                .filter(combined_condition)
                .collect()
            )

            if len(result_df) == 0:
                raise ValueError(f"Feature {feature_id} not found with specified parameters")

            row = result_df.row(0, named=True)

            return FeatureResponse(
                feature_id=row[COL_FEATURE_ID],
                sae_id=row[COL_SAE_ID],
                explanation_method=row[COL_EXPLANATION_METHOD],
                llm_explainer=row[COL_LLM_EXPLAINER],
                llm_scorer=row[COL_LLM_SCORER],
                feature_splitting=row[COL_FEATURE_SPLITTING],
                semdist_mean=row[COL_SEMDIST_MEAN],
                semdist_max=row[COL_SEMDIST_MAX],
                scores={
                    "fuzz": row[COL_SCORE_FUZZ] or 0.0,
                    "simulation": row[COL_SCORE_SIMULATION] or 0.0,
                    "detection": row[COL_SCORE_DETECTION] or 0.0,
                    "embedding": row[COL_SCORE_EMBEDDING] or 0.0
                },
                details_path=row[COL_DETAILS_PATH]
            )

        except Exception as e:
            logger.error(f"Error retrieving feature data: {e}")
            raise