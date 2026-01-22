"""
Pair similarity-based sorting service for feature pairs.

Uses SVM (Support Vector Machine) with RBF kernel to learn similarity patterns
from user-labeled feature pairs. Scores pairs by signed distance from SVM decision boundary.

9-dimensional pair vectors:
- 3 dims: A + B (combined intra-feature properties)
- 3 dims: |A - B| (intra-feature dissimilarity)
- 1 dim: inter_ngram_jaccard(A, B) - pair-specific lexical similarity
- 1 dim: inter_semantic_sim(A, B) - pair-specific semantic similarity
- 1 dim: decoder_sim(A, B) - pair-specific decoder similarity
"""

import polars as pl
import numpy as np
import logging
import hashlib
from typing import List, Dict, Tuple, Optional, TYPE_CHECKING
from sklearn.svm import SVC
from sklearn.preprocessing import StandardScaler

from ..models.similarity_sort import (
    PairSimilaritySortRequest, PairSimilaritySortResponse, PairScore,
    PairSimilarityHistogramRequest, SimilarityHistogramResponse,
    HistogramData, HistogramStatistics, BimodalityInfo, GMMComponentInfo,
    WeightedPairKey, CommitteeVoteInfo
)
from .bimodality_service import BimodalityService
from .committee_service import CommitteeService

if TYPE_CHECKING:
    from .data_service import DataService
    from .hierarchical_cluster_candidate_service import HierarchicalClusterCandidateService

logger = logging.getLogger(__name__)

# ============================================================================
# SAMPLE WEIGHTS FOR SVM TRAINING
# ============================================================================
# 'click' (direct user clicks) get full weight
# 'threshold' (batch Apply Tags) get reduced weight due to potential errors
CLICK_WEIGHT = 1.0
THRESHOLD_WEIGHT = 0.2


class PairSimilarityService:
    """Service for calculating feature pair similarity scores."""

    # 3 intra-feature metrics used for PAIR SVM similarity calculation
    # Used with A+B and |A-B| operations (6 dims total)
    # Note: Pair-specific inter-feature metrics and decoder similarity are handled separately
    PAIR_METRICS = [
        'intra_ngram_jaccard',       # Feature-level: lexical consistency within activations (max of char/word)
        'intra_semantic_sim',        # Feature-level: semantic consistency within activations (mean)
        'intra_semantic_sim_std',    # Feature-level: semantic consistency std (variability)
    ]

    def __init__(
        self,
        data_service: "DataService",
        cluster_service: Optional["HierarchicalClusterCandidateService"] = None
    ):
        """
        Initialize PairSimilarityService.

        Args:
            data_service: Instance of DataService for data access
            cluster_service: Optional instance of HierarchicalClusterCandidateService for pair generation
        """
        self.data_service = data_service
        self.cluster_service = cluster_service
        self.bimodality_service = BimodalityService()
        self.committee_service = CommitteeService()

        # SVM model cache: (selected_pair_keys, rejected_pair_keys) hash -> (model, scaler)
        self._svm_cache: Dict[str, Tuple[SVC, StandardScaler]] = {}
        self._max_cache_size = 100  # Prevent unbounded growth

        # Metrics cache: feature_ids hash -> metrics_df
        # Caches extracted metrics DataFrame to avoid repeated 3-query + 2-join operations
        self._metrics_cache: Dict[str, pl.DataFrame] = {}
        self._max_metrics_cache_size = 10

    async def get_pair_similarity_sorted(
        self,
        request: PairSimilaritySortRequest
    ) -> PairSimilaritySortResponse:
        """
        Calculate similarity scores for feature pairs and return sorted pairs.

        Pair vectors are 9-dimensional:
        - 3 dims: A + B (combined intra-feature properties)
        - 3 dims: |A - B| (intra-feature dissimilarity)
        - 1 dim: inter_ngram_jaccard(A, B) - pair-specific lexical similarity
        - 1 dim: inter_semantic_sim(A, B) - pair-specific semantic similarity
        - 1 dim: decoder_sim(A, B) - pair-specific decoder similarity

        Only uses feature-level metrics (no explanation-related metrics).

        Args:
            request: Request containing selected, rejected, and all pair keys

        Returns:
            Response with sorted pairs and scores
        """
        if not self.data_service.is_ready():
            raise RuntimeError("DataService not ready")

        # Validate inputs
        if len(request.pair_keys) == 0:
            return PairSimilaritySortResponse(
                sorted_pairs=[],
                total_pairs=0,
                weights_used=[]
            )

        # Extract pair keys and parse to (main_id, similar_id)
        pair_ids = []
        for pair_key in request.pair_keys:
            parts = pair_key.split('-')
            if len(parts) == 2:
                try:
                    main_id = int(parts[0])
                    similar_id = int(parts[1])
                    pair_ids.append((main_id, similar_id))
                except ValueError:
                    logger.warning(f"Invalid pair key format: {pair_key}")
                    continue

        if not pair_ids:
            return PairSimilaritySortResponse(
                sorted_pairs=[],
                total_pairs=0,
                weights_used=[]
            )

        # Extract all unique feature IDs from pairs
        all_feature_ids = set()
        for main_id, similar_id in pair_ids:
            all_feature_ids.add(main_id)
            all_feature_ids.add(similar_id)

        # LIMITATION: _extract_pair_feature_metrics() only returns features that exist in the current
        # filtered dataset (based on table filters like SAE, explainer, scorer).
        # Pairs referencing features outside this filter will fail to get metrics.
        logger.info(f"Extracting pair feature metrics for {len(all_feature_ids)} unique features from {len(pair_ids)} pairs")
        metrics_df = await self._extract_pair_feature_metrics(list(all_feature_ids))

        if metrics_df is None or len(metrics_df) == 0:
            logger.warning("No metrics extracted, returning empty result")
            return PairSimilaritySortResponse(
                sorted_pairs=[],
                total_pairs=0,
                weights_used=[]
            )

        # Log how many features have metrics vs requested
        features_with_metrics = len(metrics_df)
        features_requested = len(all_feature_ids)
        if features_with_metrics < features_requested:
            missing = features_requested - features_with_metrics
            logger.warning(
                f"⚠️  Insufficient data: Only {features_with_metrics}/{features_requested} features have metrics. "
                f"{missing} features are outside the current filtered dataset. "
                f"Some pairs will be excluded from similarity sort."
            )

        # Extract pair metrics (cosine_similarity from decoder_similarity)
        pair_metrics_dict = await self._extract_pair_metrics(pair_ids)

        # Extract pair-specific inter-feature metrics
        pair_inter_metrics = await self._extract_pair_specific_interfeature_metrics(pair_ids)
        logger.info(f"Extracted pair-specific inter-feature metrics for {len(pair_inter_metrics)} pairs")

        # Calculate similarity scores for pairs using SVM
        logger.info(f"Calculating similarity scores for {len(pair_ids)} pairs with SVM")
        pair_scores = self._calculate_pair_similarity_scores(
            metrics_df,
            pair_metrics_dict,
            pair_inter_metrics,
            request.selected_items,
            request.rejected_items,
            pair_ids
        )

        # Sort by score (descending - higher is better)
        pair_scores.sort(key=lambda x: x.score, reverse=True)

        logger.info(
            f"✅ Pair similarity sort complete: {len(pair_scores)}/{len(pair_ids)} pairs scored. "
            f"({len(pair_ids) - len(pair_scores)} pairs excluded due to missing feature data)"
        )

        return PairSimilaritySortResponse(
            sorted_pairs=pair_scores,
            total_pairs=len(pair_ids),
            weights_used=[]  # SVM doesn't expose interpretable weights
        )

    async def get_pair_similarity_score_histogram(
        self,
        request: PairSimilarityHistogramRequest
    ) -> SimilarityHistogramResponse:
        """
        Calculate pair similarity scores and return histogram distribution for automatic tagging.

        Simplified Flow (recommended):
            - Provide feature_ids + threshold
            - Pairs generated via hierarchical clustering
            - Reuses same clustering logic as candidate endpoint

        Legacy Flow (backward compatibility):
            - Provide pair_keys explicitly
            - No clustering, scores explicit pairs

        Args:
            request: Request with either (feature_ids + threshold) or pair_keys

        Returns:
            Response with scores and histogram data
        """
        if not self.data_service.is_ready():
            raise RuntimeError("DataService not ready")

        # Simplified flow: Generate pairs via clustering
        if request.feature_ids is not None and request.threshold is not None:
            if self.cluster_service is None:
                raise RuntimeError("Cluster service not available for pair generation")

            logger.info(
                f"[Simplified Flow] Generating pairs via clustering: "
                f"{len(request.feature_ids)} features at threshold {request.threshold}"
            )

            # Use hierarchical clustering service to get ALL pairs
            cluster_result = await self.cluster_service.get_all_cluster_pairs(
                feature_ids=request.feature_ids,
                threshold=request.threshold
            )

            # Extract pair keys from cluster result
            pair_keys_from_clustering = cluster_result["pair_keys"]
            logger.info(f"[Simplified Flow] Generated {len(pair_keys_from_clustering)} pairs from clustering")

            # Parse to (main_id, similar_id) tuples
            pair_ids = []
            for pair_key in pair_keys_from_clustering:
                parts = pair_key.split('-')
                if len(parts) == 2:
                    try:
                        main_id = int(parts[0])
                        similar_id = int(parts[1])
                        pair_ids.append((main_id, similar_id))
                    except ValueError:
                        logger.warning(f"Invalid pair key from clustering: {pair_key}")
                        continue

        # Legacy flow: Use explicit pair_keys
        elif request.pair_keys is not None:
            logger.info(f"[Legacy Flow] Using {len(request.pair_keys)} explicit pair keys")

            # Parse pair keys to (main_id, similar_id)
            pair_ids = []
            for pair_key in request.pair_keys:
                parts = pair_key.split('-')
                if len(parts) == 2:
                    try:
                        main_id = int(parts[0])
                        similar_id = int(parts[1])
                        pair_ids.append((main_id, similar_id))
                    except ValueError:
                        logger.warning(f"Invalid pair key format: {pair_key}")
                        continue

        else:
            raise ValueError("Must provide either (feature_ids + threshold) or pair_keys")

        if not pair_ids:
            return SimilarityHistogramResponse(
                scores={},
                histogram=HistogramData(bins=[], counts=[], bin_edges=[]),
                statistics=HistogramStatistics(min=0.0, max=0.0, mean=0.0, median=0.0),
                total_items=0
            )

        # Extract all unique feature IDs from pairs
        all_feature_ids = list(set(
            fid for main_id, similar_id in pair_ids for fid in (main_id, similar_id)
        ))

        logger.info(f"Extracting pair feature metrics for {len(all_feature_ids)} unique features in {len(pair_ids)} pairs for histogram")
        metrics_df = await self._extract_pair_feature_metrics(all_feature_ids)

        if metrics_df is None or len(metrics_df) == 0:
            logger.warning("No metrics extracted, returning empty histogram")
            return SimilarityHistogramResponse(
                scores={},
                histogram=HistogramData(bins=[], counts=[], bin_edges=[]),
                statistics=HistogramStatistics(min=0.0, max=0.0, mean=0.0, median=0.0),
                total_items=0
            )

        # Extract pair metrics (cosine_similarity from decoder_similarity)
        pair_metrics_dict = await self._extract_pair_metrics(pair_ids)

        # Extract pair-specific inter-feature metrics
        pair_inter_metrics = await self._extract_pair_specific_interfeature_metrics(pair_ids)
        logger.info(f"Extracted pair-specific inter-feature metrics for {len(pair_inter_metrics)} pairs")

        # Calculate similarity scores for ALL pairs (including selected/rejected)
        # Also train committee (RF + MLP) for QBC approach
        logger.info(f"Calculating similarity scores for {len(pair_ids)} pairs for histogram with SVM + committee")
        pair_scores, committee_votes = self._calculate_pair_similarity_scores_for_histogram(
            metrics_df,
            pair_metrics_dict,
            pair_inter_metrics,
            request.selected_items,
            request.rejected_items,
            pair_ids,
            train_committee=True  # Enable QBC committee training
        )

        # Create scores dictionary
        scores_dict = {item.pair_key: item.score for item in pair_scores}

        # Extract score values for histogram
        score_values = np.array([item.score for item in pair_scores])

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

        logger.info(f"Successfully generated histogram for {len(pair_scores)} pairs")

        # Convert committee votes to Pydantic models if available
        committee_votes_response = None
        if committee_votes:
            committee_votes_response = {
                pk: CommitteeVoteInfo(
                    svm_prediction=info["svm_prediction"],
                    rf_prediction=info["rf_prediction"],
                    mlp_prediction=info["mlp_prediction"],
                    vote_entropy=info["vote_entropy"]
                )
                for pk, info in committee_votes.items()
            }

        return SimilarityHistogramResponse(
            scores=scores_dict,
            histogram=HistogramData(
                bins=bins.tolist(),
                counts=counts.tolist(),
                bin_edges=bin_edges.tolist()
            ),
            statistics=statistics,
            total_items=len(pair_scores),
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

    # =========================================================================
    # METRIC EXTRACTION
    # =========================================================================

    def _get_metrics_cache_key(self, feature_ids: List[int]) -> str:
        """Generate cache key from sorted feature IDs."""
        return hashlib.md5(str(sorted(feature_ids)).encode()).hexdigest()

    def clear_metrics_cache(self):
        """Clear metrics cache (call on data reload)."""
        self._metrics_cache.clear()
        logger.info("Pair metrics cache cleared")

    async def _extract_pair_feature_metrics(self, feature_ids: List[int]) -> Optional[pl.DataFrame]:
        """
        Extract the 3 PAIR_METRICS (intra-feature) for pair SVM calculations.

        Uses in-memory caching to avoid repeated queries.
        Fast path: Uses svm_feature_metrics.parquet if available.
        Fallback: Extracts from activation_display.parquet.

        Metrics extracted:
        - intra_ngram_jaccard, intra_semantic_sim, intra_semantic_sim_std

        Note: Inter-feature metrics (inter_ngram_jaccard, inter_semantic_sim) are now
        extracted at the pair level via _extract_pair_metrics_from_svm().

        Args:
            feature_ids: List of feature IDs to extract metrics for

        Returns:
            DataFrame with feature_id and 3 intra-feature metrics
        """
        # Check cache first
        cache_key = self._get_metrics_cache_key(feature_ids)
        if cache_key in self._metrics_cache:
            logger.info(f"[_extract_pair_feature_metrics] Using cached metrics for {len(feature_ids)} features")
            return self._metrics_cache[cache_key]

        try:
            logger.info(f"[_extract_pair_feature_metrics] Starting extraction for {len(feature_ids)} features")

            # Fast path: Use pre-computed svm_feature_metrics if available
            if self.data_service._svm_feature_metrics_lazy is not None:
                result_df = self.data_service._svm_feature_metrics_lazy.filter(
                    pl.col("feature_id").is_in(feature_ids)
                ).select([
                    "feature_id",
                    "intra_ngram_jaccard",
                    "intra_semantic_sim",
                    "intra_semantic_sim_std",
                ]).collect()

                # Fill nulls with 0 for missing metrics
                for metric in self.PAIR_METRICS:
                    if metric in result_df.columns:
                        result_df = result_df.with_columns(pl.col(metric).fill_null(0.0))
                    else:
                        result_df = result_df.with_columns(pl.lit(0.0).alias(metric))

                logger.info(f"[_extract_pair_feature_metrics] Extracted {len(result_df)} features from svm_feature_metrics (fast path)")

                # Cache result
                if len(self._metrics_cache) >= self._max_metrics_cache_size:
                    oldest_key = next(iter(self._metrics_cache))
                    self._metrics_cache.pop(oldest_key)
                self._metrics_cache[cache_key] = result_df
                return result_df

            # Fallback: Legacy extraction from activation_display
            logger.info("[_extract_pair_feature_metrics] Falling back to legacy extraction")

            # Get the main dataframe for base feature IDs
            lf = self.data_service._df_lazy

            if lf is None:
                logger.error("Main dataframe not initialized")
                return None

            # Filter to requested features and get unique feature IDs
            lf = lf.filter(pl.col("feature_id").is_in(feature_ids))
            base_df = lf.select(["feature_id"]).unique(subset=["feature_id"]).collect()
            base_df = base_df.with_columns(pl.col("feature_id").cast(pl.UInt32))

            logger.info(f"[_extract_pair_feature_metrics] Base features: {len(base_df)}")

            # Extract activation-level metrics (intra-feature)
            activation_df = await self._extract_activation_metrics(feature_ids)
            logger.info(f"[_extract_pair_feature_metrics] Activation metrics: {len(activation_df) if activation_df is not None else 0} rows")

            # Join activation metrics
            result_df = base_df

            if activation_df is not None:
                result_df = result_df.join(activation_df, on="feature_id", how="left")

            # Fill nulls with 0 for missing metrics
            for metric in self.PAIR_METRICS:
                if metric not in result_df.columns:
                    result_df = result_df.with_columns(pl.lit(0.0).alias(metric))
                else:
                    result_df = result_df.with_columns(
                        pl.col(metric).fill_null(0.0)
                    )

            logger.info(f"[_extract_pair_feature_metrics] Extracted {len(result_df)} features with 3 intra-feature metrics (legacy path)")

            # Cache result for subsequent calls with same features
            if len(self._metrics_cache) >= self._max_metrics_cache_size:
                oldest_key = next(iter(self._metrics_cache))
                self._metrics_cache.pop(oldest_key)
                logger.info("[_extract_pair_feature_metrics] Metrics cache full, evicted oldest entry")
            self._metrics_cache[cache_key] = result_df
            logger.info(f"[_extract_pair_feature_metrics] Cached metrics (cache size: {len(self._metrics_cache)})")

            return result_df

        except Exception as e:
            logger.error(f"Failed to extract pair feature metrics: {e}", exc_info=True)
            return None

    async def _extract_activation_metrics(self, feature_ids: List[int]) -> Optional[pl.DataFrame]:
        """
        Extract intra-feature activation metrics.

        Args:
            feature_ids: List of feature IDs

        Returns:
            DataFrame with feature_id, intra_ngram_jaccard, intra_semantic_sim, intra_semantic_sim_std
        """
        try:
            if self.data_service._activation_display_lazy is None:
                logger.warning("No activation display data available")
                return None

            df = self.data_service._activation_display_lazy.filter(
                pl.col("feature_id").is_in(feature_ids)
            ).collect()

            # Build select columns
            select_cols = [
                "feature_id",
                # Max of char and word ngram jaccard
                pl.max_horizontal("char_ngram_max_jaccard", "word_ngram_max_jaccard")
                  .fill_null(0.0)
                  .alias("intra_ngram_jaccard"),
                # Semantic similarity (mean)
                pl.col("semantic_similarity")
                  .fill_null(0.0)
                  .alias("intra_semantic_sim"),
            ]

            # Add semantic_similarity_std if available
            if "semantic_similarity_std" in df.columns:
                select_cols.append(
                    pl.col("semantic_similarity_std")
                      .fill_null(0.0)
                      .alias("intra_semantic_sim_std")
                )

            df = df.select(select_cols).unique(subset=["feature_id"])

            # Add column with 0.0 if not present
            if "intra_semantic_sim_std" not in df.columns:
                df = df.with_columns(pl.lit(0.0).alias("intra_semantic_sim_std"))

            logger.info(f"Extracted activation metrics for {len(df)} features")
            return df

        except Exception as e:
            logger.warning(f"Failed to extract activation metrics: {e}")
            return None

    async def _extract_all_pair_metrics_from_svm(
        self,
        pair_ids: List[Tuple[int, int]]
    ) -> Optional[Dict[str, Tuple[float, float, float]]]:
        """
        Extract all pair-specific metrics from svm_pair_metrics.parquet (fast path).

        The svm_pair_metrics.parquet contains pre-computed pair-level metrics:
        - inter_ngram_jaccard: max(char_jaccard, word_jaccard) for the pair
        - inter_semantic_sim: semantic similarity between feature activations
        - decoder_sim: cosine similarity from decoder weights

        Args:
            pair_ids: List of (main_id, similar_id) tuples

        Returns:
            Dict mapping pair_key -> (inter_ngram_jaccard, inter_semantic_sim, decoder_sim)
            or None if svm_pair_metrics not available
        """
        if self.data_service._svm_pair_metrics_lazy is None:
            return None

        try:
            # Build list of canonical pair keys for filtering
            pair_keys_set = set()
            pair_keys_lookup = {}  # (min_id, max_id) -> pair_key
            for main_id, similar_id in pair_ids:
                min_id, max_id = min(main_id, similar_id), max(main_id, similar_id)
                pair_key = f"{min_id}-{max_id}"
                pair_keys_set.add(pair_key)
                pair_keys_lookup[(min_id, max_id)] = pair_key

            # Filter using feature_a and feature_b columns
            all_feature_ids = list(set(fid for a, b in pair_ids for fid in (a, b)))

            df = self.data_service._svm_pair_metrics_lazy.filter(
                (pl.col("feature_a").is_in(all_feature_ids)) &
                (pl.col("feature_b").is_in(all_feature_ids))
            ).collect()

            if len(df) == 0:
                logger.warning("No SVM pair metrics found for requested pairs")
                return None

            # Build result dict
            result: Dict[str, Tuple[float, float, float]] = {}
            for row in df.iter_rows(named=True):
                pair_key = f"{row['feature_a']}-{row['feature_b']}"
                if pair_key in pair_keys_set:
                    result[pair_key] = (
                        float(row.get('inter_ngram_jaccard', 0.0) or 0.0),
                        float(row.get('inter_semantic_sim', 0.0) or 0.0),
                        float(row.get('decoder_sim', 0.0) or 0.0),
                    )

            logger.info(f"[_extract_all_pair_metrics_from_svm] Extracted {len(result)}/{len(pair_ids)} pairs from svm_pair_metrics")
            return result

        except Exception as e:
            logger.error(f"Failed to extract pair metrics from SVM: {e}", exc_info=True)
            return None

    async def _extract_pair_metrics(
        self,
        pair_ids: List[Tuple[int, int]]
    ) -> Dict[str, float]:
        """
        Extract pair-specific metrics (cosine similarity from decoder_similarity).

        Fast path: Uses svm_pair_metrics.parquet if available.
        Fallback: Extracts from features.parquet decoder_similarity.

        Args:
            pair_ids: List of (main_id, similar_id) tuples

        Returns:
            Dictionary mapping pair_key to cosine_similarity (decoder_sim)
        """
        # Fast path: Try pre-computed svm_pair_metrics
        svm_pair_metrics = await self._extract_all_pair_metrics_from_svm(pair_ids)
        if svm_pair_metrics is not None:
            # Extract just the decoder_sim (3rd element of tuple)
            return {pk: metrics[2] for pk, metrics in svm_pair_metrics.items()}

        # Fallback: Legacy extraction from features.parquet
        logger.info("Falling back to legacy pair metrics extraction")

        # Access the main dataframe through data_service
        lf = self.data_service._df_lazy
        if lf is None:
            logger.warning("Main dataframe not available for pair metrics")
            return {}

        # Extract ALL unique feature IDs from pairs (both positions)
        all_feature_ids = list(set(fid for main_id, similar_id in pair_ids for fid in (main_id, similar_id)))

        logger.info(f"Loading decoder_similarity data for {len(all_feature_ids)} unique features from {len(pair_ids)} pairs")

        # Load the decoder_similarity data for ALL features (single filter)
        try:
            df = lf.filter(pl.col("feature_id").is_in(all_feature_ids)).select([
                "feature_id",
                "decoder_similarity"
            ]).collect()

            if df is None or len(df) == 0:
                logger.warning("No decoder_similarity data found for pair metrics")
                return {}
        except Exception as e:
            logger.error(f"Failed to load decoder_similarity data: {e}")
            return {}

        # Build lookup dictionary once (instead of filtering repeatedly)
        # Maps: feature_id -> {similar_feature_id -> cosine_similarity}
        # Use iter_rows() (tuple) instead of iter_rows(named=True) for performance
        col_names = df.columns
        fid_col_idx = col_names.index("feature_id")
        dec_sim_col_idx = col_names.index("decoder_similarity")

        feature_to_sims = {}
        for row in df.iter_rows():
            feature_id = row[fid_col_idx]
            decoder_sims = row[dec_sim_col_idx]
            if isinstance(decoder_sims, list):
                # Build a dict: similar_feature_id -> cosine_similarity
                feature_to_sims[feature_id] = {
                    sim["feature_id"]: float(sim.get("cosine_similarity", 0.0))
                    for sim in decoder_sims
                    if isinstance(sim, dict) and "feature_id" in sim
                }

        # Process pairs using O(1) dict lookups
        pair_metrics = {}
        for main_id, similar_id in pair_ids:
            # IMPORTANT: Use canonical key (smaller ID first)
            pair_key = f"{min(main_id, similar_id)}-{max(main_id, similar_id)}"

            # Try both directions using dict lookup (O(1))
            similarity = 0.0
            if main_id in feature_to_sims:
                similarity = feature_to_sims[main_id].get(similar_id, 0.0)

            if similarity == 0.0 and similar_id in feature_to_sims:
                similarity = feature_to_sims[similar_id].get(main_id, 0.0)

            if similarity == 0.0:
                logger.debug(f"No decoder similarity found for pair {pair_key}")

            pair_metrics[pair_key] = similarity

        logger.info(f"Extracted pair metrics for {len(pair_metrics)} pairs using dict lookup")
        return pair_metrics

    async def _extract_pair_specific_interfeature_metrics(
        self,
        pair_ids: List[Tuple[int, int]]
    ) -> Dict[str, Tuple[float, float]]:
        """
        Extract inter-feature metrics for SPECIFIC pairs (A, B).

        Fast path: Uses svm_pair_metrics.parquet if available.
        Fallback: Extracts from interfeature_similarity.parquet.

        Args:
            pair_ids: List of (main_id, similar_id) tuples

        Returns:
            Dict mapping pair_key -> (inter_ngram_jaccard, inter_semantic_sim)
        """
        # Fast path: Try pre-computed svm_pair_metrics
        svm_pair_metrics = await self._extract_all_pair_metrics_from_svm(pair_ids)
        if svm_pair_metrics is not None:
            # Extract inter_ngram_jaccard (0th) and inter_semantic_sim (1st) from tuple
            return {pk: (metrics[0], metrics[1]) for pk, metrics in svm_pair_metrics.items()}

        # Fallback: Legacy extraction from interfeature_similarity
        logger.info("Falling back to legacy interfeature metrics extraction")

        if self.data_service._interfeature_similarity_lazy is None:
            logger.warning("No inter-feature similarity data available for pair-specific metrics")
            return {}

        # Get all unique feature IDs
        all_feature_ids = list(set(fid for a, b in pair_ids for fid in (a, b)))

        try:
            df = self.data_service._interfeature_similarity_lazy.filter(
                pl.col("feature_id").is_in(all_feature_ids)
            ).collect()
        except Exception as e:
            logger.error(f"Failed to load inter-feature data: {e}")
            return {}

        # Build lookup: feature_id -> {similar_feature_id -> (char_jaccard, word_jaccard, semantic_sim)}
        # Use iter_rows() (tuple) instead of iter_rows(named=True) for performance
        col_names = df.columns
        fid_col_idx = col_names.index("feature_id")
        all_pairs_col_idx = col_names.index("all_pairs")

        feature_to_pairs: Dict[int, Dict[int, Tuple[float, float, float]]] = {}
        for row in df.iter_rows():
            fid = row[fid_col_idx]
            all_pairs = row[all_pairs_col_idx]
            if all_pairs:
                feature_to_pairs[fid] = {
                    p["similar_feature_id"]: (
                        p.get("char_jaccard", 0.0) or 0.0,
                        p.get("word_jaccard", 0.0) or 0.0,
                        p.get("semantic_similarity", 0.0) or 0.0
                    )
                    for p in all_pairs
                    if isinstance(p, dict) and "similar_feature_id" in p
                }

        # Extract metrics for each pair
        result: Dict[str, Tuple[float, float]] = {}
        missing_count = 0
        for main_id, similar_id in pair_ids:
            # Use canonical key (smaller ID first)
            pair_key = f"{min(main_id, similar_id)}-{max(main_id, similar_id)}"

            char_j, word_j, sem_sim = 0.0, 0.0, 0.0
            found = False

            # Try A -> B
            if main_id in feature_to_pairs and similar_id in feature_to_pairs[main_id]:
                char_j, word_j, sem_sim = feature_to_pairs[main_id][similar_id]
                found = True
            # Try B -> A
            elif similar_id in feature_to_pairs and main_id in feature_to_pairs[similar_id]:
                char_j, word_j, sem_sim = feature_to_pairs[similar_id][main_id]
                found = True

            if not found:
                missing_count += 1

            # inter_ngram = max of char/word jaccard
            inter_ngram = max(char_j, word_j)
            result[pair_key] = (inter_ngram, sem_sim)

        logger.info(f"Extracted pair-specific inter-feature metrics for {len(result)} pairs (legacy path)")
        if missing_count > 0:
            logger.warning(
                f"⚠️  {missing_count}/{len(pair_ids)} pairs ({100*missing_count/len(pair_ids):.1f}%) "
                f"have no interfeature similarity data (using 0.0 as default). "
                f"These pairs were clustered by decoder similarity but lack activation/semantic overlap data."
            )
        return result

    # =========================================================================
    # SVM SCORING
    # =========================================================================

    def _calculate_pair_similarity_scores(
        self,
        metrics_df: pl.DataFrame,
        pair_metrics: Dict[str, float],
        pair_inter_metrics: Dict[str, Tuple[float, float]],
        selected_items: List[WeightedPairKey],
        rejected_items: List[WeightedPairKey],
        pair_ids: List[Tuple[int, int]]
    ) -> List[PairScore]:
        """
        Calculate similarity scores for all pairs using SVM.

        9-dim pair vector:
        - [A+B (3)] intra-feature sum
        - [|A-B| (3)] intra-feature difference
        - [inter_ngram(A,B)] pair-specific lexical similarity
        - [inter_semantic(A,B)] pair-specific semantic similarity
        - [decoder_sim(A,B)] pair-specific decoder similarity

        Optimized with:
        - O(1) index lookups via dict instead of O(n) np.where per pair
        - Vectorized pair vector construction
        - Batch SVM scoring

        Args:
            metrics_df: DataFrame with 3 intra-feature metrics for all features
            pair_metrics: Dictionary mapping pair_key to decoder cosine_similarity
            pair_inter_metrics: Dictionary mapping pair_key to (inter_ngram, inter_semantic)
            selected_items: Weighted pair items marked as selected (✓)
            rejected_items: Weighted pair items marked as rejected (✗)
            pair_ids: List of (main_id, similar_id) tuples

        Returns:
            List of PairScore objects
        """
        # Extract keys from weighted items
        selected_pair_keys = [item.key for item in selected_items]
        rejected_pair_keys = [item.key for item in rejected_items]

        # Build key to weight mapping
        key_to_weight = {}
        for item in selected_items:
            key_to_weight[item.key] = CLICK_WEIGHT if item.source == 'click' else THRESHOLD_WEIGHT
        for item in rejected_items:
            key_to_weight[item.key] = CLICK_WEIGHT if item.source == 'click' else THRESHOLD_WEIGHT

        # Convert to numpy for SVM - use PAIR_METRICS (3 intra-feature metrics) for pairs
        feature_ids = metrics_df["feature_id"].to_numpy()
        metrics_matrix = np.column_stack([
            metrics_df[metric].to_numpy() for metric in self.PAIR_METRICS
        ])

        # Build index lookup once - O(n) total instead of O(n) per pair
        fid_to_idx = {int(fid): i for i, fid in enumerate(feature_ids)}

        # Prepare arrays for vectorized construction (pre-allocate all arrays)
        n_pairs = len(pair_ids)
        main_indices = np.empty(n_pairs, dtype=np.int32)
        similar_indices = np.empty(n_pairs, dtype=np.int32)
        valid_mask = np.ones(n_pairs, dtype=bool)
        pair_key_list = [""] * n_pairs  # Pre-allocate list
        inter_ngrams = np.empty(n_pairs, dtype=np.float64)
        inter_semantics = np.empty(n_pairs, dtype=np.float64)
        decoder_sims = np.empty(n_pairs, dtype=np.float64)

        # Single loop: build indices, pair keys, and extract metrics
        for i, (main_id, similar_id) in enumerate(pair_ids):
            # Canonical key (smaller ID first)
            pair_key = f"{min(main_id, similar_id)}-{max(main_id, similar_id)}"
            pair_key_list[i] = pair_key

            # Index lookups
            main_idx = fid_to_idx.get(main_id)
            similar_idx = fid_to_idx.get(similar_id)

            if main_idx is None or similar_idx is None:
                valid_mask[i] = False
                main_indices[i] = 0  # placeholder
                similar_indices[i] = 0
            else:
                main_indices[i] = main_idx
                similar_indices[i] = similar_idx

            # Extract inter-feature and decoder metrics in same loop
            inter_data = pair_inter_metrics.get(pair_key, (0.0, 0.0))
            inter_ngrams[i] = inter_data[0]
            inter_semantics[i] = inter_data[1]
            decoder_sims[i] = pair_metrics.get(pair_key, 0.0)

        # Log missing pairs
        n_invalid = np.sum(~valid_mask)
        if n_invalid > 0:
            logger.warning(f"Missing metrics for {n_invalid} pairs")

        # Vectorized metric extraction for all pairs (3 intra-feature metrics)
        main_metrics_all = metrics_matrix[main_indices]      # (n_pairs, 3)
        similar_metrics_all = metrics_matrix[similar_indices]  # (n_pairs, 3)

        # Vectorized pair vector construction for intra-feature metrics
        pair_sum = main_metrics_all + similar_metrics_all      # (n_pairs, 3)
        pair_diff = np.abs(main_metrics_all - similar_metrics_all)  # (n_pairs, 3)

        # Concatenate: (n_pairs, 9)
        # [A+B (3)] + [|A-B| (3)] + [inter_ngram] + [inter_semantic] + [decoder_sim]
        all_pair_vectors = np.hstack([
            pair_sum,
            pair_diff,
            inter_ngrams.reshape(-1, 1),
            inter_semantics.reshape(-1, 1),
            decoder_sims.reshape(-1, 1)
        ])

        # Build pair_vectors dict for training vector extraction
        pair_vectors = {
            pk: all_pair_vectors[i] if valid_mask[i] else None
            for i, pk in enumerate(pair_key_list)
        }

        # Check cache (include weights in cache key for weighted training)
        cache_key = self._get_pair_cache_key_weighted(selected_items, rejected_items)

        if cache_key in self._svm_cache:
            model, scaler = self._svm_cache[cache_key]
            logger.info(f"Using cached SVM model for pairs (key: {cache_key[:8]}...)")
        else:
            # Extract training vectors and weights
            logger.info(f"Building training vectors for {len(selected_pair_keys)} selected and {len(rejected_pair_keys)} rejected pairs")
            logger.info(f"Selected keys: {selected_pair_keys}")
            logger.info(f"Rejected keys: {rejected_pair_keys}")
            logger.info(f"Available pair_vectors keys (first 10): {list(pair_vectors.keys())[:10]}")

            selected_vectors = []
            selected_weights = []
            for key in selected_pair_keys:
                vec = pair_vectors.get(key)
                if vec is not None:
                    selected_vectors.append(vec)
                    selected_weights.append(key_to_weight.get(key, CLICK_WEIGHT))
                else:
                    logger.warning(f"Selected pair key '{key}' not found in pair_vectors!")

            rejected_vectors = []
            rejected_weights = []
            for key in rejected_pair_keys:
                vec = pair_vectors.get(key)
                if vec is not None:
                    rejected_vectors.append(vec)
                    rejected_weights.append(key_to_weight.get(key, CLICK_WEIGHT))
                else:
                    logger.warning(f"Rejected pair key '{key}' not found in pair_vectors!")

            logger.info(f"Found {len(selected_vectors)} selected vectors and {len(rejected_vectors)} rejected vectors")

            if not selected_vectors or not rejected_vectors:
                logger.warning(f"Insufficient training data for pair SVM: {len(selected_vectors)} selected, {len(rejected_vectors)} rejected")
                return []

            selected_vectors = np.array(selected_vectors)
            rejected_vectors = np.array(rejected_vectors)
            selected_weights_arr = np.array(selected_weights)
            rejected_weights_arr = np.array(rejected_weights)

            # Train SVM with weights
            model, scaler = self._train_svm_model(selected_vectors, rejected_vectors, selected_weights_arr, rejected_weights_arr)

            # Cache with size limit
            if len(self._svm_cache) >= self._max_cache_size:
                oldest_key = next(iter(self._svm_cache))
                self._svm_cache.pop(oldest_key)

            self._svm_cache[cache_key] = (model, scaler)
            logger.info(f"Pair SVM model cached (key: {cache_key[:8]}...)")

        # Batch score all pairs (excluding selected and rejected)
        # Use numpy boolean indexing instead of loop with append
        excluded_set = set(selected_pair_keys) | set(rejected_pair_keys)
        pair_key_arr = np.array(pair_key_list, dtype=object)

        # Build combined mask: valid AND not in excluded set
        not_excluded_mask = np.array([pk not in excluded_set for pk in pair_key_list], dtype=bool)
        combined_mask = valid_mask & not_excluded_mask

        # Use boolean indexing
        valid_vector_indices = np.where(combined_mask)[0]
        valid_pairs = pair_key_arr[combined_mask].tolist()

        pair_scores = []
        if len(valid_pairs) > 0:
            valid_vectors = all_pair_vectors[valid_vector_indices]
            scores = self._score_with_svm(model, scaler, valid_vectors)
            pair_scores = [
                PairScore(pair_key=pk, score=float(s))
                for pk, s in zip(valid_pairs, scores)
            ]

        return pair_scores

    def _calculate_pair_similarity_scores_for_histogram(
        self,
        metrics_df: pl.DataFrame,
        pair_metrics: Dict[str, float],
        pair_inter_metrics: Dict[str, Tuple[float, float]],
        selected_items: List[WeightedPairKey],
        rejected_items: List[WeightedPairKey],
        pair_ids: List[Tuple[int, int]],
        train_committee: bool = False
    ) -> Tuple[List[PairScore], Optional[Dict[str, Dict]]]:
        """
        Calculate similarity scores for ALL pairs using SVM (including selected/rejected).

        This is different from _calculate_pair_similarity_scores() which skips selected/rejected.
        For histogram visualization, we need scores for everything.

        9-dim pair vector:
        - [A+B (3)] intra-feature sum
        - [|A-B| (3)] intra-feature difference
        - [inter_ngram(A,B)] pair-specific lexical similarity
        - [inter_semantic(A,B)] pair-specific semantic similarity
        - [decoder_sim(A,B)] pair-specific decoder similarity

        Optimized with:
        - O(1) index lookups via dict instead of O(n) np.where per pair
        - Vectorized pair vector construction
        - Batch SVM scoring

        Args:
            metrics_df: DataFrame with 3 intra-feature metrics for all features
            pair_metrics: Dictionary mapping pair_key to decoder cosine_similarity
            pair_inter_metrics: Dictionary mapping pair_key to (inter_ngram, inter_semantic)
            selected_items: Weighted pair items marked as selected (✓)
            rejected_items: Weighted pair items marked as rejected (✗)
            pair_ids: List of (main_id, similar_id) tuples
            train_committee: If True, also train RF/MLP and return vote info

        Returns:
            Tuple of (pair_scores, committee_votes)
            - pair_scores: List of PairScore objects for ALL pairs
            - committee_votes: Dict of pair_key -> vote info (only if train_committee=True)
        """
        # Extract keys from weighted items
        selected_pair_keys = [item.key for item in selected_items]
        rejected_pair_keys = [item.key for item in rejected_items]

        # Build key to weight mapping
        key_to_weight = {}
        for item in selected_items:
            key_to_weight[item.key] = CLICK_WEIGHT if item.source == 'click' else THRESHOLD_WEIGHT
        for item in rejected_items:
            key_to_weight[item.key] = CLICK_WEIGHT if item.source == 'click' else THRESHOLD_WEIGHT

        # Convert to numpy for SVM - use PAIR_METRICS (3 intra-feature metrics) for pairs
        feature_ids = metrics_df["feature_id"].to_numpy()
        metrics_matrix = np.column_stack([
            metrics_df[metric].to_numpy() for metric in self.PAIR_METRICS
        ])

        # Build index lookup once - O(n) total instead of O(n) per pair
        fid_to_idx = {int(fid): i for i, fid in enumerate(feature_ids)}

        # Prepare arrays for vectorized construction (pre-allocate all arrays)
        n_pairs = len(pair_ids)
        main_indices = np.empty(n_pairs, dtype=np.int32)
        similar_indices = np.empty(n_pairs, dtype=np.int32)
        valid_mask = np.ones(n_pairs, dtype=bool)
        pair_key_list = [""] * n_pairs  # Pre-allocate list
        inter_ngrams = np.empty(n_pairs, dtype=np.float64)
        inter_semantics = np.empty(n_pairs, dtype=np.float64)
        decoder_sims = np.empty(n_pairs, dtype=np.float64)

        # Single loop: build indices, pair keys, and extract metrics
        for i, (main_id, similar_id) in enumerate(pair_ids):
            # Canonical key (smaller ID first)
            pair_key = f"{min(main_id, similar_id)}-{max(main_id, similar_id)}"
            pair_key_list[i] = pair_key

            # Index lookups
            main_idx = fid_to_idx.get(main_id)
            similar_idx = fid_to_idx.get(similar_id)

            if main_idx is None or similar_idx is None:
                valid_mask[i] = False
                main_indices[i] = 0  # placeholder
                similar_indices[i] = 0
            else:
                main_indices[i] = main_idx
                similar_indices[i] = similar_idx

            # Extract inter-feature and decoder metrics in same loop
            inter_data = pair_inter_metrics.get(pair_key, (0.0, 0.0))
            inter_ngrams[i] = inter_data[0]
            inter_semantics[i] = inter_data[1]
            decoder_sims[i] = pair_metrics.get(pair_key, 0.0)

        # Log missing pairs
        n_invalid = np.sum(~valid_mask)
        if n_invalid > 0:
            logger.warning(f"Missing metrics for {n_invalid} pairs (histogram)")

        # Vectorized metric extraction for all pairs (3 intra-feature metrics)
        main_metrics_all = metrics_matrix[main_indices]      # (n_pairs, 3)
        similar_metrics_all = metrics_matrix[similar_indices]  # (n_pairs, 3)

        # Vectorized pair vector construction for intra-feature metrics
        pair_sum = main_metrics_all + similar_metrics_all      # (n_pairs, 3)
        pair_diff = np.abs(main_metrics_all - similar_metrics_all)  # (n_pairs, 3)

        # Concatenate: (n_pairs, 9)
        # [A+B (3)] + [|A-B| (3)] + [inter_ngram] + [inter_semantic] + [decoder_sim]
        all_pair_vectors = np.hstack([
            pair_sum,
            pair_diff,
            inter_ngrams.reshape(-1, 1),
            inter_semantics.reshape(-1, 1),
            decoder_sims.reshape(-1, 1)
        ])

        # Build pair_vectors dict for training vector extraction
        pair_vectors = {
            pk: all_pair_vectors[i] if valid_mask[i] else None
            for i, pk in enumerate(pair_key_list)
        }

        # Check cache (include weights in cache key for weighted training)
        cache_key = self._get_pair_cache_key_weighted(selected_items, rejected_items)

        if cache_key in self._svm_cache:
            model, scaler = self._svm_cache[cache_key]
            logger.info(f"Using cached SVM model for pair histogram (key: {cache_key[:8]}...)")
        else:
            # Extract training vectors and weights
            selected_vectors = []
            selected_weights = []
            for key in selected_pair_keys:
                vec = pair_vectors.get(key)
                if vec is not None:
                    selected_vectors.append(vec)
                    selected_weights.append(key_to_weight.get(key, CLICK_WEIGHT))

            rejected_vectors = []
            rejected_weights = []
            for key in rejected_pair_keys:
                vec = pair_vectors.get(key)
                if vec is not None:
                    rejected_vectors.append(vec)
                    rejected_weights.append(key_to_weight.get(key, CLICK_WEIGHT))

            if not selected_vectors or not rejected_vectors:
                logger.warning("Insufficient training data for pair SVM histogram")
                return [], None

            selected_vectors = np.array(selected_vectors)
            rejected_vectors = np.array(rejected_vectors)
            selected_weights_arr = np.array(selected_weights)
            rejected_weights_arr = np.array(rejected_weights)

            # Prepare training data for committee (before SVM training modifies arrays)
            X_train = np.vstack([selected_vectors, rejected_vectors])
            y_train = np.array([1] * len(selected_vectors) + [0] * len(rejected_vectors))
            sample_weights_arr = np.concatenate([selected_weights_arr, rejected_weights_arr])

            # Train SVM with weights
            model, scaler = self._train_svm_model(selected_vectors, rejected_vectors, selected_weights_arr, rejected_weights_arr)

            # Cache with size limit
            if len(self._svm_cache) >= self._max_cache_size:
                oldest_key = next(iter(self._svm_cache))
                self._svm_cache.pop(oldest_key)

            self._svm_cache[cache_key] = (model, scaler)

        # Batch score ALL pairs (including selected and rejected for histogram)
        # Use numpy boolean indexing instead of loop with append
        pair_key_arr = np.array(pair_key_list, dtype=object)
        valid_vector_indices = np.where(valid_mask)[0]
        valid_pairs = pair_key_arr[valid_mask].tolist()

        pair_scores = []
        scores = np.array([])
        if len(valid_pairs) > 0:
            valid_vectors = all_pair_vectors[valid_vector_indices]
            scores = self._score_with_svm(model, scaler, valid_vectors)
            pair_scores = [
                PairScore(pair_key=pk, score=float(s))
                for pk, s in zip(valid_pairs, scores)
            ]

        # Train committee and get vote info if requested
        committee_votes = None

        if train_committee and len(pair_scores) > 0:
            # Need training data - check if we have it from above or need to rebuild
            if 'X_train' not in locals() or X_train is None:
                # Rebuild training data from cache scenario
                selected_vectors_list = []
                selected_weights_list = []
                for key in selected_pair_keys:
                    vec = pair_vectors.get(key)
                    if vec is not None:
                        selected_vectors_list.append(vec)
                        selected_weights_list.append(key_to_weight.get(key, CLICK_WEIGHT))

                rejected_vectors_list = []
                rejected_weights_list = []
                for key in rejected_pair_keys:
                    vec = pair_vectors.get(key)
                    if vec is not None:
                        rejected_vectors_list.append(vec)
                        rejected_weights_list.append(key_to_weight.get(key, CLICK_WEIGHT))

                if selected_vectors_list and rejected_vectors_list:
                    X_train = np.vstack([np.array(selected_vectors_list), np.array(rejected_vectors_list)])
                    y_train = np.array([1] * len(selected_vectors_list) + [0] * len(rejected_vectors_list))
                    sample_weights_arr = np.concatenate([
                        np.array(selected_weights_list),
                        np.array(rejected_weights_list)
                    ])
                else:
                    X_train = None

            if X_train is not None:
                logger.info("[PairSimilarityService] Training committee (RF + MLP) for QBC...")
                rf_model, mlp_model, committee_scaler = self.committee_service.train_committee(
                    X_train, y_train, sample_weights_arr
                )

                if rf_model is not None or mlp_model is not None:
                    # Scale vectors and get committee predictions
                    valid_vectors = all_pair_vectors[valid_vector_indices]

                    # Get committee predictions
                    committee_preds = self.committee_service.predict_with_committee(
                        valid_vectors, scores, rf_model, mlp_model, committee_scaler
                    )

                    # Convert to API response format
                    committee_votes = self.committee_service.get_vote_info_dict(valid_pairs, committee_preds)

                    logger.info(f"[PairSimilarityService] Committee votes generated for {len(valid_pairs)} pairs")

        return pair_scores, committee_votes

    # =========================================================================
    # SVM HELPERS (duplicated from SimilaritySortService for independence)
    # =========================================================================

    def _get_pair_cache_key(self, selected_pair_keys: List[str], rejected_pair_keys: List[str]) -> str:
        """
        Generate unique cache key from pair selections (legacy, unweighted).

        Args:
            selected_pair_keys: Pair keys marked as selected (✓) e.g., ["1-2", "3-4"]
            rejected_pair_keys: Pair keys marked as rejected (✗)

        Returns:
            MD5 hash of sorted pair key lists
        """
        key_str = f"{sorted(selected_pair_keys)}_{sorted(rejected_pair_keys)}"
        return hashlib.md5(key_str.encode()).hexdigest()

    def _get_pair_cache_key_weighted(
        self,
        selected_items: List[WeightedPairKey],
        rejected_items: List[WeightedPairKey]
    ) -> str:
        """
        Generate unique cache key from weighted pair selections.

        Includes both keys and sources in the cache key since weights affect the model.

        Args:
            selected_items: Weighted pair items marked as selected (✓)
            rejected_items: Weighted pair items marked as rejected (✗)

        Returns:
            MD5 hash of sorted (key, source) tuples
        """
        selected_tuples = sorted([(item.key, item.source) for item in selected_items])
        rejected_tuples = sorted([(item.key, item.source) for item in rejected_items])
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
        logger.info("Pair SVM model cache cleared")
