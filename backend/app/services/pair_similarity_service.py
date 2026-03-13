"""
Pair similarity-based sorting service for feature pairs.

Uses SVM (Support Vector Machine) with RBF kernel to learn similarity patterns
from user-labeled feature pairs. Scores pairs by signed distance from SVM decision boundary.

8-dimensional pair vectors:
- 4 dims: min/max intra-feature (answers "is either feature noisy?")
  - min(A,B) intra_ngram_jaccard: worst lexical consistency
  - min(A,B) intra_semantic_sim: worst semantic consistency
  - max(A,B) intra_ngram_jaccard_std: worst lexical variability
  - max(A,B) intra_semantic_sim_std: worst semantic variability
- 4 dims: inter-feature (answers "is the conceptual separation clear?")
  - inter_ngram_jaccard(A, B) - pair-specific lexical similarity
  - inter_semantic_sim(A, B) - pair-specific semantic similarity
  - decoder_sim(A, B) - pair-specific decoder similarity
  - feature_correlation(A, B) - pair-specific activation correlation
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
    PairSimilaritySortRequest, PairSimilaritySortResponse, PairScore,
    PairSimilarityHistogramRequest, SimilarityHistogramResponse,
    HistogramStatistics,
    WeightedPairKey, CommitteeVoteInfo
)
from .committee_service import CommitteeService
from .data_constants import CLICK_WEIGHT, THRESHOLD_WEIGHT, SVM_PAIR_INTRA_METRICS
from .data_service import DataService
from .hierarchical_cluster_candidate_service import HierarchicalClusterCandidateService
from .svm_utils import train_svm_model, score_with_svm, build_similarity_histogram_response

logger = logging.getLogger(__name__)


class PairSimilarityService:
    """Service for calculating feature pair similarity scores."""

    def __init__(
        self,
        data_service: DataService,
        cluster_service: Optional[HierarchicalClusterCandidateService] = None
    ):
        """
        Initialize PairSimilarityService.

        Args:
            data_service: Instance of DataService for data access
            cluster_service: Optional instance of HierarchicalClusterCandidateService for pair generation
        """
        self.data_service = data_service
        self.cluster_service = cluster_service
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

        Pair vectors are 8-dimensional:
        - 4 dims: min/max intra-feature (worst-member aggregation)
        - 4 dims: inter-feature (pair-specific metrics)

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
        pair_scores, _ = self._calculate_pair_similarity_scores(
            metrics_df,
            pair_metrics_dict,
            pair_inter_metrics,
            request.selected_items,
            request.rejected_items,
            pair_ids,
            include_training_items=False,
            train_committee=False,
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
            cluster_result = await self.cluster_service.get_filtered_cluster_pairs(
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
        pair_scores, committee_votes = self._calculate_pair_similarity_scores(
            metrics_df,
            pair_metrics_dict,
            pair_inter_metrics,
            request.selected_items,
            request.rejected_items,
            pair_ids,
            include_training_items=True,
            train_committee=True,
        )

        # Create scores dictionary
        scores_dict = {item.pair_key: item.score for item in pair_scores}
        score_values = np.array([item.score for item in pair_scores])

        # Convert committee votes to Pydantic models if available
        committee_votes_response = None
        if committee_votes:
            committee_votes_response = {
                pk: CommitteeVoteInfo(
                    svm_prediction=info["svm_prediction"],
                    rf_prediction=info["rf_prediction"],
                    mlp_prediction=info["mlp_prediction"],
                )
                for pk, info in committee_votes.items()
            }

        logger.info(f"Successfully generated histogram for {len(pair_scores)} pairs")

        return build_similarity_histogram_response(
            scores_dict, score_values, len(pair_scores),
            committee_votes_response
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
        Extract the 4 PAIR_METRICS (intra-feature) for pair SVM calculations.

        Uses in-memory caching to avoid repeated queries.
        Reads from svm_feature_metrics.parquet (required at startup).

        Metrics extracted:
        - intra_ngram_jaccard, intra_ngram_jaccard_std, intra_semantic_sim, intra_semantic_sim_std

        Args:
            feature_ids: List of feature IDs to extract metrics for

        Returns:
            DataFrame with feature_id and 4 intra-feature metrics
        """
        # Check cache first
        cache_key = self._get_metrics_cache_key(feature_ids)
        if cache_key in self._metrics_cache:
            logger.info(f"[_extract_pair_feature_metrics] Using cached metrics for {len(feature_ids)} features")
            return self._metrics_cache[cache_key]

        try:
            logger.info(f"[_extract_pair_feature_metrics] Starting extraction for {len(feature_ids)} features")

            result_df = self.data_service._svm_feature_metrics_lazy.filter(
                pl.col("feature_id").is_in(feature_ids)
            ).select([
                "feature_id",
                "intra_ngram_jaccard",
                "intra_ngram_jaccard_std",
                "intra_semantic_sim",
                "intra_semantic_sim_std",
            ]).collect()

            # Fill nulls with 0 for missing metrics
            for metric in SVM_PAIR_INTRA_METRICS:
                if metric in result_df.columns:
                    result_df = result_df.with_columns(pl.col(metric).fill_null(0.0))
                else:
                    result_df = result_df.with_columns(pl.lit(0.0).alias(metric))

            logger.info(f"[_extract_pair_feature_metrics] Extracted {len(result_df)} features from svm_feature_metrics")

            # Cache result
            if len(self._metrics_cache) >= self._max_metrics_cache_size:
                oldest_key = next(iter(self._metrics_cache))
                self._metrics_cache.pop(oldest_key)
            self._metrics_cache[cache_key] = result_df
            return result_df

        except Exception as e:
            logger.error(f"Failed to extract pair feature metrics: {e}", exc_info=True)
            return None

    async def _extract_all_pair_metrics_from_svm(
        self,
        pair_ids: List[Tuple[int, int]]
    ) -> Optional[Dict[str, Tuple[float, float, float, float]]]:
        """
        Extract all pair-specific metrics from svm_pair_metrics.parquet (fast path).

        The svm_pair_metrics.parquet contains pre-computed pair-level metrics:
        - inter_ngram_jaccard: max(char_jaccard, word_jaccard) for the pair
        - inter_semantic_sim: semantic similarity between feature activations
        - decoder_sim: cosine similarity from decoder weights
        - feature_correlation: activation correlation between features

        Args:
            pair_ids: List of (main_id, similar_id) tuples

        Returns:
            Dict mapping pair_key -> (inter_ngram_jaccard, inter_semantic_sim, decoder_sim, feature_correlation)
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
            result: Dict[str, Tuple[float, float, float, float]] = {}
            for row in df.iter_rows(named=True):
                pair_key = f"{row['feature_a']}-{row['feature_b']}"
                if pair_key in pair_keys_set:
                    result[pair_key] = (
                        float(row.get('inter_ngram_jaccard', 0.0) or 0.0),
                        float(row.get('inter_semantic_sim', 0.0) or 0.0),
                        float(row.get('decoder_sim', 0.0) or 0.0),
                        float(row.get('feature_correlation', 0.0) or 0.0),
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
        Extract pair-specific decoder similarity from svm_pair_metrics.parquet.

        Args:
            pair_ids: List of (main_id, similar_id) tuples

        Returns:
            Dictionary mapping pair_key to decoder_sim
        """
        svm_pair_metrics = await self._extract_all_pair_metrics_from_svm(pair_ids)
        if svm_pair_metrics is not None:
            # Extract just the decoder_sim (3rd element of tuple)
            return {pk: metrics[2] for pk, metrics in svm_pair_metrics.items()}
        return {}

    async def _extract_pair_specific_interfeature_metrics(
        self,
        pair_ids: List[Tuple[int, int]]
    ) -> Dict[str, Tuple[float, float, float]]:
        """
        Extract inter-feature metrics for SPECIFIC pairs (A, B) from svm_pair_metrics.parquet.

        Args:
            pair_ids: List of (main_id, similar_id) tuples

        Returns:
            Dict mapping pair_key -> (inter_ngram_jaccard, inter_semantic_sim, feature_correlation)
        """
        svm_pair_metrics = await self._extract_all_pair_metrics_from_svm(pair_ids)
        if svm_pair_metrics is not None:
            # Extract inter_ngram_jaccard (0th), inter_semantic_sim (1st), feature_correlation (3rd) from tuple
            return {pk: (metrics[0], metrics[1], metrics[3]) for pk, metrics in svm_pair_metrics.items()}
        return {}

    # =========================================================================
    # SVM SCORING
    # =========================================================================

    def _calculate_pair_similarity_scores(
        self,
        metrics_df: pl.DataFrame,
        pair_metrics: Dict[str, float],
        pair_inter_metrics: Dict[str, Tuple[float, float, float]],
        selected_items: List[WeightedPairKey],
        rejected_items: List[WeightedPairKey],
        pair_ids: List[Tuple[int, int]],
        include_training_items: bool = False,
        train_committee: bool = False,
    ) -> Tuple[List[PairScore], Optional[Dict[str, Dict]]]:
        """
        Calculate similarity scores for pairs using SVM.

        8-dim pair vector:
        - [min/max (4)] intra-feature worst-member aggregation
          - min(A,B) ngram_jaccard, min(A,B) semantic_sim (worst consistency)
          - max(A,B) ngram_jaccard_std, max(A,B) semantic_sim_std (worst variability)
        - [inter (4)] pair-specific metrics
          - inter_ngram, inter_semantic, decoder_sim, feature_correlation

        Args:
            metrics_df: DataFrame with 4 intra-feature metrics for all features
            pair_metrics: Dictionary mapping pair_key to decoder cosine_similarity
            pair_inter_metrics: Dictionary mapping pair_key to (inter_ngram, inter_semantic)
            selected_items: Weighted pair items marked as selected (✓)
            rejected_items: Weighted pair items marked as rejected (✗)
            pair_ids: List of (main_id, similar_id) tuples
            include_training_items: If True, score ALL pairs (for histogram).
                                   If False, exclude selected/rejected (for sort).
            train_committee: If True, also train RF/MLP and return committee votes.

        Returns:
            Tuple of (pair_scores, committee_votes)
            - pair_scores: List of PairScore objects
            - committee_votes: Dict of pair_key -> vote info (None unless train_committee=True)
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

        # Convert to numpy for SVM - use PAIR_METRICS (4 intra-feature metrics) for pairs
        feature_ids = metrics_df["feature_id"].to_numpy()
        metrics_matrix = np.column_stack([
            metrics_df[metric].to_numpy() for metric in SVM_PAIR_INTRA_METRICS
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
        correlations = np.empty(n_pairs, dtype=np.float64)

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
            inter_data = pair_inter_metrics.get(pair_key, (0.0, 0.0, 0.0))
            inter_ngrams[i] = inter_data[0]
            inter_semantics[i] = inter_data[1]
            correlations[i] = inter_data[2]
            decoder_sims[i] = pair_metrics.get(pair_key, 0.0)

        # Log pair validity stats
        n_valid = int(np.sum(valid_mask))
        n_invalid = len(pair_ids) - n_valid
        logger.info(f"[Stage1] Pair vectors: {n_valid}/{len(pair_ids)} pairs valid "
                    f"(scaler will fit on {n_valid} valid pairs)")
        if n_invalid > 0:
            logger.warning(f"Missing metrics for {n_invalid} pairs")

        # Vectorized metric extraction for all pairs (4 intra-feature metrics)
        # SVM_PAIR_INTRA_METRICS order: [ngram_jaccard, ngram_jaccard_std, semantic_sim, semantic_sim_std]
        main_metrics_all = metrics_matrix[main_indices]      # (n_pairs, 4)
        similar_metrics_all = metrics_matrix[similar_indices]  # (n_pairs, 4)

        # Worst-member aggregation aligned with diagnostic questions:
        # Q1 "Is either feature noisy?" → min(consistency), max(variability)
        # Metrics: [ngram_jaccard, ngram_jaccard_std, semantic_sim, semantic_sim_std]
        # Consistency metrics (idx 0, 2): min(A,B) — worst consistency
        # Variability metrics (idx 1, 3): max(A,B) — worst variability
        intra_min = np.minimum(main_metrics_all, similar_metrics_all)  # (n_pairs, 4)
        intra_max = np.maximum(main_metrics_all, similar_metrics_all)  # (n_pairs, 4)
        intra_aggregated = np.empty_like(main_metrics_all)  # (n_pairs, 4)
        intra_aggregated[:, 0] = intra_min[:, 0]  # min(ngram_jaccard) — worst lexical consistency
        intra_aggregated[:, 1] = intra_max[:, 1]  # max(ngram_jaccard_std) — worst lexical variability
        intra_aggregated[:, 2] = intra_min[:, 2]  # min(semantic_sim) — worst semantic consistency
        intra_aggregated[:, 3] = intra_max[:, 3]  # max(semantic_sim_std) — worst semantic variability

        # Concatenate: (n_pairs, 8)
        # [min/max intra (4)] + [inter_ngram] + [inter_semantic] + [decoder_sim] + [correlation]
        all_pair_vectors = np.hstack([
            intra_aggregated,
            inter_ngrams.reshape(-1, 1),
            inter_semantics.reshape(-1, 1),
            decoder_sims.reshape(-1, 1),
            correlations.reshape(-1, 1)
        ])

        # Build pair_vectors dict for training vector extraction
        pair_vectors = {
            pk: all_pair_vectors[i] if valid_mask[i] else None
            for i, pk in enumerate(pair_key_list)
        }

        # Check cache (include weights in cache key for weighted training)
        cache_key = self._get_pair_cache_key_weighted(selected_items, rejected_items)

        # Variables for committee training
        X_train = None
        y_train = None
        sample_weights_arr = None

        if cache_key in self._svm_cache:
            model, scaler = self._svm_cache[cache_key]
            logger.info(f"Using cached SVM model for pairs (key: {cache_key[:8]}...)")

            # Still need training data for committee if requested
            if train_committee:
                sel_vecs = [pair_vectors[k] for k in selected_pair_keys if pair_vectors.get(k) is not None]
                sel_w = [key_to_weight.get(k, CLICK_WEIGHT) for k in selected_pair_keys if pair_vectors.get(k) is not None]
                rej_vecs = [pair_vectors[k] for k in rejected_pair_keys if pair_vectors.get(k) is not None]
                rej_w = [key_to_weight.get(k, CLICK_WEIGHT) for k in rejected_pair_keys if pair_vectors.get(k) is not None]
                if sel_vecs and rej_vecs:
                    X_train = np.vstack([np.array(sel_vecs), np.array(rej_vecs)])
                    y_train = np.array([1] * len(sel_vecs) + [0] * len(rej_vecs))
                    sample_weights_arr = np.concatenate([np.array(sel_w), np.array(rej_w)])
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
                return [], None

            selected_vectors = np.array(selected_vectors)
            rejected_vectors = np.array(rejected_vectors)
            selected_weights_arr = np.array(selected_weights)
            rejected_weights_arr = np.array(rejected_weights)

            # Prepare training data for committee
            if train_committee:
                X_train = np.vstack([selected_vectors, rejected_vectors])
                y_train = np.array([1] * len(selected_vectors) + [0] * len(rejected_vectors))
                sample_weights_arr = np.concatenate([selected_weights_arr, rejected_weights_arr])

            # Fit scaler on full prediction pool for stable statistics
            full_data_scaler = StandardScaler()
            full_data_scaler.fit(all_pair_vectors[valid_mask])

            # Train SVM with weights (using pre-fit scaler)
            model, scaler = train_svm_model(selected_vectors, rejected_vectors, selected_weights_arr, rejected_weights_arr, scaler=full_data_scaler)

            # Cache with size limit
            if len(self._svm_cache) >= self._max_cache_size:
                oldest_key = next(iter(self._svm_cache))
                self._svm_cache.pop(oldest_key)

            self._svm_cache[cache_key] = (model, scaler)
            logger.info(f"Pair SVM model cached (key: {cache_key[:8]}...)")

        # Score pairs
        pair_key_arr = np.array(pair_key_list, dtype=object)

        if include_training_items:
            # Score ALL valid pairs (for histogram)
            valid_vector_indices = np.where(valid_mask)[0]
            valid_pairs = pair_key_arr[valid_mask].tolist()
        else:
            # Exclude selected/rejected (for sort)
            excluded_set = set(selected_pair_keys) | set(rejected_pair_keys)
            not_excluded_mask = np.array([pk not in excluded_set for pk in pair_key_list], dtype=bool)
            combined_mask = valid_mask & not_excluded_mask
            valid_vector_indices = np.where(combined_mask)[0]
            valid_pairs = pair_key_arr[combined_mask].tolist()

        pair_scores = []
        scores = np.array([])
        if len(valid_pairs) > 0:
            valid_vectors = all_pair_vectors[valid_vector_indices]
            scores = score_with_svm(model, scaler, valid_vectors)
            pair_scores = [
                PairScore(pair_key=pk, score=float(s))
                for pk, s in zip(valid_pairs, scores)
            ]

        # Train committee and get vote info if requested
        committee_votes = None

        if train_committee and X_train is not None and y_train is not None and len(pair_scores) > 0:
            logger.info("[PairSimilarityService] Training committee (RF + MLP) for QBC...")
            # Pre-scale training data with SVM scaler so committee trains on same scale
            X_train_scaled = scaler.transform(X_train)
            rf_model, mlp_model, _committee_scaler = self.committee_service.train_committee(
                X_train_scaled, y_train, sample_weights_arr, skip_scaling=True
            )

            if rf_model is not None or mlp_model is not None:
                # Scale all features using the SVM scaler (consistent with SVM scoring)
                valid_vectors_scaled = scaler.transform(all_pair_vectors[valid_vector_indices])
                committee_preds = self.committee_service.predict_with_committee(
                    valid_vectors_scaled, scores, rf_model, mlp_model, None
                )
                committee_votes = self.committee_service.get_vote_info_dict(valid_pairs, committee_preds)
                logger.info(f"[PairSimilarityService] Committee votes generated for {len(valid_pairs)} pairs")

        return pair_scores, committee_votes

    # =========================================================================
    # SVM HELPERS
    # =========================================================================

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

    def clear_svm_cache(self):
        """Clear SVM model cache (call on data reload)."""
        self._svm_cache.clear()
        logger.info("Pair SVM model cache cleared")
