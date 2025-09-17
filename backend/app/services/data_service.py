import polars as pl
import numpy as np
import json
import asyncio
from typing import Dict, List, Tuple, Optional, Union, Any
from pathlib import Path
import logging

# Enable Polars string cache for categorical operations
pl.enable_string_cache()
from ..models.common import Filters, MetricType
from ..models.responses import (
    FilterOptionsResponse, HistogramResponse, SankeyResponse,
    ComparisonResponse, FeatureResponse
)

logger = logging.getLogger(__name__)

class DataService:
    """High-performance data service using Polars for Parquet operations"""

    def __init__(self, data_path: str = "/home/dohyun/interface/data"):
        self.data_path = Path(data_path)
        self.master_file = self.data_path / "master" / "feature_analysis.parquet"
        self.detailed_json_dir = self.data_path / "detailed_json"
        self.metadata_file = self.data_path / "master" / "feature_analysis.metadata.json"

        # Cache for frequently accessed data
        self._filter_options_cache: Optional[Dict[str, List[str]]] = None
        self._df_lazy: Optional[pl.LazyFrame] = None
        self._ready = False

    async def initialize(self):
        """Initialize the data service with lazy loading"""
        try:
            if not self.master_file.exists():
                raise FileNotFoundError(f"Master parquet file not found: {self.master_file}")

            # Create lazy frame for efficient querying
            self._df_lazy = pl.scan_parquet(self.master_file)

            # Pre-compute and cache filter options
            await self._cache_filter_options()

            self._ready = True
            logger.info(f"DataService initialized with {self.master_file}")

        except Exception as e:
            logger.error(f"Failed to initialize DataService: {e}")
            raise

    async def cleanup(self):
        """Clean up resources"""
        self._df_lazy = None
        self._filter_options_cache = None
        self._ready = False

    def is_ready(self) -> bool:
        """Check if the service is ready for queries"""
        return self._ready and self._df_lazy is not None

    async def _cache_filter_options(self):
        """Pre-compute and cache filter options for performance"""
        if self._df_lazy is None:
            raise RuntimeError("DataService not initialized")

        try:
            # Use Polars to efficiently get unique values
            filter_cols = ["sae_id", "explanation_method", "llm_explainer", "llm_scorer"]

            unique_values = {}
            for col in filter_cols:
                values = (
                    self._df_lazy
                    .select(pl.col(col).unique().sort())
                    .collect()
                    .get_column(col)
                    .to_list()
                )
                unique_values[col] = [v for v in values if v is not None]

            self._filter_options_cache = unique_values
            logger.info("Filter options cached successfully")

        except Exception as e:
            logger.error(f"Failed to cache filter options: {e}")
            raise

    def _apply_filters(self, lazy_df: pl.LazyFrame, filters: Filters) -> pl.LazyFrame:
        """Apply filters to lazy DataFrame efficiently"""
        conditions = []

        if filters.sae_id:
            conditions.append(pl.col("sae_id").is_in(filters.sae_id))

        if filters.explanation_method:
            conditions.append(pl.col("explanation_method").is_in(filters.explanation_method))

        if filters.llm_explainer:
            conditions.append(pl.col("llm_explainer").is_in(filters.llm_explainer))

        if filters.llm_scorer:
            conditions.append(pl.col("llm_scorer").is_in(filters.llm_scorer))

        if conditions:
            # Combine all conditions with AND logic
            combined_condition = conditions[0]
            for condition in conditions[1:]:
                combined_condition = combined_condition & condition

            return lazy_df.filter(combined_condition)

        return lazy_df

    async def get_filter_options(self) -> FilterOptionsResponse:
        """Get all available filter options"""
        if not self._filter_options_cache:
            await self._cache_filter_options()

        return FilterOptionsResponse(**self._filter_options_cache)

    async def get_histogram_data(self, filters: Filters, metric: MetricType, bins: int = 20) -> HistogramResponse:
        """Generate histogram data for a specific metric"""
        if not self.is_ready():
            raise RuntimeError("DataService not ready")

        try:
            # Apply filters
            filtered_df = self._apply_filters(self._df_lazy, filters)

            # Get the metric column data
            metric_data = (
                filtered_df
                .select([
                    pl.col(metric.value).alias("metric_value"),
                ])
                .collect()
            )

            if len(metric_data) == 0:
                raise ValueError("No data available after applying filters")

            # Extract values and remove nulls
            values = metric_data.get_column("metric_value").drop_nulls().to_numpy()

            if len(values) == 0:
                raise ValueError("No valid values found for the specified metric")

            # Calculate histogram
            counts, bin_edges = np.histogram(values, bins=bins)
            bin_centers = (bin_edges[:-1] + bin_edges[1:]) / 2

            # Calculate statistics
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

    def _classify_score_agreement(self, df: pl.DataFrame, score_threshold: float) -> pl.DataFrame:
        """Classify features based on score agreement"""
        return df.with_columns([
            # Count how many scores are above threshold
            (
                (pl.col("score_fuzz") >= score_threshold).cast(pl.Int32) +
                (pl.col("score_simulation") >= score_threshold).cast(pl.Int32) +
                (pl.col("score_detection") >= score_threshold).cast(pl.Int32)
            ).alias("high_score_count"),

            # Create agreement category
            pl.when(
                (pl.col("score_fuzz") >= score_threshold) &
                (pl.col("score_simulation") >= score_threshold) &
                (pl.col("score_detection") >= score_threshold)
            ).then(pl.lit("agree_all"))
            .when(
                (
                    (pl.col("score_fuzz") >= score_threshold).cast(pl.Int32) +
                    (pl.col("score_simulation") >= score_threshold).cast(pl.Int32) +
                    (pl.col("score_detection") >= score_threshold).cast(pl.Int32)
                ) == 2
            ).then(pl.lit("agree_2of3"))
            .when(
                (
                    (pl.col("score_fuzz") >= score_threshold).cast(pl.Int32) +
                    (pl.col("score_simulation") >= score_threshold).cast(pl.Int32) +
                    (pl.col("score_detection") >= score_threshold).cast(pl.Int32)
                ) == 1
            ).then(pl.lit("agree_1of3"))
            .otherwise(pl.lit("agree_none"))
            .alias("score_agreement")
        ])

    async def get_sankey_data(self, filters: Filters, thresholds: Dict[str, float]) -> SankeyResponse:
        """Generate Sankey diagram data with hierarchical categorization"""
        if not self.is_ready():
            raise RuntimeError("DataService not ready")

        try:
            # Apply filters and collect data
            filtered_df = self._apply_filters(self._df_lazy, filters).collect()

            if len(filtered_df) == 0:
                raise ValueError("No data available after applying filters")

            semdist_threshold = thresholds["semdist_mean"]
            score_threshold = thresholds["score_high"]

            # Add categorization columns
            categorized_df = filtered_df.with_columns([
                # Semantic distance category
                pl.when(pl.col("semdist_mean") >= semdist_threshold)
                .then(pl.lit("high"))
                .otherwise(pl.lit("low"))
                .alias("semdist_category"),

                # Feature splitting category
                pl.when(pl.col("feature_splitting"))
                .then(pl.lit("true"))
                .otherwise(pl.lit("false"))
                .alias("splitting_category")
            ])

            # Add score agreement classification
            categorized_df = self._classify_score_agreement(categorized_df, score_threshold)

            # Generate nodes and links
            nodes = []
            links = []

            # Stage 0: Root node
            total_features = len(categorized_df)
            nodes.append({
                "id": "root",
                "name": "All Features",
                "stage": 0,
                "feature_count": total_features,
                "category": "root"
            })

            # Stage 1: Feature splitting
            splitting_counts = categorized_df.group_by("splitting_category").count().sort("splitting_category")

            for row in splitting_counts.iter_rows(named=True):
                category = row["splitting_category"]
                count = row["count"]

                node_id = f"split_{category}"
                nodes.append({
                    "id": node_id,
                    "name": f"Feature Splitting: {category.title()}",
                    "stage": 1,
                    "feature_count": count,
                    "category": "feature_splitting"
                })

                links.append({
                    "source": "root",
                    "target": node_id,
                    "value": count
                })

            # Stage 2: Semantic distance within each splitting category
            semdist_counts = (
                categorized_df
                .group_by(["splitting_category", "semdist_category"])
                .count()
                .sort(["splitting_category", "semdist_category"])
            )

            for row in semdist_counts.iter_rows(named=True):
                split_cat = row["splitting_category"]
                semdist_cat = row["semdist_category"]
                count = row["count"]

                source_id = f"split_{split_cat}"
                target_id = f"split_{split_cat}_semdist_{semdist_cat}"

                nodes.append({
                    "id": target_id,
                    "name": f"{semdist_cat.title()} Semantic Distance",
                    "stage": 2,
                    "feature_count": count,
                    "category": "semantic_distance",
                    "parent_path": [f"split_{split_cat}"]
                })

                links.append({
                    "source": source_id,
                    "target": target_id,
                    "value": count
                })

            # Stage 3: Score agreement within each semdist+splitting category
            agreement_counts = (
                categorized_df
                .group_by(["splitting_category", "semdist_category", "score_agreement"])
                .count()
                .sort(["splitting_category", "semdist_category", "score_agreement"])
            )

            agreement_names = {
                "agree_all": "All 3 Scores High",
                "agree_2of3": "2 of 3 Scores High",
                "agree_1of3": "1 of 3 Scores High",
                "agree_none": "All 3 Scores Low"
            }

            for row in agreement_counts.iter_rows(named=True):
                split_cat = row["splitting_category"]
                semdist_cat = row["semdist_category"]
                agreement_cat = row["score_agreement"]
                count = row["count"]

                source_id = f"split_{split_cat}_semdist_{semdist_cat}"
                target_id = f"split_{split_cat}_semdist_{semdist_cat}_{agreement_cat}"

                nodes.append({
                    "id": target_id,
                    "name": agreement_names[agreement_cat],
                    "stage": 3,
                    "feature_count": count,
                    "category": "score_agreement",
                    "parent_path": [f"split_{split_cat}", f"semdist_{semdist_cat}"]
                })

                links.append({
                    "source": source_id,
                    "target": target_id,
                    "value": count
                })

            # Build response
            applied_filters = {}
            if filters.sae_id:
                applied_filters["sae_id"] = filters.sae_id
            if filters.explanation_method:
                applied_filters["explanation_method"] = filters.explanation_method
            if filters.llm_explainer:
                applied_filters["llm_explainer"] = filters.llm_explainer
            if filters.llm_scorer:
                applied_filters["llm_scorer"] = filters.llm_scorer

            return SankeyResponse(
                nodes=nodes,
                links=links,
                metadata={
                    "total_features": total_features,
                    "applied_filters": applied_filters,
                    "applied_thresholds": thresholds
                }
            )

        except Exception as e:
            logger.error(f"Error generating Sankey data: {e}")
            raise

    async def get_comparison_data(self, left_filters: Filters, left_thresholds: Dict[str, float],
                                right_filters: Filters, right_thresholds: Dict[str, float]) -> ComparisonResponse:
        """Generate alluvial comparison data between two Sankey configurations"""
        # This would be implemented for Phase 2
        # For now, return a placeholder
        raise NotImplementedError("Comparison data generation not yet implemented")

    async def get_feature_data(self, feature_id: int, sae_id: Optional[str] = None,
                             explanation_method: Optional[str] = None,
                             llm_explainer: Optional[str] = None,
                             llm_scorer: Optional[str] = None) -> FeatureResponse:
        """Get detailed data for a specific feature"""
        if not self.is_ready():
            raise RuntimeError("DataService not ready")

        try:
            # Build query conditions
            conditions = [pl.col("feature_id") == feature_id]

            if sae_id:
                conditions.append(pl.col("sae_id") == sae_id)
            if explanation_method:
                conditions.append(pl.col("explanation_method") == explanation_method)
            if llm_explainer:
                conditions.append(pl.col("llm_explainer") == llm_explainer)
            if llm_scorer:
                conditions.append(pl.col("llm_scorer") == llm_scorer)

            # Combine conditions
            combined_condition = conditions[0]
            for condition in conditions[1:]:
                combined_condition = combined_condition & condition

            # Query the data
            result_df = (
                self._df_lazy
                .filter(combined_condition)
                .collect()
            )

            if len(result_df) == 0:
                raise ValueError(f"Feature {feature_id} not found with specified parameters")

            # Take the first matching record
            row = result_df.row(0, named=True)

            return FeatureResponse(
                feature_id=row["feature_id"],
                sae_id=row["sae_id"],
                explanation_method=row["explanation_method"],
                llm_explainer=row["llm_explainer"],
                llm_scorer=row["llm_scorer"],
                feature_splitting=row["feature_splitting"],
                semdist_mean=row["semdist_mean"],
                semdist_max=row["semdist_max"],
                scores={
                    "fuzz": row["score_fuzz"] or 0.0,
                    "simulation": row["score_simulation"] or 0.0,
                    "detection": row["score_detection"] or 0.0,
                    "embedding": row["score_embedding"] or 0.0
                },
                details_path=row["details_path"]
            )

        except Exception as e:
            logger.error(f"Error retrieving feature data: {e}")
            raise