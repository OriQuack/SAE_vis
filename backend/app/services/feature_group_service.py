"""
Feature Group Service - Simple filtering and grouping logic.

Replaces the complex classification engine with straightforward data operations.
"""

import polars as pl
import logging
from typing import List, Dict, Tuple
from pathlib import Path

from ..models.common import Filters
from ..models.responses import FeatureGroup, FeatureGroupResponse
from .data_constants import (
    COL_FEATURE_ID,
    COL_SAE_ID,
    COL_EXPLANATION_METHOD,
    COL_LLM_EXPLAINER,
    COL_LLM_SCORER,
    COL_DECODER_SIMILARITY,
    COL_DECODER_SIMILARITY_MERGE_THRESHOLD,
    DECODER_METRIC_FOR_AGGREGATION
)

logger = logging.getLogger(__name__)

# Data file paths
FEATURES_PATH = Path(__file__).parent.parent.parent.parent / "data" / "master" / "features.parquet"


class FeatureGroupService:
    """
    Simple service for grouping features by threshold ranges.

    Supports:
    - 5 standard metrics: decoder_similarity, semdist_mean, score_fuzz, score_detection, score_embedding
    - 1 computed metric: quality_score
    """

    def __init__(self):
        """Initialize service and load data"""
        logger.info("Initializing FeatureGroupService")

        # Load master data
        self.feature_df = pl.scan_parquet(str(FEATURES_PATH))

        # Transform nested schema to flat schema
        self.feature_df = self._transform_to_flat_schema(self.feature_df)
        logger.info(f"Loaded features from {FEATURES_PATH}")

    @staticmethod
    def _get_actual_column_name(metric_name: str) -> str:
        """
        Map metric name to actual column name based on configuration.

        When metric is "decoder_similarity", returns the actual column to use
        based on DECODER_METRIC_FOR_AGGREGATION constant.

        Args:
            metric_name: Metric name from API request

        Returns:
            Actual column name to use in DataFrame operations
        """
        if metric_name == COL_DECODER_SIMILARITY:
            return DECODER_METRIC_FOR_AGGREGATION
        return metric_name

    def _transform_to_flat_schema(self, df_lazy: pl.LazyFrame) -> pl.LazyFrame:
        """
        Transform nested features.parquet schema to flat schema expected by backend.

        Explodes the nested scores structure and extracts individual columns.
        """
        # Explode scores to create one row per scorer
        df_lazy = df_lazy.explode("scores")

        # Extract scorer and individual score columns from the struct
        df_lazy = df_lazy.with_columns([
            pl.col("scores").struct.field("scorer").alias(COL_LLM_SCORER),
            pl.col("scores").struct.field("fuzz").alias("score_fuzz"),
            pl.col("scores").struct.field("simulation").alias("score_simulation"),
            pl.col("scores").struct.field("detection").alias("score_detection"),
            pl.col("scores").struct.field("embedding").alias("score_embedding"),
        ])

        # Compute quality_score as mean of embedding, fuzz, and detection scores
        df_lazy = df_lazy.with_columns([
            ((pl.col("score_embedding") + pl.col("score_fuzz") + pl.col("score_detection")) / 3.0)
            .alias("quality_score")
        ])

        # Convert decoder_similarity list to max value for numeric operations
        # Overwrites the list column with max cosine_similarity value
        # NOTE: Only transform if using original decoder_similarity for aggregation
        if DECODER_METRIC_FOR_AGGREGATION == COL_DECODER_SIMILARITY:
            logger.info("Transforming decoder_similarity from List(Struct) to max float value")
            df_lazy = df_lazy.with_columns([
                pl.col(COL_DECODER_SIMILARITY)
                  .list.eval(pl.element().struct.field("cosine_similarity"))
                  .list.max()
                  .alias(COL_DECODER_SIMILARITY)
            ])
        else:
            logger.info(f"Using {DECODER_METRIC_FOR_AGGREGATION} for aggregation (no transformation needed)")

        # Drop only scores and explanation_text, keep decoder_similarity
        df_lazy = df_lazy.drop(["scores", "explanation_text"])

        return df_lazy

    async def get_feature_groups(
        self,
        filters: Filters,
        metric: str,
        thresholds: List[float]
    ) -> FeatureGroupResponse:
        """
        Main entry point - filter and group features by threshold ranges.

        Args:
            filters: User-defined filters (explainer, scorer, etc.)
            metric: Metric name to group by
            thresholds: List of threshold values (N → N+1 groups)
                       Empty list [] returns all features as single group (root node case)

        Returns:
            FeatureGroupResponse with groups

        Raises:
            ValueError: If metric is invalid or data is missing
        """
        logger.info(f"Getting feature groups for metric={metric}, thresholds={thresholds}")

        # Apply filters to get base dataframe
        filtered_df = self._apply_filters(filters)

        # Special case: Empty thresholds means "all features" (root node initialization)
        if len(thresholds) == 0:
            logger.info("Empty thresholds - returning all features as single group (root node)")
            return self._get_root_group(filtered_df, metric)

        # Route to appropriate handler based on metric type
        if metric == 'quality_score':
            groups, total_features = self._get_quality_score_groups(filtered_df, thresholds)
        else:
            groups, total_features = self._get_standard_groups(filtered_df, metric, thresholds)

        logger.info(f"Created {len(groups)} groups with {total_features} total features")

        return FeatureGroupResponse(
            metric=metric,
            groups=groups,
            total_features=total_features
        )

    def _apply_filters(self, filters: Filters) -> pl.LazyFrame:
        """Apply user filters to feature dataframe"""
        df = self.feature_df

        if filters.sae_id:
            df = df.filter(pl.col(COL_SAE_ID).is_in(filters.sae_id))

        if filters.explanation_method:
            df = df.filter(pl.col(COL_EXPLANATION_METHOD).is_in(filters.explanation_method))

        if filters.llm_explainer:
            df = df.filter(pl.col(COL_LLM_EXPLAINER).is_in(filters.llm_explainer))

        if filters.llm_scorer:
            df = df.filter(pl.col(COL_LLM_SCORER).is_in(filters.llm_scorer))

        return df

    def _get_standard_groups(
        self,
        df: pl.LazyFrame,
        metric: str,
        thresholds: List[float]
    ) -> Tuple[List[FeatureGroup], int]:
        """
        Get groups for standard metrics (semdist_mean, scores).

        Returns:
            Tuple of (groups, total_features)
        """
        # Map metric name to actual column based on configuration
        actual_metric = self._get_actual_column_name(metric)
        logger.debug(f"Mapping metric '{metric}' to actual column '{actual_metric}'")

        # Collect dataframe for processing
        df_collected = df.collect()

        if actual_metric not in df_collected.columns:
            raise ValueError(f"Metric '{actual_metric}' (requested as '{metric}') not found in dataset")

        # CRITICAL FIX: For score metrics that vary by explainer/scorer,
        # we need to aggregate BEFORE grouping to avoid duplicate features in groups

        # Determine which metrics need aggregation (same logic as histogram_service)
        # NOTE: Check actual_metric since decoder_similarity might map to decoder_similarity_merge_threshold
        score_metrics = {'score_fuzz', 'score_detection', 'score_embedding', 'quality_score'}

        if actual_metric in score_metrics:
            logger.info(f"Aggregating {actual_metric} by feature_id before grouping (avoiding duplicates)")

            # For score_fuzz and score_detection: these vary by scorer, aggregate by feature_id
            # For score_embedding and quality_score: these vary by explainer, aggregate by feature_id
            # In all cases, we take the mean across all rows for each feature
            df_aggregated = (
                df_collected
                .group_by([COL_FEATURE_ID])
                .agg([
                    pl.col(actual_metric).mean().alias(actual_metric),
                    # Keep first value of other columns for reference
                    pl.col(COL_SAE_ID).first(),
                    pl.col(COL_EXPLANATION_METHOD).first(),
                    pl.col(COL_LLM_EXPLAINER).first(),
                    pl.col(COL_LLM_SCORER).first()
                ])
            )
            logger.info(f"Aggregated {len(df_collected)} rows to {len(df_aggregated)} unique features")
        else:
            # For metrics that don't vary (semdist_mean),
            # we can use the data as-is but will still deduplicate feature IDs later
            df_aggregated = df_collected

        sorted_thresholds = sorted(thresholds)
        groups = []

        # Create N+1 groups for N thresholds
        for i in range(len(sorted_thresholds) + 1):
            # Determine range and label
            if i == 0:
                # First group: < threshold[0]
                range_df = df_aggregated.filter(pl.col(actual_metric) < sorted_thresholds[0])
                label = f"< {sorted_thresholds[0]:.2f}"
            elif i == len(sorted_thresholds):
                # Last group: >= threshold[-1]
                range_df = df_aggregated.filter(pl.col(actual_metric) >= sorted_thresholds[-1])
                label = f">= {sorted_thresholds[-1]:.2f}"
            else:
                # Middle groups: threshold[i-1] <= x < threshold[i]
                range_df = df_aggregated.filter(
                    (pl.col(actual_metric) >= sorted_thresholds[i-1]) &
                    (pl.col(actual_metric) < sorted_thresholds[i])
                )
                label = f"{sorted_thresholds[i-1]:.2f} - {sorted_thresholds[i]:.2f}"

            # Now feature IDs are already unique (one row per feature after aggregation)
            # But we still extract them for consistency
            unique_ids = range_df[COL_FEATURE_ID].unique().sort().to_list()

            groups.append(FeatureGroup(
                group_index=i,
                range_label=label,
                feature_ids=unique_ids,  # Standard metrics use feature_ids
                feature_count=len(unique_ids)
            ))

        # Use aggregated dataframe for total count (will be same as collected for non-aggregated metrics)
        total_features = df_aggregated[COL_FEATURE_ID].n_unique()

        # Verify groups are mutually exclusive (sum should equal total)
        group_sum = sum(len(g.feature_ids) for g in groups)
        if group_sum != total_features:
            logger.warning(f"Group sum ({group_sum}) != total features ({total_features}) for metric {metric}")

        return groups, total_features

    def _get_quality_score_groups(
        self,
        df: pl.LazyFrame,
        thresholds: List[float]
    ) -> Tuple[List[FeatureGroup], int]:
        """
        Get groups for quality_score metric (computed from score components).

        Quality score is computed as mean of embedding, fuzz, and detection scores.

        Returns:
            Tuple of (groups, total_features)
        """
        # quality_score is computed in _transform_to_flat_schema, just use it like any standard metric
        return self._get_standard_groups(df, 'quality_score', thresholds)

    def _get_root_group(
        self,
        df: pl.LazyFrame,
        metric: str
    ) -> FeatureGroupResponse:
        """
        Special handler for root node initialization (empty thresholds).
        Returns all features matching filters as a single group.

        Args:
            df: Filtered dataframe
            metric: Metric name (for response, not used in filtering)

        Returns:
            FeatureGroupResponse with single group containing all features
        """
        # Collect and get unique feature IDs
        df_collected = df.collect()
        unique_ids = df_collected[COL_FEATURE_ID].unique().sort().to_list()
        total_features = len(unique_ids)

        logger.info(f"Root group: {total_features} features")

        # Create single group with all features
        groups = [FeatureGroup(
            group_index=0,
            range_label="All Features",
            feature_ids=unique_ids,
            feature_count=total_features
        )]

        return FeatureGroupResponse(
            metric=metric,
            groups=groups,
            total_features=total_features
        )
