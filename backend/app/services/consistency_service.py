"""
Consistency score calculation service.

Provides statistical consistency calculations for LLM scoring analysis:
- Inverse CV (coefficient of variation) for scorer/explainer consistency
- Normalized standard deviation for metric consistency
- Global z-score normalization for cross-metric comparison
- Semantic similarity aggregation for explainer consistency

All methods are stateless and can be called independently.
"""

import numpy as np
import polars as pl
from typing import List, Optional, Dict

from ..models.responses import ConsistencyScore


class ConsistencyService:
    """
    Service for computing various consistency scores.

    All methods are static as they perform pure calculations without state.
    """

    @staticmethod
    def compute_inverse_cv(scores: List[Optional[float]]) -> Optional[ConsistencyScore]:
        """
        Compute inverse coefficient of variation for consistency measurement.

        Formula: Consistency = 1 / (1 + CV) where CV = std / mean

        This provides a natural 0-1 scaling:
        - CV = 0 → consistency = 1.0 (perfect agreement)
        - CV = 1 → consistency = 0.5 (moderate variation)
        - CV → ∞ → consistency → 0 (high variation)

        Used for:
        - LLM Scorer consistency (within-metric consistency across scorers)
        - Cross-explainer metric consistency (consistency of each metric across explainers)

        Args:
            scores: List of score values (None values are filtered out)

        Returns:
            ConsistencyScore with value 0-1 and method="inverse_cv", or None if insufficient data
        """
        # Filter out None values
        valid_scores = [s for s in scores if s is not None]

        if len(valid_scores) < 2:
            return None

        scores_array = np.array(valid_scores)
        mean = np.mean(scores_array)
        std = np.std(scores_array, ddof=1)  # Sample std deviation

        # Handle edge cases
        if mean == 0 or np.isclose(mean, 0):
            # If mean is 0, CV is undefined
            if std == 0 or np.isclose(std, 0):
                # Both mean and std are 0 - perfect consistency
                return ConsistencyScore(value=1.0, method="inverse_cv")
            else:
                # Mean is 0 but std is not - inconsistent
                return ConsistencyScore(value=0.0, method="inverse_cv")

        cv = std / abs(mean)

        # Inverse CV formula: consistency = 1 / (1 + CV)
        consistency = 1.0 / (1.0 + cv)

        return ConsistencyScore(
            value=float(round(consistency, 3)),
            method="inverse_cv"
        )

    @staticmethod
    def compute_normalized_std(scores: List[Optional[float]]) -> Optional[ConsistencyScore]:
        """
        Compute normalized standard deviation for metric consistency.

        Process:
        1. Normalize all scores to 0-1 range
        2. Compute standard deviation
        3. Convert to consistency score (1 - normalized_std)

        This method is useful when comparing metrics with different scales,
        though in our case most metrics are already 0-1.

        Args:
            scores: List of score values (None values are filtered out)

        Returns:
            ConsistencyScore with value 0-1 and method="normalized_std", or None if insufficient data
        """
        # Filter out None values
        valid_scores = [s for s in scores if s is not None]

        if len(valid_scores) < 2:
            return None

        scores_array = np.array(valid_scores)

        # Normalize scores to 0-1 range
        min_score = np.min(scores_array)
        max_score = np.max(scores_array)

        if max_score - min_score == 0 or np.isclose(max_score, min_score):
            # All scores are the same - perfect consistency
            return ConsistencyScore(value=1.0, method="normalized_std")

        normalized = (scores_array - min_score) / (max_score - min_score)

        # Compute standard deviation of normalized scores
        std = np.std(normalized, ddof=1)

        # Convert std to consistency (0 std = 1 consistency, max std = 0 consistency)
        # Max std for normalized 0-1 data is ~0.5 (when values are at extremes)
        normalized_std = min(std / 0.5, 1.0)
        consistency = 1.0 - normalized_std

        return ConsistencyScore(
            value=float(round(consistency, 3)),
            method="normalized_std"
        )

    @staticmethod
    def compute_global_zscore_consistency(
        embedding: Optional[float],
        fuzz: Optional[float],
        detection: Optional[float],
        global_stats: Dict[str, Dict[str, float]]
    ) -> Optional[ConsistencyScore]:
        """
        Compute metric consistency using global z-score normalization.

        Process:
        1. Convert each metric to z-score using global mean/std
        2. Compute standard deviation of z-scores
        3. Convert to consistency score

        This allows fair comparison of metrics with different distributions
        by normalizing relative to the global dataset.

        Args:
            embedding: Embedding score value
            fuzz: Fuzz score value
            detection: Detection score value
            global_stats: Dict with 'mean' and 'std' for each metric

        Returns:
            ConsistencyScore with value 0-1 and method="global_zscore", or None if insufficient data
        """
        # Collect metric values that are not None
        metric_values = []
        metric_names = []

        if embedding is not None and 'embedding' in global_stats:
            metric_values.append(embedding)
            metric_names.append('embedding')
        if fuzz is not None and 'fuzz' in global_stats:
            metric_values.append(fuzz)
            metric_names.append('fuzz')
        if detection is not None and 'detection' in global_stats:
            metric_values.append(detection)
            metric_names.append('detection')

        # Need at least 2 metrics to compute consistency
        if len(metric_values) < 2:
            return None

        # Compute z-scores for each metric
        z_scores = []
        for value, name in zip(metric_values, metric_names):
            stats = global_stats[name]
            mean = stats['mean']
            std = stats['std']

            # Avoid division by zero
            if std == 0 or np.isclose(std, 0):
                # If std is 0, all values are the same - use 0 as z-score
                z_score = 0.0
            else:
                z_score = (value - mean) / std

            z_scores.append(z_score)

        # Compute standard deviation of z-scores
        z_scores_array = np.array(z_scores)
        std_z = np.std(z_scores_array, ddof=1)

        # Convert std to consistency
        # For z-scores, std typically ranges from 0 to ~2.0 (values within ~2 std of each other)
        # Higher std = lower consistency
        normalized_std = min(std_z / 2.0, 1.0)
        consistency = 1.0 - normalized_std

        return ConsistencyScore(
            value=float(round(consistency, 3)),
            method="global_zscore"
        )

    @staticmethod
    def compute_semantic_similarity_consistency(
        feature_id: int,
        selected_explainers: List[str],
        pairwise_df: pl.DataFrame
    ) -> Optional[ConsistencyScore]:
        """
        Compute LLM explainer semantic consistency via average pairwise cosine similarity.

        This measures how similar the explanations from different LLM explainers are
        for a given feature, based on pre-computed embedding similarities.

        Args:
            feature_id: Feature ID to compute consistency for
            selected_explainers: List of selected LLM explainer IDs
            pairwise_df: DataFrame with pairwise cosine similarities

        Returns:
            ConsistencyScore with value 0-1 and method="avg_pairwise_cosine", or None if insufficient data
        """
        if len(selected_explainers) < 2:
            return None

        # Filter pairwise data for this feature
        feature_pairs = pairwise_df.filter(pl.col("feature_id") == feature_id)

        if len(feature_pairs) == 0:
            return None

        # Filter to only selected explainers
        relevant_pairs = feature_pairs.filter(
            pl.col("explainer_1").is_in(selected_explainers) &
            pl.col("explainer_2").is_in(selected_explainers)
        )

        if len(relevant_pairs) == 0:
            return None

        # Get cosine similarities
        similarities = relevant_pairs["cosine_similarity"].to_list()

        if not similarities or len(similarities) == 0:
            return None

        # Average pairwise cosine similarity
        avg_similarity = float(np.mean(similarities))

        return ConsistencyScore(
            value=float(round(avg_similarity, 3)),
            method="avg_pairwise_cosine"
        )
