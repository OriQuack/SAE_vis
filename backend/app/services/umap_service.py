"""
Barycentric projection service for feature visualization.

Returns pre-computed 2D positions from explanation_barycentric.parquet.
Also provides SVM decision function UMAP for custom training.
"""

import polars as pl
import numpy as np
import logging
from typing import List, Dict, Optional, TYPE_CHECKING
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

from .committee_service import CommitteeService
from ..models.umap import (
    UmapProjectionRequest,
    UmapProjectionResponse,
    UmapPoint,
    ExplainerPosition
)
from ..models.similarity_sort import (
    CauseClassificationRequest,
    CauseClassificationResponse,
    CauseClassificationResult,
    CauseSelectionItem,
    CauseCommitteeVoteInfo
)
from .data_constants import COL_FEATURE_ID

# Categories for decision function space (3 categories)
CAUSE_CATEGORIES = [
    'noisy-activation',
    'missed-N-gram',
    'missed-context'
]

# ============================================================================
# SAMPLE WEIGHTS FOR SVM TRAINING
# ============================================================================
# 'click' (direct user clicks) get full weight
# 'threshold' (batch Apply Tags) get reduced weight due to potential errors
CLICK_WEIGHT = 1.0
THRESHOLD_WEIGHT = 0.2

# 12 metrics used for SVM decision function UMAP
# Same as Stage 2 (Quality) for uniformity - splits composite intra_feature_sim into components
METRICS_FOR_SVM = [
    # Mean metrics (7)
    'intra_ngram_jaccard',       # Activation-level: max(char_ngram, word_ngram) - lexical consistency
    'intra_semantic_sim',        # Activation-level: semantic_similarity - semantic consistency
    'score_embedding',           # Score: embedding-based scoring
    'score_fuzz',                # Score: fuzzy matching score
    'score_detection',           # Score: detection score
    'explanation_semantic_sim',  # Explanation-level: semantic similarity between LLM explanations
    'log_frac_nonzero',          # Neuronpedia: log(frac_nonzero + 1e-8) - sparse activation handling
    # Std metrics (5) - captures cross-explainer disagreement and activation variability
    'intra_semantic_sim_std',    # Activation-level: semantic consistency std (variability within feature)
    'explanation_semantic_sim_std',  # Explanation-level: cross-explainer semantic disagreement
    'score_embedding_std',
    'score_fuzz_std',
    'score_detection_std',
]

if TYPE_CHECKING:
    from .data_service import DataService

logger = logging.getLogger(__name__)


class UMAPService:
    """Service for barycentric projections and SVM-based UMAP."""

    def __init__(self, data_service: "DataService"):
        """Initialize UMAPService.

        Args:
            data_service: Instance of DataService for data access
        """
        self.data_service = data_service
        self.committee_service = CommitteeService()

    async def get_umap_projection(
        self,
        request: UmapProjectionRequest
    ) -> UmapProjectionResponse:
        """Return pre-computed barycentric positions for features.

        Returns mean position across explainers for each feature,
        plus individual explainer positions for detail view.

        Args:
            request: Request containing feature IDs

        Returns:
            Response with 2D coordinates for each feature
        """
        if not self.data_service.is_ready():
            raise RuntimeError("DataService not ready")

        if self.data_service._barycentric_lazy is None:
            raise RuntimeError("Barycentric data not loaded")

        feature_ids = request.feature_ids

        # Load all explainer rows with scores
        df = self.data_service._barycentric_lazy.filter(
            pl.col("feature_id").is_in(feature_ids)
        ).select([
            "feature_id", "llm_explainer", "position_x", "position_y", "nearest_anchor", "cluster_id",
            "score_embedding", "score_fuzz", "score_detection"
        ]).collect()

        logger.info(f"Loaded {len(df)} rows for {df['feature_id'].n_unique()} features")

        # Compute average score for each row
        df = df.with_columns([
            ((pl.col("score_embedding") + pl.col("score_fuzz") + pl.col("score_detection")) / 3.0)
            .alias("avg_score")
        ])

        # Group by feature_id using partition_by for O(N) single-pass grouping
        points = []
        partitions = df.partition_by("feature_id", as_dict=True)

        # Get column indices for tuple-based iter_rows (2-3x faster than named=True)
        col_names = df.columns
        exp_col = col_names.index("llm_explainer")
        px_col = col_names.index("position_x")
        py_col = col_names.index("position_y")
        anchor_col = col_names.index("nearest_anchor")
        emb_col = col_names.index("score_embedding")
        fuzz_col = col_names.index("score_fuzz")
        det_col = col_names.index("score_detection")
        avg_col = col_names.index("avg_score")

        for fid, feature_rows in partitions.items():
            # Find best explainer (highest avg_score)
            best_idx = feature_rows["avg_score"].arg_max()
            best_row = feature_rows.row(best_idx, named=True)

            # Use best explainer's position as main point
            best_x = float(best_row["position_x"])
            best_y = float(best_row["position_y"])
            best_anchor = best_row["nearest_anchor"]
            best_explainer = best_row["llm_explainer"]

            # Get cluster_id (same for all explainers of a feature)
            cluster_id = int(feature_rows["cluster_id"][0])

            # Collect all explainer positions with scores using tuple-based iteration
            explainer_positions = []
            for row in feature_rows.iter_rows():
                is_best = row[exp_col] == best_explainer
                explainer_positions.append(ExplainerPosition(
                    explainer=row[exp_col],
                    x=float(row[px_col]),
                    y=float(row[py_col]),
                    nearest_anchor=row[anchor_col],
                    score_embedding=float(row[emb_col]) if row[emb_col] is not None else None,
                    score_fuzz=float(row[fuzz_col]) if row[fuzz_col] is not None else None,
                    score_detection=float(row[det_col]) if row[det_col] is not None else None,
                    avg_score=float(row[avg_col]) if row[avg_col] is not None else None,
                    is_best=is_best
                ))

            # fid from partition_by is a tuple, extract the actual feature_id
            actual_fid = fid[0] if isinstance(fid, tuple) else fid
            points.append(UmapPoint(
                feature_id=int(actual_fid),
                x=best_x,
                y=best_y,
                cluster_id=cluster_id,
                nearest_anchor=best_anchor,
                explainer_positions=explainer_positions
            ))

        logger.info(f"Built {len(points)} feature points (best explainer positions)")

        return UmapProjectionResponse(
            points=points,
            total_features=len(points),
            params_used={"source": "barycentric_precomputed", "aggregation": "best_explainer"}
        )

    async def get_cause_classification(
        self,
        request: CauseClassificationRequest
    ) -> CauseClassificationResponse:
        """Classify features into cause categories using OvR SVMs.

        Trains One-vs-Rest SVMs for each category using only user's manual tags.
        Requires manual tags to be provided before classification can run.

        Args:
            request: Request containing feature_ids and cause_selections

        Returns:
            Response with predicted category and decision scores for each feature
        """
        if not self.data_service.is_ready():
            raise RuntimeError("DataService not ready")

        feature_ids = request.feature_ids
        cause_selections = request.cause_selections

        # Count manual tags per category (for logging)
        category_counts = {cat: 0 for cat in CAUSE_CATEGORIES}
        for fid, item in cause_selections.items():
            if item.category in category_counts:
                category_counts[item.category] += 1

        logger.info(f"Classifying {len(feature_ids)} features into cause categories")
        logger.info(f"Manual tag counts: {category_counts}")

        # Extract mean metrics per feature from barycentric data
        metrics_df = await self._extract_metrics_from_barycentric(feature_ids)

        if metrics_df is None or len(metrics_df) == 0:
            logger.warning("No metrics extracted, returning empty result")
            return CauseClassificationResponse(
                results=[],
                total_features=0,
                category_counts={}
            )

        # Build feature matrix
        feature_ids_ordered = metrics_df[COL_FEATURE_ID].to_numpy()
        metrics_matrix = np.column_stack([
            metrics_df[metric].to_numpy() for metric in METRICS_FOR_SVM
        ])

        # Map feature_ids to indices for cause_selections lookup
        feature_id_to_idx = {int(fid): idx for idx, fid in enumerate(feature_ids_ordered)}

        # Scale metrics for training
        scaler = StandardScaler()
        metrics_scaled = scaler.fit_transform(metrics_matrix)

        # Train One-vs-Rest SVMs and compute decision function vectors
        # Uses only manual tags (no anchor points)
        decision_vectors = self._compute_decision_function_vectors(
            metrics_matrix,
            feature_ids_ordered,
            cause_selections,
            feature_id_to_idx
        )

        # Train RF and MLP committee for multi-class prediction
        committee_votes = self._train_committee_and_predict(
            metrics_scaled,
            feature_ids_ordered,
            cause_selections,
            feature_id_to_idx
        )

        # Build classification results
        results = []
        predicted_counts = {cat: 0 for cat in CAUSE_CATEGORIES}

        for i, fid in enumerate(feature_ids_ordered):
            # Decision scores per category
            scores = {
                cat: float(decision_vectors[i, j])
                for j, cat in enumerate(CAUSE_CATEGORIES)
            }

            # Predicted category = argmax of decision scores
            predicted = max(scores, key=lambda k: scores[k])
            predicted_counts[predicted] += 1

            # Decision margin = min absolute distance to any boundary
            margin = float(np.min(np.abs(decision_vectors[i])))

            results.append(CauseClassificationResult(
                feature_id=int(fid),
                predicted_category=predicted,
                decision_margin=margin,
                decision_scores=scores
            ))

        logger.info(f"Classification complete. Predicted counts: {predicted_counts}")

        # Update committee_votes with actual SVM predictions (from decision vectors)
        if committee_votes is not None:
            for result in results:
                if result.feature_id in committee_votes:
                    # Update svm_category with the actual SVM prediction
                    committee_votes[result.feature_id] = CauseCommitteeVoteInfo(
                        svm_category=result.predicted_category,
                        rf_category=committee_votes[result.feature_id].rf_category,
                        mlp_category=committee_votes[result.feature_id].mlp_category
                    )

        return CauseClassificationResponse(
            results=results,
            total_features=len(results),
            category_counts=predicted_counts,
            committee_votes=committee_votes
        )

    def _compute_decision_function_vectors(
        self,
        metrics_matrix: np.ndarray,
        feature_ids: np.ndarray,
        cause_selections: Dict[int, CauseSelectionItem],
        feature_id_to_idx: Dict[int, int]
    ) -> np.ndarray:
        """Train One-vs-Rest SVMs with sample weights and compute decision function vectors.

        Uses only user's manual tags for training (no anchor points).
        Applies sample weights based on source: 'click' = 1.0, 'threshold' = 0.2.

        Args:
            metrics_matrix: (N, 9) feature metric matrix (raw values)
            feature_ids: Array of feature IDs
            cause_selections: Dict mapping feature_id to CauseSelectionItem (category + source)
            feature_id_to_idx: Dict mapping feature_id to matrix index

        Returns:
            (N, 3) matrix of decision function values
        """
        n_features = len(feature_ids)
        n_categories = len(CAUSE_CATEGORIES)
        decision_vectors = np.zeros((n_features, n_categories))

        # Build ID to weight mapping
        id_to_weight = {}
        for fid, item in cause_selections.items():
            id_to_weight[fid] = CLICK_WEIGHT if item.source == 'click' else THRESHOLD_WEIGHT

        # Scale feature metrics
        scaler = StandardScaler()
        metrics_scaled = scaler.fit_transform(metrics_matrix)

        # Train OvR SVM for each category
        for cat_idx, category in enumerate(CAUSE_CATEGORIES):
            # Collect manual tags from user with weights
            manual_positive = []
            manual_negative = []
            positive_weights = []
            negative_weights = []
            for fid, item in cause_selections.items():
                if fid in feature_id_to_idx:
                    idx = feature_id_to_idx[fid]
                    weight = id_to_weight.get(fid, CLICK_WEIGHT)
                    if item.category == category:
                        manual_positive.append(idx)
                        positive_weights.append(weight)
                    else:
                        manual_negative.append(idx)
                        negative_weights.append(weight)

            # Check we have both classes from manual tags
            if len(manual_positive) == 0 or len(manual_negative) == 0:
                logger.warning(f"Skipping SVM for {category}: missing positive or negative manual samples")
                continue

            # Build training data and weights from manual tags only
            X_train = np.vstack([
                metrics_scaled[manual_positive],
                metrics_scaled[manual_negative]
            ])
            y_train = np.array([1] * len(manual_positive) + [0] * len(manual_negative))
            sample_weights = np.array(positive_weights + negative_weights)

            # Train SVM with sample weights
            svm = SVC(
                kernel='rbf',
                C=1.0,
                gamma='scale',
                class_weight='balanced'
            )
            svm.fit(X_train, y_train, sample_weight=sample_weights)

            # Compute decision function for ALL features
            decision_values = svm.decision_function(metrics_scaled)
            decision_vectors[:, cat_idx] = decision_values

            logger.info(f"Trained SVM for {category}: {len(manual_positive)} manual positive, {len(manual_negative)} manual negative")

        return decision_vectors

    def _train_committee_and_predict(
        self,
        metrics_scaled: np.ndarray,
        feature_ids: np.ndarray,
        cause_selections: Dict[int, CauseSelectionItem],
        feature_id_to_idx: Dict[int, int]
    ) -> Optional[Dict[int, CauseCommitteeVoteInfo]]:
        """Train RF and MLP committee for multi-class cause prediction.

        Uses CommitteeService to train Random Forest and MLP classifiers,
        then predicts category for all features. Returns committee votes
        for disagreement highlighting.

        Args:
            metrics_scaled: (N, D) scaled feature matrix
            feature_ids: Array of feature IDs
            cause_selections: Dict mapping feature_id to CauseSelectionItem
            feature_id_to_idx: Dict mapping feature_id to matrix index

        Returns:
            Dict mapping feature_id to CauseCommitteeVoteInfo, or None if insufficient data
        """
        # Build training data from manual tags
        train_indices = []
        train_labels = []
        sample_weights = []

        category_to_label = {cat: i for i, cat in enumerate(CAUSE_CATEGORIES)}
        label_to_category = {i: cat for cat, i in category_to_label.items()}

        for fid, item in cause_selections.items():
            if fid in feature_id_to_idx and item.category in category_to_label:
                idx = feature_id_to_idx[fid]
                train_indices.append(idx)
                train_labels.append(category_to_label[item.category])
                weight = CLICK_WEIGHT if item.source == 'click' else THRESHOLD_WEIGHT
                sample_weights.append(weight)

        # Need at least 2 samples per category for meaningful committee
        if len(train_indices) < 6:  # At least 2 per 3 categories
            logger.warning(f"[UMAPService] Insufficient training data for committee: {len(train_indices)} samples")
            return None

        X_train = metrics_scaled[train_indices]
        y_train = np.array(train_labels)
        weights = np.array(sample_weights)

        # Train committee using CommitteeService
        rf_model, mlp_model, scaler = self.committee_service.train_multiclass_committee(
            X_train, y_train, weights
        )

        # If both failed, return None
        if rf_model is None and mlp_model is None:
            return None

        # Create placeholder SVM category indices (will be updated by caller with actual SVM predictions)
        # Use RF predictions as initial placeholder
        if rf_model is not None and scaler is not None:
            X_scaled = scaler.transform(metrics_scaled)
            svm_category_indices = rf_model.predict(X_scaled).astype(int)
        else:
            svm_category_indices = np.zeros(len(feature_ids), dtype=int)

        # Get committee predictions
        committee_preds = self.committee_service.predict_multiclass_with_committee(
            metrics_scaled,
            svm_category_indices,
            rf_model,
            mlp_model,
            scaler,
            label_to_category
        )

        # Convert MulticlassCommitteePrediction to CauseCommitteeVoteInfo
        committee_votes: Dict[int, CauseCommitteeVoteInfo] = {}
        for i, fid in enumerate(feature_ids):
            fid_int = int(fid)
            if i in committee_preds:
                pred = committee_preds[i]
                committee_votes[fid_int] = CauseCommitteeVoteInfo(
                    svm_category=pred.svm_category,  # Will be overwritten with actual SVM prediction
                    rf_category=pred.rf_category,
                    mlp_category=pred.mlp_category
                )

        logger.info(f"[UMAPService] Committee votes generated for {len(committee_votes)} features")
        return committee_votes

    async def _extract_metrics_from_barycentric(self, feature_ids: List[int]) -> Optional[pl.DataFrame]:
        """Extract MEAN metrics per feature from barycentric parquet for SVM training.

        Computes mean across 3 explainers for each feature.
        Also joins activation-level metrics from activation_display.parquet.

        Args:
            feature_ids: List of feature IDs

        Returns:
            DataFrame with feature_id and all 12 metrics
        """
        try:
            if self.data_service._barycentric_lazy is None:
                logger.error("Barycentric data not loaded")
                return None

            # Compute mean and std across 3 explainers for each feature from barycentric data
            df = self.data_service._barycentric_lazy.filter(
                pl.col("feature_id").is_in(feature_ids)
            ).group_by("feature_id").agg([
                # Score metrics (mean across explainers)
                pl.col("score_embedding").mean().alias("score_embedding"),
                pl.col("score_fuzz").mean().alias("score_fuzz"),
                pl.col("score_detection").mean().alias("score_detection"),
                pl.col("explanation_semantic_sim").mean().alias("explanation_semantic_sim"),
                pl.col("frac_nonzero").mean().alias("frac_nonzero"),
                # Std metrics - captures cross-explainer disagreement
                pl.col("explanation_semantic_sim_std").mean().alias("explanation_semantic_sim_std"),
                pl.col("score_embedding_std").mean().alias("score_embedding_std"),
                pl.col("score_fuzz_std").mean().alias("score_fuzz_std"),
                pl.col("score_detection_std").mean().alias("score_detection_std"),
            ]).collect()

            # Compute log_frac_nonzero from frac_nonzero
            df = df.with_columns([
                (pl.col("frac_nonzero") + 1e-8).log().alias("log_frac_nonzero")
            ])

            # Load activation-level metrics from activation_display.parquet
            if self.data_service._activation_display_lazy is not None:
                act_df = self.data_service._activation_display_lazy.filter(
                    pl.col("feature_id").is_in(feature_ids)
                ).select([
                    pl.col("feature_id").cast(pl.Int64),
                    # intra_ngram_jaccard = max(char_ngram, word_ngram)
                    pl.max_horizontal("char_ngram_max_jaccard", "word_ngram_max_jaccard")
                        .fill_null(0.0).alias("intra_ngram_jaccard"),
                    # intra_semantic_sim (activation-level semantic similarity)
                    pl.col("semantic_similarity").fill_null(0.0).alias("intra_semantic_sim"),
                    # intra_semantic_sim_std
                    pl.col("semantic_similarity_std").fill_null(0.0).alias("intra_semantic_sim_std"),
                ]).unique(subset=["feature_id"]).collect()

                # Join activation metrics to the main metrics
                df = df.join(act_df, on="feature_id", how="left")
                logger.info(f"Joined activation metrics from activation_display.parquet")

            # Fill null values for all metrics
            for metric in METRICS_FOR_SVM:
                if metric in df.columns:
                    df = df.with_columns(pl.col(metric).fill_null(0.0))
                else:
                    df = df.with_columns(pl.lit(0.0).alias(metric))

            logger.info(f"Extracted {len(METRICS_FOR_SVM)} metrics for {len(df)} features from barycentric data")
            return df

        except Exception as e:
            logger.error(f"Failed to extract metrics from barycentric: {e}", exc_info=True)
            return None

    def clear_cache(self):
        """Clear any cached data (no-op since we use pre-computed data)."""
        logger.info("Cache clear requested (no-op for pre-computed data)")


# ============================================================================
# RADVIZ UTILITY FUNCTIONS
# ============================================================================

def compute_radviz_position(decision_scores: Dict[str, float]) -> Dict[str, float]:
    """Compute RadViz position from decision scores using softmax weighting.

    RadViz positions features based on softmax-normalized decision scores,
    where each cause category is an anchor at 120° intervals on a CIRCLE.
    Reference: https://www.mdpi.com/2227-9709/6/2/16

    Args:
        decision_scores: Dict mapping category to SVM decision function value

    Returns:
        Dict with 'x', 'y', 'confidence' keys
    """
    # Circle parameters
    CENTER = (0.5, 0.5)
    RADIUS = 0.45

    # Anchor positions at 120° intervals on circle (matches frontend RADVIZ_ANCHORS)
    # Formula: (cx + r*cos(θ), cy + r*sin(θ))
    ANCHORS = {
        'noisy-activation': (CENTER[0] + RADIUS * np.cos(np.pi / 2),      # 90°
                            CENTER[1] + RADIUS * np.sin(np.pi / 2)),
        'missed-N-gram':    (CENTER[0] + RADIUS * np.cos(7 * np.pi / 6),  # 210°
                            CENTER[1] + RADIUS * np.sin(7 * np.pi / 6)),
        'missed-context':   (CENTER[0] + RADIUS * np.cos(11 * np.pi / 6), # 330°
                            CENTER[1] + RADIUS * np.sin(11 * np.pi / 6))
    }

    # Get scores for our categories
    scores = np.array([decision_scores.get(cat, 0) for cat in ANCHORS.keys()])

    # Softmax with numeric stability
    scores_shifted = scores - scores.max()
    exp_scores = np.exp(scores_shifted)
    weights = exp_scores / exp_scores.sum()

    # Weighted sum of anchor positions (spring-force equilibrium)
    x, y = 0.0, 0.0
    for (_, anchor), weight in zip(ANCHORS.items(), weights):
        x += weight * anchor[0]
        y += weight * anchor[1]

    # Confidence = normalized distance from center (0 at center, 1 at edge)
    dist = np.sqrt((x - CENTER[0])**2 + (y - CENTER[1])**2)
    confidence = min(1.0, dist / RADIUS)

    return {'x': float(x), 'y': float(y), 'confidence': float(confidence)}
