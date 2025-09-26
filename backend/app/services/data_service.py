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

    def _extract_thresholds_from_tree(self, df: pl.DataFrame, threshold_tree: ThresholdTree) -> Dict[str, pl.Series]:
        """Extract threshold values for all features from threshold tree - proper hierarchical traversal."""
        threshold_columns = {}
        num_rows = len(df)

        # Stage 1: Feature splitting - all features use root threshold
        root_threshold = 0.0
        if threshold_tree.root.split and threshold_tree.root.split.get('thresholds'):
            root_threshold = threshold_tree.root.split['thresholds'][0]
        threshold_columns["feature_splitting_threshold"] = pl.Series([root_threshold] * num_rows)

        # Initialize threshold lists for per-feature extraction
        semdist_thresholds = []
        fuzz_thresholds = []
        simulation_thresholds = []
        detection_thresholds = []

        # Process each feature individually to get proper hierarchical thresholds
        for row in df.iter_rows(named=True):
            feature_splitting_val = row.get("feature_splitting", 0.0)
            semdist_mean_val = row.get("semdist_mean", 0.0)

            # Stage 1: Determine splitting branch
            if feature_splitting_val >= root_threshold:
                splitting_branch = "split_true"
            else:
                splitting_branch = "split_false"

            # Find the splitting child node
            splitting_node = None
            if threshold_tree.root.split:
                for child in threshold_tree.root.split.get('children', []):
                    if child.id == splitting_branch:
                        splitting_node = child
                        break

            # Stage 2: Extract semdist threshold
            if splitting_node and splitting_node.split and splitting_node.split.get('thresholds'):
                semdist_threshold = splitting_node.split['thresholds'][0]
            else:
                semdist_threshold = DEFAULT_THRESHOLDS.get("semdist_mean", 0.15)

            semdist_thresholds.append(semdist_threshold)

            # Stage 3: Determine semantic distance branch and extract score thresholds
            if semdist_mean_val >= semdist_threshold:
                semdist_branch = f"{splitting_branch}_semdist_high"
            else:
                semdist_branch = f"{splitting_branch}_semdist_low"

            # Find the semantic distance child node
            semdist_node = None
            if splitting_node and splitting_node.split:
                for child in splitting_node.split.get('children', []):
                    if hasattr(child, 'id') and child.id == semdist_branch:
                        semdist_node = child
                        break
                    elif isinstance(child, dict) and child.get('id') == semdist_branch:
                        # Handle case where children are still dicts instead of ThresholdNode objects
                        from ..models.common import ThresholdNode
                        semdist_node = ThresholdNode(**child)
                        break

            # Extract score thresholds from the semdist node
            if semdist_node:
                logger.debug(f"Feature {row[COL_FEATURE_ID]}: found semdist_node {semdist_node.id}, metric={semdist_node.metric}")

                if (semdist_node.split and
                    semdist_node.split.get('thresholds') and
                    semdist_node.metric == "score_combined"):

                    score_thresholds = semdist_node.split['thresholds']
                    # Expecting [fuzz, simulation, detection] thresholds
                    fuzz_threshold = score_thresholds[0] if len(score_thresholds) > 0 else DEFAULT_THRESHOLDS.get("score_fuzz", 0.8)
                    simulation_threshold = score_thresholds[1] if len(score_thresholds) > 1 else DEFAULT_THRESHOLDS.get("score_simulation", 0.8)
                    detection_threshold = score_thresholds[2] if len(score_thresholds) > 2 else DEFAULT_THRESHOLDS.get("score_detection", 0.8)
                    logger.info(f"✅ Found hierarchical thresholds for feature {row[COL_FEATURE_ID]}: {score_thresholds}")
                else:
                    # Fallback to defaults
                    fuzz_threshold = DEFAULT_THRESHOLDS.get("score_fuzz", 0.8)
                    simulation_threshold = DEFAULT_THRESHOLDS.get("score_simulation", 0.8)
                    detection_threshold = DEFAULT_THRESHOLDS.get("score_detection", 0.8)
                    logger.debug(f"Using default thresholds for feature {row[COL_FEATURE_ID]}: metric={semdist_node.metric}")
            else:
                # Fallback to defaults - no semdist node found
                fuzz_threshold = DEFAULT_THRESHOLDS.get("score_fuzz", 0.8)
                simulation_threshold = DEFAULT_THRESHOLDS.get("score_simulation", 0.8)
                detection_threshold = DEFAULT_THRESHOLDS.get("score_detection", 0.8)
                logger.warning(f"No semdist node found for feature {row[COL_FEATURE_ID]}, branch={semdist_branch}")

            fuzz_thresholds.append(fuzz_threshold)
            simulation_thresholds.append(simulation_threshold)
            detection_thresholds.append(detection_threshold)

        # Build threshold columns
        threshold_columns["semdist_mean_threshold"] = pl.Series(semdist_thresholds)
        threshold_columns[COL_THRESHOLD_FUZZ] = pl.Series(fuzz_thresholds)
        threshold_columns[COL_THRESHOLD_SIMULATION] = pl.Series(simulation_thresholds)
        threshold_columns[COL_THRESHOLD_DETECTION] = pl.Series(detection_thresholds)

        return threshold_columns

    def _classify_features(self, df: pl.DataFrame, threshold_tree: ThresholdTree) -> pl.DataFrame:
        """Classify features using simplified threshold system - single pass approach."""

        # Extract thresholds for all features
        threshold_columns = self._extract_thresholds_from_tree(df, threshold_tree)

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

    def _build_sankey_nodes_and_links(self, categorized_df: pl.DataFrame) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """Build Sankey nodes and links from categorized data - consolidated approach."""
        total_features = len(categorized_df)
        nodes = []
        links = []

        # Stage 0: Root node
        nodes.append({
            "id": NODE_ROOT,
            "name": STAGE_NAMES[STAGE_ROOT],
            "stage": STAGE_ROOT,
            "feature_count": total_features,
            "category": CATEGORY_ROOT
        })

        # Stage 1: Feature splitting
        splitting_counts = (
            categorized_df
            .group_by(COL_SPLITTING_CATEGORY)
            .count()
            .sort(COL_SPLITTING_CATEGORY)
        )

        for row in splitting_counts.iter_rows(named=True):
            category = row[COL_SPLITTING_CATEGORY]
            count = row["count"]
            node_id = f"{NODE_SPLIT_PREFIX}{category}"

            nodes.append({
                "id": node_id,
                "name": f"Feature Splitting: {category.title()}",
                "stage": STAGE_SPLITTING,
                "feature_count": count,
                "category": CATEGORY_FEATURE_SPLITTING
            })

            links.append({
                "source": NODE_ROOT,
                "target": node_id,
                "value": count
            })

        # Stage 2: Semantic distance
        semantic_counts = (
            categorized_df
            .group_by([COL_SPLITTING_CATEGORY, COL_SEMDIST_CATEGORY])
            .count()
            .sort([COL_SPLITTING_CATEGORY, COL_SEMDIST_CATEGORY])
        )

        for row in semantic_counts.iter_rows(named=True):
            split_cat = row[COL_SPLITTING_CATEGORY]
            semdist_cat = row[COL_SEMDIST_CATEGORY]
            count = row["count"]

            source_id = f"{NODE_SPLIT_PREFIX}{split_cat}"
            target_id = f"{NODE_SPLIT_PREFIX}{split_cat}{NODE_SEMDIST_SUFFIX}{semdist_cat}"

            nodes.append({
                "id": target_id,
                "name": f"{semdist_cat.title()} Semantic Distance",
                "stage": STAGE_SEMANTIC,
                "feature_count": count,
                "category": CATEGORY_SEMANTIC_DISTANCE,
                "parent_path": [source_id]
            })

            links.append({
                "source": source_id,
                "target": target_id,
                "value": count
            })

        # Stage 3: Score agreement
        agreement_groups = (
            categorized_df
            .group_by([COL_SPLITTING_CATEGORY, COL_SEMDIST_CATEGORY, COL_SCORE_AGREEMENT])
            .agg([
                pl.count().alias("count"),
                pl.col(COL_FEATURE_ID).alias("feature_ids")
            ])
            .sort([COL_SPLITTING_CATEGORY, COL_SEMDIST_CATEGORY, COL_SCORE_AGREEMENT])
        )

        for row in agreement_groups.iter_rows(named=True):
            split_cat = row[COL_SPLITTING_CATEGORY]
            semdist_cat = row[COL_SEMDIST_CATEGORY]
            agreement_cat = row[COL_SCORE_AGREEMENT]
            count = row["count"]
            feature_ids = row["feature_ids"]

            source_id = f"{NODE_SPLIT_PREFIX}{split_cat}{NODE_SEMDIST_SUFFIX}{semdist_cat}"
            target_id = f"{source_id}_{agreement_cat}"

            nodes.append({
                "id": target_id,
                "name": AGREEMENT_NAMES[agreement_cat],
                "stage": STAGE_AGREEMENT,
                "feature_count": count,
                "category": CATEGORY_SCORE_AGREEMENT,
                "parent_path": [f"{NODE_SPLIT_PREFIX}{split_cat}", f"semdist_{semdist_cat}"],
                "feature_ids": feature_ids
            })

            links.append({
                "source": source_id,
                "target": target_id,
                "value": count
            })

        return nodes, links

    async def get_filter_options(self) -> FilterOptionsResponse:
        """Get all available filter options."""
        if not self._filter_options_cache:
            await self._cache_filter_options()
        return FilterOptionsResponse(**self._filter_options_cache)

    async def get_histogram_data(
        self,
        filters: Filters,
        metric: MetricType,
        bins: int = DEFAULT_HISTOGRAM_BINS
    ) -> HistogramResponse:
        """Generate histogram data for a specific metric."""
        if not self.is_ready():
            raise RuntimeError("DataService not ready")

        try:
            metric_data = (
                self._apply_filters(self._df_lazy, filters)
                .select([pl.col(metric.value).alias("metric_value")])
                .collect()
            )

            if len(metric_data) == 0:
                raise ValueError("No data available after applying filters")

            values = metric_data.get_column("metric_value").drop_nulls().to_numpy()

            if len(values) == 0:
                raise ValueError("No valid values found for the specified metric")

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
            nodes, links = self._build_sankey_nodes_and_links(categorized_df)

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

    async def get_comparison_data(
        self,
        left_filters: Filters,
        left_thresholds: Dict[str, float],
        right_filters: Filters,
        right_thresholds: Dict[str, float]
    ) -> ComparisonResponse:
        """Generate alluvial comparison data between two Sankey configurations."""
        # Implementation for Phase 2
        raise NotImplementedError("Comparison data generation not yet implemented")

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