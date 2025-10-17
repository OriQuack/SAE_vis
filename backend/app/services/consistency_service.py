"""
Consistency score calculation service.

Provides statistical consistency calculations for LLM scoring analysis:
- Standard deviation-based consistency with data-driven max_std
- Inverse CV (coefficient of variation) for backwards compatibility
- Normalized standard deviation for metric consistency
- Global z-score normalization for cross-metric comparison
- Semantic similarity aggregation for explainer consistency

All methods are stateless and can be called independently.
"""

import numpy as np
import polars as pl
from typing import List, Optional, Dict, Tuple

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

    @staticmethod
    def compute_std_consistency(
        scores: List[Optional[float]],
        max_std: float
    ) -> Optional[ConsistencyScore]:
        """
        Compute consistency using standard deviation with data-driven max_std.

        Formula: Consistency = 1 - (std / max_std)

        This method is more statistically robust than inverse CV, especially
        for values in bounded ranges like [0,1].

        Args:
            scores: List of score values (None values are filtered out)
            max_std: Maximum standard deviation observed in the data

        Returns:
            ConsistencyScore with value 0-1 and method="std_based", or None if insufficient data
        """
        # Filter out None values
        valid_scores = [s for s in scores if s is not None]

        if len(valid_scores) < 2:
            return None

        scores_array = np.array(valid_scores)
        std = np.std(scores_array, ddof=1)  # Sample std deviation

        # Avoid division by zero
        if max_std == 0 or np.isclose(max_std, 0):
            # If max_std is 0, all values in dataset are identical
            if std == 0 or np.isclose(std, 0):
                return ConsistencyScore(value=1.0, method="std_based")
            else:
                # This shouldn't happen in practice
                return ConsistencyScore(value=0.0, method="std_based")

        consistency = 1.0 - (std / max_std)
        consistency = np.clip(consistency, 0, 1)  # Ensure in [0,1] range

        return ConsistencyScore(
            value=float(round(consistency, 3)),
            method="std_based"
        )

    @staticmethod
    def compute_normalized_std_consistency(
        values: Dict[str, Optional[float]],
        global_stats: Dict[str, Dict[str, float]],
        max_std: float
    ) -> Optional[ConsistencyScore]:
        """
        Compute within-explanation metric consistency with normalization.

        Process:
        1. Normalize each metric to [0,1] using global min/max
        2. Compute std of normalized values
        3. Apply formula: 1 - (std_normalized / max_std)

        Args:
            values: Dict of metric names to values (e.g., {'embedding': 0.5, 'fuzz': 0.7, 'detection': 0.6})
            global_stats: Dict with 'min' and 'max' for each metric
            max_std: Maximum std of normalized values observed in data

        Returns:
            ConsistencyScore with value 0-1 and method="normalized_std", or None if insufficient data
        """
        normalized_values = []

        for metric_name, value in values.items():
            if value is None or metric_name not in global_stats:
                continue

            stats = global_stats[metric_name]
            min_val = stats.get('min', 0)
            max_val = stats.get('max', 1)

            # Normalize to [0,1]
            if max_val - min_val > 0:
                normalized = (value - min_val) / (max_val - min_val)
                normalized_values.append(normalized)

        # Need at least 2 metrics
        if len(normalized_values) < 2:
            return None

        # Compute std of normalized values
        std = np.std(normalized_values, ddof=1)

        # Apply consistency formula
        if max_std == 0 or np.isclose(max_std, 0):
            if std == 0 or np.isclose(std, 0):
                return ConsistencyScore(value=1.0, method="normalized_std")
            else:
                return ConsistencyScore(value=0.0, method="normalized_std")

        consistency = 1.0 - (std / max_std)
        consistency = np.clip(consistency, 0, 1)

        return ConsistencyScore(
            value=float(round(consistency, 3)),
            method="normalized_std"
        )

    @staticmethod
    def compute_max_stds(
        df: pl.DataFrame,
        explainer_ids: List[str],
        global_stats: Dict[str, Dict[str, float]]
    ) -> Dict[str, float]:
        """
        Compute actual max_std values from data for dynamic calculation.

        This is used when pre-computed values are not available (non-default configurations).

        Args:
            df: DataFrame with score data
            explainer_ids: List of explainer IDs
            global_stats: Global statistics for normalization

        Returns:
            Dict mapping metric types to their max_std values
        """
        feature_ids = sorted(df['feature_id'].unique().to_list())

        # Collectors for std computation
        scorer_stds_fuzz = []
        scorer_stds_detection = []
        within_explanation_stds = []
        cross_explanation_stds_embedding = []
        cross_explanation_stds_fuzz = []
        cross_explanation_stds_detection = []
        cross_explanation_stds_overall_score = []

        for feature_id in feature_ids:
            feature_df = df.filter(pl.col("feature_id") == feature_id)

            # Scorer consistency stds (per explainer)
            for explainer in explainer_ids:
                explainer_df = feature_df.filter(pl.col("llm_explainer") == explainer)
                if len(explainer_df) == 0:
                    continue

                # Get scores across scorers
                fuzz_scores = explainer_df['score_fuzz'].drop_nulls().to_list()
                detection_scores = explainer_df['score_detection'].drop_nulls().to_list()

                if len(fuzz_scores) >= 2:
                    scorer_stds_fuzz.append(np.std(fuzz_scores, ddof=1))
                if len(detection_scores) >= 2:
                    scorer_stds_detection.append(np.std(detection_scores, ddof=1))

                # Within-explanation consistency (normalized)
                embedding_val = explainer_df['score_embedding'].drop_nulls().to_list()
                embedding_val = embedding_val[0] if embedding_val else None

                fuzz_val = np.mean(fuzz_scores) if fuzz_scores else None
                detection_val = np.mean(detection_scores) if detection_scores else None

                # Normalize values
                normalized_values = []
                if embedding_val is not None and 'embedding' in global_stats:
                    stats = global_stats['embedding']
                    if stats['max'] - stats['min'] > 0:
                        normalized = (embedding_val - stats['min']) / (stats['max'] - stats['min'])
                        normalized_values.append(normalized)

                if fuzz_val is not None and 'fuzz' in global_stats:
                    stats = global_stats['fuzz']
                    if stats['max'] - stats['min'] > 0:
                        normalized = (fuzz_val - stats['min']) / (stats['max'] - stats['min'])
                        normalized_values.append(normalized)

                if detection_val is not None and 'detection' in global_stats:
                    stats = global_stats['detection']
                    if stats['max'] - stats['min'] > 0:
                        normalized = (detection_val - stats['min']) / (stats['max'] - stats['min'])
                        normalized_values.append(normalized)

                if len(normalized_values) >= 2:
                    within_explanation_stds.append(np.std(normalized_values, ddof=1))

            # Cross-explanation consistency (across explainers)
            embedding_across = []
            fuzz_across = []
            detection_across = []

            for explainer in explainer_ids:
                explainer_df = feature_df.filter(pl.col("llm_explainer") == explainer)
                if len(explainer_df) == 0:
                    continue

                embedding_vals = explainer_df['score_embedding'].drop_nulls().to_list()
                if embedding_vals:
                    embedding_across.append(embedding_vals[0])

                fuzz_vals = explainer_df['score_fuzz'].drop_nulls().to_list()
                if fuzz_vals:
                    fuzz_across.append(np.mean(fuzz_vals))

                detection_vals = explainer_df['score_detection'].drop_nulls().to_list()
                if detection_vals:
                    detection_across.append(np.mean(detection_vals))

            if len(embedding_across) >= 2:
                cross_explanation_stds_embedding.append(np.std(embedding_across, ddof=1))
            if len(fuzz_across) >= 2:
                cross_explanation_stds_fuzz.append(np.std(fuzz_across, ddof=1))
            if len(detection_across) >= 2:
                cross_explanation_stds_detection.append(np.std(detection_across, ddof=1))

            # Cross-explanation overall score consistency
            # Calculate overall score for each explainer (using normalized average)
            overall_scores_across = []
            for i, explainer in enumerate(explainer_ids):
                # Skip if we don't have values for this explainer
                if i >= len(embedding_across) and i >= len(fuzz_across) and i >= len(detection_across):
                    continue

                normalized_scores = []

                # Normalize and add embedding if available
                if i < len(embedding_across) and 'embedding' in global_stats:
                    stats = global_stats['embedding']
                    if stats['max'] - stats['min'] > 0:
                        normalized = (embedding_across[i] - stats['min']) / (stats['max'] - stats['min'])
                        normalized_scores.append(normalized)

                # Normalize and add fuzz if available
                if i < len(fuzz_across) and 'fuzz' in global_stats:
                    stats = global_stats['fuzz']
                    if stats['max'] - stats['min'] > 0:
                        normalized = (fuzz_across[i] - stats['min']) / (stats['max'] - stats['min'])
                        normalized_scores.append(normalized)

                # Normalize and add detection if available
                if i < len(detection_across) and 'detection' in global_stats:
                    stats = global_stats['detection']
                    if stats['max'] - stats['min'] > 0:
                        normalized = (detection_across[i] - stats['min']) / (stats['max'] - stats['min'])
                        normalized_scores.append(normalized)

                # Calculate overall score as average of normalized scores
                if len(normalized_scores) >= 2:
                    overall_score = np.mean(normalized_scores)
                    overall_scores_across.append(overall_score)

            if len(overall_scores_across) >= 2:
                cross_explanation_stds_overall_score.append(np.std(overall_scores_across, ddof=1))

        # Compute max_stds with fallback values
        return {
            'scorer_fuzz': float(np.max(scorer_stds_fuzz)) if scorer_stds_fuzz else 0.5,
            'scorer_detection': float(np.max(scorer_stds_detection)) if scorer_stds_detection else 0.5,
            'within_explanation': float(np.max(within_explanation_stds)) if within_explanation_stds else 0.5,
            'cross_explanation_embedding': float(np.max(cross_explanation_stds_embedding)) if cross_explanation_stds_embedding else 0.5,
            'cross_explanation_fuzz': float(np.max(cross_explanation_stds_fuzz)) if cross_explanation_stds_fuzz else 0.5,
            'cross_explanation_detection': float(np.max(cross_explanation_stds_detection)) if cross_explanation_stds_detection else 0.5,
            'cross_explanation_overall_score': float(np.max(cross_explanation_stds_overall_score)) if cross_explanation_stds_overall_score else 0.5
        }
