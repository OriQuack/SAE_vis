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
    COL_LLM_SCORER
)

logger = logging.getLogger(__name__)

# Data file paths
FEATURE_ANALYSIS_PATH = Path(__file__).parent.parent.parent.parent / "data" / "master" / "feature_analysis.parquet"
CONSISTENCY_SCORES_PATH = Path(__file__).parent.parent.parent.parent / "data" / "master" / "consistency_scores.parquet"


class FeatureGroupService:
    """
    Simple service for grouping features by threshold ranges.

    Supports:
    - 5 standard metrics: feature_splitting, semdist_mean, score_fuzz, score_detection, score_embedding
    - 5 consistency metrics (pre-computed):
      * llm_scorer_consistency
      * within_explanation_metric_consistency
      * cross_explanation_metric_consistency
      * cross_explanation_overall_score_consistency
      * llm_explainer_consistency
    - 1 computed metric: overall_score
    """

    def __init__(self):
        """Initialize service and load data"""
        logger.info("Initializing FeatureGroupService")

        # Load master data
        self.feature_df = pl.scan_parquet(str(FEATURE_ANALYSIS_PATH))
        logger.info(f"Loaded feature analysis from {FEATURE_ANALYSIS_PATH}")

        # Load consistency data
        self.consistency_df = pl.scan_parquet(str(CONSISTENCY_SCORES_PATH))
        logger.info(f"Loaded consistency scores from {CONSISTENCY_SCORES_PATH}")

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

        Returns:
            FeatureGroupResponse with groups

        Raises:
            ValueError: If metric is invalid or data is missing
        """
        logger.info(f"Getting feature groups for metric={metric}, thresholds={thresholds}")

        # Apply filters to get base dataframe
        filtered_df = self._apply_filters(filters)

        # Route to appropriate handler based on metric type
        # List of consistency metrics (using actual column names from consistency_scores.parquet)
        consistency_metrics = {
            'llm_scorer_consistency',
            'within_explanation_metric_consistency',
            'cross_explanation_metric_consistency',
            'cross_explanation_overall_score_consistency',
            'llm_explainer_consistency'
        }

        if metric in consistency_metrics:
            groups, total_features = self._get_consistency_groups(filtered_df, metric, thresholds)
        elif metric == 'overall_score':
            groups, total_features = self._get_overall_score_groups(filtered_df, thresholds)
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
        Get groups for standard metrics (feature_splitting, semdist_mean, scores).

        Returns:
            Tuple of (groups, total_features)
        """
        # Collect dataframe for processing
        df_collected = df.collect()

        if metric not in df_collected.columns:
            raise ValueError(f"Metric '{metric}' not found in dataset")

        sorted_thresholds = sorted(thresholds)
        groups = []

        # Create N+1 groups for N thresholds
        for i in range(len(sorted_thresholds) + 1):
            # Determine range and label
            if i == 0:
                # First group: < threshold[0]
                range_df = df_collected.filter(pl.col(metric) < sorted_thresholds[0])
                label = f"< {sorted_thresholds[0]:.2f}"
            elif i == len(sorted_thresholds):
                # Last group: >= threshold[-1]
                range_df = df_collected.filter(pl.col(metric) >= sorted_thresholds[-1])
                label = f">= {sorted_thresholds[-1]:.2f}"
            else:
                # Middle groups: threshold[i-1] <= x < threshold[i]
                range_df = df_collected.filter(
                    (pl.col(metric) >= sorted_thresholds[i-1]) &
                    (pl.col(metric) < sorted_thresholds[i])
                )
                label = f"{sorted_thresholds[i-1]:.2f} - {sorted_thresholds[i]:.2f}"

            # Deduplicate feature IDs (critical - each feature appears multiple times)
            unique_ids = range_df[COL_FEATURE_ID].unique().sort().to_list()

            groups.append(FeatureGroup(
                group_index=i,
                range_label=label,
                feature_ids=unique_ids,  # Standard metrics use feature_ids
                feature_count=len(unique_ids)
            ))

        total_features = df_collected[COL_FEATURE_ID].n_unique()

        return groups, total_features

    def _get_consistency_groups(
        self,
        df: pl.LazyFrame,
        metric: str,
        thresholds: List[float]
    ) -> Tuple[List[FeatureGroup], int]:
        """
        Get groups for consistency metrics with min-selection logic.

        Returns:
            Tuple of (groups, total_features)
        """
        # IMPORTANT: feature_analysis has 3 rows per (feature_id, llm_explainer) due to 3 scorers
        # We need to deduplicate to get unique pairs before joining with consistency scores
        unique_pairs = df.select([COL_FEATURE_ID, COL_LLM_EXPLAINER]).unique()

        # Join with consistency data which has 1 row per (feature_id, llm_explainer)
        df_with_consistency = unique_pairs.join(
            self.consistency_df,
            on=[COL_FEATURE_ID, COL_LLM_EXPLAINER],
            how='inner'  # Use inner join since we only care about features with consistency scores
        ).collect()

        # Compute min consistency values based on metric type
        # Use actual column names from consistency_scores.parquet
        if metric == 'llm_scorer_consistency':
            # For llm_scorer consistency: min(fuzz, detection) per explainer, then min across explainers
            min_df = self._compute_min_llm_scorer_consistency(df_with_consistency)
        elif metric == 'within_explanation_metric_consistency':
            min_df = self._compute_min_within_explanation_metric_consistency(df_with_consistency)
        elif metric == 'cross_explanation_metric_consistency':
            min_df = self._compute_min_cross_metric_consistency(df_with_consistency)
        elif metric == 'cross_explanation_overall_score_consistency':
            min_df = self._compute_cross_overall_consistency(df_with_consistency)
        elif metric == 'llm_explainer_consistency':
            min_df = self._compute_llm_explainer_consistency(df_with_consistency)
        else:
            raise ValueError(f"Unknown consistency metric: {metric}")

        # Group by thresholds
        sorted_thresholds = sorted(thresholds)
        groups = []

        for i in range(len(sorted_thresholds) + 1):
            # Determine range
            if i == 0:
                range_df = min_df.filter(pl.col('value') < sorted_thresholds[0])
                label = f"< {sorted_thresholds[0]:.2f}"
            elif i == len(sorted_thresholds):
                range_df = min_df.filter(pl.col('value') >= sorted_thresholds[-1])
                label = f">= {sorted_thresholds[-1]:.2f}"
            else:
                range_df = min_df.filter(
                    (pl.col('value') >= sorted_thresholds[i-1]) &
                    (pl.col('value') < sorted_thresholds[i])
                )
                label = f"{sorted_thresholds[i-1]:.2f} - {sorted_thresholds[i]:.2f}"

            # Group by source_min
            if range_df.height > 0:
                feature_ids_by_source = (
                    range_df
                    .group_by('source_min')
                    .agg(pl.col(COL_FEATURE_ID).sort())
                    .to_dicts()
                )

                # Convert to dict format
                source_dict = {
                    row['source_min']: [int(fid) for fid in row[COL_FEATURE_ID]]
                    for row in feature_ids_by_source
                }
                feature_count = len(range_df)
            else:
                source_dict = {}
                feature_count = 0

            groups.append(FeatureGroup(
                group_index=i,
                range_label=label,
                feature_ids_by_source=source_dict,  # Consistency metrics use feature_ids_by_source
                feature_count=feature_count
            ))

        total_features = min_df[COL_FEATURE_ID].n_unique()

        return groups, total_features

    def _compute_min_llm_scorer_consistency(self, df: pl.DataFrame) -> pl.DataFrame:
        """
        For each feature:
        1. Per explainer: min(fuzz_consistency, detection_consistency)
        2. Across feature: choose explainer with lowest min

        Returns: DataFrame with columns [feature_id, value, source_min (explainer name)]
        """
        # Add min of fuzz and detection as a new column
        df_with_min = df.with_columns(
            pl.min_horizontal([
                pl.col('llm_scorer_consistency_fuzz'),
                pl.col('llm_scorer_consistency_detection')
            ]).alias('min_consistency')
        )

        # Sort by feature_id and min_consistency, then take first per feature
        result = (
            df_with_min
            .sort([COL_FEATURE_ID, 'min_consistency'])
            .group_by(COL_FEATURE_ID, maintain_order=True)
            .first()
            .select([
                COL_FEATURE_ID,
                pl.col('min_consistency').alias('value'),
                pl.col(COL_LLM_EXPLAINER).alias('source_min')
            ])
        )

        return result

    def _compute_min_within_explanation_metric_consistency(self, df: pl.DataFrame) -> pl.DataFrame:
        """
        For each feature:
        Choose min within_explanation_metric_consistency across explainers

        Returns: DataFrame with columns [feature_id, value, source_min (explainer name)]
        """
        # Sort by feature_id and consistency value, then take first per feature
        result = (
            df
            .sort([COL_FEATURE_ID, 'within_explanation_metric_consistency'])
            .group_by(COL_FEATURE_ID, maintain_order=True)
            .first()
            .select([
                COL_FEATURE_ID,
                pl.col('within_explanation_metric_consistency').alias('value'),
                pl.col(COL_LLM_EXPLAINER).alias('source_min')
            ])
        )

        return result

    def _compute_min_cross_metric_consistency(self, df: pl.DataFrame) -> pl.DataFrame:
        """
        For each feature:
        Choose min from (embedding, fuzz, detection)

        Returns: DataFrame with columns [feature_id, value, source_min (metric name)]
        """
        # Aggregate to feature level first (take first value per feature since these are duplicated)
        feature_level = df.group_by(COL_FEATURE_ID).first()

        # Find min across metrics
        result = feature_level.select([
            pl.col(COL_FEATURE_ID),
            pl.min_horizontal([
                pl.col('cross_explanation_metric_consistency_embedding'),
                pl.col('cross_explanation_metric_consistency_fuzz'),
                pl.col('cross_explanation_metric_consistency_detection')
            ]).alias('value'),
            pl.when(
                pl.col('cross_explanation_metric_consistency_embedding') ==
                pl.min_horizontal([
                    pl.col('cross_explanation_metric_consistency_embedding'),
                    pl.col('cross_explanation_metric_consistency_fuzz'),
                    pl.col('cross_explanation_metric_consistency_detection')
                ])
            ).then(pl.lit('embedding'))
            .when(
                pl.col('cross_explanation_metric_consistency_fuzz') ==
                pl.min_horizontal([
                    pl.col('cross_explanation_metric_consistency_embedding'),
                    pl.col('cross_explanation_metric_consistency_fuzz'),
                    pl.col('cross_explanation_metric_consistency_detection')
                ])
            ).then(pl.lit('fuzz'))
            .otherwise(pl.lit('detection'))
            .alias('source_min')
        ])

        return result

    def _compute_cross_overall_consistency(self, df: pl.DataFrame) -> pl.DataFrame:
        """
        For each feature:
        Use cross_explanation_overall_score_consistency (same value for all explainers)

        Returns: DataFrame with columns [feature_id, value, source_min (fixed: "overall")]
        """
        # Aggregate to feature level
        result = df.group_by(COL_FEATURE_ID).agg([
            pl.col('cross_explanation_overall_score_consistency').first().alias('value'),
            pl.lit('overall').alias('source_min')
        ])

        return result

    def _compute_llm_explainer_consistency(self, df: pl.DataFrame) -> pl.DataFrame:
        """
        For each feature:
        Use llm_explainer_consistency (semantic similarity)

        Returns: DataFrame with columns [feature_id, value, source_min (fixed: "semantic")]
        """
        # Aggregate to feature level
        result = df.group_by(COL_FEATURE_ID).agg([
            pl.col('llm_explainer_consistency').first().alias('value'),
            pl.lit('semantic').alias('source_min')
        ])

        return result

    def _get_overall_score_groups(
        self,
        df: pl.LazyFrame,
        thresholds: List[float]
    ) -> Tuple[List[FeatureGroup], int]:
        """
        Get groups for overall_score metric (already exists in parquet).

        Overall score is pre-computed as mean of z-scores (embedding, fuzz, detection).

        Returns:
            Tuple of (groups, total_features)
        """
        # overall_score already exists in the parquet, just use it like any standard metric
        return self._get_standard_groups(df, 'overall_score', thresholds)
