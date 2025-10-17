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
        1. Normalize each metric using z-score normalization
        2. Compute std of normalized values
        3. Apply formula: 1 - (std_normalized / max_std)

        Args:
            values: Dict of metric names to values (e.g., {'embedding': 0.5, 'fuzz': 0.7, 'detection': 0.6})
            global_stats: Dict with 'mean' and 'std' for each metric
            max_std: Maximum std of normalized values observed in data

        Returns:
            ConsistencyScore with value 0-1 and method="normalized_std", or None if insufficient data
        """
        normalized_values = []

        for metric_name, value in values.items():
            if value is None or metric_name not in global_stats:
                continue

            stats = global_stats[metric_name]
            mean = stats.get('mean', 0)
            std = stats.get('std', 1)

            # Z-score normalization
            if std > 0:
                normalized = (value - mean) / std
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
        llm_scorer_stds_fuzz = []
        llm_scorer_stds_detection = []
        within_explanation_stds = []
        cross_explanation_metric_consistency_stds_embedding = []
        cross_explanation_metric_consistency_stds_fuzz = []
        cross_explanation_metric_consistency_stds_detection = []
        cross_explanation_overall_score_consistency_stds = []

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
                    llm_scorer_stds_fuzz.append(np.std(fuzz_scores, ddof=1))
                if len(detection_scores) >= 2:
                    llm_scorer_stds_detection.append(np.std(detection_scores, ddof=1))

                # Within-explanation consistency (normalized)
                embedding_val = explainer_df['score_embedding'].drop_nulls().to_list()
                embedding_val = embedding_val[0] if embedding_val else None

                fuzz_val = np.mean(fuzz_scores) if fuzz_scores else None
                detection_val = np.mean(detection_scores) if detection_scores else None

                # Z-score normalization
                normalized_values = []
                if embedding_val is not None and 'embedding' in global_stats:
                    stats = global_stats['embedding']
                    if stats['std'] > 0:
                        normalized = (embedding_val - stats['mean']) / stats['std']
                        normalized_values.append(normalized)

                if fuzz_val is not None and 'fuzz' in global_stats:
                    stats = global_stats['fuzz']
                    if stats['std'] > 0:
                        normalized = (fuzz_val - stats['mean']) / stats['std']
                        normalized_values.append(normalized)

                if detection_val is not None and 'detection' in global_stats:
                    stats = global_stats['detection']
                    if stats['std'] > 0:
                        normalized = (detection_val - stats['mean']) / stats['std']
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
                cross_explanation_metric_consistency_stds_embedding.append(np.std(embedding_across, ddof=1))
            if len(fuzz_across) >= 2:
                cross_explanation_metric_consistency_stds_fuzz.append(np.std(fuzz_across, ddof=1))
            if len(detection_across) >= 2:
                cross_explanation_metric_consistency_stds_detection.append(np.std(detection_across, ddof=1))

            # Cross-explanation overall score consistency
            # Calculate overall score for each explainer (using normalized average)
            overall_scores_across = []
            for i, explainer in enumerate(explainer_ids):
                # Skip if we don't have values for this explainer
                if i >= len(embedding_across) and i >= len(fuzz_across) and i >= len(detection_across):
                    continue

                normalized_scores = []

                # Z-score normalization and add embedding if available
                if i < len(embedding_across) and 'embedding' in global_stats:
                    stats = global_stats['embedding']
                    if stats['std'] > 0:
                        normalized = (embedding_across[i] - stats['mean']) / stats['std']
                        normalized_scores.append(normalized)

                # Z-score normalization and add fuzz if available
                if i < len(fuzz_across) and 'fuzz' in global_stats:
                    stats = global_stats['fuzz']
                    if stats['std'] > 0:
                        normalized = (fuzz_across[i] - stats['mean']) / stats['std']
                        normalized_scores.append(normalized)

                # Z-score normalization and add detection if available
                if i < len(detection_across) and 'detection' in global_stats:
                    stats = global_stats['detection']
                    if stats['std'] > 0:
                        normalized = (detection_across[i] - stats['mean']) / stats['std']
                        normalized_scores.append(normalized)

                # Calculate overall score as average of normalized scores
                if len(normalized_scores) >= 2:
                    overall_score = np.mean(normalized_scores)
                    overall_scores_across.append(overall_score)

            if len(overall_scores_across) >= 2:
                cross_explanation_overall_score_consistency_stds.append(np.std(overall_scores_across, ddof=1))

        # Compute max_stds with fallback values
        return {
            'llm_scorer_fuzz': float(np.max(llm_scorer_stds_fuzz)) if llm_scorer_stds_fuzz else 0.5,
            'llm_scorer_detection': float(np.max(llm_scorer_stds_detection)) if llm_scorer_stds_detection else 0.5,
            'within_explanation': float(np.max(within_explanation_stds)) if within_explanation_stds else 0.5,
            'cross_explanation_metric_consistency_embedding': float(np.max(cross_explanation_metric_consistency_stds_embedding)) if cross_explanation_metric_consistency_stds_embedding else 0.5,
            'cross_explanation_metric_consistency_fuzz': float(np.max(cross_explanation_metric_consistency_stds_fuzz)) if cross_explanation_metric_consistency_stds_fuzz else 0.5,
            'cross_explanation_metric_consistency_detection': float(np.max(cross_explanation_metric_consistency_stds_detection)) if cross_explanation_metric_consistency_stds_detection else 0.5,
            'cross_explanation_overall_score_consistency': float(np.max(cross_explanation_overall_score_consistency_stds)) if cross_explanation_overall_score_consistency_stds else 0.5
        }

    @staticmethod
    def collect_metric_scores_per_explainer(
        explainer_df: pl.DataFrame
    ) -> Dict[str, Optional[float]]:
        """
        Collect metric scores for a single explainer.

        For a given explainer's DataFrame:
        - Embedding: Take first value (one per explainer)
        - Fuzz: Average across all scorers
        - Detection: Average across all scorers

        Args:
            explainer_df: DataFrame filtered for one explainer

        Returns:
            Dict with keys 'embedding', 'fuzz', 'detection' and their values (or None)
        """
        if len(explainer_df) == 0:
            return {'embedding': None, 'fuzz': None, 'detection': None}

        # Embedding (one per explainer)
        emb = explainer_df["score_embedding"].to_list()
        embedding = emb[0] if emb and emb[0] is not None else None

        # Fuzz (averaged across scorers)
        fuzz = explainer_df["score_fuzz"].to_list()
        fuzz_avg = np.mean([s for s in fuzz if s is not None]) if any(s is not None for s in fuzz) else None

        # Detection (averaged across scorers)
        det = explainer_df["score_detection"].to_list()
        detection_avg = np.mean([s for s in det if s is not None]) if any(s is not None for s in det) else None

        return {
            'embedding': embedding,
            'fuzz': fuzz_avg,
            'detection': detection_avg
        }

    @staticmethod
    def collect_scores_across_explainers(
        df: pl.DataFrame,
        feature_id: int,
        explainer_ids: List[str]
    ) -> Dict[str, List[float]]:
        """
        Collect metric scores across multiple explainers for one feature.

        Args:
            df: DataFrame with score data
            feature_id: Feature ID to process
            explainer_ids: List of explainer IDs

        Returns:
            Dict mapping metric names to lists of scores:
            {'embedding': [...], 'fuzz': [...], 'detection': [...]}
        """
        feature_df = df.filter(pl.col("feature_id") == feature_id)

        embedding_scores = []
        fuzz_scores = []
        detection_scores = []

        for explainer in explainer_ids:
            explainer_df = feature_df.filter(pl.col("llm_explainer") == explainer)
            scores = ConsistencyService.collect_metric_scores_per_explainer(explainer_df)

            if scores['embedding'] is not None:
                embedding_scores.append(scores['embedding'])
            if scores['fuzz'] is not None:
                fuzz_scores.append(scores['fuzz'])
            if scores['detection'] is not None:
                detection_scores.append(scores['detection'])

        return {
            'embedding': embedding_scores,
            'fuzz': fuzz_scores,
            'detection': detection_scores
        }

    @staticmethod
    def compute_overall_score_zscore(
        embedding: Optional[float],
        fuzz_avg: Optional[float],
        detection_avg: Optional[float],
        global_stats: Dict[str, Dict[str, float]]
    ) -> Optional[float]:
        """
        Compute overall score using z-score normalization.

        Process:
        1. Convert each metric to z-score using global mean/std
        2. Average the z-scores (need at least 2 metrics)
        3. Return the averaged z-score

        This provides a normalized overall score that accounts for different
        metric distributions by standardizing relative to the global dataset.

        Args:
            embedding: Embedding score value
            fuzz_avg: Average fuzz score across scorers
            detection_avg: Average detection score across scorers
            global_stats: Dict with 'mean' and 'std' for each metric

        Returns:
            Overall z-score (average of individual metric z-scores), or None if insufficient data
        """
        z_scores = []

        # Z-score for embedding
        if embedding is not None and 'embedding' in global_stats:
            stats = global_stats['embedding']
            if stats['std'] > 0:
                z_score = (embedding - stats['mean']) / stats['std']
                z_scores.append(z_score)

        # Z-score for fuzz
        if fuzz_avg is not None and 'fuzz' in global_stats:
            stats = global_stats['fuzz']
            if stats['std'] > 0:
                z_score = (fuzz_avg - stats['mean']) / stats['std']
                z_scores.append(z_score)

        # Z-score for detection
        if detection_avg is not None and 'detection' in global_stats:
            stats = global_stats['detection']
            if stats['std'] > 0:
                z_score = (detection_avg - stats['mean']) / stats['std']
                z_scores.append(z_score)

        # Need at least 2 metrics to compute overall score
        if len(z_scores) < 2:
            return None

        return float(np.mean(z_scores))

    @staticmethod
    def compute_cross_explainer_consistency_all_metrics(
        df: pl.DataFrame,
        explainer_ids: List[str],
        feature_ids: List[int],
        max_stds: Dict[str, float],
        global_stats: Dict[str, Dict[str, float]]
    ) -> Dict[int, Dict[str, 'ConsistencyScore']]:
        """
        Compute cross-explainer metric consistency for all features.

        For each feature, computes how consistent each metric (embedding, fuzz,
        detection, overall_score) is across the selected explainers using
        std-based consistency (1 - std/max_std).

        Args:
            df: DataFrame with score data
            explainer_ids: List of explainer IDs
            feature_ids: List of feature IDs to process
            max_stds: Dict of max_std values for each metric type
            global_stats: Global statistics for z-score normalization

        Returns:
            Dict mapping feature_id to dict of metric_name -> ConsistencyScore:
            {
                feature_id: {
                    'embedding': ConsistencyScore(...),
                    'fuzz': ConsistencyScore(...),
                    'detection': ConsistencyScore(...),
                    'overall_score': ConsistencyScore(...)
                }
            }
        """
        cross_explainer_consistency_map = {}

        for feature_id in feature_ids:
            # Collect scores across explainers
            scores = ConsistencyService.collect_scores_across_explainers(
                df, feature_id, explainer_ids
            )

            consistency_dict = {}

            # Compute std-based consistency for each metric
            emb_consistency = ConsistencyService.compute_std_consistency(
                scores['embedding'],
                max_stds.get('cross_explanation_metric_consistency_embedding', 0.5)
            )
            if emb_consistency:
                consistency_dict['embedding'] = emb_consistency

            fuzz_consistency = ConsistencyService.compute_std_consistency(
                scores['fuzz'],
                max_stds.get('cross_explanation_metric_consistency_fuzz', 0.5)
            )
            if fuzz_consistency:
                consistency_dict['fuzz'] = fuzz_consistency

            det_consistency = ConsistencyService.compute_std_consistency(
                scores['detection'],
                max_stds.get('cross_explanation_metric_consistency_detection', 0.5)
            )
            if det_consistency:
                consistency_dict['detection'] = det_consistency

            # Compute overall score for each explainer and its consistency
            feature_df = df.filter(pl.col("feature_id") == feature_id)
            overall_scores_across = []

            for explainer in explainer_ids:
                explainer_df = feature_df.filter(pl.col("llm_explainer") == explainer)

                if len(explainer_df) == 0:
                    continue

                # Try to use pre-computed overall_score if available
                if 'overall_score' in explainer_df.columns:
                    overall_vals = explainer_df['overall_score'].drop_nulls().to_list()
                    if overall_vals:
                        overall_scores_across.append(overall_vals[0])
                        continue  # Skip manual calculation

                # Fallback: Calculate overall score using z-score normalization
                scores_dict = ConsistencyService.collect_metric_scores_per_explainer(explainer_df)
                overall_score = ConsistencyService.compute_overall_score_zscore(
                    scores_dict['embedding'],
                    scores_dict['fuzz'],
                    scores_dict['detection'],
                    global_stats
                )

                if overall_score is not None:
                    overall_scores_across.append(overall_score)

            # Compute consistency for overall scores
            overall_consistency = ConsistencyService.compute_std_consistency(
                overall_scores_across,
                max_stds.get('cross_explanation_overall_score_consistency', 0.5)
            )
            if overall_consistency:
                consistency_dict['overall_score'] = overall_consistency

            if consistency_dict:
                cross_explainer_consistency_map[feature_id] = consistency_dict

        return cross_explainer_consistency_map

    @staticmethod
    def compute_cross_explanation_overall_score_per_feature(
        df: pl.DataFrame,
        explainer_ids: List[str],
        feature_ids: List[int],
        max_std: float,
        global_stats: Dict[str, Dict[str, float]]
    ) -> pl.DataFrame:
        """
        Compute cross-explanation overall score consistency per feature.

        For each feature:
        1. Compute overall_score for each explainer:
           - Normalize embedding, fuzz_avg, detection_avg to [0,1] using global min/max
           - overall_score = mean of normalized scores (need at least 2 metrics)
        2. Compute consistency across explainers: 1 - (std / max_std)

        This produces ONE consistency value per feature for percentile-based classification.

        Args:
            df: DataFrame with score data (feature_id, llm_explainer, llm_scorer, scores)
            explainer_ids: List of explainer IDs to consider
            feature_ids: List of feature IDs to process
            max_std: Maximum standard deviation for normalization
            global_stats: Global statistics with 'min' and 'max' for each metric

        Returns:
            DataFrame with columns [feature_id, cross_explanation_overall_score]
        """
        feature_consistency_map = {}

        for feature_id in feature_ids:
            feature_df = df.filter(pl.col("feature_id") == feature_id)

            # Collect overall_score for each explainer
            overall_scores_across = []

            for explainer in explainer_ids:
                explainer_df = feature_df.filter(pl.col("llm_explainer") == explainer)

                if len(explainer_df) == 0:
                    continue

                # Get embedding score (one per explainer)
                emb = explainer_df["score_embedding"].to_list()
                embedding = emb[0] if emb and emb[0] is not None else None

                # Get fuzz and detection scores (averaged across scorers)
                fuzz = explainer_df["score_fuzz"].to_list()
                fuzz_avg = np.mean([s for s in fuzz if s is not None]) if any(s is not None for s in fuzz) else None

                det = explainer_df["score_detection"].to_list()
                detection_avg = np.mean([s for s in det if s is not None]) if any(s is not None for s in det) else None

                # Z-score normalization using global mean/std
                normalized_scores = []

                if embedding is not None and 'embedding' in global_stats:
                    stats = global_stats['embedding']
                    if stats['std'] > 0:
                        normalized = (embedding - stats['mean']) / stats['std']
                        normalized_scores.append(normalized)

                if fuzz_avg is not None and 'fuzz' in global_stats:
                    stats = global_stats['fuzz']
                    if stats['std'] > 0:
                        normalized = (fuzz_avg - stats['mean']) / stats['std']
                        normalized_scores.append(normalized)

                if detection_avg is not None and 'detection' in global_stats:
                    stats = global_stats['detection']
                    if stats['std'] > 0:
                        normalized = (detection_avg - stats['mean']) / stats['std']
                        normalized_scores.append(normalized)

                # Compute overall_score as average of normalized scores
                if len(normalized_scores) >= 2:  # Need at least 2 metrics
                    overall_score = np.mean(normalized_scores)
                    overall_scores_across.append(overall_score)

            # Compute consistency across explainers for this feature
            if len(overall_scores_across) >= 2:
                std = np.std(overall_scores_across, ddof=1)

                # Avoid division by zero
                if max_std == 0 or np.isclose(max_std, 0):
                    consistency = 1.0 if (std == 0 or np.isclose(std, 0)) else 0.0
                else:
                    consistency = 1.0 - (std / max_std)
                    consistency = np.clip(consistency, 0, 1)

                feature_consistency_map[feature_id] = float(consistency)

        # Convert to Polars DataFrame for easy joining
        if feature_consistency_map:
            return pl.DataFrame({
                'feature_id': list(feature_consistency_map.keys()),
                'cross_explanation_overall_score': list(feature_consistency_map.values())
            }).with_columns([
                pl.col("feature_id").cast(pl.UInt32)
            ])
        else:
            # Return empty DataFrame with correct schema
            return pl.DataFrame({
                'feature_id': pl.Series([], dtype=pl.UInt32),
                'cross_explanation_overall_score': pl.Series([], dtype=pl.Float64)
            })


    @staticmethod
    def calculate_all_consistency(
        df: pl.DataFrame,
        explainer_ids: List[str],
        feature_ids: List[int],
        pairwise_df: Optional[pl.DataFrame] = None
    ) -> pl.DataFrame:
        """
        Calculate all consistency scores for features not in pre-computed data.

        This is the main entry point for calculating consistency when parquet data
        is missing or incomplete. Returns a DataFrame with same schema as
        consistency_scores.parquet that can be merged with existing data.

        Args:
            df: DataFrame from feature_analysis.parquet (filtered)
            explainer_ids: List of explainer IDs to process
            feature_ids: List of feature IDs to process
            pairwise_df: Optional pairwise similarity DataFrame for explainer consistency

        Returns:
            DataFrame with columns [feature_id, llm_explainer, llm_scorer_consistency_fuzz,
            llm_scorer_consistency_detection, within_explanation_metric_consistency,
            cross_explanation_metric_consistency_embedding, cross_explanation_metric_consistency_fuzz,
            cross_explanation_metric_consistency_detection, cross_explanation_overall_score_consistency,
            llm_explainer_consistency]
        """
        # Compute global statistics for normalization
        global_stats = ConsistencyService._compute_global_stats_for_consistency(
            df, explainer_ids, feature_ids
        )

        # Compute max_stds for std-based consistency
        max_stds = ConsistencyService.compute_max_stds(df, explainer_ids, global_stats)

        # Collect results
        results = []

        for feature_id in feature_ids:
            feature_df = df.filter(pl.col("feature_id") == feature_id)

            # Compute cross-explanation consistency (per feature, same for all explainers)
            cross_exp_consistency = ConsistencyService._calculate_cross_explanation_consistency_for_feature(
                feature_df, explainer_ids, max_stds, global_stats
            )

            # Compute LLM explainer consistency (per feature, same for all explainers)
            llm_explainer_consistency = None
            if pairwise_df is not None and len(explainer_ids) >= 2:
                consistency_score = ConsistencyService.compute_semantic_similarity_consistency(
                    feature_id, explainer_ids, pairwise_df
                )
                llm_explainer_consistency = consistency_score.value if consistency_score else None

            # Per-explainer consistency scores
            for explainer in explainer_ids:
                explainer_df = feature_df.filter(pl.col("llm_explainer") == explainer)

                if len(explainer_df) == 0:
                    continue

                # Scorer consistency (fuzz and detection)
                fuzz_scores = explainer_df['score_fuzz'].drop_nulls().to_list()
                detection_scores = explainer_df['score_detection'].drop_nulls().to_list()

                llm_scorer_consistency_fuzz = None
                fuzz_consistency = ConsistencyService.compute_std_consistency(
                    fuzz_scores, max_stds.get('llm_scorer_fuzz', 0.5)
                )
                if fuzz_consistency:
                    llm_scorer_consistency_fuzz = fuzz_consistency.value

                llm_scorer_consistency_detection = None
                detection_consistency = ConsistencyService.compute_std_consistency(
                    detection_scores, max_stds.get('llm_scorer_detection', 0.5)
                )
                if detection_consistency:
                    llm_scorer_consistency_detection = detection_consistency.value

                # Within-explanation metric consistency
                scores_dict = ConsistencyService.collect_metric_scores_per_explainer(explainer_df)
                within_explanation_metric_consistency = None
                metric_consistency = ConsistencyService.compute_normalized_std_consistency(
                    scores_dict, global_stats, max_stds.get('within_explanation', 0.5)
                )
                if metric_consistency:
                    within_explanation_metric_consistency = metric_consistency.value

                # Add result row
                results.append({
                    'feature_id': feature_id,
                    'llm_explainer': explainer,
                    'llm_scorer_consistency_fuzz': llm_scorer_consistency_fuzz,
                    'llm_scorer_consistency_detection': llm_scorer_consistency_detection,
                    'within_explanation_metric_consistency': within_explanation_metric_consistency,
                    'cross_explanation_metric_consistency_embedding': cross_exp_consistency.get('embedding'),
                    'cross_explanation_metric_consistency_fuzz': cross_exp_consistency.get('fuzz'),
                    'cross_explanation_metric_consistency_detection': cross_exp_consistency.get('detection'),
                    'cross_explanation_overall_score_consistency': cross_exp_consistency.get('overall_score'),
                    'llm_explainer_consistency': llm_explainer_consistency
                })

        # Convert to DataFrame
        if results:
            return pl.DataFrame(results).with_columns([
                pl.col("feature_id").cast(pl.UInt32),
                pl.col("llm_explainer").cast(pl.Categorical)
            ])
        else:
            # Return empty DataFrame with correct schema
            return pl.DataFrame({
                'feature_id': pl.Series([], dtype=pl.UInt32),
                'llm_explainer': pl.Series([], dtype=pl.Categorical),
                'llm_scorer_consistency_fuzz': pl.Series([], dtype=pl.Float32),
                'llm_scorer_consistency_detection': pl.Series([], dtype=pl.Float32),
                'within_explanation_metric_consistency': pl.Series([], dtype=pl.Float32),
                'cross_explanation_metric_consistency_embedding': pl.Series([], dtype=pl.Float32),
                'cross_explanation_metric_consistency_fuzz': pl.Series([], dtype=pl.Float32),
                'cross_explanation_metric_consistency_detection': pl.Series([], dtype=pl.Float32),
                'cross_explanation_overall_score_consistency': pl.Series([], dtype=pl.Float32),
                'llm_explainer_consistency': pl.Series([], dtype=pl.Float32)
            })

    @staticmethod
    def _compute_global_stats_for_consistency(
        df: pl.DataFrame,
        explainer_ids: List[str],
        feature_ids: List[int]
    ) -> Dict[str, Dict[str, float]]:
        """
        Compute global statistics for z-score normalization.

        Args:
            df: DataFrame from feature_analysis.parquet
            explainer_ids: List of explainer IDs
            feature_ids: List of feature IDs

        Returns:
            Dict with global stats: {'metric_name': {'mean': float, 'std': float}}
        """
        embedding_values = []
        fuzz_values = []
        detection_values = []

        for feature_id in feature_ids:
            feature_df = df.filter(pl.col("feature_id") == feature_id)

            for explainer in explainer_ids:
                explainer_df = feature_df.filter(pl.col("llm_explainer") == explainer)

                if len(explainer_df) == 0:
                    continue

                scores = ConsistencyService.collect_metric_scores_per_explainer(explainer_df)

                if scores['embedding'] is not None:
                    embedding_values.append(scores['embedding'])
                if scores['fuzz'] is not None:
                    fuzz_values.append(scores['fuzz'])
                if scores['detection'] is not None:
                    detection_values.append(scores['detection'])

        # Compute global statistics
        global_stats = {}
        if len(embedding_values) >= 2:
            global_stats['embedding'] = {
                'mean': float(np.mean(embedding_values)),
                'std': float(np.std(embedding_values, ddof=1))
            }
        if len(fuzz_values) >= 2:
            global_stats['fuzz'] = {
                'mean': float(np.mean(fuzz_values)),
                'std': float(np.std(fuzz_values, ddof=1))
            }
        if len(detection_values) >= 2:
            global_stats['detection'] = {
                'mean': float(np.mean(detection_values)),
                'std': float(np.std(detection_values, ddof=1))
            }

        return global_stats

    @staticmethod
    def _calculate_cross_explanation_consistency_for_feature(
        feature_df: pl.DataFrame,
        explainer_ids: List[str],
        max_stds: Dict[str, float],
        global_stats: Dict[str, Dict[str, float]]
    ) -> Dict[str, Optional[float]]:
        """
        Calculate cross-explanation consistency for a single feature.

        Args:
            feature_df: DataFrame filtered for one feature
            explainer_ids: List of explainer IDs
            max_stds: Dict of max_std values
            global_stats: Global statistics for normalization

        Returns:
            Dict with keys ['embedding', 'fuzz', 'detection', 'overall_score']
        """
        # Collect scores across explainers
        embedding_scores = []
        fuzz_scores = []
        detection_scores = []
        overall_scores = []

        for explainer in explainer_ids:
            explainer_df = feature_df.filter(pl.col("llm_explainer") == explainer)

            if len(explainer_df) == 0:
                continue

            scores = ConsistencyService.collect_metric_scores_per_explainer(explainer_df)

            if scores['embedding'] is not None:
                embedding_scores.append(scores['embedding'])
            if scores['fuzz'] is not None:
                fuzz_scores.append(scores['fuzz'])
            if scores['detection'] is not None:
                detection_scores.append(scores['detection'])

            # Calculate overall score using z-score normalization
            overall_score = ConsistencyService.compute_overall_score_zscore(
                scores['embedding'], scores['fuzz'], scores['detection'], global_stats
            )
            if overall_score is not None:
                overall_scores.append(overall_score)

        # Compute consistency for each metric
        result = {}

        emb_consistency = ConsistencyService.compute_std_consistency(
            embedding_scores, max_stds.get('cross_explanation_metric_consistency_embedding', 0.5)
        )
        result['embedding'] = emb_consistency.value if emb_consistency else None

        fuzz_consistency = ConsistencyService.compute_std_consistency(
            fuzz_scores, max_stds.get('cross_explanation_metric_consistency_fuzz', 0.5)
        )
        result['fuzz'] = fuzz_consistency.value if fuzz_consistency else None

        det_consistency = ConsistencyService.compute_std_consistency(
            detection_scores, max_stds.get('cross_explanation_metric_consistency_detection', 0.5)
        )
        result['detection'] = det_consistency.value if det_consistency else None

        overall_consistency = ConsistencyService.compute_std_consistency(
            overall_scores, max_stds.get('cross_explanation_overall_score_consistency', 0.5)
        )
        result['overall_score'] = overall_consistency.value if overall_consistency else None

        return result


class ExplainerDataBuilder:
    """
    Helper class for building explainer data responses.

    Provides utility methods for extracting scores from DataFrames and
    looking up related data (explanations, etc.).
    """

    @staticmethod
    def extract_scores_from_explainer_df(
        explainer_df: pl.DataFrame,
        scorer_map: Optional[Dict[str, str]] = None
    ) -> Tuple[Dict[str, Optional[float]], Dict[str, Optional[float]], Optional[float]]:
        """
        Extract score dictionaries and embedding score from explainer DataFrame.

        Args:
            explainer_df: DataFrame for one explainer
            scorer_map: Optional mapping from scorer ID to s1/s2/s3.
                        If None, creates automatic mapping (s1, s2, s3)

        Returns:
            Tuple of (fuzz_dict, detection_dict, embedding_score):
            - fuzz_dict: {'s1': val, 's2': val, 's3': val}
            - detection_dict: {'s1': val, 's2': val, 's3': val}
            - embedding_score: float or None
        """
        fuzz_dict = {'s1': None, 's2': None, 's3': None}
        detection_dict = {'s1': None, 's2': None, 's3': None}
        embedding_score = None

        if len(explainer_df) == 0:
            return fuzz_dict, detection_dict, embedding_score

        # Get embedding score (first value)
        embedding_scores = explainer_df["score_embedding"].to_list()
        embedding_score = round(embedding_scores[0], 3) if embedding_scores and embedding_scores[0] is not None else None

        # Extract scores per scorer
        if scorer_map is None:
            # Auto-generate scorer mapping
            scorer_map = {}
            for i, row_dict in enumerate(explainer_df.iter_rows(named=True)):
                scorer = row_dict["llm_scorer"]
                scorer_key = f"s{i+1}"
                scorer_map[scorer] = scorer_key

                fuzz_val = row_dict.get("score_fuzz")
                detection_val = row_dict.get("score_detection")

                fuzz_dict[scorer_key] = round(fuzz_val, 3) if fuzz_val is not None else None
                detection_dict[scorer_key] = round(detection_val, 3) if detection_val is not None else None
        else:
            # Use provided scorer mapping
            for _, row in enumerate(explainer_df.iter_rows(named=True)):
                scorer = row["llm_scorer"]
                scorer_key = scorer_map.get(scorer)

                if scorer_key:
                    fuzz_val = row.get("score_fuzz")
                    detection_val = row.get("score_detection")

                    fuzz_dict[scorer_key] = round(fuzz_val, 3) if fuzz_val is not None else None
                    detection_dict[scorer_key] = round(detection_val, 3) if detection_val is not None else None

        return fuzz_dict, detection_dict, embedding_score

    @staticmethod
    def lookup_explanation_text(
        feature_id: int,
        explainer: str,
        explanations_df: Optional[pl.DataFrame]
    ) -> Optional[str]:
        """
        Look up explanation text for a feature-explainer pair.

        Args:
            feature_id: Feature ID
            explainer: Explainer ID (full name)
            explanations_df: DataFrame with explanations (or None if not available)

        Returns:
            Explanation text string, or None if not found
        """
        if explanations_df is None:
            return None

        try:
            explanation_rows = explanations_df.filter(
                (pl.col("feature_id") == feature_id) &
                (pl.col("llm_explainer") == explainer)
            )

            if len(explanation_rows) > 0:
                return explanation_rows["explanation_text"].to_list()[0]
        except Exception:
            # Silently fail if explanation lookup fails
            pass

        return None
