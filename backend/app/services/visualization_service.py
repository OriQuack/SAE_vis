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
from ..models.threshold import ThresholdStructure, PatternSplitRule
from .rule_evaluators import SplitEvaluator
from ..models.responses import (
    FilterOptionsResponse, HistogramResponse, SankeyResponse,
    ComparisonResponse, FeatureResponse
)
from .data_constants import *
from .feature_classifier import ClassificationEngine
from .consistency_service import ConsistencyService

logger = logging.getLogger(__name__)


class DataService:
    """High-performance data service using Polars for Parquet operations."""

    def __init__(self, data_path: str = "../data"):
        self.data_path = Path(data_path)
        self.master_file = self.data_path / "master" / "feature_analysis.parquet"
        self.pairwise_similarity_file = self.data_path / "master" / "semantic_similarity_pairwise.parquet"
        self.consistency_scores_file = self.data_path / "master" / "consistency_scores.parquet"
        self.detailed_json_dir = self.data_path / "detailed_json"

        # Cache for frequently accessed data
        self._filter_options_cache: Optional[Dict[str, List[str]]] = None
        self._df_lazy: Optional[pl.LazyFrame] = None
        self._pairwise_sim_lazy: Optional[pl.LazyFrame] = None
        self._consistency_lazy: Optional[pl.LazyFrame] = None
        self._ready = False

    async def initialize(self):
        """Initialize the data service with lazy loading."""
        try:
            if not self.master_file.exists():
                raise FileNotFoundError(f"Master parquet file not found: {self.master_file}")

            self._df_lazy = pl.scan_parquet(self.master_file)

            # Load consistency scores if available
            if self.consistency_scores_file.exists():
                self._consistency_lazy = pl.scan_parquet(self.consistency_scores_file)
                logger.info(f"Loaded consistency scores: {self.consistency_scores_file}")
            else:
                logger.warning(f"Consistency scores not found: {self.consistency_scores_file}")
                self._consistency_lazy = None

            await self._cache_filter_options()
            self._ready = True
            logger.info(f"DataService initialized with {self.master_file}")

        except Exception as e:
            logger.error(f"Failed to initialize DataService: {e}")
            raise

    async def cleanup(self):
        """Clean up resources."""
        self._df_lazy = None
        self._pairwise_sim_lazy = None
        self._consistency_lazy = None
        self._filter_options_cache = None
        self._ready = False

    def is_ready(self) -> bool:
        """Check if the service is ready for queries."""
        return self._ready and self._df_lazy is not None

    def _load_pairwise_similarity_lazy(self) -> pl.LazyFrame:
        """
        Load and cache the pairwise similarity parquet as a LazyFrame.

        Returns:
            LazyFrame for pairwise similarity data
        """
        if self._pairwise_sim_lazy is None:
            if not self.pairwise_similarity_file.exists():
                raise FileNotFoundError(f"Pairwise similarity parquet not found: {self.pairwise_similarity_file}")
            self._pairwise_sim_lazy = pl.scan_parquet(self.pairwise_similarity_file)
            logger.info(f"Loaded pairwise similarity parquet: {self.pairwise_similarity_file}")
        return self._pairwise_sim_lazy

    def _compute_semsim_for_one_llm(
        self,
        filtered_df: pl.DataFrame,
        selected_llm: str
    ) -> pl.DataFrame:
        """
        Compute semsim_mean for one selected LLM by averaging pairwise similarities with other LLMs.

        For feature in filtered_df:
            semsim_mean = average of (selected_llm vs llm_2, selected_llm vs llm_3)

        Args:
            filtered_df: Master parquet filtered by filters and node
            selected_llm: The selected LLM explainer name

        Returns:
            DataFrame with feature_id and computed semsim_mean
        """
        # Get unique feature IDs from filtered data
        feature_ids = filtered_df.select(pl.col(COL_FEATURE_ID).unique()).get_column(COL_FEATURE_ID).to_list()

        # Load pairwise similarity data
        pairwise_lazy = self._load_pairwise_similarity_lazy()

        # Filter pairwise data for features in filtered_df and where selected_llm is one of the explainers
        pairwise_df = (
            pairwise_lazy
            .filter(
                pl.col("feature_id").is_in(feature_ids) &
                ((pl.col("explainer_1") == selected_llm) | (pl.col("explainer_2") == selected_llm))
            )
            .collect()
        )

        if len(pairwise_df) == 0:
            raise ValueError(f"No pairwise similarity data found for selected LLM: {selected_llm}")

        # Group by feature_id and calculate mean cosine similarity
        semsim_df = (
            pairwise_df
            .group_by("feature_id")
            .agg(pl.col("cosine_similarity").mean().alias("semsim_mean"))
        )

        logger.info(f"Computed semsim_mean for 1 LLM ({selected_llm}): {len(semsim_df)} features")
        return semsim_df

    def _compute_semsim_for_two_llms(
        self,
        filtered_df: pl.DataFrame,
        llm1: str,
        llm2: str
    ) -> pl.DataFrame:
        """
        Compute semsim_mean for two selected LLMs using their direct pairwise similarity.

        For feature in filtered_df:
            semsim_mean = cosine_similarity(llm1, llm2)

        Args:
            filtered_df: Master parquet filtered by filters and node
            llm1: First selected LLM explainer name
            llm2: Second selected LLM explainer name

        Returns:
            DataFrame with feature_id and semsim_mean
        """
        # Get unique feature IDs from filtered data
        feature_ids = filtered_df.select(pl.col(COL_FEATURE_ID).unique()).get_column(COL_FEATURE_ID).to_list()

        # Load pairwise similarity data
        pairwise_lazy = self._load_pairwise_similarity_lazy()

        # Ensure alphabetical ordering for explainer pair (matching pairwise parquet convention)
        explainer_1, explainer_2 = (llm1, llm2) if llm1 < llm2 else (llm2, llm1)

        # Filter for exact pair
        pairwise_df = (
            pairwise_lazy
            .filter(
                pl.col("feature_id").is_in(feature_ids) &
                (pl.col("explainer_1") == explainer_1) &
                (pl.col("explainer_2") == explainer_2)
            )
            .select([pl.col("feature_id"), pl.col("cosine_similarity").alias("semsim_mean")])
            .collect()
        )

        if len(pairwise_df) == 0:
            raise ValueError(f"No pairwise similarity data found for LLM pair: {llm1}, {llm2}")

        logger.info(f"Computed semsim_mean for 2 LLMs ({llm1}, {llm2}): {len(pairwise_df)} features")
        return pairwise_df

    def _filter_by_llm_explainers(
        self,
        df: pl.DataFrame,
        selected_llms: List[str]
    ) -> pl.DataFrame:
        """
        Filter master parquet DataFrame by selected LLM explainers.

        Args:
            df: Master parquet DataFrame
            selected_llms: List of selected LLM explainer names (1 or 2)

        Returns:
            Filtered DataFrame containing only rows for selected LLMs
        """
        return df.filter(pl.col(COL_LLM_EXPLAINER).is_in(selected_llms))

    def _get_llm_filtered_histogram_data(
        self,
        filtered_df: pl.DataFrame,
        metric: MetricType,
        selected_llm_explainers: List[str],
        bins: Optional[int],
        fixed_domain: Optional[tuple[float, float]]
    ) -> HistogramResponse:
        """
        Generate histogram data with LLM filtering applied.

        When 1 LLM is selected:
        - feature_splitting: use existing logic (global metric)
        - semsim_mean: average of 2 pairwise similarities
        - score metrics: filter by selected LLM, average across 3 scorers

        When 2 LLMs are selected:
        - feature_splitting: use existing logic (global metric)
        - semsim_mean: pairwise similarity between the 2 LLMs
        - score metrics: filter by both LLMs, average across 6 combinations

        Args:
            filtered_df: Master parquet filtered by filters and node
            metric: Metric to analyze
            selected_llm_explainers: List of 1 or 2 selected LLM names
            bins: Number of histogram bins
            fixed_domain: Optional fixed domain for histogram

        Returns:
            HistogramResponse with LLM-filtered histogram data
        """
        num_selected = len(selected_llm_explainers)

        if num_selected not in [1, 2]:
            raise ValueError(f"Expected 1 or 2 selected LLM explainers, got {num_selected}")

        # For feature_splitting, use existing logic (no LLM filtering needed)
        if metric == MetricType.FEATURE_SPLITTING:
            logger.info(f"Using global feature_splitting (LLM-independent)")
            # Deduplicate by averaging across all explainer-scorer combinations
            df_for_metric = self._average_by_field(filtered_df, metric, ['llm_explainer', 'llm_scorer'])

        # For semsim_mean, use pairwise similarity parquet
        elif metric == MetricType.SEMSIM_MEAN:
            if num_selected == 1:
                semsim_df = self._compute_semsim_for_one_llm(filtered_df, selected_llm_explainers[0])
            else:  # num_selected == 2
                semsim_df = self._compute_semsim_for_two_llms(
                    filtered_df,
                    selected_llm_explainers[0],
                    selected_llm_explainers[1]
                )

            # Extract values directly from semsim_df
            values = semsim_df.get_column("semsim_mean").drop_nulls().to_numpy()

            if len(values) == 0:
                raise ValueError(f"No semsim_mean values available for selected LLMs")

            bins = self._calculate_bins_if_needed(values, bins)
            bin_range = fixed_domain if fixed_domain else (float(np.min(values)), float(np.max(values)))
            counts, bin_edges = np.histogram(values, bins=bins, range=bin_range)
            bin_centers = (bin_edges[:-1] + bin_edges[1:]) / 2

            return HistogramResponse(
                metric=metric.value,
                histogram={
                    "bins": bin_centers.tolist(),
                    "counts": counts.tolist(),
                    "bin_edges": bin_edges.tolist()
                },
                statistics=self._calculate_statistics(values),
                total_features=len(values)
            )

        # For score metrics, filter by selected LLMs and average
        else:
            # Filter master parquet by selected LLMs
            llm_filtered_df = self._filter_by_llm_explainers(filtered_df, selected_llm_explainers)

            if len(llm_filtered_df) == 0:
                raise ValueError(f"No data available for selected LLM explainers: {selected_llm_explainers}")

            # Average across llm_explainer and llm_scorer dimensions
            # This gives us 1 value per feature (averaging all selected explainer-scorer combos)
            df_for_metric = self._average_by_field(llm_filtered_df, metric, ['llm_explainer', 'llm_scorer'])

        # Generate histogram for score metrics and feature_splitting
        values = self._extract_metric_values(df_for_metric, metric)
        bins = self._calculate_bins_if_needed(values, bins)
        bin_range = fixed_domain if fixed_domain else (float(np.min(values)), float(np.max(values)))
        counts, bin_edges = np.histogram(values, bins=bins, range=bin_range)
        bin_centers = (bin_edges[:-1] + bin_edges[1:]) / 2

        return HistogramResponse(
            metric=metric.value,
            histogram={
                "bins": bin_centers.tolist(),
                "counts": counts.tolist(),
                "bin_edges": bin_edges.tolist()
            },
            statistics=self._calculate_statistics(values),
            total_features=len(values)
        )

    def _get_llm_filtered_feature_ids(
        self,
        filtered_df: pl.DataFrame,
        metric: MetricType,
        selected_llm_explainers: List[str],
        min_value: float,
        max_value: float
    ) -> List[int]:
        """
        Get feature IDs within threshold range with LLM filtering applied.

        Args:
            filtered_df: Master parquet filtered by filters
            metric: Metric to check
            selected_llm_explainers: List of 1 or 2 selected LLM names
            min_value: Minimum threshold value
            max_value: Maximum threshold value

        Returns:
            List of feature IDs within threshold range
        """
        num_selected = len(selected_llm_explainers)

        # For feature_splitting, use existing logic (no LLM filtering)
        if metric == MetricType.FEATURE_SPLITTING:
            df_for_metric = self._average_by_field(filtered_df, metric, ['llm_explainer', 'llm_scorer'])

        # For semsim_mean, use pairwise similarity parquet
        elif metric == MetricType.SEMSIM_MEAN:
            if num_selected == 1:
                semsim_df = self._compute_semsim_for_one_llm(filtered_df, selected_llm_explainers[0])
            else:
                semsim_df = self._compute_semsim_for_two_llms(
                    filtered_df, selected_llm_explainers[0], selected_llm_explainers[1]
                )

            # Filter by threshold range
            threshold_filtered = semsim_df.filter(
                (pl.col("semsim_mean") >= min_value) &
                (pl.col("semsim_mean") <= max_value)
            )

            feature_ids = threshold_filtered.get_column("feature_id").to_list()
            return [int(fid) for fid in feature_ids]

        # For score metrics, filter by selected LLMs and average
        else:
            llm_filtered_df = self._filter_by_llm_explainers(filtered_df, selected_llm_explainers)
            df_for_metric = self._average_by_field(llm_filtered_df, metric, ['llm_explainer', 'llm_scorer'])

        # Filter by threshold range for feature_splitting and score metrics
        metric_col = metric.value
        threshold_filtered = df_for_metric.filter(
            (pl.col(metric_col) >= min_value) &
            (pl.col(metric_col) <= max_value)
        )

        feature_ids = (
            threshold_filtered
            .select(pl.col(COL_FEATURE_ID).unique())
            .get_column(COL_FEATURE_ID)
            .to_list()
        )

        logger.info(f"LLM-filtered feature IDs for {metric.value}: {len(feature_ids)} features in range [{min_value}, {max_value}]")
        return [int(fid) for fid in feature_ids]

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
        filter_mapping = [
            (filters.sae_id, COL_SAE_ID),
            (filters.explanation_method, COL_EXPLANATION_METHOD),
            (filters.llm_explainer, COL_LLM_EXPLAINER),
            (filters.llm_scorer, COL_LLM_SCORER)
        ]

        conditions = [
            pl.col(column).is_in(values)
            for values, column in filter_mapping
            if values
        ]

        if not conditions:
            return lazy_df

        combined_condition = conditions[0]
        for condition in conditions[1:]:
            combined_condition = combined_condition & condition

        return lazy_df.filter(combined_condition)

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
        node_id: Optional[str] = None,
        group_by: Optional[str] = None,
        average_by: Optional[Union[str, List[str]]] = None,
        fixed_domain: Optional[tuple[float, float]] = None,
        selected_llm_explainers: Optional[List[str]] = None
    ) -> HistogramResponse:
        """
        Generate histogram data for a specific metric, optionally filtered by node and/or grouped.

        Args:
            filters: Filter criteria to apply
            metric: Metric to analyze
            bins: Number of histogram bins (auto-calculated if None)
            threshold_tree: Optional threshold tree for node filtering
            node_id: Optional node ID for node-specific filtering
            group_by: Optional field to group histogram by
            average_by: Optional field(s) to average by. Can be a single field (str) or multiple fields (List[str])
            fixed_domain: Optional fixed range for histogram bins
            selected_llm_explainers: Optional list of 1 or 2 selected LLM explainers for filtered computation

        Returns:
            HistogramResponse with histogram data and statistics
        """
        if not self.is_ready():
            raise RuntimeError("DataService not ready")

        try:
            filtered_df = self._apply_filtered_data(filters, threshold_tree, node_id)

            # If LLM explainers are selected (1 or 2), use LLM filtering logic
            if selected_llm_explainers and len(selected_llm_explainers) in [1, 2]:
                logger.info(f"Using LLM-filtered histogram data for {len(selected_llm_explainers)} selected explainer(s)")
                return self._get_llm_filtered_histogram_data(
                    filtered_df,
                    metric,
                    selected_llm_explainers,
                    bins,
                    fixed_domain
                )

            # Automatically deduplicate feature-level metrics if no averaging specified
            # Feature-level metrics have identical values across all explainer-scorer combinations
            if not average_by:
                if metric in [MetricType.FEATURE_SPLITTING, MetricType.SEMSIM_MEAN]:
                    # For feature_splitting: same across all 9 combinations (explainers × scorers)
                    # For semsim_mean: same across scorers, varies by explainer
                    if metric == MetricType.FEATURE_SPLITTING:
                        average_by = ['llm_explainer', 'llm_scorer']
                        logger.info(f"Auto-deduplicating {metric.value} (feature-level metric)")
                    elif metric == MetricType.SEMSIM_MEAN:
                        average_by = 'llm_explainer'
                        logger.info(f"Auto-deduplicating {metric.value} (explainer-level metric)")

            # If averageBy is specified (or auto-assigned), average values by the specified field
            if average_by:
                filtered_df = self._average_by_field(filtered_df, metric, average_by)

            # If groupBy is specified, generate grouped histograms
            if group_by:
                return self._generate_grouped_histogram(filtered_df, metric, bins, group_by, fixed_domain)

            # Otherwise, generate regular histogram
            values = self._extract_metric_values(filtered_df, metric)
            bins = self._calculate_bins_if_needed(values, bins)

            # Use fixed domain if provided, otherwise use data range
            if fixed_domain:
                bin_range = fixed_domain
                logger.debug(f"Using fixed domain for histogram: {bin_range}")
            else:
                bin_range = (float(np.min(values)), float(np.max(values)))

            counts, bin_edges = np.histogram(values, bins=bins, range=bin_range)
            bin_centers = (bin_edges[:-1] + bin_edges[1:]) / 2

            return HistogramResponse(
                metric=metric.value,
                histogram={
                    "bins": bin_centers.tolist(),
                    "counts": counts.tolist(),
                    "bin_edges": bin_edges.tolist()
                },
                statistics=self._calculate_statistics(values),
                total_features=len(values)
            )

        except Exception as e:
            logger.error(f"Error generating histogram: {e}")
            raise

    def _apply_filtered_data(
        self,
        filters: Filters,
        threshold_tree: Optional[ThresholdStructure],
        node_id: Optional[str]
    ) -> pl.DataFrame:
        """Apply filters and node-specific filtering to get final dataset."""
        filtered_df = self._apply_filters(self._df_lazy, filters).collect()

        if len(filtered_df) == 0:
            raise ValueError("No data available after applying filters")

        if threshold_tree or node_id:
            logger.debug(f"Applying node-specific filtering for node: {node_id}")
            engine = ClassificationEngine()
            filtered_df = engine.filter_features_for_node(filtered_df, threshold_tree, node_id)

            if len(filtered_df) == 0:
                raise ValueError(f"No data available for node '{node_id}' after applying thresholds")

        return filtered_df

    def _join_consistency_scores(
        self,
        filtered_df: pl.DataFrame
    ) -> pl.DataFrame:
        """
        Join consistency scores with filtered data and compute min consistency per feature.

        For each feature:
        - llm_scorer_consistency: MIN across all scorer_consistency values
          (3 explainers × 2 metrics = 6 values per feature)
        - within_explanation_score: MIN of within_explanation_metric_consistency across explainers
          (3 explainer values per feature)
        - cross_explanation_overall_score: Consistency of overall_score across explainers
          (computed using normalized averages of embedding, fuzz, detection scores)

        All metrics are used for percentile-based classification.

        Args:
            filtered_df: DataFrame after applying filters

        Returns:
            DataFrame with consistency scores joined and computed per feature
        """
        if self._consistency_lazy is None:
            logger.warning("Consistency scores not available - skipping join")
            return filtered_df

        try:
            # Get unique feature IDs and explainers from filtered data
            feature_ids = filtered_df["feature_id"].unique().to_list()
            explainer_ids = filtered_df["llm_explainer"].unique().to_list()

            # Collect consistency scores that match filtered data
            consistency_df = (
                self._consistency_lazy
                .filter(
                    pl.col("feature_id").is_in(feature_ids) &
                    pl.col("llm_explainer").is_in(explainer_ids)
                )
                .collect()
                .with_columns([
                    pl.col("feature_id").cast(pl.UInt32)
                ])
            )

            if len(consistency_df) == 0:
                logger.warning("No matching consistency scores found for filtered data")
                return filtered_df

            # Compute MIN consistency per feature across all explainers and metrics
            # For each feature: min(all scorer_consistency_fuzz and scorer_consistency_detection values)
            min_consistency_per_feature = (
                consistency_df
                .select([
                    pl.col("feature_id"),
                    pl.min_horizontal([
                        pl.col("scorer_consistency_fuzz"),
                        pl.col("scorer_consistency_detection")
                    ]).alias("min_per_explainer")
                ])
                .group_by("feature_id")
                .agg([
                    pl.col("min_per_explainer").min().alias("llm_scorer_consistency")
                ])
                .with_columns([
                    pl.col("feature_id").cast(pl.UInt32)
                ])
            )

            logger.info(f"Computed min consistency for {len(min_consistency_per_feature)} features "
                       f"across {len(explainer_ids)} explainers")

            # Compute within-explanation score: MIN of within_explanation_metric_consistency across explainers
            # For each feature: min(within_explanation_metric_consistency for all explainers)
            within_explanation_per_feature = (
                consistency_df
                .group_by("feature_id")
                .agg([
                    pl.col("within_explanation_metric_consistency").min().alias("within_explanation_score")
                ])
                .with_columns([
                    pl.col("feature_id").cast(pl.UInt32)
                ])
            )

            logger.info(f"Computed within-explanation score for {len(within_explanation_per_feature)} features "
                       f"(min across {len(explainer_ids)} explainers)")

            # Get cross-explanation overall score if multiple explainers
            cross_explanation_overall_score_df = None
            if len(explainer_ids) >= 2:
                # Try to use pre-computed cross_explanation_overall_score from consistency parquet
                if 'cross_explanation_overall_score' in consistency_df.columns:
                    # Use pre-computed values (calculated with z-score normalization)
                    cross_explanation_overall_score_df = (
                        consistency_df
                        .select(['feature_id', 'cross_explanation_overall_score'])
                        .unique(subset=['feature_id'])  # One value per feature
                        .with_columns([
                            pl.col("feature_id").cast(pl.UInt32)
                        ])
                    )
                    logger.info(f"Using pre-computed cross_explanation_overall_score for {len(cross_explanation_overall_score_df)} features")
                else:
                    # Fallback: Compute cross_explanation_overall_score dynamically
                    # (This should rarely happen for default config)
                    logger.info(f"Pre-computed cross_explanation_overall_score not available, computing dynamically")

                    # Step 1: Compute global stats for normalization (mean/std for z-score, also min/max for fallback)
                    global_stats = {}
                    for metric_col in ['score_embedding', 'score_fuzz', 'score_detection']:
                        metric_values = filtered_df[metric_col].drop_nulls().to_list()
                        if len(metric_values) >= 2:
                            global_stats[metric_col.replace('score_', '')] = {
                                'mean': float(np.mean(metric_values)),
                                'std': float(np.std(metric_values, ddof=1)),
                                'min': float(np.min(metric_values)),
                                'max': float(np.max(metric_values))
                            }

                    # Step 2: Compute max_std using ConsistencyService
                    max_stds = ConsistencyService.compute_max_stds(filtered_df, explainer_ids, global_stats)
                    max_std_overall = max_stds.get('cross_explanation_overall_score', 0.5)

                    # Step 3: Compute per-feature cross_explanation_overall_score
                    cross_explanation_overall_score_df = ConsistencyService.compute_cross_explanation_overall_score_per_feature(
                        filtered_df,
                        explainer_ids,
                        feature_ids,
                        max_std_overall,
                        global_stats
                    )

                    logger.info(f"Computed cross_explanation_overall_score for {len(cross_explanation_overall_score_df)} features "
                               f"(consistency across {len(explainer_ids)} explainers)")

            # Join min consistency with filtered data
            result_df = filtered_df.join(
                min_consistency_per_feature,
                on="feature_id",
                how="left"
            )

            # Join within-explanation score
            result_df = result_df.join(
                within_explanation_per_feature,
                on="feature_id",
                how="left"
            )

            # Join cross-explanation overall score if computed
            if cross_explanation_overall_score_df is not None and len(cross_explanation_overall_score_df) > 0:
                result_df = result_df.join(
                    cross_explanation_overall_score_df,
                    on="feature_id",
                    how="left"
                )

            # Also join full consistency data for individual metric access
            result_df = result_df.join(
                consistency_df,
                on=["feature_id", "llm_explainer"],
                how="left"
            )

            # Add column aliases for frontend compatibility
            result_df = result_df.with_columns([
                pl.col("scorer_consistency_fuzz").alias("llm_scorer_consistency_fuzz"),
                pl.col("scorer_consistency_detection").alias("llm_scorer_consistency_detection")
            ])

            metrics_computed = "llm_scorer_consistency, within_explanation_score"
            if cross_explanation_overall_score_df is not None and len(cross_explanation_overall_score_df) > 0:
                metrics_computed += ", cross_explanation_overall_score"

            logger.info(f"Joined consistency scores: {len(result_df)} rows with {metrics_computed}")
            return result_df

        except Exception as e:
            logger.error(f"Error joining consistency scores: {e}")
            # Return original data if join fails
            return filtered_df

    def _extract_metric_values(self, df: pl.DataFrame, metric: MetricType) -> np.ndarray:
        """Extract and validate metric values from DataFrame."""
        metric_data = df.select([pl.col(metric.value).alias("metric_value")])
        values = metric_data.get_column("metric_value").drop_nulls().to_numpy()

        if len(values) == 0:
            raise ValueError("No valid values found for the specified metric")

        return values

    def _average_by_field(self, df: pl.DataFrame, metric: MetricType, average_by: Union[str, List[str]]) -> pl.DataFrame:
        """
        Average metric values by collapsing the specified field(s).

        Args:
            df: DataFrame with metric values
            metric: Metric to average
            average_by: Field(s) to collapse. Can be:
                - Single field (str): e.g., 'llm_explainer' - collapses that dimension
                - Multiple fields (List[str]): e.g., ['llm_explainer', 'llm_scorer'] - collapses all specified dimensions

        Returns:
            DataFrame with metric averaged per feature_id
        """
        # Normalize average_by to list for consistent handling
        fields_to_collapse = [average_by] if isinstance(average_by, str) else average_by

        # Group by feature_id and calculate mean of the metric
        averaged_df = (
            df.group_by([COL_FEATURE_ID])
            .agg(pl.col(metric.value).mean().alias(metric.value))
        )

        # Add back other necessary columns (take first value from each group)
        # Exclude the fields being collapsed and the metric itself
        columns_to_exclude = [COL_FEATURE_ID, metric.value] + fields_to_collapse
        other_columns = [col for col in df.columns if col not in columns_to_exclude]

        if other_columns:
            # Get first value for each feature_id for other columns
            first_values = (
                df.group_by([COL_FEATURE_ID])
                .agg([pl.col(col).first().alias(col) for col in other_columns])
            )
            averaged_df = averaged_df.join(first_values, on=COL_FEATURE_ID, how="left")

        # Log the averaging operation
        fields_str = " and ".join(fields_to_collapse)
        logger.info(f"Averaged {metric.value} by collapsing [{fields_str}]: {len(df)} rows -> {len(averaged_df)} features")
        return averaged_df

    def _calculate_bins_if_needed(self, values: np.ndarray, bins: Optional[int]) -> int:
        """Calculate optimal bins if not specified."""
        if bins is not None:
            return bins

        data_range = float(np.max(values) - np.min(values))
        std_dev = float(np.std(values))
        bins = self.calculate_optimal_bins(len(values), data_range, std_dev)

        logger.info(f"Auto-calculated {bins} bins for {len(values)} data points "
                   f"(range: {data_range:.3f}, std: {std_dev:.3f})")

        return bins

    def _calculate_statistics(self, values: np.ndarray) -> Dict[str, float]:
        """Calculate statistical summary for values."""
        return {
            "min": float(np.min(values)),
            "max": float(np.max(values)),
            "mean": float(np.mean(values)),
            "median": float(np.median(values)),
            "std": float(np.std(values))
        }

    def _generate_grouped_histogram(
        self,
        df: pl.DataFrame,
        metric: MetricType,
        bins: Optional[int],
        group_by: str,
        fixed_domain: Optional[tuple[float, float]] = None
    ) -> HistogramResponse:
        """Generate grouped histogram data by the specified field."""
        from ..models.responses import GroupedHistogramData

        # Get unique values for the grouping field
        if group_by not in df.columns:
            raise ValueError(f"Group by field '{group_by}' not found in data")

        group_values = df.select(pl.col(group_by)).unique().sort(group_by).to_series().to_list()

        if not group_values:
            raise ValueError(f"No unique values found for grouping field '{group_by}'")

        # Extract all values to determine common bin edges
        all_values = self._extract_metric_values(df, metric)
        bins = self._calculate_bins_if_needed(all_values, bins)

        # Use fixed domain if provided, otherwise use data range
        if fixed_domain:
            bin_range = fixed_domain
            logger.debug(f"Using fixed domain for grouped histogram: {bin_range}")
        else:
            bin_range = (float(np.min(all_values)), float(np.max(all_values)))

        # Calculate common bin edges based on all data
        _, common_bin_edges = np.histogram(all_values, bins=bins, range=bin_range)
        bin_centers = (common_bin_edges[:-1] + common_bin_edges[1:]) / 2

        # Generate histogram for each group
        grouped_data = []
        for group_value in group_values:
            # Filter data for this group
            group_df = df.filter(pl.col(group_by) == group_value)

            if len(group_df) == 0:
                continue

            # Extract metric values for this group
            group_values_array = self._extract_metric_values(group_df, metric)

            # Calculate histogram with common bin edges
            counts, _ = np.histogram(group_values_array, bins=common_bin_edges)

            # Calculate statistics for this group
            statistics = self._calculate_statistics(group_values_array)

            grouped_data.append(
                GroupedHistogramData(
                    group_value=str(group_value),
                    histogram={
                        "bins": bin_centers.tolist(),
                        "counts": counts.tolist(),
                        "bin_edges": common_bin_edges.tolist()
                    },
                    statistics=statistics,
                    total_features=len(group_values_array)
                )
            )

        # Return response with grouped data
        return HistogramResponse(
            metric=metric.value,
            histogram={
                "bins": bin_centers.tolist(),
                "counts": [0] * len(bin_centers),  # Empty for grouped response
                "bin_edges": common_bin_edges.tolist()
            },
            statistics=self._calculate_statistics(all_values),
            total_features=len(all_values),
            grouped_data=grouped_data
        )

    async def get_filtered_histogram_panel_data(
        self,
        feature_ids: List[int],
        bins: int = 20,
        selected_llm_explainers: Optional[List[str]] = None
    ) -> Dict[str, HistogramResponse]:
        """
        Generate all histogram panel data filtered by feature IDs.

        This method efficiently filters the dataset once and generates histograms
        for all 5 metrics used in the histogram panel.

        Args:
            feature_ids: List of feature IDs to include
            bins: Number of histogram bins (default: 20)
            selected_llm_explainers: Optional list of selected LLM explainers (1 or 2)
                                     for filtered histogram computation

        Returns:
            Dictionary mapping metric names to HistogramResponse objects
        """
        if not self.is_ready():
            raise RuntimeError("DataService not ready")

        if not feature_ids:
            raise ValueError("feature_ids cannot be empty")

        try:
            # Filter dataset once by feature IDs
            filtered_df = (
                self._df_lazy
                .filter(pl.col(COL_FEATURE_ID).is_in(feature_ids))
                .collect()
            )

            if len(filtered_df) == 0:
                raise ValueError(f"No data available for provided feature IDs")

            logger.info(f"Generating filtered histogram panel data for {len(filtered_df)} rows (from {len(feature_ids)} feature IDs)")

            # Define metrics configuration matching HistogramPanel requirements
            # Note: All metrics average to get 1 value per feature
            # - feature_splitting: Same value for all 9 combinations, deduplicate by averaging
            # - semsim_mean: Same across scorers, varies by explainer → average by explainer only
            # - score metrics: Vary by both explainer and scorer → average by both dimensions
            metrics_config = [
                (MetricType.FEATURE_SPLITTING, ['llm_explainer', 'llm_scorer'], (0.0, 0.6)),
                (MetricType.SEMSIM_MEAN, 'llm_explainer', (0.75, 1.0)),
                (MetricType.SCORE_EMBEDDING, ['llm_explainer', 'llm_scorer'], (0.0, 1.0)),
                (MetricType.SCORE_FUZZ, ['llm_explainer', 'llm_scorer'], (0.0, 1.0)),
                (MetricType.SCORE_DETECTION, ['llm_explainer', 'llm_scorer'], (0.0, 1.0))
            ]

            # Generate histogram for each metric
            histograms = {}
            for metric, average_by, fixed_domain in metrics_config:
                # If LLM explainers are selected (1 or 2), use LLM filtering logic
                if selected_llm_explainers and len(selected_llm_explainers) in [1, 2]:
                    logger.info(f"Using LLM-filtered data for {metric.value} with {len(selected_llm_explainers)} explainer(s)")

                    # For feature_splitting, use existing logic (no LLM filtering)
                    if metric == MetricType.FEATURE_SPLITTING:
                        df_for_metric = self._average_by_field(filtered_df, metric, ['llm_explainer', 'llm_scorer'])
                        values = self._extract_metric_values(df_for_metric, metric)

                    # For semsim_mean, use pairwise similarity parquet
                    elif metric == MetricType.SEMSIM_MEAN:
                        if len(selected_llm_explainers) == 1:
                            semsim_df = self._compute_semsim_for_one_llm(filtered_df, selected_llm_explainers[0])
                        else:
                            semsim_df = self._compute_semsim_for_two_llms(
                                filtered_df, selected_llm_explainers[0], selected_llm_explainers[1]
                            )
                        values = semsim_df.get_column("semsim_mean").drop_nulls().to_numpy()

                    # For score metrics, filter by selected LLMs and average
                    else:
                        llm_filtered_df = self._filter_by_llm_explainers(filtered_df, selected_llm_explainers)
                        df_for_metric = self._average_by_field(llm_filtered_df, metric, ['llm_explainer', 'llm_scorer'])
                        values = self._extract_metric_values(df_for_metric, metric)

                # Otherwise use existing logic (global filtering)
                else:
                    df_for_metric = filtered_df
                    if average_by:
                        df_for_metric = self._average_by_field(filtered_df, metric, average_by)
                    values = self._extract_metric_values(df_for_metric, metric)

                # Calculate bin range
                if fixed_domain:
                    bin_range = fixed_domain
                else:
                    bin_range = (float(np.min(values)), float(np.max(values)))

                # Generate histogram
                counts, bin_edges = np.histogram(values, bins=bins, range=bin_range)
                bin_centers = (bin_edges[:-1] + bin_edges[1:]) / 2

                # Build response
                histograms[metric.value] = HistogramResponse(
                    metric=metric.value,
                    histogram={
                        "bins": bin_centers.tolist(),
                        "counts": counts.tolist(),
                        "bin_edges": bin_edges.tolist()
                    },
                    statistics=self._calculate_statistics(values),
                    total_features=len(values)
                )

            logger.info(f"Successfully generated {len(histograms)} histograms for filtered data")
            return histograms

        except Exception as e:
            logger.error(f"Error generating filtered histogram panel data: {e}")
            raise

    async def get_features_in_threshold_range(
        self,
        filters: Filters,
        metric: MetricType,
        min_value: float,
        max_value: float,
        selected_llm_explainers: Optional[List[str]] = None
    ) -> List[int]:
        """
        Get unique feature IDs that fall within a specific threshold range for a given metric.

        This method is used by the progress bar visualization to track which features
        belong to each threshold selection in a threshold group.

        Args:
            filters: Filter criteria to apply
            metric: The metric to check
            min_value: Minimum threshold value (inclusive)
            max_value: Maximum threshold value (inclusive)
            selected_llm_explainers: Optional list of 1 or 2 selected LLM explainers for filtered computation

        Returns:
            List of unique feature IDs within the threshold range
        """
        if not self.is_ready():
            raise RuntimeError("DataService not ready")

        try:
            # Apply filters to get the base dataset
            filtered_df = self._apply_filters(self._df_lazy, filters).collect()

            if len(filtered_df) == 0:
                raise ValueError("No data available after applying filters")

            # If LLM explainers are selected (1 or 2), use LLM filtering logic
            if selected_llm_explainers and len(selected_llm_explainers) in [1, 2]:
                return self._get_llm_filtered_feature_ids(
                    filtered_df, metric, selected_llm_explainers, min_value, max_value
                )

            # Otherwise use existing logic (global filtering)
            metric_col = metric.value
            threshold_filtered = filtered_df.filter(
                (pl.col(metric_col) >= min_value) &
                (pl.col(metric_col) <= max_value)
            )

            # Get unique feature IDs
            feature_ids = (
                threshold_filtered
                .select(pl.col(COL_FEATURE_ID).unique())
                .get_column(COL_FEATURE_ID)
                .to_list()
            )

            # Convert to integers and return
            return [int(fid) for fid in feature_ids]

        except Exception as e:
            logger.error(f"Error getting features in threshold range: {e}")
            raise

    async def get_sankey_data(
        self,
        filters: Filters,
        threshold_data: Union[ThresholdStructure, Dict[str, Any]],
        use_v2: Optional[bool] = None
    ) -> SankeyResponse:
        """
        Generate Sankey diagram data using the v2 threshold system.

        Args:
            filters: Filter criteria
            threshold_data: ThresholdStructure as dict or ThresholdStructure object
            use_v2: Legacy parameter (ignored, always uses v2)

        Returns:
            SankeyResponse with nodes, links, and metadata
        """
        if not self.is_ready():
            raise RuntimeError("DataService not ready")

        filtered_df = self._apply_filters(self._df_lazy, filters).collect()

        if len(filtered_df) == 0:
            raise ValueError("No data available after applying filters")

        # Join consistency scores for percentile-based classification
        filtered_df = self._join_consistency_scores(filtered_df)

        return await self._get_sankey_data_impl(filtered_df, filters, threshold_data)

    async def _get_sankey_data_impl(
        self,
        filtered_df: pl.DataFrame,
        filters: Filters,
        threshold_data: Union[Dict[str, Any], ThresholdStructure]
    ) -> SankeyResponse:
        """Internal implementation using v2 classification engine."""
        threshold_structure = self._ensure_threshold_structure(threshold_data)

        engine = ClassificationEngine()
        classified_df = engine.classify_features(filtered_df, threshold_structure)
        nodes, links = engine.build_sankey_data(classified_df, threshold_structure)

        metadata = {
            "total_features": filtered_df.select(pl.col("feature_id")).n_unique(),
            "applied_filters": self._build_applied_filters(filters),
            "applied_thresholds": self._extract_applied_thresholds(threshold_structure)
        }

        return SankeyResponse(nodes=nodes, links=links, metadata=metadata)

    def _ensure_threshold_structure(
        self, threshold_data: Union[Dict[str, Any], ThresholdStructure]
    ) -> ThresholdStructure:
        """Convert threshold_data to ThresholdStructure if needed."""
        if isinstance(threshold_data, dict):
            return ThresholdStructure.from_dict(threshold_data)
        return threshold_data

    def _build_applied_filters(self, filters: Filters) -> Dict[str, List[str]]:
        """Build dictionary of applied filters."""
        applied_filters = {}
        filter_mapping = [
            (filters.sae_id, COL_SAE_ID),
            (filters.explanation_method, COL_EXPLANATION_METHOD),
            (filters.llm_explainer, COL_LLM_EXPLAINER),
            (filters.llm_scorer, COL_LLM_SCORER)
        ]

        for filter_value, column_name in filter_mapping:
            if filter_value:
                applied_filters[column_name] = filter_value

        return applied_filters

    def _extract_applied_thresholds(self, threshold_structure: ThresholdStructure) -> Dict[str, float]:
        """Extract threshold values from the threshold structure."""
        applied_thresholds = {}

        for node in threshold_structure.nodes:
            if not (hasattr(node, 'split_rule') and node.split_rule):
                continue

            # Range split rule
            if hasattr(node.split_rule, 'metric') and hasattr(node.split_rule, 'thresholds'):
                metric = node.split_rule.metric
                thresholds = node.split_rule.thresholds
                if thresholds:
                    if len(thresholds) == 1:
                        applied_thresholds[metric] = float(thresholds[0])
                    else:
                        for i, threshold in enumerate(thresholds):
                            applied_thresholds[f"{metric}_{i}"] = float(threshold)

            # Pattern split rule
            elif hasattr(node.split_rule, 'conditions') and node.split_rule.conditions:
                for metric_name, pattern_condition in node.split_rule.conditions.items():
                    if hasattr(pattern_condition, 'threshold') and pattern_condition.threshold is not None:
                        applied_thresholds[metric_name] = float(pattern_condition.threshold)
                    elif hasattr(pattern_condition, 'value') and pattern_condition.value is not None:
                        applied_thresholds[metric_name] = float(pattern_condition.value)

        return applied_thresholds

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
            combined_condition = self._build_feature_conditions(
                feature_id, sae_id, explanation_method, llm_explainer, llm_scorer
            )

            result_df = self._df_lazy.filter(combined_condition).collect()

            if len(result_df) == 0:
                raise ValueError(f"Feature {feature_id} not found with specified parameters")

            row = result_df.row(0, named=True)
            return self._build_feature_response(row)

        except Exception as e:
            logger.error(f"Error retrieving feature data: {e}")
            raise

    def _build_feature_conditions(
        self,
        feature_id: int,
        sae_id: Optional[str],
        explanation_method: Optional[str],
        llm_explainer: Optional[str],
        llm_scorer: Optional[str]
    ):
        """Build combined condition for feature query."""
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

        return combined_condition

    def _build_feature_response(self, row: Dict[str, Any]) -> FeatureResponse:
        """Build FeatureResponse from row data."""
        return FeatureResponse(
            feature_id=row[COL_FEATURE_ID],
            sae_id=row[COL_SAE_ID],
            explanation_method=row[COL_EXPLANATION_METHOD],
            llm_explainer=row[COL_LLM_EXPLAINER],
            llm_scorer=row[COL_LLM_SCORER],
            feature_splitting=row[COL_FEATURE_SPLITTING],
            semsim_mean=row[COL_SEMSIM_MEAN],
            semsim_max=row[COL_SEMSIM_MAX],
            scores={
                "fuzz": row[COL_SCORE_FUZZ] or 0.0,
                "simulation": row[COL_SCORE_SIMULATION] or 0.0,
                "detection": row[COL_SCORE_DETECTION] or 0.0,
                "embedding": row[COL_SCORE_EMBEDDING] or 0.0
            },
            details_path=row[COL_DETAILS_PATH]
        )

    async def get_umap_data(
        self,
        filters: Filters,
        umap_type: Optional[str] = "both",
        feature_ids: Optional[List[int]] = None,
        include_noise: bool = True
    ):
        """
        Get UMAP visualization data with cluster hierarchy.

        Args:
            filters: Filter criteria to apply
            umap_type: Type of UMAP data ('feature', 'explanation', or 'both')
            feature_ids: Optional list of specific feature IDs to include
            include_noise: Whether to include noise points

        Returns:
            UMAPDataResponse with points and cluster hierarchy
        """
        from ..models.responses import UMAPDataResponse, UMAPPoint, UMAPMetadata, ClusterNode

        if not self.is_ready():
            raise RuntimeError("DataService not ready")

        try:
            # Load UMAP parquet file
            umap_file = self.data_path / "master" / "umap_projections.parquet"
            if not umap_file.exists():
                raise FileNotFoundError(f"UMAP parquet file not found: {umap_file}")

            # Load data with lazy frame
            umap_df = pl.scan_parquet(umap_file)

            # Apply filters (reusing existing filter logic for feature_analysis parquet)
            # Note: UMAP parquet has different schema, so we filter on available columns
            filter_conditions = []

            # Filter by feature_ids if provided
            if feature_ids:
                filter_conditions.append(pl.col("feature_id").is_in(feature_ids))

            # Filter by umap_type
            if umap_type and umap_type != "both":
                filter_conditions.append(pl.col("umap_type") == umap_type)

            # Filter noise if requested
            if not include_noise:
                filter_conditions.append(pl.col("cluster_label") != "noise")

            # Apply all filter conditions
            if filter_conditions:
                combined_condition = filter_conditions[0]
                for condition in filter_conditions[1:]:
                    combined_condition = combined_condition & condition
                umap_df = umap_df.filter(combined_condition)

            # Collect the data
            df = umap_df.collect()

            if len(df) == 0:
                raise ValueError("No UMAP data available after applying filters")

            logger.info(f"Loaded {len(df)} UMAP points")

            # Split into features and explanations
            features = []
            explanations = []

            for row in df.iter_rows(named=True):
                point = UMAPPoint(
                    umap_id=row["umap_id"],
                    feature_id=row["feature_id"],
                    umap_x=row["umap_x"],
                    umap_y=row["umap_y"],
                    source=row["source"],
                    llm_explainer=row["llm_explainer"],
                    cluster_id=row["cluster_id"],
                    cluster_label=row["cluster_label"],
                    cluster_level=row["cluster_level"]
                )

                if row["umap_type"] == "feature":
                    features.append(point)
                else:
                    explanations.append(point)

            # Build cluster hierarchy
            cluster_hierarchy = self._build_cluster_hierarchy(df)

            # Count noise points
            noise_points = len(df.filter(pl.col("cluster_label") == "noise"))

            # Build metadata
            metadata = UMAPMetadata(
                total_points=len(df),
                feature_points=len(features),
                explanation_points=len(explanations),
                noise_points=noise_points,
                applied_filters=self._build_applied_filters(filters),
                cluster_hierarchy=cluster_hierarchy
            )

            logger.info(f"Generated UMAP response: {len(features)} features, {len(explanations)} explanations, {len(cluster_hierarchy)} clusters")

            return UMAPDataResponse(
                features=features,
                explanations=explanations,
                metadata=metadata
            )

        except Exception as e:
            logger.error(f"Error generating UMAP data: {e}")
            raise

    def _build_cluster_hierarchy(self, df: pl.DataFrame) -> Dict[str, Any]:
        """
        Build separate cluster hierarchies for features and explanations.

        Since features and explanations are clustered separately but share cluster IDs,
        we need to build separate hierarchies to avoid conflicts.

        Args:
            df: UMAP dataframe with both features and explanations

        Returns:
            Dictionary with two hierarchies:
            {
                "features": {...},      # hierarchy for feature clusters
                "explanations": {...}   # hierarchy for explanation clusters
            }
        """
        from ..models.responses import ClusterNode

        hierarchies = {
            "features": {},
            "explanations": {}
        }

        # Process each umap_type separately
        for umap_type in ["feature", "explanation"]:
            type_df = df.filter(pl.col("umap_type") == umap_type)

            if len(type_df) == 0:
                continue

            # Get unique clusters for this umap_type
            unique_clusters = type_df.select(
                pl.col("cluster_id").unique()
            ).get_column("cluster_id").to_list()

            hierarchy = {}

            # Build hierarchy for each cluster
            for cluster_id in unique_clusters:
                cluster_df = type_df.filter(pl.col("cluster_id") == cluster_id)

                if len(cluster_df) == 0:
                    continue

                # Get cluster info from first row (now safe - all rows have same level)
                first_row = cluster_df.row(0, named=True)
                level = first_row["cluster_level"]
                is_noise = first_row["cluster_label"] == "noise"
                point_count = len(cluster_df)

                # Determine parent from ancestors
                parent_id = None
                if level > 0:
                    # Parent is at level-1, check ancestor columns
                    if level == 1:
                        parent_id = first_row["ancestor_level_0"]
                    elif level == 2:
                        parent_id = first_row["ancestor_level_1"]
                    elif level == 3:
                        parent_id = first_row["ancestor_level_2"]

                hierarchy[cluster_id] = ClusterNode(
                    cluster_id=cluster_id,
                    level=level,
                    parent_id=parent_id,
                    children_ids=[],  # Will be filled in second pass
                    point_count=point_count,
                    is_noise=is_noise
                )

            # Second pass: build children_ids by looking for nodes where parent_id matches
            for cluster_id, node in hierarchy.items():
                for other_id, other_node in hierarchy.items():
                    if other_node.parent_id == cluster_id:
                        node.children_ids.append(other_id)

            # Store hierarchy for this umap_type
            hierarchies[umap_type + "s"] = hierarchy  # "features" or "explanations"

        logger.info(f"Built cluster hierarchies: {len(hierarchies['features'])} feature clusters, {len(hierarchies['explanations'])} explanation clusters")

        return hierarchies