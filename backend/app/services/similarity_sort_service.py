"""
Similarity-based sorting service for table features.

Uses SVM (Support Vector Machine) with RBF kernel to learn similarity patterns
from user-labeled features. Scores features by signed distance from SVM decision boundary.
"""

import polars as pl
import numpy as np
import logging
import hashlib
from typing import List, Dict, Tuple, Optional, TYPE_CHECKING
from sklearn.svm import SVC
from sklearn.preprocessing import StandardScaler

from ..models.similarity_sort import (
    SimilaritySortRequest, SimilaritySortResponse, FeatureScore,
    SimilarityHistogramRequest, SimilarityHistogramResponse,
    HistogramData, HistogramStatistics, BimodalityInfo, GMMComponentInfo,
    MultiModalityRequest, MultiModalityResponse, MultiModalityInfo, CategoryBimodalityInfo,
    Stage3QualityScoresRequest,
    WeightedFeatureId, CauseSelectionItem, CommitteeVoteInfo
)
from .bimodality_service import BimodalityService
from .committee_service import CommitteeService

if TYPE_CHECKING:
    from .data_service import DataService

logger = logging.getLogger(__name__)

# ============================================================================
# SAMPLE WEIGHTS FOR SVM TRAINING
# ============================================================================
# 'click' (direct user clicks) get full weight
# 'threshold' (batch Apply Tags) get reduced weight due to potential errors
CLICK_WEIGHT = 1.0
THRESHOLD_WEIGHT = 0.2


class SimilaritySortService:
    """Service for calculating feature similarity scores."""

    # 9 metrics used for SINGLE FEATURE SVM similarity calculation
    # Same as Stage 3 (Cause) for uniformity - uses composite intra_feature_sim
    METRICS = [
        # Mean metrics (6)
        'intra_feature_sim',         # Activation-level: max(char_ngram, word_ngram, semantic) - composite consistency
        'score_embedding',           # Score: embedding-based scoring
        'score_fuzz',                # Score: fuzzy matching score
        'score_detection',           # Score: detection score
        'explanation_semantic_sim',  # Explanation-level: semantic similarity between LLM explanations (semsim_mean)
        'frac_nonzero',              # Neuronpedia: fraction of non-zero activations
        # Std metrics - scores only (3) - captures cross-explainer disagreement
        'score_embedding_std',
        'score_fuzz_std',
        'score_detection_std',
    ]

    def __init__(self, data_service: "DataService"):
        """
        Initialize SimilaritySortService.

        Args:
            data_service: Instance of DataService for data access
        """
        self.data_service = data_service
        self.bimodality_service = BimodalityService()
        self.committee_service = CommitteeService()

        # SVM model cache: (selected_ids, rejected_ids) hash -> (model, scaler)
        self._svm_cache: Dict[str, Tuple[SVC, StandardScaler]] = {}
        self._max_cache_size = 100  # Prevent unbounded growth

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
        feature_scores = self._calculate_similarity_scores(
            metrics_df,
            request.selected_items,
            request.rejected_items
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
        feature_scores, committee_votes = self._calculate_similarity_scores_for_histogram(
            metrics_df,
            request.selected_items,
            request.rejected_items,
            train_committee=True  # Enable QBC committee training
        )

        # Create scores dictionary
        scores_dict = {str(item.feature_id): item.score for item in feature_scores}

        # Extract score values for histogram
        score_values = np.array([item.score for item in feature_scores])

        if len(score_values) == 0:
            return SimilarityHistogramResponse(
                scores={},
                histogram=HistogramData(bins=[], counts=[], bin_edges=[]),
                statistics=HistogramStatistics(min=0.0, max=0.0, mean=0.0, median=0.0),
                total_items=0
            )

        # Compute histogram (60 bins for good resolution)
        counts, bin_edges = np.histogram(score_values, bins=60)
        bins = (bin_edges[:-1] + bin_edges[1:]) / 2  # Bin centers

        # Compute statistics
        statistics = HistogramStatistics(
            min=float(np.min(score_values)),
            max=float(np.max(score_values)),
            mean=float(np.mean(score_values)),
            median=float(np.median(score_values))
        )

        # Detect bimodality
        bimodality_result = self.bimodality_service.detect_bimodality(score_values)

        logger.info(f"Successfully generated histogram for {len(feature_scores)} features")

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

        return SimilarityHistogramResponse(
            scores=scores_dict,
            histogram=HistogramData(
                bins=bins.tolist(),
                counts=counts.tolist(),
                bin_edges=bin_edges.tolist()
            ),
            statistics=statistics,
            total_items=len(feature_scores),
            bimodality=BimodalityInfo(
                dip_pvalue=bimodality_result.dip_pvalue,
                bic_k1=bimodality_result.bic_k1,
                bic_k2=bimodality_result.bic_k2,
                gmm_components=[
                    GMMComponentInfo(
                        mean=comp.mean,
                        variance=comp.variance,
                        weight=comp.weight
                    )
                    for comp in bimodality_result.gmm_components
                ],
                sample_size=bimodality_result.sample_size
            ),
            committee_votes=committee_votes_response
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

        Features with higher scores are closer to the "Well-Explained" class,
        indicating they may have been borderline cases that could be revisited.

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
        # Well-Explained = selected (positive class)
        # Need Revision = rejected (negative class)
        # NOTE: We pass metrics_df (not filtered) because SVM needs training features
        # to extract their vectors for training. We filter results afterward.
        logger.info("[Stage3QualityScores] Training SVM on Stage 2 selections")
        all_feature_scores = self._calculate_similarity_scores_for_histogram(
            metrics_df,  # Full dataframe with training + classification features
            request.well_explained_items,
            request.need_revision_items
        )

        # Filter to only return scores for classification features (request.feature_ids)
        feature_ids_set = set(request.feature_ids)
        feature_scores = [fs for fs in all_feature_scores if fs.feature_id in feature_ids_set]

        logger.info(f"[Stage3QualityScores] SVM scored {len(all_feature_scores)} total, "
                   f"filtered to {len(feature_scores)} classification features")

        # Create scores dictionary
        scores_dict = {str(item.feature_id): item.score for item in feature_scores}

        # Extract score values for histogram
        score_values = np.array([item.score for item in feature_scores])

        if len(score_values) == 0:
            return SimilarityHistogramResponse(
                scores={},
                histogram=HistogramData(bins=[], counts=[], bin_edges=[]),
                statistics=HistogramStatistics(min=0.0, max=0.0, mean=0.0, median=0.0),
                total_items=0
            )

        # Compute histogram (60 bins for good resolution)
        counts, bin_edges = np.histogram(score_values, bins=60)
        bins = (bin_edges[:-1] + bin_edges[1:]) / 2  # Bin centers

        # Compute statistics
        statistics = HistogramStatistics(
            min=float(np.min(score_values)),
            max=float(np.max(score_values)),
            mean=float(np.mean(score_values)),
            median=float(np.median(score_values))
        )

        # Detect bimodality
        bimodality_result = self.bimodality_service.detect_bimodality(score_values)

        logger.info(f"[Stage3QualityScores] Generated histogram for {len(feature_scores)} features "
                   f"(range: {statistics.min:.2f} to {statistics.max:.2f})")

        return SimilarityHistogramResponse(
            scores=scores_dict,
            histogram=HistogramData(
                bins=bins.tolist(),
                counts=counts.tolist(),
                bin_edges=bin_edges.tolist()
            ),
            statistics=statistics,
            total_items=len(feature_scores),
            bimodality=BimodalityInfo(
                dip_pvalue=bimodality_result.dip_pvalue,
                bic_k1=bimodality_result.bic_k1,
                bic_k2=bimodality_result.bic_k2,
                gmm_components=[
                    GMMComponentInfo(
                        mean=comp.mean,
                        variance=comp.variance,
                        weight=comp.weight
                    )
                    for comp in bimodality_result.gmm_components
                ],
                sample_size=bimodality_result.sample_size
            )
        )

    # =========================================================================
    # MULTI-MODALITY TEST
    # =========================================================================

    async def get_multi_modality_test(
        self,
        request: MultiModalityRequest
    ) -> MultiModalityResponse:
        """
        Test multi-modality of SVM decision margins across cause categories.

        For each cause category, trains a binary SVM (One-vs-Rest) and tests
        the bimodality of the decision margins. Returns per-category bimodality
        info and an aggregate score.

        Args:
            request: Request with feature_ids and cause_selections

        Returns:
            MultiModalityResponse with per-category bimodality and aggregate score
        """
        if not self.data_service.is_ready():
            raise RuntimeError("DataService not ready")

        feature_ids = request.feature_ids
        cause_selections = request.cause_selections

        # Extract categories from CauseSelectionItem values
        categories_set = set(item.category for item in cause_selections.values())

        # Extract metrics for all features
        logger.info(f"[multi_modality_test] Extracting metrics for {len(feature_ids)} features")
        metrics_df = await self._extract_metrics(feature_ids)

        if metrics_df is None or len(metrics_df) == 0:
            raise ValueError("Failed to extract metrics for features")

        # Build metrics matrix
        feature_id_to_idx = {fid: idx for idx, fid in enumerate(metrics_df["feature_id"].to_list())}
        metrics_matrix = metrics_df.select(self.METRICS).to_numpy()

        # Standardize metrics for SVM training
        scaler = StandardScaler()
        metrics_scaled = scaler.fit_transform(metrics_matrix)

        # Get unique categories from cause_selections
        categories = sorted(categories_set)
        logger.info(f"[multi_modality_test] Categories: {categories}")

        # Build ID to weight mapping
        id_to_weight = {}
        for fid, item in cause_selections.items():
            id_to_weight[fid] = CLICK_WEIGHT if item.source == 'click' else THRESHOLD_WEIGHT

        # Train One-vs-Rest SVM for each category and compute bimodality
        category_results = []

        for category in categories:
            # Build labels and weights: 1 for this category, 0 for all others
            positive_indices = []
            negative_indices = []
            positive_weights = []
            negative_weights = []

            for fid, item in cause_selections.items():
                if fid in feature_id_to_idx:
                    idx = feature_id_to_idx[fid]
                    weight = id_to_weight.get(fid, CLICK_WEIGHT)
                    if item.category == category:
                        positive_indices.append(idx)
                        positive_weights.append(weight)
                    else:
                        negative_indices.append(idx)
                        negative_weights.append(weight)

            if len(positive_indices) == 0 or len(negative_indices) == 0:
                logger.warning(f"[multi_modality_test] Skipping {category}: missing positive or negative samples")
                continue

            # Build training data and weights
            train_indices = positive_indices + negative_indices
            X_train = metrics_scaled[train_indices]
            y_train = np.array([1] * len(positive_indices) + [0] * len(negative_indices))
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

            logger.info(f"[multi_modality_test] {category}: {len(positive_indices)} positive, {len(negative_indices)} negative")

            # Run bimodality detection on decision margins
            bimodality_result = self.bimodality_service.detect_bimodality(decision_values)

            # Convert to Pydantic models
            gmm_components = [
                GMMComponentInfo(
                    mean=comp.mean,
                    variance=comp.variance,
                    weight=comp.weight
                )
                for comp in bimodality_result.gmm_components
            ]

            bimodality_info = BimodalityInfo(
                dip_pvalue=bimodality_result.dip_pvalue,
                bic_k1=bimodality_result.bic_k1,
                bic_k2=bimodality_result.bic_k2,
                gmm_components=gmm_components,
                sample_size=bimodality_result.sample_size
            )

            category_results.append(CategoryBimodalityInfo(
                category=category,
                bimodality=bimodality_info
            ))

        if not category_results:
            raise ValueError("No categories had sufficient data for multi-modality test")

        # Calculate aggregate score (average of category bimodality scores)
        # Use the same scoring logic as frontend: geometric mean of dip, BIC, mean separation
        total_score = 0.0
        for cat_result in category_results:
            bi = cat_result.bimodality
            if bi.sample_size < 10:
                score = 0.0
            else:
                # Dip score: lower p-value = more bimodal
                dip_score = max(0, 1 - min(bi.dip_pvalue / 0.05, 1))

                # BIC score: lower BIC for k=2 = more bimodal
                bic_diff = bi.bic_k1 - bi.bic_k2
                relative_bic_diff = bic_diff / abs(bi.bic_k1) if bi.bic_k1 != 0 else 0
                bic_score = max(0, min(1, relative_bic_diff * 10))

                # Mean separation score
                if len(bi.gmm_components) >= 2:
                    mean_diff = abs(bi.gmm_components[1].mean - bi.gmm_components[0].mean)
                    avg_var = (bi.gmm_components[0].variance + bi.gmm_components[1].variance) / 2
                    avg_std = np.sqrt(max(avg_var, 0.0001))
                    mean_separation = mean_diff / avg_std
                    mean_score = min(mean_separation / 2, 1)
                else:
                    mean_score = 0.0

                # Geometric mean (all components must contribute)
                score = (dip_score * bic_score * mean_score) ** (1/3)

            total_score += score

        aggregate_score = total_score / len(category_results) if category_results else 0.0

        return MultiModalityResponse(
            multimodality=MultiModalityInfo(
                category_results=category_results,
                aggregate_score=aggregate_score,
                sample_size=len(feature_ids)
            )
        )

    # =========================================================================
    # METRIC EXTRACTION
    # =========================================================================

    async def _extract_metrics(self, feature_ids: List[int]) -> Optional[pl.DataFrame]:
        """
        Extract all 6 metrics for the specified features.

        Uses pre-aggregated barycentric parquet for fast extraction (same as CauseView).
        Falls back to legacy extraction if barycentric data not available.

        Args:
            feature_ids: List of feature IDs to extract metrics for

        Returns:
            DataFrame with feature_id and all 6 metrics
        """
        # Try fast path: barycentric parquet (pre-aggregated)
        if self.data_service._barycentric_lazy is not None:
            result = await self._extract_metrics_from_barycentric(feature_ids)
            if result is not None and len(result) > 0:
                return result
            logger.warning("[_extract_metrics_legacy] Barycentric extraction failed, falling back to legacy")

        # Fallback to legacy extraction
        return await self._extract_metrics_legacy(feature_ids)

    async def _extract_metrics_from_barycentric(self, feature_ids: List[int]) -> Optional[pl.DataFrame]:
        """
        Extract metrics from pre-aggregated barycentric parquet (fast path).

        This mirrors umap_service._extract_metrics_from_barycentric() for consistent
        performance with CauseView.

        Args:
            feature_ids: List of feature IDs to extract metrics for

        Returns:
            DataFrame with feature_id and all 6 metrics (mean across explainers)
        """
        try:
            logger.info(f"[_extract_metrics_from_barycentric] Extracting metrics for {len(feature_ids)} features")

            # Compute mean and std across 3 explainers for each feature
            df = self.data_service._barycentric_lazy.filter(
                pl.col("feature_id").is_in(feature_ids)
            ).group_by("feature_id").agg([
                # Mean metrics
                pl.col("intra_feature_sim").mean().alias("intra_feature_sim"),
                pl.col("score_embedding").mean().alias("score_embedding"),
                pl.col("score_fuzz").mean().alias("score_fuzz"),
                pl.col("score_detection").mean().alias("score_detection"),
                pl.col("explanation_semantic_sim").mean().alias("explanation_semantic_sim"),
                # Std metrics (scores only) - captures cross-explainer disagreement
                pl.col("score_embedding").std().alias("score_embedding_std"),
                pl.col("score_fuzz").std().alias("score_fuzz_std"),
                pl.col("score_detection").std().alias("score_detection_std"),
            ]).collect()

            # Load frac_nonzero from features.parquet (per-feature, not per-explainer)
            if self.data_service._df_lazy is not None:
                frac_df = self.data_service._df_lazy.filter(
                    pl.col("feature_id").is_in(feature_ids)
                ).select([
                    "feature_id",
                    pl.col("frac_nonzero").fill_null(0.0).alias("frac_nonzero")
                ]).unique(subset=["feature_id"]).collect()

                # Join frac_nonzero to the main metrics
                df = df.join(frac_df, on="feature_id", how="left")

            # Fill null values
            for metric in self.METRICS:
                if metric in df.columns:
                    df = df.with_columns(pl.col(metric).fill_null(0.0))
                else:
                    df = df.with_columns(pl.lit(0.0).alias(metric))

            logger.info(f"[_extract_metrics_from_barycentric] Extracted {len(self.METRICS)} metrics for {len(df)} features")
            return df

        except Exception as e:
            logger.error(f"[_extract_metrics_from_barycentric] Failed: {e}", exc_info=True)
            return None

    async def _extract_metrics_legacy(self, feature_ids: List[int]) -> Optional[pl.DataFrame]:
        """
        Legacy metric extraction from main dataframe + activation_display.

        This is slower than barycentric extraction but serves as fallback.

        Args:
            feature_ids: List of feature IDs to extract metrics for

        Returns:
            DataFrame with feature_id and all 6 metrics
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
                    # Neuronpedia: fraction of non-zero activations
                    pl.col("frac_nonzero").fill_null(0.0).alias("frac_nonzero"),
                ]).unique(subset=["feature_id"]).collect()

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

            # Fill nulls with 0 for missing metrics
            for metric in self.METRICS:
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
        Extract intra-feature activation metrics.

        Computes composite intra_feature_sim = max(char_ngram, word_ngram, semantic)
        for uniformity with Stage 3 (Cause) classification.

        Args:
            feature_ids: List of feature IDs

        Returns:
            DataFrame with feature_id, intra_feature_sim
        """
        try:
            # Try optimized activation_display file first
            if self.data_service._activation_display_lazy is not None:
                df = self.data_service._activation_display_lazy.filter(
                    pl.col("feature_id").is_in(feature_ids)
                ).collect()

                # Compute composite intra_feature_sim = max(char, word, semantic)
                df = df.select([
                    "feature_id",
                    pl.max_horizontal(
                        "char_ngram_max_jaccard",
                        "word_ngram_max_jaccard",
                        "semantic_similarity"
                    ).fill_null(0.0).alias("intra_feature_sim")
                ]).unique(subset=["feature_id"])

                logger.info(f"Extracted activation metrics from optimized file for {len(df)} features")
                return df

            # Fallback to legacy files
            elif self.data_service._activation_similarity_lazy is not None:
                df = self.data_service._activation_similarity_lazy.filter(
                    pl.col("feature_id").is_in(feature_ids)
                ).collect()

                df = df.select([
                    "feature_id",
                    pl.max_horizontal(
                        "char_ngram_max_jaccard",
                        "word_ngram_max_jaccard",
                        "semantic_similarity"
                    ).fill_null(0.0).alias("intra_feature_sim")
                ]).unique(subset=["feature_id"])

                logger.info(f"Extracted activation metrics from legacy file for {len(df)} features")
                return df

            else:
                logger.warning("No activation data available")
                return None

        except Exception as e:
            logger.warning(f"Failed to extract activation metrics: {e}")
            return None

    # =========================================================================
    # SVM SCORING
    # =========================================================================

    def _calculate_similarity_scores(
        self,
        metrics_df: pl.DataFrame,
        selected_items: List[WeightedFeatureId],
        rejected_items: List[WeightedFeatureId]
    ) -> List[FeatureScore]:
        """
        Calculate similarity scores for all features using SVM.

        Trains a binary SVM classifier on selected (✓) vs rejected (✗) features,
        then scores all other features by their signed distance from the decision boundary.

        Args:
            metrics_df: DataFrame with metrics for all features
            selected_items: Weighted feature items marked as selected (✓)
            rejected_items: Weighted feature items marked as rejected (✗)

        Returns:
            List of FeatureScore objects (excluding selected and rejected)
        """
        # Extract IDs from weighted items
        selected_ids = [item.id for item in selected_items]
        rejected_ids = [item.id for item in rejected_items]

        # Convert to numpy for SVM
        feature_ids = metrics_df["feature_id"].to_numpy()
        metrics_matrix = np.column_stack([
            metrics_df[metric].to_numpy() for metric in self.METRICS
        ])

        # Build ID to weight mapping
        id_to_weight = {}
        for item in selected_items:
            id_to_weight[item.id] = CLICK_WEIGHT if item.source == 'click' else THRESHOLD_WEIGHT
        for item in rejected_items:
            id_to_weight[item.id] = CLICK_WEIGHT if item.source == 'click' else THRESHOLD_WEIGHT

        # Check cache (include weights in cache key for weighted training)
        cache_key = self._get_cache_key_weighted(selected_items, rejected_items)

        if cache_key in self._svm_cache:
            model, scaler = self._svm_cache[cache_key]
            logger.info(f"Using cached SVM model (key: {cache_key[:8]}...)")
        else:
            # Extract training vectors and weights
            selected_indices = [i for i, fid in enumerate(feature_ids) if fid in selected_ids]
            rejected_indices = [i for i, fid in enumerate(feature_ids) if fid in rejected_ids]

            if not selected_indices or not rejected_indices:
                logger.warning("Insufficient training data for SVM (need both selected and rejected)")
                return []

            selected_vectors = metrics_matrix[selected_indices]
            rejected_vectors = metrics_matrix[rejected_indices]

            # Build weight arrays
            selected_weights = np.array([id_to_weight.get(feature_ids[i], CLICK_WEIGHT) for i in selected_indices])
            rejected_weights = np.array([id_to_weight.get(feature_ids[i], CLICK_WEIGHT) for i in rejected_indices])

            # Train SVM with weights
            model, scaler = self._train_svm_model(selected_vectors, rejected_vectors, selected_weights, rejected_weights)

            # Cache with size limit
            if len(self._svm_cache) >= self._max_cache_size:
                # Remove oldest entry (FIFO)
                oldest_key = next(iter(self._svm_cache))
                self._svm_cache.pop(oldest_key)
                logger.info(f"SVM cache full, evicted oldest entry")

            self._svm_cache[cache_key] = (model, scaler)
            logger.info(f"SVM model cached (key: {cache_key[:8]}..., cache size: {len(self._svm_cache)})")

        # Batch score all features (excluding selected and rejected)
        selected_set = set(selected_ids)
        rejected_set = set(rejected_ids)
        score_mask = np.array([
            fid not in selected_set and fid not in rejected_set
            for fid in feature_ids
        ])

        feature_scores = []
        if np.any(score_mask):
            scores = self._score_with_svm(model, scaler, metrics_matrix[score_mask])
            scored_ids = feature_ids[score_mask]
            feature_scores = [
                FeatureScore(feature_id=int(fid), score=float(s))
                for fid, s in zip(scored_ids, scores)
            ]

        return feature_scores

    def _calculate_similarity_scores_for_histogram(
        self,
        metrics_df: pl.DataFrame,
        selected_items: List[WeightedFeatureId],
        rejected_items: List[WeightedFeatureId],
        train_committee: bool = False
    ) -> Tuple[List[FeatureScore], Optional[Dict[str, Dict]]]:
        """
        Calculate similarity scores for ALL features using SVM (including selected/rejected).

        This is different from _calculate_similarity_scores() which skips selected/rejected.
        For histogram visualization, we need scores for everything.

        Args:
            metrics_df: DataFrame with metrics for all features
            selected_items: Weighted feature items marked as selected (✓)
            rejected_items: Weighted feature items marked as rejected (✗)
            train_committee: If True, also train RF/MLP and return vote info

        Returns:
            Tuple of (feature_scores, committee_votes)
            - feature_scores: List of FeatureScore objects for ALL features
            - committee_votes: Dict of feature_id -> vote info (only if train_committee=True)
        """
        # Extract IDs from weighted items
        selected_ids = [item.id for item in selected_items]
        rejected_ids = [item.id for item in rejected_items]

        # Convert to numpy for SVM
        feature_ids = metrics_df["feature_id"].to_numpy()
        metrics_matrix = np.column_stack([
            metrics_df[metric].to_numpy() for metric in self.METRICS
        ])

        # Build ID to weight mapping
        id_to_weight = {}
        for item in selected_items:
            id_to_weight[item.id] = CLICK_WEIGHT if item.source == 'click' else THRESHOLD_WEIGHT
        for item in rejected_items:
            id_to_weight[item.id] = CLICK_WEIGHT if item.source == 'click' else THRESHOLD_WEIGHT

        # Check cache (reuse model from main scoring)
        cache_key = self._get_cache_key_weighted(selected_items, rejected_items)

        # Variables for committee training
        X_train = None
        y_train = None
        sample_weights = None

        if cache_key in self._svm_cache:
            model, scaler = self._svm_cache[cache_key]
            logger.info(f"Using cached SVM model for histogram (key: {cache_key[:8]}...)")

            # Still need training data for committee if requested
            if train_committee:
                selected_indices = [i for i, fid in enumerate(feature_ids) if fid in selected_ids]
                rejected_indices = [i for i, fid in enumerate(feature_ids) if fid in rejected_ids]
                if selected_indices and rejected_indices:
                    selected_vectors = metrics_matrix[selected_indices]
                    rejected_vectors = metrics_matrix[rejected_indices]
                    X_train = np.vstack([selected_vectors, rejected_vectors])
                    y_train = np.array([1] * len(selected_vectors) + [0] * len(rejected_vectors))
                    selected_weights = np.array([id_to_weight.get(feature_ids[i], CLICK_WEIGHT) for i in selected_indices])
                    rejected_weights = np.array([id_to_weight.get(feature_ids[i], CLICK_WEIGHT) for i in rejected_indices])
                    sample_weights = np.concatenate([selected_weights, rejected_weights])
        else:
            # Extract training vectors and weights
            selected_indices = [i for i, fid in enumerate(feature_ids) if fid in selected_ids]
            rejected_indices = [i for i, fid in enumerate(feature_ids) if fid in rejected_ids]

            if not selected_indices or not rejected_indices:
                logger.warning("Insufficient training data for SVM histogram")
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
            model, scaler = self._train_svm_model(selected_vectors, rejected_vectors, selected_weights, rejected_weights)

            # Cache with size limit
            if len(self._svm_cache) >= self._max_cache_size:
                oldest_key = next(iter(self._svm_cache))
                self._svm_cache.pop(oldest_key)

            self._svm_cache[cache_key] = (model, scaler)

        # Score ALL features (including selected and rejected for histogram)
        scores = self._score_with_svm(model, scaler, metrics_matrix)

        # Create FeatureScore objects
        feature_scores = [
            FeatureScore(feature_id=int(fid), score=float(score))
            for fid, score in zip(feature_ids, scores)
        ]

        # Train committee and get vote info if requested
        committee_votes = None

        if train_committee and X_train is not None and y_train is not None:
            logger.info("[SimilaritySortService] Training committee (RF + MLP) for QBC...")
            rf_model, mlp_model, committee_scaler = self.committee_service.train_committee(
                X_train, y_train, sample_weights
            )

            if rf_model is not None or mlp_model is not None:
                # Scale all features using the SVM scaler (consistent with SVM scoring)
                X_scaled = scaler.transform(metrics_matrix)

                # Get committee predictions
                committee_preds = self.committee_service.predict_with_committee(
                    X_scaled, scores, rf_model, mlp_model, committee_scaler
                )

                # Convert to API response format
                item_ids = [str(int(fid)) for fid in feature_ids]
                committee_votes = self.committee_service.get_vote_info_dict(item_ids, committee_preds)

                logger.info(f"[SimilaritySortService] Committee votes generated for {len(item_ids)} items")

        return feature_scores, committee_votes

    # =========================================================================
    # SVM HELPERS
    # =========================================================================

    def _get_cache_key(self, selected_ids: List[int], rejected_ids: List[int]) -> str:
        """
        Generate unique cache key from user selections (legacy, unweighted).

        Args:
            selected_ids: Feature IDs marked as selected (✓)
            rejected_ids: Feature IDs marked as rejected (✗)

        Returns:
            MD5 hash of sorted ID lists
        """
        key_str = f"{sorted(selected_ids)}_{sorted(rejected_ids)}"
        return hashlib.md5(key_str.encode()).hexdigest()

    def _get_cache_key_weighted(
        self,
        selected_items: List[WeightedFeatureId],
        rejected_items: List[WeightedFeatureId]
    ) -> str:
        """
        Generate unique cache key from weighted user selections.

        Includes both IDs and sources in the cache key since weights affect the model.

        Args:
            selected_items: Weighted feature items marked as selected (✓)
            rejected_items: Weighted feature items marked as rejected (✗)

        Returns:
            MD5 hash of sorted (ID, source) tuples
        """
        selected_tuples = sorted([(item.id, item.source) for item in selected_items])
        rejected_tuples = sorted([(item.id, item.source) for item in rejected_items])
        key_str = f"{selected_tuples}_{rejected_tuples}"
        return hashlib.md5(key_str.encode()).hexdigest()

    def _train_svm_model(
        self,
        selected_vectors: np.ndarray,
        rejected_vectors: np.ndarray,
        selected_weights: Optional[np.ndarray] = None,
        rejected_weights: Optional[np.ndarray] = None
    ) -> Tuple[SVC, StandardScaler]:
        """
        Train binary SVM classifier with RBF kernel and optional sample weights.

        Args:
            selected_vectors: (N_pos, d) positive examples (✓)
            rejected_vectors: (N_neg, d) negative examples (✗)
            selected_weights: (N_pos,) sample weights for positive examples (default: all 1.0)
            rejected_weights: (N_neg,) sample weights for negative examples (default: all 1.0)

        Returns:
            Tuple of (trained_model, fitted_scaler)
        """
        # Combine data
        X = np.vstack([selected_vectors, rejected_vectors])
        y = np.array([1] * len(selected_vectors) + [0] * len(rejected_vectors))

        # Build sample weights array
        if selected_weights is None:
            selected_weights = np.ones(len(selected_vectors))
        if rejected_weights is None:
            rejected_weights = np.ones(len(rejected_vectors))
        sample_weights = np.concatenate([selected_weights, rejected_weights])

        # Standardize features (critical for SVM)
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        # Train SVM with RBF kernel
        model = SVC(
            kernel='rbf',
            C=1.0,
            gamma='scale',
            class_weight='balanced',  # Handle class imbalance
            probability=False  # Faster without probability calibration
        )
        model.fit(X_scaled, y, sample_weight=sample_weights)

        logger.info(f"SVM trained: {len(selected_vectors)} positive, {len(rejected_vectors)} negative, "
                   f"{model.n_support_.sum()} support vectors, weighted training")

        return model, scaler

    def _score_with_svm(
        self,
        model: SVC,
        scaler: StandardScaler,
        feature_vectors: np.ndarray
    ) -> np.ndarray:
        """
        Score features using SVM decision function.

        Args:
            model: Trained SVM model
            scaler: Fitted StandardScaler
            feature_vectors: (N, d) feature vectors to score

        Returns:
            (N,) array of scores (signed distance from decision boundary)
            Positive scores = more similar to selected features
            Negative scores = more similar to rejected features
        """
        X_scaled = scaler.transform(feature_vectors)
        scores = model.decision_function(X_scaled)
        return scores

    def clear_svm_cache(self):
        """Clear SVM model cache (call on data reload)."""
        self._svm_cache.clear()
        logger.info("SVM model cache cleared")
