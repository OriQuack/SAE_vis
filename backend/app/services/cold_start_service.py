"""
Cold-start suggestions service using Kennard-Stone algorithm.

Provides diverse initial suggestions to bootstrap SVM-based tagging
when users haven't tagged enough items yet. Uses Kennard-Stone algorithm
to select representative samples that maximally span the feature space.
"""

import polars as pl
import numpy as np
import logging
import hashlib
import random
from typing import List, Dict, Optional, TYPE_CHECKING
from sklearn.preprocessing import StandardScaler

from ..models.cold_start import (
    ColdStartSuggestionRequest,
    ColdStartSuggestionsResponse,
    ColdStartSuggestion
)

if TYPE_CHECKING:
    from .data_service import DataService
    from .hierarchical_cluster_candidate_service import HierarchicalClusterCandidateService

logger = logging.getLogger(__name__)


class ColdStartService:
    """Service for generating cold-start suggestions using Kennard-Stone algorithm."""

    # Same 6 metrics as SimilaritySortService for features
    FEATURE_METRICS = [
        'intra_feature_sim',
        'score_embedding',
        'score_fuzz',
        'score_detection',
        'explanation_semantic_sim',
        'frac_nonzero',
    ]

    # Same 5 metrics as PairSimilarityService for pairs
    PAIR_METRICS = [
        'intra_ngram_jaccard',
        'intra_semantic_sim',
        'inter_ngram_jaccard',
        'inter_semantic_sim',
        'frac_nonzero',
    ]

    def __init__(
        self,
        data_service: "DataService",
        cluster_service: Optional["HierarchicalClusterCandidateService"] = None
    ):
        """
        Initialize ColdStartService.

        Args:
            data_service: Instance of DataService for data access
            cluster_service: Optional instance of HierarchicalClusterCandidateService for pair generation
        """
        self.data_service = data_service
        self.cluster_service = cluster_service

        # Cache: request hash -> suggestions response
        self._cache: Dict[str, ColdStartSuggestionsResponse] = {}
        self._max_cache_size = 50

    def _get_cache_key(self, request: ColdStartSuggestionRequest) -> str:
        """Generate cache key from request parameters."""
        key_parts = [
            request.mode,
            str(sorted(request.feature_ids)),
            str(request.num_suggestions),
            str(request.threshold) if request.threshold else "none"
        ]
        key_str = "_".join(key_parts)
        return hashlib.md5(key_str.encode()).hexdigest()

    async def get_suggestions(
        self,
        request: ColdStartSuggestionRequest
    ) -> ColdStartSuggestionsResponse:
        """
        Get diverse suggestions using Kennard-Stone algorithm.

        For features: Uses 6D metric space from barycentric parquet
        For pairs: Uses 11D symmetric pair vectors

        Args:
            request: Request with mode, feature_ids, num_suggestions, and optional threshold

        Returns:
            Response with diverse suggestions selected via Kennard-Stone
        """
        if not self.data_service.is_ready():
            raise RuntimeError("DataService not ready")

        # Check cache
        cache_key = self._get_cache_key(request)
        if cache_key in self._cache:
            cached = self._cache[cache_key]
            logger.info(f"[ColdStart] Cache hit for {request.mode} mode")
            return ColdStartSuggestionsResponse(
                suggestions=cached.suggestions,
                total_suggestions=cached.total_suggestions,
                mode=cached.mode,
                num_clusters=cached.num_clusters,
                cache_hit=True
            )

        if request.mode == 'feature':
            response = await self._get_feature_suggestions(request)
        else:
            response = await self._get_pair_suggestions(request)

        # Cache result
        if len(self._cache) >= self._max_cache_size:
            oldest_key = next(iter(self._cache))
            self._cache.pop(oldest_key)
        self._cache[cache_key] = response

        return response

    async def _get_feature_suggestions(
        self,
        request: ColdStartSuggestionRequest
    ) -> ColdStartSuggestionsResponse:
        """Get feature suggestions using Kennard-Stone on 6D metric space."""
        feature_ids = request.feature_ids
        num_suggestions = min(request.num_suggestions, len(feature_ids))

        # Extract metrics from barycentric parquet (fast path)
        metrics_df = await self._extract_feature_metrics(feature_ids)

        if metrics_df is None or len(metrics_df) < num_suggestions:
            logger.warning(f"[ColdStart] Insufficient metrics: {len(metrics_df) if metrics_df else 0} features")
            return self._random_fallback(feature_ids, num_suggestions, 'feature')

        # Build feature matrix
        feature_id_list = metrics_df["feature_id"].to_list()
        metrics_matrix = metrics_df.select(self.FEATURE_METRICS).to_numpy()

        # Standardize for Kennard-Stone
        scaler = StandardScaler()
        metrics_scaled = scaler.fit_transform(metrics_matrix)

        # Select diverse samples via Kennard-Stone
        n_select = min(num_suggestions, len(feature_id_list))
        selected_indices = self._kennard_stone(metrics_scaled, n_select)

        # Build suggestions
        suggestions = []
        for idx, sample_idx in enumerate(selected_indices):
            feature_id = feature_id_list[sample_idx]
            suggestions.append(ColdStartSuggestion(
                id=str(feature_id),
                cluster_id=idx,
                is_medoid=True,
                diversity_reason=f"Kennard-Stone sample {idx + 1}",
                metrics={
                    metric: float(metrics_matrix[sample_idx, i])
                    for i, metric in enumerate(self.FEATURE_METRICS)
                }
            ))

        logger.info(f"[ColdStart] Selected {len(suggestions)} diverse features via Kennard-Stone")

        return ColdStartSuggestionsResponse(
            suggestions=suggestions,
            total_suggestions=len(suggestions),
            mode='feature',
            num_clusters=n_select,
            cache_hit=False
        )

    async def _get_pair_suggestions(
        self,
        request: ColdStartSuggestionRequest
    ) -> ColdStartSuggestionsResponse:
        """Get pair suggestions using Kennard-Stone on 11D pair vectors."""
        if self.cluster_service is None:
            raise RuntimeError("Cluster service required for pair mode")

        if request.threshold is None:
            raise ValueError("threshold required for pair mode")

        feature_ids = request.feature_ids
        threshold = request.threshold
        num_suggestions = request.num_suggestions

        # Get all cluster pairs using existing service
        cluster_result = await self.cluster_service.get_all_cluster_pairs(
            feature_ids=feature_ids,
            threshold=threshold
        )

        pairs = cluster_result["pairs"]
        if len(pairs) < num_suggestions:
            logger.warning(f"[ColdStart] Only {len(pairs)} pairs available, need {num_suggestions}")
            num_suggestions = min(num_suggestions, len(pairs))

        if len(pairs) == 0:
            return ColdStartSuggestionsResponse(
                suggestions=[],
                total_suggestions=0,
                mode='pair',
                num_clusters=0,
                cache_hit=False
            )

        # Extract unique feature IDs from pairs
        all_feature_ids = list(set(
            fid for pair in pairs for fid in (pair["main_id"], pair["similar_id"])
        ))

        # Extract pair metrics
        metrics_df = await self._extract_pair_feature_metrics(all_feature_ids)

        if metrics_df is None or len(metrics_df) == 0:
            return self._random_fallback_pairs(pairs, num_suggestions)

        # Build 11D pair vectors (same as PairSimilarityService)
        pair_vectors = []
        valid_pairs = []

        feature_ids_arr = metrics_df["feature_id"].to_numpy()
        metrics_matrix = metrics_df.select(self.PAIR_METRICS).to_numpy()

        for pair in pairs:
            main_id = pair["main_id"]
            similar_id = pair["similar_id"]

            main_idx = np.where(feature_ids_arr == main_id)[0]
            similar_idx = np.where(feature_ids_arr == similar_id)[0]

            if len(main_idx) == 0 or len(similar_idx) == 0:
                continue

            main_metrics = metrics_matrix[main_idx[0]]
            similar_metrics = metrics_matrix[similar_idx[0]]

            # Symmetric 11D vector: [A+B (5)] + [|A-B| (5)] + [decoder_sim (1)]
            pair_sum = main_metrics + similar_metrics
            pair_diff = np.abs(main_metrics - similar_metrics)
            pair_vector = np.concatenate([pair_sum, pair_diff, [0.0]])

            pair_vectors.append(pair_vector)
            valid_pairs.append(pair)

        if len(valid_pairs) < num_suggestions:
            return self._random_fallback_pairs(valid_pairs, min(num_suggestions, len(valid_pairs)))

        # Kennard-Stone on pair vectors
        pair_matrix = np.array(pair_vectors)
        scaler = StandardScaler()
        pair_scaled = scaler.fit_transform(pair_matrix)

        # Select diverse samples via Kennard-Stone
        n_select = min(num_suggestions, len(valid_pairs))
        selected_indices = self._kennard_stone(pair_scaled, n_select)

        suggestions = []
        for idx, sample_idx in enumerate(selected_indices):
            pair = valid_pairs[sample_idx]
            suggestions.append(ColdStartSuggestion(
                id=pair["pair_key"],
                cluster_id=idx,
                is_medoid=True,
                diversity_reason=f"Kennard-Stone sample {idx + 1}"
            ))

        logger.info(f"[ColdStart] Selected {len(suggestions)} diverse pairs via Kennard-Stone")

        return ColdStartSuggestionsResponse(
            suggestions=suggestions,
            total_suggestions=len(suggestions),
            mode='pair',
            num_clusters=n_select,
            cache_hit=False
        )

    def _kennard_stone(self, X: np.ndarray, n: int) -> List[int]:
        """
        Kennard-Stone algorithm for diverse sample selection.

        Selects n samples that maximally span the feature space by iteratively
        choosing points with maximum minimum distance to already selected points.

        Args:
            X: Data matrix (n_samples, n_features), should be pre-scaled
            n: Number of samples to select

        Returns:
            List of selected sample indices
        """
        n_samples = X.shape[0]
        if n >= n_samples:
            return list(range(n_samples))

        # Compute pairwise distance matrix
        dist_matrix = np.linalg.norm(X[:, np.newaxis] - X, axis=2)

        # Start with the two points furthest apart
        i, j = np.unravel_index(np.argmax(dist_matrix), dist_matrix.shape)
        selected = [int(i), int(j)]

        # Greedily add points with max min-distance to selected set
        while len(selected) < n:
            min_distances = dist_matrix[selected].min(axis=0)
            min_distances[selected] = -1  # Exclude already selected
            next_idx = int(np.argmax(min_distances))
            selected.append(next_idx)

        return selected

    async def _extract_feature_metrics(self, feature_ids: List[int]) -> Optional[pl.DataFrame]:
        """Extract 6D metrics from svm_feature_metrics parquet (pre-aggregated)."""
        if self.data_service._svm_feature_metrics_lazy is None:
            logger.warning("[ColdStart] SVM feature metrics lazy not available")
            return None

        try:
            logger.info(f"[ColdStart] Extracting metrics for {len(feature_ids)} features")

            # Load pre-aggregated metrics (already 1 row per feature)
            df = self.data_service._svm_feature_metrics_lazy.filter(
                pl.col("feature_id").is_in(feature_ids)
            ).select([
                "feature_id",
                "intra_semantic_sim",  # Use as intra_feature_sim
                "score_embedding",
                "score_fuzz",
                "score_detection",
                "explanation_semantic_sim",
                "frac_nonzero"
            ]).collect()

            # Rename intra_semantic_sim to intra_feature_sim for compatibility
            df = df.rename({"intra_semantic_sim": "intra_feature_sim"})

            # Fill null values
            for metric in self.FEATURE_METRICS:
                if metric in df.columns:
                    df = df.with_columns(pl.col(metric).fill_null(0.0))
                else:
                    df = df.with_columns(pl.lit(0.0).alias(metric))

            logger.info(f"[ColdStart] Extracted metrics for {len(df)} features")
            return df

        except Exception as e:
            logger.error(f"[ColdStart] Failed to extract feature metrics: {e}", exc_info=True)
            return None

    async def _extract_pair_feature_metrics(self, feature_ids: List[int]) -> Optional[pl.DataFrame]:
        """Extract pair metrics (same approach as PairSimilarityService)."""
        try:
            lf = self.data_service._df_lazy
            if lf is None:
                return None

            # Base metrics from features.parquet
            base_df = lf.filter(pl.col("feature_id").is_in(feature_ids)).select([
                "feature_id",
                pl.col("frac_nonzero").fill_null(0.0).alias("frac_nonzero"),
            ]).unique(subset=["feature_id"]).collect()
            base_df = base_df.with_columns(pl.col("feature_id").cast(pl.UInt32))

            # Extract activation metrics (intra-feature)
            # Select only needed columns BEFORE collect() to avoid schema issues with new columns
            if self.data_service._activation_display_lazy is not None:
                act_df = self.data_service._activation_display_lazy.filter(
                    pl.col("feature_id").is_in(feature_ids)
                ).select([
                    "feature_id",
                    pl.max_horizontal("char_ngram_max_jaccard", "word_ngram_max_jaccard")
                      .fill_null(0.0).alias("intra_ngram_jaccard"),
                    pl.col("semantic_similarity").fill_null(0.0).alias("intra_semantic_sim")
                ]).unique(subset=["feature_id"]).collect()

                base_df = base_df.join(act_df, on="feature_id", how="left")

            # Extract inter-feature metrics
            # Select only needed columns BEFORE collect() to avoid schema issues
            if self.data_service._interfeature_similarity_lazy is not None:
                # Filter pairs where either feature is in our set
                inter_df = self.data_service._interfeature_similarity_lazy.filter(
                    pl.col("main_feature_id").is_in(feature_ids) | pl.col("similar_feature_id").is_in(feature_ids)
                ).select([
                    "main_feature_id",
                    "similar_feature_id",
                    "char_ngram_max_jaccard",
                    "word_ngram_max_jaccard",
                    "semantic_similarity"
                ]).collect()

                if len(inter_df) > 0:
                    # For each feature, get max inter-feature metrics from pairs it participates in
                    # Process main_feature_id side
                    main_metrics = inter_df.filter(pl.col("main_feature_id").is_in(feature_ids)).group_by("main_feature_id").agg([
                        pl.max("char_ngram_max_jaccard").fill_null(0.0).alias("max_char"),
                        pl.max("word_ngram_max_jaccard").fill_null(0.0).alias("max_word"),
                        pl.max("semantic_similarity").fill_null(0.0).alias("inter_semantic_sim")
                    ]).rename({"main_feature_id": "feature_id"})

                    # Process similar_feature_id side
                    similar_metrics = inter_df.filter(pl.col("similar_feature_id").is_in(feature_ids)).group_by("similar_feature_id").agg([
                        pl.max("char_ngram_max_jaccard").fill_null(0.0).alias("max_char"),
                        pl.max("word_ngram_max_jaccard").fill_null(0.0).alias("max_word"),
                        pl.max("semantic_similarity").fill_null(0.0).alias("inter_semantic_sim")
                    ]).rename({"similar_feature_id": "feature_id"})

                    # Combine both sides, taking max for each feature
                    inter_df = pl.concat([main_metrics, similar_metrics]).group_by("feature_id").agg([
                        pl.max("max_char").alias("max_char"),
                        pl.max("max_word").alias("max_word"),
                        pl.max("inter_semantic_sim").alias("inter_semantic_sim")
                    ]).select([
                        "feature_id",
                        pl.max_horizontal("max_char", "max_word").alias("inter_ngram_jaccard"),
                        "inter_semantic_sim"
                    ])
                    inter_df = inter_df.with_columns(pl.col("feature_id").cast(pl.UInt32))

                    base_df = base_df.join(inter_df, on="feature_id", how="left")

            # Fill nulls for all metrics
            for metric in self.PAIR_METRICS:
                if metric not in base_df.columns:
                    base_df = base_df.with_columns(pl.lit(0.0).alias(metric))
                else:
                    base_df = base_df.with_columns(pl.col(metric).fill_null(0.0))

            return base_df

        except Exception as e:
            logger.error(f"[ColdStart] Failed to extract pair feature metrics: {e}", exc_info=True)
            return None

    def _random_fallback(
        self,
        feature_ids: List[int],
        num_suggestions: int,
        mode: str
    ) -> ColdStartSuggestionsResponse:
        """Fallback to random selection when clustering fails."""
        random.seed(42)
        selected = random.sample(feature_ids, min(num_suggestions, len(feature_ids)))

        suggestions = [
            ColdStartSuggestion(
                id=str(fid),
                cluster_id=i,
                is_medoid=False,
                diversity_reason="Random selection (fallback)"
            )
            for i, fid in enumerate(selected)
        ]

        logger.info(f"[ColdStart] Using random fallback: {len(suggestions)} suggestions")

        return ColdStartSuggestionsResponse(
            suggestions=suggestions,
            total_suggestions=len(suggestions),
            mode=mode,
            num_clusters=len(suggestions),
            cache_hit=False
        )

    def _random_fallback_pairs(
        self,
        pairs: List[dict],
        num_suggestions: int
    ) -> ColdStartSuggestionsResponse:
        """Fallback to random pair selection."""
        random.seed(42)
        selected = random.sample(pairs, min(num_suggestions, len(pairs)))

        suggestions = [
            ColdStartSuggestion(
                id=pair["pair_key"],
                cluster_id=i,
                is_medoid=False,
                diversity_reason="Random selection (fallback)"
            )
            for i, pair in enumerate(selected)
        ]

        logger.info(f"[ColdStart] Using random fallback for pairs: {len(suggestions)} suggestions")

        return ColdStartSuggestionsResponse(
            suggestions=suggestions,
            total_suggestions=len(suggestions),
            mode='pair',
            num_clusters=len(suggestions),
            cache_hit=False
        )

    def clear_cache(self):
        """Clear suggestions cache."""
        self._cache.clear()
        logger.info("[ColdStart] Cache cleared")
