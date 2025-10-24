"""
Histogram service for generating histogram visualizations.

Clean architecture:
1. Load data from appropriate source (feature_analysis or consistency_scores)
2. Apply filters and threshold path constraints
3. Calculate histogram bins and statistics
4. Return structured histogram response

All histogram-specific logic is centralized here for maintainability.
"""

import polars as pl
import numpy as np
import logging
import re
from typing import Dict, List, Optional, Union, Any, TYPE_CHECKING

from ..models.common import Filters, MetricType
from ..models.responses import HistogramResponse, GroupedHistogramData
from .data_constants import (
    COL_FEATURE_ID,
    COL_SAE_ID,
    COL_EXPLANATION_METHOD,
    COL_LLM_EXPLAINER,
    COL_LLM_SCORER
)

# Import for type hints only (avoids circular imports)
if TYPE_CHECKING:
    from .data_service import DataService

logger = logging.getLogger(__name__)

# Consistency metrics that use consistency_scores.parquet
CONSISTENCY_METRICS = [
    MetricType.LLM_SCORER_CONSISTENCY,
    MetricType.WITHIN_EXPLANATION_METRIC_CONSISTENCY,
    MetricType.CROSS_EXPLANATION_METRIC_CONSISTENCY,
    MetricType.CROSS_EXPLANATION_OVERALL_SCORE_CONSISTENCY,
    MetricType.LLM_EXPLAINER_CONSISTENCY
]


def parse_range_label(range_label: str) -> tuple[Optional[float], Optional[float]]:
    """
    Parse range label to extract min/max bounds for filtering.

    Supports formats:
    - "< X" or "<= X" -> (None, X)
    - "> X" or ">= X" -> (X, None)
    - "[X, Y)" or "[X, Y]" or "(X, Y)" -> (X, Y)

    Args:
        range_label: Range label string to parse

    Returns:
        Tuple of (min_value, max_value) where either can be None
    """
    # Pattern: "< X" or "<= X"
    if match := re.match(r'^<\s*=?\s*([\d.]+)', range_label):
        return (None, float(match.group(1)))

    # Pattern: "> X" or ">= X"
    if match := re.match(r'^>\s*=?\s*([\d.]+)', range_label):
        return (float(match.group(1)), None)

    # Pattern: "[X, Y)" or "[X, Y]" or "(X, Y)"
    if match := re.match(r'^[\[\(]\s*([\d.]+)\s*,\s*([\d.]+)\s*[\]\)]', range_label):
        return (float(match.group(1)), float(match.group(2)))

    logger.warning(f"Could not parse range label: {range_label}")
    return (None, None)


class HistogramService:
    """Service for generating histogram visualization data."""

    def __init__(self, data_service: "DataService"):
        """
        Initialize HistogramService.

        Args:
            data_service: Instance of DataService for raw data access
        """
        self.data_service = data_service

    async def get_histogram_data(
        self,
        filters: Filters,
        metric: MetricType,
        bins: Optional[int] = None,
        node_id: Optional[str] = None,
        fixed_domain: Optional[tuple[float, float]] = None,
        threshold_path: Optional[List[Dict[str, str]]] = None
    ) -> HistogramResponse:
        """
        Generate histogram data for a specific metric with optional threshold path filtering.

        Args:
            filters: Filter criteria to apply
            metric: Metric to analyze
            bins: Number of histogram bins (auto-calculated if None)
            node_id: Optional node ID for reference (not used for filtering)
            fixed_domain: Optional fixed range for histogram bins
            threshold_path: Optional threshold path constraints from root to node for filtering

        Returns:
            HistogramResponse with histogram data and statistics
        """
        if not self.data_service.is_ready():
            raise RuntimeError("DataService not ready")

        try:
            # Get filtered data (handles both standard and consistency metrics)
            filtered_df = self._get_metric_data(filters, metric, threshold_path)

            # Generate histogram
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

    def _get_metric_data(
        self,
        filters: Filters,
        metric: MetricType,
        threshold_path: Optional[List[Dict[str, str]]]
    ) -> pl.DataFrame:
        """
        Get data for any metric (standard or consistency) with unified flow.

        Args:
            filters: Filter criteria to apply
            metric: Metric to analyze
            threshold_path: Optional threshold path constraints

        Returns:
            Filtered DataFrame ready for histogram generation
        """
        # Apply filters to get base dataframe
        filtered_df = self.data_service.apply_filters(
            self.data_service._df_lazy, filters
        ).collect()

        # Apply threshold path constraints if provided
        if threshold_path:
            logger.info(f"Applying threshold path filtering with {len(threshold_path)} constraints")
            for constraint in threshold_path:
                metric_col = constraint.get('metric')
                range_label = constraint.get('rangeLabel')

                if not metric_col or not range_label:
                    logger.warning(f"Skipping invalid constraint: {constraint}")
                    continue

                # Parse range and apply filter
                min_val, max_val = parse_range_label(range_label)

                if min_val is not None:
                    filtered_df = filtered_df.filter(pl.col(metric_col) >= min_val)
                    logger.debug(f"Applied constraint: {metric_col} >= {min_val}")

                if max_val is not None:
                    filtered_df = filtered_df.filter(pl.col(metric_col) < max_val)
                    logger.debug(f"Applied constraint: {metric_col} < {max_val}")

            logger.info(f"After threshold path filtering: {len(filtered_df)} rows")

        # If consistency metric, join with consistency_scores.parquet
        if metric in CONSISTENCY_METRICS:
            logger.info(f"Joining consistency scores for metric: {metric.value}")

            if self.data_service._consistency_lazy is None:
                raise ValueError(
                    f"Consistency scores not available for metric: {metric.value}. "
                    f"Please ensure consistency_scores.parquet exists."
                )

            # Get unique feature_id and llm_explainer pairs from filtered data
            unique_pairs = filtered_df.select([COL_FEATURE_ID, COL_LLM_EXPLAINER]).unique()

            # Collect consistency scores
            consistency_df = self.data_service._consistency_lazy.collect()

            # Join with consistency scores (has 1 row per feature_id + llm_explainer)
            filtered_df = unique_pairs.join(
                consistency_df,
                on=[COL_FEATURE_ID, COL_LLM_EXPLAINER],
                how='inner'
            )

            # Compute metric values for consistency metrics that need calculation
            filtered_df = self._compute_consistency_metric(filtered_df, metric)

            logger.info(f"After consistency join: {len(filtered_df)} rows")

        # Automatically deduplicate feature-level and score metrics
        average_by = None
        if metric in [MetricType.FEATURE_SPLITTING, MetricType.SEMSIM_MEAN,
                      MetricType.SCORE_FUZZ, MetricType.SCORE_DETECTION,
                      MetricType.SCORE_EMBEDDING, MetricType.OVERALL_SCORE]:
            if metric == MetricType.FEATURE_SPLITTING:
                average_by = ['llm_explainer', 'llm_scorer']
                logger.info(f"Auto-deduplicating {metric.value} (feature-level metric)")
            elif metric in [MetricType.SCORE_FUZZ, MetricType.SCORE_DETECTION]:
                # Scorer-level metrics: vary by scorer, so average by both
                average_by = ['llm_explainer', 'llm_scorer']
                logger.info(f"Auto-deduplicating {metric.value} (scorer-level metric)")
            elif metric in [MetricType.SEMSIM_MEAN, MetricType.SCORE_EMBEDDING, MetricType.OVERALL_SCORE]:
                # Explainer-level metrics: same value across scorers, so average by explainer only
                average_by = 'llm_explainer'
                logger.info(f"Auto-deduplicating {metric.value} (explainer-level metric)")

        # Average if needed
        if average_by:
            filtered_df = self._average_by_field(filtered_df, metric, average_by)

        return filtered_df

    def _compute_consistency_metric(self, df: pl.DataFrame, metric: MetricType) -> pl.DataFrame:
        """
        Compute consistency metric values for metrics that need calculation.

        Args:
            df: DataFrame with consistency scores joined
            metric: Metric type

        Returns:
            DataFrame with computed metric column added
        """
        # If metric column already exists, nothing to do
        if metric.value in df.columns:
            return df

        # Compute llm_scorer_consistency: min(fuzz, detection)
        if metric == MetricType.LLM_SCORER_CONSISTENCY:
            logger.info("Computing llm_scorer_consistency as min(fuzz, detection)")
            return df.with_columns(
                pl.min_horizontal([
                    pl.col('llm_scorer_consistency_fuzz'),
                    pl.col('llm_scorer_consistency_detection')
                ]).alias(metric.value)
            )

        # cross_explanation_metric_consistency: min(embedding, fuzz, detection)
        elif metric == MetricType.CROSS_EXPLANATION_METRIC_CONSISTENCY:
            logger.info("Computing cross_explanation_metric_consistency as min(embedding, fuzz, detection)")
            return df.with_columns(
                pl.min_horizontal([
                    pl.col('cross_explanation_metric_consistency_embedding'),
                    pl.col('cross_explanation_metric_consistency_fuzz'),
                    pl.col('cross_explanation_metric_consistency_detection')
                ]).alias(metric.value)
            )

        # All other consistency metrics should exist as columns
        return df

    def _extract_metric_values(self, df: pl.DataFrame, metric: MetricType) -> np.ndarray:
        """Extract and validate metric values from DataFrame."""
        metric_data = df.select([pl.col(metric.value).alias("metric_value")])
        values = metric_data.get_column("metric_value").drop_nulls().to_numpy()

        if len(values) == 0:
            raise ValueError("No valid values found for the specified metric")

        return values

    def _average_by_field(
        self,
        df: pl.DataFrame,
        metric: MetricType,
        average_by: Union[str, List[str]]
    ) -> pl.DataFrame:
        """
        Average metric values by collapsing the specified field(s).

        Args:
            df: DataFrame with metric values
            metric: Metric to average
            average_by: Field(s) to collapse. Can be:
                - Single field (str): e.g., 'llm_explainer' - collapses that dimension
                - Multiple fields (List[str]): e.g., ['llm_explainer', 'llm_scorer']

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
        iqr_approx = 1.35 * std_dev
        if iqr_approx > 0 and data_range > 0:
            bin_width = 2 * iqr_approx * (data_size ** (-1/3))
            freedman = int(np.ceil(data_range / bin_width))
        else:
            freedman = sturges

        # Choose based on data characteristics
        if data_size < 30:
            optimal = max(5, sturges)
        elif data_size < 100:
            optimal = sturges
        elif data_size < 1000:
            optimal = rice
        else:
            optimal = min(freedman, rice) if freedman > 0 else rice

        # Apply constraints (between 5 and 50 bins)
        return max(5, min(50, optimal))

    def _calculate_statistics(self, values: np.ndarray) -> Dict[str, float]:
        """Calculate statistical summary for values."""
        return {
            "min": float(np.min(values)),
            "max": float(np.max(values)),
            "mean": float(np.mean(values)),
            "median": float(np.median(values)),
            "std": float(np.std(values))
        }
