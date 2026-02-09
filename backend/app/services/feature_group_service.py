"""
Feature Group Service - Simple filtering and grouping logic.

Replaces the complex classification engine with straightforward data operations.
"""

import polars as pl
import logging
from typing import List, Tuple

from ..models.common import Filters
from ..models.feature_groups import FeatureGroup, FeatureGroupResponse
from .data_constants import (
    COL_FEATURE_ID,
    COL_SAE_ID,
    COL_EXPLANATION_METHOD,
    COL_LLM_EXPLAINER,
    COL_LLM_SCORER,
    COL_DECODER_SIMILARITY,
    DECODER_METRIC_FOR_AGGREGATION
)
from .data_service import DataService

logger = logging.getLogger(__name__)


class FeatureGroupService:
    """
    Simple service for grouping features by threshold ranges.

    Supports:
    - 5 standard metrics: decoder_similarity, semdist_mean, score_fuzz, score_detection, score_embedding
    - 1 computed metric: quality_score
    """

    def __init__(self, data_service: DataService):
        """Initialize service with shared DataService."""
        logger.info("Initializing FeatureGroupService")
        self.data_service = data_service

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

        # Apply filters using DataService
        filtered_df = self.data_service.apply_filters(self.data_service._df_lazy, filters)

        # Special case: Empty thresholds means "all features" (root node initialization)
        if len(thresholds) == 0:
            logger.info("Empty thresholds - returning all features as single group (root node)")
            return self._get_root_group(filtered_df, metric)

        # Route to handler (quality_score is just a standard column after DataService transform)
        groups, total_features = self._get_standard_groups(filtered_df, metric, thresholds)

        logger.info(f"Created {len(groups)} groups with {total_features} total features")

        return FeatureGroupResponse(
            metric=metric,
            groups=groups,
            total_features=total_features
        )

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
        # Map decoder_similarity to configured column
        actual_metric = DECODER_METRIC_FOR_AGGREGATION if metric == COL_DECODER_SIMILARITY else metric
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
