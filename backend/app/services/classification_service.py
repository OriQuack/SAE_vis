"""
Classification service for SVM-based feature scoring.

Unified service handling:
- Binary SVM classification (Stage 2: similarity sorting, histograms, quality scores)
- Multi-class SVM classification (Stage 3: cause classification with OvR)
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
    HistogramStatistics, Stage3QualityScoresRequest,
    WeightedFeatureId, CommitteeVoteInfo,
    # Cause classification (Stage 3)
    CauseClassificationRequest, CauseClassificationResponse,
    CauseClassificationResult, CauseSelectionItem, CauseCommitteeVoteInfo,
)
from .committee_service import CommitteeService
from .data_constants import (
    COL_FEATURE_ID, CLICK_WEIGHT, THRESHOLD_WEIGHT,
    SVM_FEATURE_METRICS, CAUSE_CATEGORIES,
)
from .data_service import DataService
from .svm_utils import train_svm_model, score_with_svm, build_similarity_histogram_response

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
        Extract all 12 metrics for the specified features.

        Uses pre-aggregated cause_metrics parquet for fast extraction.
        Falls back to legacy extraction if cause_metrics data not available.

        Args:
            feature_ids: List of feature IDs to extract metrics for

        Returns:
            DataFrame with feature_id and all 12 metrics
        """
        # Try fast path: svm_feature_metrics parquet (pre-aggregated)
        if self.data_service._svm_feature_metrics_lazy is not None:
            result = await self._extract_metrics_from_svm_metrics(feature_ids)
            if result is not None and len(result) > 0:
                return result
            logger.warning("[_extract_metrics] SVM feature metrics extraction failed, falling back to legacy")

        # Fallback to legacy extraction
        return await self._extract_metrics_legacy(feature_ids)

    async def _extract_metrics_from_svm_metrics(self, feature_ids: List[int]) -> Optional[pl.DataFrame]:
        """
        Extract pre-aggregated metrics from svm_feature_metrics.parquet (fast path).

        The svm_feature_metrics.parquet already contains 1 row per feature with
        pre-aggregated metrics (mean/std across explainers) and activation-level
        metrics (intra_ngram_jaccard, intra_semantic_sim, etc).

        Args:
            feature_ids: List of feature IDs to extract metrics for

        Returns:
            DataFrame with feature_id and all 12 metrics
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

            logger.info(f"[_extract_metrics_from_svm_metrics] Extracted {len(SVM_FEATURE_METRICS)} metrics for {len(df)} features")
            return df

        except Exception as e:
            logger.error(f"[_extract_metrics_from_svm_metrics] Failed: {e}", exc_info=True)
            return None

    async def _extract_metrics_legacy(self, feature_ids: List[int]) -> Optional[pl.DataFrame]:
        """
        Legacy metric extraction from main dataframe + activation_display.

        This is slower than barycentric extraction but serves as fallback.

        Args:
            feature_ids: List of feature IDs to extract metrics for

        Returns:
            DataFrame with feature_id and all 12 metrics
        """
        try:
            logger.info(f"[_extract_metrics_legacy] Starting extraction for {len(feature_ids)} features")

            # Get the main dataframe
            lf = self.data_service._df_lazy

            if lf is None:
                logger.error("Main dataframe not initialized")
                return None

            logger.info("[_extract_metrics_legacy] Main dataframe loaded")

            # Filter to requested features
            lf = lf.filter(pl.col("feature_id").is_in(feature_ids))
            logger.info("[_extract_metrics_legacy] Filtered to requested features")

            # Extract metrics from main dataframe
            logger.info("[_extract_metrics_legacy] Extracting main dataframe metrics")

            try:
                # Extract scores and semsim_mean
                base_df = lf.select([
                    "feature_id",
                    # Score metrics
                    pl.col("score_embedding").fill_null(0.0).alias("score_embedding"),
                    pl.col("score_fuzz").fill_null(0.0).alias("score_fuzz"),
                    pl.col("score_detection").fill_null(0.0).alias("score_detection"),
                    # Explanation semantic similarity (semsim_mean)
                    pl.col("semsim_mean").fill_null(0.0).alias("explanation_semantic_sim"),
                    # Neuronpedia: fraction of non-zero activations (will be log-transformed later)
                    pl.col("frac_nonzero").fill_null(0.0).alias("frac_nonzero"),
                ]).unique(subset=["feature_id"]).collect()

                # Compute log_frac_nonzero
                base_df = base_df.with_columns([
                    (pl.col("frac_nonzero") + 1e-8).log().alias("log_frac_nonzero")
                ])

                logger.info(f"[_extract_metrics_legacy] Main dataframe metrics extracted: {len(base_df)} features")
            except Exception as agg_error:
                logger.error(f"[_extract_metrics_legacy] Main dataframe extraction failed: {agg_error}", exc_info=True)
                raise

            # Cast feature_id to UInt32 to match activation dataframe
            base_df = base_df.with_columns(pl.col("feature_id").cast(pl.UInt32))

            # Extract activation-level metrics (intra-feature)
            logger.info("[_extract_metrics_legacy] Extracting activation metrics")
            activation_df = await self._extract_activation_metrics(feature_ids)
            logger.info(f"[_extract_metrics_legacy] Activation metrics: {len(activation_df) if activation_df is not None else 0} rows")

            # Join all metrics together
            logger.info("[_extract_metrics_legacy] Joining all metrics")
            result_df = base_df

            if activation_df is not None:
                result_df = result_df.join(activation_df, on="feature_id", how="left")
                logger.info("[_extract_metrics_legacy] Joined activation metrics")

            # Fill nulls with 0 for missing metrics (including std metrics that may not exist in legacy)
            for metric in SVM_FEATURE_METRICS:
                if metric not in result_df.columns:
                    result_df = result_df.with_columns(pl.lit(0.0).alias(metric))
                else:
                    result_df = result_df.with_columns(
                        pl.col(metric).fill_null(0.0)
                    )

            logger.info(f"Extracted metrics for {len(result_df)} features")
            return result_df

        except Exception as e:
            logger.error(f"Failed to extract metrics: {e}", exc_info=True)
            import traceback
            traceback.print_exc()
            return None

    async def _extract_activation_metrics(self, feature_ids: List[int]) -> Optional[pl.DataFrame]:
        """
        Extract intra-feature activation metrics for new 12-metric configuration.

        Extracts:
        - intra_ngram_jaccard: max(char_ngram, word_ngram) - lexical consistency
        - intra_semantic_sim: semantic_similarity - semantic consistency
        - intra_semantic_sim_std: semantic_similarity_std - variability

        Args:
            feature_ids: List of feature IDs

        Returns:
            DataFrame with feature_id and activation-level metrics
        """
        try:
            if self.data_service._activation_display_lazy is None:
                logger.warning("No activation display data available")
                return None

            df = self.data_service._activation_display_lazy.filter(
                pl.col("feature_id").is_in(feature_ids)
            ).collect()

            # Extract split activation metrics
            df = df.select([
                "feature_id",
                # intra_ngram_jaccard = max(char_ngram, word_ngram)
                pl.max_horizontal(
                    "char_ngram_max_jaccard",
                    "word_ngram_max_jaccard"
                ).fill_null(0.0).alias("intra_ngram_jaccard"),
                # intra_ngram_jaccard_std: pick std corresponding to whichever of char/word had higher mean
                pl.when(pl.col("char_ngram_max_jaccard").fill_null(0.0) >= pl.col("word_ngram_max_jaccard").fill_null(0.0))
                  .then(pl.col("char_ngram_max_jaccard_std").fill_null(0.0))
                  .otherwise(pl.col("word_ngram_max_jaccard_std").fill_null(0.0))
                  .alias("intra_ngram_jaccard_std"),
                # intra_semantic_sim (activation-level semantic similarity)
                pl.col("semantic_similarity").fill_null(0.0).alias("intra_semantic_sim"),
                # intra_semantic_sim_std
                pl.col("semantic_similarity_std").fill_null(0.0).alias("intra_semantic_sim_std"),
            ]).unique(subset=["feature_id"])

            logger.info(f"Extracted activation metrics for {len(df)} features")
            return df

        except Exception as e:
            logger.warning(f"Failed to extract activation metrics: {e}")
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
                    vote_entropy=info["vote_entropy"]
                )
                for fid, info in committee_votes.items()
            }

        logger.info(f"Successfully generated histogram for {len(feature_scores)} features")

        return build_similarity_histogram_response(
            scores_dict, score_values, len(feature_scores),
            committee_votes_response
        )

    async def get_stage3_quality_scores(
        self,
        request: Stage3QualityScoresRequest
    ) -> SimilarityHistogramResponse:
        """
        Calculate Stage 3 quality scores using Stage 2's SVM model.

        Trains an SVM on Stage 2's Well-Explained (positive) vs Need Revision (negative)
        features, then scores all specified feature_ids (typically the Need Revision set)
        to determine their proximity to the Well-Explained decision boundary.

        Args:
            request: Request containing well_explained_ids, need_revision_ids, and feature_ids

        Returns:
            Response with scores and histogram data (reuses SimilarityHistogramResponse)
        """
        if not self.data_service.is_ready():
            raise RuntimeError("DataService not ready")

        # We need metrics for all features involved:
        # - Training: well_explained_items + need_revision_items
        # - Scoring: feature_ids
        well_explained_ids = [item.id for item in request.well_explained_items]
        need_revision_ids = [item.id for item in request.need_revision_items]
        all_feature_ids = list(set(
            well_explained_ids +
            need_revision_ids +
            request.feature_ids
        ))

        logger.info(f"[Stage3QualityScores] Extracting metrics for {len(all_feature_ids)} features "
                   f"(well_explained={len(request.well_explained_items)}, "
                   f"need_revision={len(request.need_revision_items)}, "
                   f"to_score={len(request.feature_ids)})")

        metrics_df = await self._extract_metrics(all_feature_ids)

        if metrics_df is None or len(metrics_df) == 0:
            logger.warning("[Stage3QualityScores] No metrics extracted, returning empty histogram")
            return SimilarityHistogramResponse(
                scores={},
                histogram=HistogramData(bins=[], counts=[], bin_edges=[]),
                statistics=HistogramStatistics(min=0.0, max=0.0, mean=0.0, median=0.0),
                total_items=0
            )

        # Calculate similarity scores using SVM on ALL features (training + classification)
        logger.info("[Stage3QualityScores] Training SVM on Stage 2 selections")
        all_feature_scores, _ = self._calculate_similarity_scores(
            metrics_df,  # Full dataframe with training + classification features
            request.well_explained_items,
            request.need_revision_items,
            include_training_items=True,
            train_committee=False,
        )

        # Filter to only return scores for classification features (request.feature_ids)
        feature_ids_set = set(request.feature_ids)
        feature_scores = [fs for fs in all_feature_scores if fs.feature_id in feature_ids_set]

        logger.info(f"[Stage3QualityScores] SVM scored {len(all_feature_scores)} total, "
                   f"filtered to {len(feature_scores)} classification features")

        # Create scores dictionary
        scores_dict = {str(item.feature_id): item.score for item in feature_scores}
        score_values = np.array([item.score for item in feature_scores])

        logger.info(f"[Stage3QualityScores] Generated histogram for {len(feature_scores)} features")

        return build_similarity_histogram_response(
            scores_dict, score_values, len(feature_scores)
        )

    # =========================================================================
    # CAUSE CLASSIFICATION (Stage 3 — multi-class)
    # =========================================================================

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

        # Extract metrics (uses fast path with legacy fallback)
        metrics_df = await self._extract_metrics(feature_ids)

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
            logger.warning(f"[ClassificationService] Insufficient training data for committee: {len(train_indices)} samples")
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

            # Train SVM with weights
            model, scaler = train_svm_model(selected_vectors, rejected_vectors, selected_weights, rejected_weights)

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
            rf_model, mlp_model, committee_scaler = self.committee_service.train_committee(
                X_train, y_train, sample_weights
            )

            if rf_model is not None or mlp_model is not None:
                # Score all features for committee (need full scores array)
                if scores is None:
                    scores = score_with_svm(model, scaler, metrics_matrix)

                # Scale all features using the SVM scaler (consistent with SVM scoring)
                X_scaled = scaler.transform(metrics_matrix)  # type: ignore[assignment]

                # Get committee predictions
                committee_preds = self.committee_service.predict_with_committee(
                    X_scaled, scores, rf_model, mlp_model, committee_scaler  # type: ignore[arg-type]
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
