"""
Classification service for SVM-based feature scoring.

Unified service handling:
- Binary SVM classification (Stage 2: similarity sorting, histograms, quality scores)
- Multi-class SVM classification (Stage 3: cause classification with OvO-based SVC)
"""

import polars as pl
import numpy as np
import logging
import hashlib
from typing import List, Dict, Tuple, Optional
from sklearn.svm import SVC
from sklearn.preprocessing import StandardScaler

from ..models.common import HistogramData
from ..models.classification import (
    # Binary classification (Stage 2)
    SimilaritySortRequest, SimilaritySortResponse, FeatureScore,
    SimilarityHistogramRequest, SimilarityHistogramResponse,
    HistogramStatistics,
    WeightedFeatureId, CommitteeVoteInfo,
    # Cause classification (Stage 3)
    CauseClassificationRequest,
    CauseSelectionItem, CauseCommitteeVoteInfo,
)
from .committee_service import CommitteeService
from .data_constants import (
    COL_FEATURE_ID, CLICK_WEIGHT, THRESHOLD_WEIGHT,
    SVM_FEATURE_METRICS, CAUSE_CATEGORIES,
)
from .data_service import DataService
from .svm_utils import (
    train_svm_model, score_with_svm, build_similarity_histogram_response,
    compute_balanced_sample_weights,
)

logger = logging.getLogger(__name__)


class ClassificationService:
    """Unified SVM-based classification service (binary + multi-class)."""

    def __init__(self, data_service: DataService):
        """
        Initialize ClassificationService.

        Args:
            data_service: Instance of DataService for data access
        """
        self.data_service = data_service
        self.committee_service = CommitteeService()

        # SVM model cache: (selected_ids, rejected_ids) hash -> (model, scaler)
        self._svm_cache: Dict[str, Tuple[SVC, StandardScaler]] = {}
        self._max_cache_size = 100  # Prevent unbounded growth

    # =========================================================================
    # METRIC EXTRACTION (shared by binary + multi-class)
    # =========================================================================

    async def _extract_metrics(self, feature_ids: List[int]) -> Optional[pl.DataFrame]:
        """
        Extract pre-aggregated metrics from svm_feature_metrics.parquet (fast path).

        The svm_feature_metrics.parquet already contains 1 row per feature with
        pre-aggregated metrics (mean/std across explainers) and activation-level
        metrics (intra_ngram_jaccard, intra_semantic_sim, etc).

        Args:
            feature_ids: List of feature IDs to extract metrics for

        Returns:
            DataFrame with feature_id and all 14 metrics (see SVM_FEATURE_METRICS)
        """
        try:
            logger.info(f"[_extract_metrics_from_svm_metrics] Extracting metrics for {len(feature_ids)} features")

            # Simply filter - data is already pre-aggregated (1 row per feature)
            svm_lazy = self.data_service._svm_feature_metrics_lazy
            assert svm_lazy is not None
            df = svm_lazy.filter(
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

            logger.info(f"[_extract_metrics] Requested {len(feature_ids)} features, got {len(df)} from svm_feature_metrics")
            return df

        except Exception as e:
            logger.error(f"[_extract_metrics] Failed: {e}", exc_info=True)
            return None

    # =========================================================================
    # BINARY SVM (Stage 2)
    # =========================================================================

    async def get_similarity_sorted_features(
        self,
        request: SimilaritySortRequest
    ) -> SimilaritySortResponse:
        """
        Calculate similarity scores and return sorted features.

        Args:
            request: Request containing selected, rejected, and all feature IDs

        Returns:
            Response with sorted features and scores
        """
        if not self.data_service.is_ready():
            raise RuntimeError("DataService not ready")

        # Validate inputs
        if len(request.feature_ids) == 0:
            return SimilaritySortResponse(
                sorted_features=[],
                total_features=0,
                weights_used=[]
            )

        # Extract metrics for all features
        logger.info(f"Extracting metrics for {len(request.feature_ids)} features")
        metrics_df = await self._extract_metrics(request.feature_ids)

        if metrics_df is None or len(metrics_df) == 0:
            logger.warning("No metrics extracted, returning empty result")
            return SimilaritySortResponse(
                sorted_features=[],
                total_features=0,
                weights_used=[]
            )

        # Calculate similarity scores using SVM
        logger.info(f"Calculating similarity scores with SVM")
        feature_scores, _ = self._calculate_similarity_scores(
            metrics_df,
            request.selected_items,
            request.rejected_items,
            include_training_items=False,
            train_committee=False,
        )

        # Sort by score (descending - higher is better)
        feature_scores.sort(key=lambda x: x.score, reverse=True)

        logger.info(f"Successfully scored and sorted {len(feature_scores)} features using SVM")

        return SimilaritySortResponse(
            sorted_features=feature_scores,
            total_features=len(feature_scores),
            weights_used=[]  # SVM doesn't expose interpretable weights
        )

    async def get_similarity_score_histogram(
        self,
        request: SimilarityHistogramRequest
    ) -> SimilarityHistogramResponse:
        """
        Calculate similarity scores and return histogram distribution for automatic tagging.

        Args:
            request: Request containing selected, rejected, and all feature IDs

        Returns:
            Response with scores and histogram data
        """
        if not self.data_service.is_ready():
            raise RuntimeError("DataService not ready")

        # Extract metrics for all features
        logger.info(f"Extracting metrics for {len(request.feature_ids)} features for histogram")
        metrics_df = await self._extract_metrics(request.feature_ids)

        if metrics_df is None or len(metrics_df) == 0:
            logger.warning("No metrics extracted, returning empty histogram")
            return SimilarityHistogramResponse(
                scores={},
                histogram=HistogramData(bins=[], counts=[], bin_edges=[]),
                statistics=HistogramStatistics(min=0.0, max=0.0, mean=0.0, median=0.0),
                total_items=0
            )

        # Calculate similarity scores for ALL features (including selected/rejected)
        # Also train committee (RF + MLP) for QBC approach
        logger.info(f"Calculating similarity scores for histogram with SVM + committee")
        feature_scores, committee_votes = self._calculate_similarity_scores(
            metrics_df,
            request.selected_items,
            request.rejected_items,
            include_training_items=True,
            train_committee=True,
        )

        # Create scores dictionary
        scores_dict = {str(item.feature_id): item.score for item in feature_scores}
        score_values = np.array([item.score for item in feature_scores])

        # Convert committee votes to Pydantic models if available
        committee_votes_response = None
        if committee_votes:
            committee_votes_response = {
                fid: CommitteeVoteInfo(
                    svm_prediction=info["svm_prediction"],
                    rf_prediction=info["rf_prediction"],
                    mlp_prediction=info["mlp_prediction"],
                )
                for fid, info in committee_votes.items()
            }

        logger.info(f"Successfully generated histogram for {len(feature_scores)} features")

        return build_similarity_histogram_response(
            scores_dict, score_values, len(feature_scores),
            committee_votes_response
        )

    # =========================================================================
    # CAUSE CLASSIFICATION (Stage 3 — multi-class)
    # =========================================================================

    async def get_cause_classification(
        self,
        request: CauseClassificationRequest
    ) -> dict:
        """Classify features into cause categories using OvO-based multi-class SVM.

        Trains a single multi-class SVC (internally OvO via libsvm) using only
        user's manual tags. decision_function_shape='ovr' produces per-category
        scores with the same (N, 3) shape as the previous manual OvR approach.

        Returns a plain dict (bypasses Pydantic serialization for speed).

        Args:
            request: Request containing feature_ids and cause_selections

        Returns:
            Dict with results, total_features, category_counts, committee_votes
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

        # Extract metrics (uses fast path with legacy fallback)
        metrics_df = await self._extract_metrics(feature_ids)

        if metrics_df is None or len(metrics_df) == 0:
            logger.warning("No metrics extracted, returning empty result")
            return {
                "results": [],
                "total_features": 0,
                "category_counts": {}
            }

        # Build feature matrix
        feature_ids_ordered = metrics_df[COL_FEATURE_ID].to_numpy()
        metrics_matrix = np.column_stack([
            metrics_df[metric].to_numpy() for metric in SVM_FEATURE_METRICS
        ])
        logger.info(f"[Stage3] metrics_matrix: {len(feature_ids_ordered)}/{len(feature_ids)} features have metrics")

        # Map feature_ids to indices for cause_selections lookup
        feature_id_to_idx = {int(fid): idx for idx, fid in enumerate(feature_ids_ordered)}

        # Build training data once (shared by SVM + committee)
        train_indices, train_labels, sample_weights = self._build_cause_training_data(
            cause_selections, feature_id_to_idx
        )

        # Train OvO-based multi-class SVM and compute decision function vectors
        decision_vectors, scaler = self._compute_decision_function_vectors(
            metrics_matrix,
            feature_ids_ordered,
            train_indices,
            train_labels,
            sample_weights
        )

        # Scale metrics for committee training (reuse scaler from SVM)
        metrics_scaled = scaler.transform(metrics_matrix)

        # Train RF and MLP committee for multi-class prediction
        committee_votes = self._train_committee_and_predict(
            metrics_scaled,
            feature_ids_ordered,
            train_indices,
            train_labels,
            sample_weights
        )

        # Vectorized argmax + margin computation (replaces per-row loop)
        n_categories = len(CAUSE_CATEGORIES)
        predicted_indices = np.argmax(decision_vectors, axis=1)
        sorted_dv = np.sort(decision_vectors, axis=1)[:, ::-1]
        margins = sorted_dv[:, 0] - sorted_dv[:, 1]

        # Count predictions
        counts = np.bincount(predicted_indices, minlength=n_categories)
        predicted_counts = {CAUSE_CATEGORIES[i]: int(counts[i]) for i in range(n_categories)}

        logger.info(f"Classification complete. Predicted counts: {predicted_counts}")

        # Update committee_votes svm_category using vectorized predictions
        if committee_votes is not None:
            for i, fid in enumerate(feature_ids_ordered):
                fid_int = int(fid)
                if fid_int in committee_votes:
                    committee_votes[fid_int] = CauseCommitteeVoteInfo(
                        svm_category=CAUSE_CATEGORIES[int(predicted_indices[i])],
                        rf_category=committee_votes[fid_int].rf_category,
                        mlp_category=committee_votes[fid_int].mlp_category
                    )

        # Build plain-dict results (bypass Pydantic serialization for speed)
        results = []
        for i in range(len(feature_ids_ordered)):
            results.append({
                "feature_id": int(feature_ids_ordered[i]),
                "predicted_category": CAUSE_CATEGORIES[int(predicted_indices[i])],
                "decision_margin": float(margins[i]),
                "decision_scores": {
                    CAUSE_CATEGORIES[j]: float(decision_vectors[i, j])
                    for j in range(n_categories)
                }
            })

        # Convert committee_votes Pydantic → plain dicts
        committee_votes_dict = None
        if committee_votes is not None:
            committee_votes_dict = {
                fid: {"svm_category": v.svm_category, "rf_category": v.rf_category, "mlp_category": v.mlp_category}
                for fid, v in committee_votes.items()
            }

        return {
            "results": results,
            "total_features": len(results),
            "category_counts": predicted_counts,
            "committee_votes": committee_votes_dict
        }

    def _build_cause_training_data(
        self,
        cause_selections: Dict[int, CauseSelectionItem],
        feature_id_to_idx: Dict[int, int]
    ) -> Tuple[List[int], List[int], List[float]]:
        """Build training arrays from cause selections (shared by SVM + committee).

        Args:
            cause_selections: Dict mapping feature_id to CauseSelectionItem
            feature_id_to_idx: Dict mapping feature_id to matrix index

        Returns:
            Tuple of (train_indices, train_labels, sample_weights)
        """
        category_to_idx = {cat: i for i, cat in enumerate(CAUSE_CATEGORIES)}
        train_indices = []
        train_labels = []
        sample_weights = []
        for fid, item in cause_selections.items():
            if fid in feature_id_to_idx and item.category in category_to_idx:
                train_indices.append(feature_id_to_idx[fid])
                train_labels.append(category_to_idx[item.category])
                sample_weights.append(CLICK_WEIGHT if item.source == 'click' else THRESHOLD_WEIGHT)
        return train_indices, train_labels, sample_weights

    def _compute_decision_function_vectors(
        self,
        metrics_matrix: np.ndarray,
        feature_ids: np.ndarray,
        train_indices: List[int],
        train_labels: List[int],
        sample_weights: List[float]
    ) -> Tuple[np.ndarray, StandardScaler]:
        """Train OvO-based multi-class SVM and compute decision function vectors.

        Uses sklearn's native SVC which internally trains OvO (pairwise) classifiers
        via libsvm. With decision_function_shape='ovr', the output is transformed to
        per-category scores — same (N, 3) shape as the previous manual OvR approach.

        Args:
            metrics_matrix: (N, D) feature metric matrix (raw values)
            feature_ids: Array of feature IDs
            train_indices: Indices into metrics_matrix for training samples
            train_labels: Integer class labels for training samples
            sample_weights: Per-sample weights for training

        Returns:
            Tuple of (N, K) decision function matrix and fitted StandardScaler
        """
        n_features = len(feature_ids)
        n_categories = len(CAUSE_CATEGORIES)

        # Scale feature metrics
        scaler = StandardScaler()
        metrics_scaled = scaler.fit_transform(metrics_matrix)

        # Validate: need >= 2 unique categories to train
        unique_labels = set(train_labels)
        if len(unique_labels) < 2:
            logger.warning(f"Insufficient categories for SVM: {len(unique_labels)} (need >= 2)")
            return np.zeros((n_features, n_categories)), scaler

        X_train = metrics_scaled[train_indices]
        y_train = np.array(train_labels)
        weights = np.array(sample_weights)

        # Balance by weighted class mass (not raw counts like sklearn's class_weight='balanced')
        weights = compute_balanced_sample_weights(y_train, weights)

        # Train single multi-class SVC (OvO internally, OvR-shaped output)
        svm = SVC(
            kernel='rbf',
            C=1.0,
            gamma='scale',
            decision_function_shape='ovr'
        )
        svm.fit(X_train, y_train, sample_weight=weights)

        # Compute decision function for all features
        raw_decisions = svm.decision_function(metrics_scaled)

        # Map decision function output to (N, n_categories) matrix
        decision_vectors = np.zeros((n_features, n_categories))

        if len(svm.classes_) == 2:
            # Binary case: decision_function returns (N,) 1D array
            # Positive direction = classes_[1], negative = classes_[0]
            pos_idx = int(svm.classes_[1])
            neg_idx = int(svm.classes_[0])
            decision_vectors[:, pos_idx] = raw_decisions
            decision_vectors[:, neg_idx] = -raw_decisions
            # Missing category: set to -|decision_function| so softmax treats as "least likely"
            known_indices = {pos_idx, neg_idx}
            for miss_idx in [i for i in range(n_categories) if i not in known_indices]:
                decision_vectors[:, miss_idx] = -np.abs(raw_decisions)
            logger.warning(f"Binary SVM: only {len(svm.classes_)} classes detected, "
                           f"missing categories set to -|decision_function|")
        else:
            # Multi-class (3+): decision_function returns (N, K) with OvR shape
            # Columns correspond to svm.classes_ ordering
            for col_idx, class_label in enumerate(svm.classes_):
                cat_idx = int(class_label)
                decision_vectors[:, cat_idx] = raw_decisions[:, col_idx]

        n_train = len(train_indices)
        n_cats = len(unique_labels)
        logger.info(f"Trained OvO SVM: {n_train} samples across {n_cats} categories")

        return decision_vectors, scaler

    def _train_committee_and_predict(
        self,
        metrics_scaled: np.ndarray,
        feature_ids: np.ndarray,
        train_indices: List[int],
        train_labels: List[int],
        sample_weights: List[float]
    ) -> Optional[Dict[int, CauseCommitteeVoteInfo]]:
        """Train RF and MLP committee for multi-class cause prediction.

        Uses CommitteeService to train Random Forest and MLP classifiers,
        then predicts category for all features. Returns committee votes
        for disagreement highlighting.

        Args:
            metrics_scaled: (N, D) scaled feature matrix (already SVM-scaled)
            feature_ids: Array of feature IDs
            train_indices: Indices into metrics_scaled for training samples
            train_labels: Integer class labels for training samples
            sample_weights: Per-sample weights for training

        Returns:
            Dict mapping feature_id to CauseCommitteeVoteInfo, or None if insufficient data
        """
        label_to_category = {i: cat for i, cat in enumerate(CAUSE_CATEGORIES)}

        # Need at least 2 samples per category for meaningful committee
        if len(train_indices) < 6:  # At least 2 per 3 categories
            logger.warning(f"[ClassificationService] Insufficient training data for committee: {len(train_indices)} samples")
            return None

        X_train = metrics_scaled[train_indices]
        y_train = np.array(train_labels)
        weights = np.array(sample_weights)

        # Train committee using CommitteeService
        # Data is already SVM-scaled, skip committee's own scaling
        rf_model, mlp_model, _committee_scaler = self.committee_service.train_multiclass_committee(
            X_train, y_train, weights, skip_scaling=True
        )

        # If both failed, return None
        if rf_model is None and mlp_model is None:
            return None

        # Create placeholder SVM category indices (will be updated by caller with actual SVM predictions)
        # Use RF predictions as initial placeholder (data already scaled, no transform needed)
        if rf_model is not None:
            svm_category_indices = rf_model.predict(metrics_scaled).astype(int)
        else:
            svm_category_indices = np.zeros(len(feature_ids), dtype=int)

        # Get committee predictions (scaler=None since data is already SVM-scaled)
        committee_preds = self.committee_service.predict_multiclass_with_committee(
            metrics_scaled,
            svm_category_indices,
            rf_model,
            mlp_model,
            None,
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

        logger.info(f"[ClassificationService] Committee votes generated for {len(committee_votes)} features")
        return committee_votes

    # =========================================================================
    # BINARY SVM SCORING (internal)
    # =========================================================================

    def _calculate_similarity_scores(
        self,
        metrics_df: pl.DataFrame,
        selected_items: List[WeightedFeatureId],
        rejected_items: List[WeightedFeatureId],
        include_training_items: bool = False,
        train_committee: bool = False,
    ) -> Tuple[List[FeatureScore], Optional[Dict[str, Dict]]]:
        """
        Calculate similarity scores for features using SVM.

        Trains a binary SVM classifier on selected vs rejected features,
        then scores features by their signed distance from the decision boundary.

        Args:
            metrics_df: DataFrame with metrics for all features
            selected_items: Weighted feature items marked as selected
            rejected_items: Weighted feature items marked as rejected
            include_training_items: If True, score ALL features (histogram);
                                   if False, exclude selected/rejected (sort)
            train_committee: If True, also train RF/MLP and return vote info

        Returns:
            Tuple of (feature_scores, committee_votes)
        """
        # Extract IDs from weighted items
        selected_ids = [item.id for item in selected_items]
        rejected_ids = [item.id for item in rejected_items]

        # Convert to numpy for SVM
        feature_ids = metrics_df["feature_id"].to_numpy()
        metrics_matrix = np.column_stack([
            metrics_df[metric].to_numpy() for metric in SVM_FEATURE_METRICS
        ])

        # Build ID to weight mapping
        id_to_weight = {}
        for item in selected_items:
            id_to_weight[item.id] = CLICK_WEIGHT if item.source == 'click' else THRESHOLD_WEIGHT
        for item in rejected_items:
            id_to_weight[item.id] = CLICK_WEIGHT if item.source == 'click' else THRESHOLD_WEIGHT

        # Check cache (include weights in cache key for weighted training)
        cache_key = self._get_cache_key_weighted(selected_items, rejected_items)

        # Variables for committee training
        X_train = None
        y_train = None
        sample_weights = None

        if cache_key in self._svm_cache:
            model, scaler = self._svm_cache[cache_key]
            logger.info(f"Using cached SVM model (key: {cache_key[:8]}...)")

            # Still need training data for committee if requested
            if train_committee:
                selected_set = set(selected_ids)
                rejected_set = set(rejected_ids)
                selected_indices = []
                rejected_indices = []
                for i, fid in enumerate(feature_ids):
                    if fid in selected_set:
                        selected_indices.append(i)
                    elif fid in rejected_set:
                        rejected_indices.append(i)
                if selected_indices and rejected_indices:
                    selected_vectors = metrics_matrix[selected_indices]
                    rejected_vectors = metrics_matrix[rejected_indices]
                    X_train = np.vstack([selected_vectors, rejected_vectors])
                    y_train = np.array([1] * len(selected_vectors) + [0] * len(rejected_vectors))
                    sel_w = np.array([id_to_weight.get(feature_ids[i], CLICK_WEIGHT) for i in selected_indices])
                    rej_w = np.array([id_to_weight.get(feature_ids[i], CLICK_WEIGHT) for i in rejected_indices])
                    sample_weights = np.concatenate([sel_w, rej_w])
        else:
            # Extract training vectors and weights - single pass with set lookups
            selected_set = set(selected_ids)
            rejected_set = set(rejected_ids)
            selected_indices = []
            rejected_indices = []
            for i, fid in enumerate(feature_ids):
                if fid in selected_set:
                    selected_indices.append(i)
                elif fid in rejected_set:
                    rejected_indices.append(i)

            if not selected_indices or not rejected_indices:
                logger.warning("Insufficient training data for SVM (need both selected and rejected)")
                return [], None

            selected_vectors = metrics_matrix[selected_indices]
            rejected_vectors = metrics_matrix[rejected_indices]

            # Build weight arrays
            selected_weights = np.array([id_to_weight.get(feature_ids[i], CLICK_WEIGHT) for i in selected_indices])
            rejected_weights = np.array([id_to_weight.get(feature_ids[i], CLICK_WEIGHT) for i in rejected_indices])

            # Prepare training data for committee
            X_train = np.vstack([selected_vectors, rejected_vectors])
            y_train = np.array([1] * len(selected_vectors) + [0] * len(rejected_vectors))
            sample_weights = np.concatenate([selected_weights, rejected_weights])

            # Fit scaler on full prediction pool for stable statistics
            full_data_scaler = StandardScaler()
            full_data_scaler.fit(metrics_matrix)
            logger.info(f"[Stage2] Scaler fit on {len(metrics_matrix)} features (full prediction pool). "
                        f"Training: {len(selected_vectors)} selected + {len(rejected_vectors)} rejected")

            # Train SVM with weights (using pre-fit scaler)
            model, scaler = train_svm_model(selected_vectors, rejected_vectors, selected_weights, rejected_weights, scaler=full_data_scaler)

            # Cache with size limit
            if len(self._svm_cache) >= self._max_cache_size:
                oldest_key = next(iter(self._svm_cache))
                self._svm_cache.pop(oldest_key)
                logger.info(f"SVM cache full, evicted oldest entry")

            self._svm_cache[cache_key] = (model, scaler)
            logger.info(f"SVM model cached (key: {cache_key[:8]}..., cache size: {len(self._svm_cache)})")

        # Score features
        if include_training_items:
            # Score ALL features (for histogram)
            scores = score_with_svm(model, scaler, metrics_matrix)
            feature_scores = [
                FeatureScore(feature_id=int(fid), score=float(s))
                for fid, s in zip(feature_ids, scores)
            ]
        else:
            # Exclude selected/rejected (for sort)
            selected_set = set(selected_ids)
            rejected_set = set(rejected_ids)
            score_mask = np.array([
                fid not in selected_set and fid not in rejected_set
                for fid in feature_ids
            ])
            feature_scores = []
            scores = None
            if np.any(score_mask):
                masked_scores = score_with_svm(model, scaler, metrics_matrix[score_mask])
                scored_ids = feature_ids[score_mask]
                feature_scores = [
                    FeatureScore(feature_id=int(fid), score=float(s))
                    for fid, s in zip(scored_ids, masked_scores)
                ]

        # Train committee and get vote info if requested
        committee_votes = None

        if train_committee and X_train is not None and y_train is not None:
            logger.info("[ClassificationService] Training committee (RF + MLP) for QBC...")
            # Pre-scale training data with SVM scaler so committee trains on same scale
            X_train_scaled = scaler.transform(X_train)
            rf_model, mlp_model, _committee_scaler = self.committee_service.train_committee(
                X_train_scaled, y_train, sample_weights, skip_scaling=True
            )

            if rf_model is not None or mlp_model is not None:
                # Score all features for committee (need full scores array)
                if scores is None:
                    scores = score_with_svm(model, scaler, metrics_matrix)

                # Scale all features using the SVM scaler (consistent with SVM scoring)
                X_scaled = scaler.transform(metrics_matrix)  # type: ignore[assignment]

                # Get committee predictions (scaler=None since data already SVM-scaled)
                committee_preds = self.committee_service.predict_with_committee(
                    X_scaled, scores, rf_model, mlp_model, None  # type: ignore[arg-type]
                )

                # Convert to API response format
                item_ids = [str(int(fid)) for fid in feature_ids]
                committee_votes = self.committee_service.get_vote_info_dict(item_ids, committee_preds)

                logger.info(f"[ClassificationService] Committee votes generated for {len(item_ids)} items")

        return feature_scores, committee_votes

    # =========================================================================
    # HELPERS
    # =========================================================================

    def _get_cache_key_weighted(
        self,
        selected_items: List[WeightedFeatureId],
        rejected_items: List[WeightedFeatureId]
    ) -> str:
        """
        Generate unique cache key from weighted user selections.

        Includes both IDs and sources in the cache key since weights affect the model.

        Args:
            selected_items: Weighted feature items marked as selected
            rejected_items: Weighted feature items marked as rejected

        Returns:
            MD5 hash of sorted (ID, source) tuples
        """
        selected_tuples = sorted([(item.id, item.source) for item in selected_items])
        rejected_tuples = sorted([(item.id, item.source) for item in rejected_items])
        key_str = f"{selected_tuples}_{rejected_tuples}"
        return hashlib.md5(key_str.encode()).hexdigest()

    def clear_svm_cache(self):
        """Clear SVM model cache (call on data reload)."""
        self._svm_cache.clear()
        logger.info("SVM model cache cleared")
