"""
Cause classification service for feature visualization.

Provides SVM-based cause classification for Stage 3.
"""

import polars as pl
import numpy as np
import logging
from typing import List, Dict, Optional
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

from .committee_service import CommitteeService
from ..models.similarity_sort import (
    CauseClassificationRequest,
    CauseClassificationResponse,
    CauseClassificationResult,
    CauseSelectionItem,
    CauseCommitteeVoteInfo
)
from .data_constants import (
    COL_FEATURE_ID,
    CLICK_WEIGHT,
    THRESHOLD_WEIGHT,
    SVM_FEATURE_METRICS,
    CAUSE_CATEGORIES,
)
from .data_service import DataService

logger = logging.getLogger(__name__)


class CauseService:
    """Service for SVM-based cause classification."""

    def __init__(self, data_service: DataService):
        """Initialize CauseService.

        Args:
            data_service: Instance of DataService for data access
        """
        self.data_service = data_service
        self.committee_service = CommitteeService()

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

        # Extract pre-aggregated metrics from svm_feature_metrics data
        metrics_df = await self._extract_metrics_from_svm_metrics(feature_ids)

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
            metrics_df[metric].to_numpy() for metric in SVM_FEATURE_METRICS
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
            logger.warning(f"[CauseService] Insufficient training data for committee: {len(train_indices)} samples")
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

        logger.info(f"[CauseService] Committee votes generated for {len(committee_votes)} features")
        return committee_votes

    async def _extract_metrics_from_svm_metrics(self, feature_ids: List[int]) -> Optional[pl.DataFrame]:
        """Extract pre-aggregated metrics from svm_feature_metrics.parquet for SVM training.

        The svm_feature_metrics.parquet already contains 1 row per feature with
        pre-aggregated metrics (mean/std across explainers) and activation-level
        metrics (intra_ngram_jaccard, intra_semantic_sim, etc).

        Args:
            feature_ids: List of feature IDs

        Returns:
            DataFrame with feature_id and all 12 metrics
        """
        try:
            if self.data_service._svm_feature_metrics_lazy is None:
                logger.error("SVM feature metrics data not loaded")
                return None

            # Simply filter - data is already pre-aggregated (1 row per feature)
            df = self.data_service._svm_feature_metrics_lazy.filter(
                pl.col("feature_id").is_in(feature_ids)
            ).collect()

            # Compute log_frac_nonzero from frac_nonzero (computed at runtime)
            df = df.with_columns([
                (pl.col("frac_nonzero") + 1e-8).log().alias("log_frac_nonzero")
            ])

            # Fill null values for all metrics
            for metric in SVM_FEATURE_METRICS:
                if metric in df.columns:
                    df = df.with_columns(pl.col(metric).fill_null(0.0))
                else:
                    df = df.with_columns(pl.lit(0.0).alias(metric))

            logger.info(f"Extracted {len(SVM_FEATURE_METRICS)} metrics for {len(df)} features from svm_feature_metrics")
            return df

        except Exception as e:
            logger.error(f"Failed to extract metrics from cause_metrics: {e}", exc_info=True)
            return None

    def clear_cache(self):
        """Clear any cached data (no-op since we use pre-computed data)."""
        logger.info("Cache clear requested (no-op for pre-computed data)")
