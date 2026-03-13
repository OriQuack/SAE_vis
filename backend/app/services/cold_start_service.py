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
from typing import List, Dict, Optional
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from sklearn.neighbors import NearestNeighbors
from sklearn.ensemble import IsolationForest

from ..models.cold_start import (
    ColdStartSuggestionRequest,
    ColdStartSuggestionsResponse,
    ColdStartSuggestion
)
from .data_constants import SVM_FEATURE_METRICS, SVM_PAIR_INTRA_METRICS
from .data_service import DataService
from .hierarchical_cluster_candidate_service import HierarchicalClusterCandidateService

logger = logging.getLogger(__name__)


class ColdStartService:
    """Service for generating cold-start suggestions using Kennard-Stone algorithm."""

    def __init__(
        self,
        data_service: DataService,
        cluster_service: Optional[HierarchicalClusterCandidateService] = None
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
            str(request.threshold) if request.threshold else "none",
            str(request.random_seed) if request.random_seed is not None else "ks",
            request.method,
            str(request.anomaly_ratio) if request.method == 'typiclust_odal' else ""
        ]
        key_str = "_".join(key_parts)
        return hashlib.md5(key_str.encode()).hexdigest()

    async def get_suggestions(
        self,
        request: ColdStartSuggestionRequest
    ) -> ColdStartSuggestionsResponse:
        """
        Get diverse suggestions using Kennard-Stone algorithm.

        For features: Uses 11D metric space (SVM_FEATURE_METRICS)
        For pairs: Uses 8D pair vectors (4 min/max intra + 4 inter)

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

        # If random_seed provided, use random sampling instead of Kennard-Stone
        if request.random_seed is not None:
            if request.mode == 'feature':
                response = self._random_fallback(
                    request.feature_ids, request.num_suggestions, 'feature',
                    seed=request.random_seed
                )
            else:
                if self.cluster_service is None:
                    raise RuntimeError("Cluster service required for pair mode")
                cluster_result = await self.cluster_service.get_filtered_cluster_pairs(
                    feature_ids=request.feature_ids,
                    threshold=request.threshold
                )
                response = self._random_fallback_pairs(
                    cluster_result["pairs"], request.num_suggestions,
                    seed=request.random_seed
                )
        elif request.mode == 'feature':
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
        """Get feature suggestions using Kennard-Stone on 11D metric space."""
        feature_ids = request.feature_ids
        num_suggestions = min(request.num_suggestions, len(feature_ids))

        # Extract metrics from barycentric parquet (fast path)
        metrics_df = await self._extract_feature_metrics(feature_ids)

        if metrics_df is None or len(metrics_df) < num_suggestions:
            logger.warning(f"[ColdStart] Insufficient metrics: {len(metrics_df) if metrics_df else 0} features")
            return self._random_fallback(feature_ids, num_suggestions, 'feature')

        # Build feature matrix
        feature_id_list = metrics_df["feature_id"].to_list()
        metrics_matrix = metrics_df.select(SVM_FEATURE_METRICS).to_numpy()

        # Standardize
        scaler = StandardScaler()
        metrics_scaled = scaler.fit_transform(metrics_matrix)

        # Select samples via chosen method
        method = request.method
        n_select = min(num_suggestions, len(feature_id_list))
        if method == 'typiclust_odal':
            selected_indices, labels = self._typiclust_odal(metrics_scaled, n_select, request.anomaly_ratio, k_nn=10)
        elif method == 'typiclust':
            selected_indices = self._typiclust(metrics_scaled, n_select, k_nn=10)
            labels = [f"Typiclust sample {i + 1}" for i in range(len(selected_indices))]
        else:
            selected_indices = self._kennard_stone(metrics_scaled, n_select)
            labels = [f"Kennard-Stone sample {i + 1}" for i in range(len(selected_indices))]

        # Build suggestions
        suggestions = []
        for idx, sample_idx in enumerate(selected_indices):
            feature_id = feature_id_list[sample_idx]
            suggestions.append(ColdStartSuggestion(
                id=str(feature_id),
                cluster_id=idx,
                is_medoid=True,
                diversity_reason=labels[idx],
                metrics={
                    metric: float(metrics_matrix[sample_idx, i])
                    for i, metric in enumerate(SVM_FEATURE_METRICS)
                }
            ))

        logger.info(f"[ColdStart] Selected {len(suggestions)} diverse features via {method}")

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
        """Get pair suggestions using Kennard-Stone on 8D pair vectors.

        8D = [min/max intra (4)] + [inter_ngram (1)] + [inter_semantic (1)] + [decoder_sim (1)] + [correlation (1)]
        """
        if self.cluster_service is None:
            raise RuntimeError("Cluster service required for pair mode")

        if request.threshold is None:
            raise ValueError("threshold required for pair mode")

        feature_ids = request.feature_ids
        threshold = request.threshold
        num_suggestions = request.num_suggestions

        # Get all cluster pairs using existing service
        cluster_result = await self.cluster_service.get_filtered_cluster_pairs(
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

        # Extract intra-feature metrics (4D per feature from SVM_PAIR_INTRA_METRICS)
        intra_df = await self._extract_pair_feature_metrics(all_feature_ids)

        if intra_df is None or len(intra_df) == 0:
            return self._random_fallback_pairs(pairs, num_suggestions)

        # Extract inter-feature metrics from svm_pair_metrics parquet
        pair_ids = [(pair["main_id"], pair["similar_id"]) for pair in pairs]
        inter_metrics = await self._extract_pair_inter_metrics(pair_ids)

        # Build lookup for intra metrics
        fid_to_idx = {fid: i for i, fid in enumerate(intra_df["feature_id"].to_list())}
        intra_matrix = intra_df.select(SVM_PAIR_INTRA_METRICS).to_numpy()

        # Build 8D pair vectors
        pair_vectors = []
        valid_pairs = []

        for pair in pairs:
            main_id = pair["main_id"]
            similar_id = pair["similar_id"]

            main_idx = fid_to_idx.get(main_id)
            similar_idx = fid_to_idx.get(similar_id)

            if main_idx is None or similar_idx is None:
                continue

            main_metrics = intra_matrix[main_idx]
            similar_metrics = intra_matrix[similar_idx]

            # Worst-member aggregation: min(consistency), max(variability)
            # SVM_PAIR_INTRA_METRICS: [ngram_jaccard, ngram_jaccard_std, semantic_sim, semantic_sim_std]
            intra_agg = np.empty(4)
            intra_agg[0] = min(main_metrics[0], similar_metrics[0])  # min(ngram_jaccard)
            intra_agg[1] = max(main_metrics[1], similar_metrics[1])  # max(ngram_jaccard_std)
            intra_agg[2] = min(main_metrics[2], similar_metrics[2])  # min(semantic_sim)
            intra_agg[3] = max(main_metrics[3], similar_metrics[3])  # max(semantic_sim_std)

            # Inter: [inter_ngram, inter_semantic, decoder_sim, feature_correlation]
            pair_key = f"{min(main_id, similar_id)}-{max(main_id, similar_id)}"
            inter_data = inter_metrics.get(pair_key, (0.0, 0.0, 0.0, 0.0))

            pair_vector = np.concatenate([
                intra_agg,
                [inter_data[0], inter_data[1], inter_data[2], inter_data[3]]
            ])

            pair_vectors.append(pair_vector)
            valid_pairs.append(pair)

        if len(valid_pairs) < num_suggestions:
            return self._random_fallback_pairs(valid_pairs, min(num_suggestions, len(valid_pairs)))

        # Select diverse samples
        pair_matrix = np.array(pair_vectors)
        scaler = StandardScaler()
        pair_scaled = scaler.fit_transform(pair_matrix)

        method = request.method
        n_select = min(num_suggestions, len(valid_pairs))
        if method == 'typiclust_odal':
            selected_indices, labels = self._typiclust_odal(pair_scaled, n_select, request.anomaly_ratio, k_nn=7)
        elif method == 'typiclust':
            selected_indices = self._typiclust(pair_scaled, n_select, k_nn=10)
            labels = [f"Typiclust sample {i + 1}" for i in range(len(selected_indices))]
        else:
            selected_indices = self._kennard_stone(pair_scaled, n_select)
            labels = [f"Kennard-Stone sample {i + 1}" for i in range(len(selected_indices))]

        suggestions = []
        for idx, sample_idx in enumerate(selected_indices):
            pair = valid_pairs[sample_idx]
            suggestions.append(ColdStartSuggestion(
                id=pair["pair_key"],
                cluster_id=idx,
                is_medoid=True,
                diversity_reason=labels[idx]
            ))

        logger.info(f"[ColdStart] Selected {len(suggestions)} diverse pairs via {method}")

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

    def _typiclust(self, X: np.ndarray, n: int, k_nn: int = 7) -> List[int]:
        """
        Typiclust: KMeans clustering + KNN typicality scoring.

        Selects the most "typical" (densely surrounded) sample from each cluster,
        as opposed to Kennard-Stone which selects maximally spread-out points.

        Args:
            X: Data matrix (n_samples, n_features), should be pre-scaled
            n: Number of samples to select (= number of clusters)
            k_nn: Max nearest neighbors for typicality (adapted per cluster:
                  min(k_nn, cluster_size - 1); clusters < 5 fall back to centroid)

        Returns:
            List of selected sample indices
        """
        n_samples = X.shape[0]
        if n >= n_samples:
            return list(range(n_samples))

        km = KMeans(n_clusters=n, init='k-means++', n_init=10, random_state=42)
        labels = km.fit_predict(X)

        selected: List[int] = []
        for c in range(n):
            cluster_mask = np.where(labels == c)[0]
            if len(cluster_mask) == 0:
                continue

            cluster_size = len(cluster_mask)
            typicality = np.empty(0)

            if cluster_size < 5:
                # Small cluster fallback: nearest to centroid
                dists = np.linalg.norm(X[cluster_mask] - km.cluster_centers_[c], axis=1)
                best_local = int(np.argmin(dists))
                idx = int(cluster_mask[best_local])
                use_typicality = False
            else:
                # Adaptive k: min(k_nn, cluster_size - 1)
                k = min(k_nn, cluster_size - 1)
                cluster_points = X[cluster_mask]
                nn = NearestNeighbors(n_neighbors=k + 1, metric='euclidean')
                nn.fit(cluster_points)
                distances, _ = nn.kneighbors(cluster_points)
                mean_dists = distances[:, 1:].mean(axis=1)  # exclude self
                typicality = 1.0 / (mean_dists + 1e-10)
                best_local = int(np.argmax(typicality))
                idx = int(cluster_mask[best_local])
                use_typicality = True

            # Avoid duplicates
            if idx in selected:
                if use_typicality:
                    order = np.argsort(-typicality)
                    for alt in order:
                        alt_idx = int(cluster_mask[alt])
                        if alt_idx not in selected:
                            idx = alt_idx
                            break
                else:
                    dists = np.linalg.norm(X[cluster_mask] - km.cluster_centers_[c], axis=1)
                    order = np.argsort(dists)
                    for alt in order:
                        alt_idx = int(cluster_mask[alt])
                        if alt_idx not in selected:
                            idx = alt_idx
                            break

            selected.append(idx)

        return selected

    def _typiclust_odal(
        self, X: np.ndarray, n: int, anomaly_ratio: float = 0.5, k_nn: int = 7
    ) -> tuple[List[int], List[str]]:
        """
        Typiclust + Isolation Forest anomaly detection (simplified ODAL).

        Combines KMeans+KNN typicality for coverage with Isolation Forest to
        surface minority candidates in low-density regions.

        Args:
            X: Data matrix (n_samples, n_features), should be pre-scaled
            n: Total number of samples to select
            anomaly_ratio: Fraction of n allocated to anomaly detection
            k_nn: Max nearest neighbors for typicality scoring

        Returns:
            Tuple of (selected indices, diversity reason labels)
        """
        n_samples = X.shape[0]
        if n >= n_samples:
            labels = [f"Typiclust sample {i + 1}" for i in range(n_samples)]
            return list(range(n_samples)), labels

        n_anomaly = max(1, round(n * anomaly_ratio))
        n_typical = n - n_anomaly

        # Step 1: Typical samples via Typiclust
        typical_indices = self._typiclust(X, n_typical, k_nn)
        typical_set = set(typical_indices)

        # Step 2: Anomaly detection via Isolation Forest
        iso = IsolationForest(
            n_estimators=100, contamination=0.1,
            max_features=1.0, max_samples='auto', random_state=42
        )
        iso.fit(X)
        anomaly_scores = iso.decision_function(X)  # lower = more anomalous

        # Sort by anomaly score ascending (most anomalous first),
        # pick top n_anomaly not already in typical set
        sorted_by_anomaly = np.argsort(anomaly_scores)
        anomaly_indices: List[int] = []
        for idx in sorted_by_anomaly:
            if int(idx) not in typical_set:
                anomaly_indices.append(int(idx))
                if len(anomaly_indices) >= n_anomaly:
                    break

        selected = typical_indices + anomaly_indices
        labels = (
            [f"Typiclust sample {i + 1}" for i in range(len(typical_indices))] +
            [f"Anomaly sample {i + 1}" for i in range(len(anomaly_indices))]
        )

        logger.info(
            f"[ColdStart] Typiclust-ODAL: {len(typical_indices)} typical + "
            f"{len(anomaly_indices)} anomaly = {len(selected)} total"
        )

        return selected, labels

    async def _extract_feature_metrics(self, feature_ids: List[int]) -> Optional[pl.DataFrame]:
        """Extract 11D metrics from svm_feature_metrics parquet (pre-aggregated)."""
        if self.data_service._svm_feature_metrics_lazy is None:
            logger.warning("[ColdStart] SVM feature metrics lazy not available")
            return None

        try:
            logger.info(f"[ColdStart] Extracting metrics for {len(feature_ids)} features")

            # Load pre-aggregated metrics (already 1 row per feature)
            df = self.data_service._svm_feature_metrics_lazy.filter(
                pl.col("feature_id").is_in(feature_ids)
            ).collect()

            # Compute log_frac_nonzero from frac_nonzero at runtime
            df = df.with_columns([
                (pl.col("frac_nonzero") + 1e-8).log().alias("log_frac_nonzero")
            ])

            # Fill null values for all metrics
            for metric in SVM_FEATURE_METRICS:
                if metric in df.columns:
                    df = df.with_columns(pl.col(metric).fill_null(0.0))
                else:
                    df = df.with_columns(pl.lit(0.0).alias(metric))

            logger.info(f"[ColdStart] Extracted {len(SVM_FEATURE_METRICS)} metrics for {len(df)} features")
            return df

        except Exception as e:
            logger.error(f"[ColdStart] Failed to extract feature metrics: {e}", exc_info=True)
            return None

    async def _extract_pair_feature_metrics(self, feature_ids: List[int]) -> Optional[pl.DataFrame]:
        """Extract 4D intra-feature metrics (SVM_PAIR_INTRA_METRICS) per feature."""
        try:
            # Fast path: Use pre-computed svm_feature_metrics if available
            if self.data_service._svm_feature_metrics_lazy is not None:
                df = self.data_service._svm_feature_metrics_lazy.filter(
                    pl.col("feature_id").is_in(feature_ids)
                ).select(["feature_id"] + list(SVM_PAIR_INTRA_METRICS)).collect()

                for metric in SVM_PAIR_INTRA_METRICS:
                    if metric in df.columns:
                        df = df.with_columns(pl.col(metric).fill_null(0.0))
                    else:
                        df = df.with_columns(pl.lit(0.0).alias(metric))

                logger.info(f"[ColdStart] Extracted {len(SVM_PAIR_INTRA_METRICS)} intra metrics for {len(df)} features (fast path)")
                return df

            # Fallback: Extract from activation_display
            logger.info("[ColdStart] Falling back to legacy intra-metric extraction")
            lf = self.data_service._df_lazy
            if lf is None:
                return None

            base_df = lf.filter(pl.col("feature_id").is_in(feature_ids)).select(
                ["feature_id"]
            ).unique(subset=["feature_id"]).collect()
            base_df = base_df.with_columns(pl.col("feature_id").cast(pl.UInt32))

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

            for metric in SVM_PAIR_INTRA_METRICS:
                if metric not in base_df.columns:
                    base_df = base_df.with_columns(pl.lit(0.0).alias(metric))
                else:
                    base_df = base_df.with_columns(pl.col(metric).fill_null(0.0))

            return base_df

        except Exception as e:
            logger.error(f"[ColdStart] Failed to extract pair feature metrics: {e}", exc_info=True)
            return None

    async def _extract_pair_inter_metrics(
        self,
        pair_ids: List[tuple]
    ) -> Dict[str, tuple]:
        """Extract inter-feature metrics from svm_pair_metrics parquet.

        Returns:
            Dict mapping pair_key -> (inter_ngram_jaccard, inter_semantic_sim, decoder_sim, feature_correlation)
        """
        if self.data_service._svm_pair_metrics_lazy is None:
            return {}

        try:
            all_feature_ids = list(set(fid for a, b in pair_ids for fid in (a, b)))

            df = self.data_service._svm_pair_metrics_lazy.filter(
                (pl.col("feature_a").is_in(all_feature_ids)) &
                (pl.col("feature_b").is_in(all_feature_ids))
            ).collect()

            if len(df) == 0:
                return {}

            result: Dict[str, tuple] = {}
            for row in df.iter_rows(named=True):
                pair_key = f"{row['feature_a']}-{row['feature_b']}"
                result[pair_key] = (
                    float(row.get('inter_ngram_jaccard', 0.0) or 0.0),
                    float(row.get('inter_semantic_sim', 0.0) or 0.0),
                    float(row.get('decoder_sim', 0.0) or 0.0),
                    float(row.get('feature_correlation', 0.0) or 0.0),
                )

            logger.info(f"[ColdStart] Extracted inter metrics for {len(result)}/{len(pair_ids)} pairs")
            return result

        except Exception as e:
            logger.error(f"[ColdStart] Failed to extract pair inter metrics: {e}", exc_info=True)
            return {}

    def _random_fallback(
        self,
        feature_ids: List[int],
        num_suggestions: int,
        mode: str,
        seed: int = 123
    ) -> ColdStartSuggestionsResponse:
        """Fallback to random selection when clustering fails."""
        random.seed(seed)
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
        num_suggestions: int,
        seed: int = 123
    ) -> ColdStartSuggestionsResponse:
        """Fallback to random pair selection."""
        random.seed(seed)
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
