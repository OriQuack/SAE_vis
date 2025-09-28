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

from ..models.common import Filters, MetricType
from ..models.threshold import ThresholdStructure
from ..models.responses import (
    FilterOptionsResponse, HistogramResponse, SankeyResponse,
    ComparisonResponse, FeatureResponse
)
from .data_constants import *
from .classification import ClassificationEngine

from ..models.threshold import ThresholdStructure

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
        threshold_tree: Optional[ThresholdStructure] = None,
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
            logger.debug(f"Applying node-specific filtering for node: {node_id}")

            # Use the v2 classification engine for filtering
            # Developer option: Change sort_mode to 'within_parent' for grouped sorting
            engine = ClassificationEngine(sort_mode='within_parent')
            filtered_df = engine.filter_features_for_node(filtered_df, threshold_tree, node_id)

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
        threshold_data: Union[ThresholdStructure, Dict[str, Any]],
        use_v2: Optional[bool] = None
    ) -> SankeyResponse:
        """
        Generate Sankey diagram data using the v2 threshold system.

        This method uses the new flexible threshold system with the v2
        classification engine for feature categorization and Sankey generation.

        Args:
            filters: Filter criteria
            threshold_data: ThresholdStructure as dict or ThresholdStructure object
            use_v2: Legacy parameter (ignored, always uses v2)

        Returns:
            SankeyResponse with nodes, links, and metadata
        """
        if not self.is_ready():
            raise RuntimeError("DataService not ready")


        # Apply filters and collect data
        filtered_df = self._apply_filters(self._df_lazy, filters).collect()

        if len(filtered_df) == 0:
            raise ValueError("No data available after applying filters")

        return await self._get_sankey_data_impl(filtered_df, filters, threshold_data)

    async def _get_sankey_data_impl(
        self,
        filtered_df: pl.DataFrame,
        filters: Filters,
        threshold_data: Union[Dict[str, Any], ThresholdStructure]
    ) -> SankeyResponse:
        """
        Internal implementation using v2 classification engine.
        """
        # Convert to ThresholdStructure if needed
        if isinstance(threshold_data, dict):
            threshold_structure = ThresholdStructure.from_dict(threshold_data)
        else:
            threshold_structure = threshold_data

        # Use v2 classification engine
        # Developer option: Change sort_mode to 'within_parent' for grouped sorting
        engine = ClassificationEngine(sort_mode='within_parent')
        classified_df = engine.classify_features(filtered_df, threshold_structure)

        # Build Sankey nodes and links
        nodes, links = engine.build_sankey_data(classified_df, threshold_structure)

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

        # Extract actual threshold values from the structure
        applied_thresholds = {}
        for node in threshold_structure.nodes:
            if hasattr(node, 'split_rule') and node.split_rule:
                if hasattr(node.split_rule, 'metric') and hasattr(node.split_rule, 'thresholds'):
                    # Range split rule: extract metric thresholds
                    metric = node.split_rule.metric
                    thresholds = node.split_rule.thresholds
                    if thresholds:
                        if len(thresholds) == 1:
                            applied_thresholds[metric] = float(thresholds[0])
                        else:
                            for i, threshold in enumerate(thresholds):
                                applied_thresholds[f"{metric}_{i}"] = float(threshold)
                elif hasattr(node.split_rule, 'conditions') and node.split_rule.conditions:
                    # Pattern split rule: extract score thresholds
                    conditions = node.split_rule.conditions
                    for metric_name, pattern_condition in conditions.items():
                        # Extract threshold from PatternCondition object
                        if hasattr(pattern_condition, 'threshold') and pattern_condition.threshold is not None:
                            applied_thresholds[metric_name] = float(pattern_condition.threshold)
                        elif hasattr(pattern_condition, 'value') and pattern_condition.value is not None:
                            applied_thresholds[metric_name] = float(pattern_condition.value)

        metadata = {
            "total_features": filtered_df.select(pl.col("feature_id")).n_unique(),  # Count unique features, not rows
            "applied_filters": applied_filters,
            "applied_thresholds": applied_thresholds
        }

        return SankeyResponse(
            nodes=nodes,
            links=links,
            metadata=metadata
        )

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