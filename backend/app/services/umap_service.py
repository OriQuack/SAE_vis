"""
UMAP projection service for feature visualization.

Projects features into 2D space using 7 metrics (same as single feature SVM):
- intra_ngram_jaccard: lexical consistency within activations
- intra_semantic_sim: semantic consistency within activations
- decoder_sim: max decoder weight cosine similarity
- score_embedding: embedding-based score
- score_fuzz: fuzzy matching score
- score_detection: detection score
- explanation_semantic_sim: semantic similarity between LLM explanations
"""

import polars as pl
import numpy as np
import logging
import hashlib
from typing import List, Dict, Tuple, Optional, TYPE_CHECKING
from umap import UMAP
from sklearn.preprocessing import StandardScaler

from sklearn.svm import SVC

from ..models.umap import (
    UmapProjectionRequest,
    UmapProjectionResponse,
    UmapPoint
)
from ..models.similarity_sort import DecisionFunctionUmapRequest
from .data_constants import (
    COL_FEATURE_ID
)

# Categories for decision function space (3 categories)
CAUSE_CATEGORIES = [
    'noisy-activation',
    'missed-N-gram',
    'missed-context'
]

if TYPE_CHECKING:
    from .data_service import DataService

logger = logging.getLogger(__name__)


class UMAPService:
    """Service for computing UMAP projections of features."""

    # 7 metrics used for UMAP embedding (same as single feature SVM)
    METRICS = [
        'intra_ngram_jaccard',       # Activation-level: lexical consistency within activations
        'intra_semantic_sim',        # Activation-level: semantic consistency within activations
        'decoder_sim',               # Feature-level: max decoder weight cosine similarity
        'score_embedding',           # Score: embedding-based scoring
        'score_fuzz',                # Score: fuzzy matching score
        'score_detection',           # Score: detection score
        'explanation_semantic_sim',  # Explanation-level: semantic similarity (semsim_mean)
    ]

    def __init__(self, data_service: "DataService"):
        """
        Initialize UMAPService.

        Args:
            data_service: Instance of DataService for data access
        """
        self.data_service = data_service

        # UMAP projection cache: hash -> (feature_ids, coordinates)
        self._umap_cache: Dict[str, Tuple[List[int], np.ndarray]] = {}
        self._max_cache_size = 10

    async def get_umap_projection(
        self,
        request: UmapProjectionRequest
    ) -> UmapProjectionResponse:
        """
        Compute UMAP projection for given features.

        Args:
            request: Request containing feature IDs and UMAP parameters

        Returns:
            Response with 2D coordinates for each feature
        """
        if not self.data_service.is_ready():
            raise RuntimeError("DataService not ready")

        feature_ids = request.feature_ids

        # Validate minimum features
        if len(feature_ids) < 3:
            raise ValueError("UMAP requires at least 3 features")

        # Check cache
        cache_key = self._get_cache_key(
            feature_ids,
            request.n_neighbors,
            request.min_dist,
            request.random_state
        )

        if cache_key in self._umap_cache:
            cached_ids, cached_coords = self._umap_cache[cache_key]
            logger.info(f"Using cached UMAP projection (key: {cache_key[:8]}...)")
            return self._build_response(cached_ids, cached_coords, request)

        # Extract metrics for features
        logger.info(f"Extracting metrics for {len(feature_ids)} features")
        metrics_df = await self._extract_metrics(feature_ids)

        if metrics_df is None or len(metrics_df) == 0:
            logger.warning("No metrics extracted, returning empty result")
            return UmapProjectionResponse(
                points=[],
                total_features=0,
                params_used={}
            )

        # Build feature matrix
        feature_ids_ordered = metrics_df[COL_FEATURE_ID].to_numpy()
        metrics_matrix = np.column_stack([
            metrics_df[metric].to_numpy() for metric in self.METRICS
        ])

        # Standardize features before UMAP
        scaler = StandardScaler()
        metrics_scaled = scaler.fit_transform(metrics_matrix)

        # Compute effective n_neighbors (can't exceed n_samples - 1)
        effective_n_neighbors = min(request.n_neighbors, len(feature_ids_ordered) - 1)
        if effective_n_neighbors < 2:
            effective_n_neighbors = 2

        # Compute UMAP
        logger.info(f"Computing UMAP with n_neighbors={effective_n_neighbors}, min_dist={request.min_dist}")
        umap = UMAP(
            n_components=2,
            n_neighbors=effective_n_neighbors,
            min_dist=request.min_dist,
            random_state=request.random_state,
            metric='euclidean'
        )
        coordinates = umap.fit_transform(metrics_scaled)

        # Cache result
        self._cache_result(cache_key, feature_ids_ordered.tolist(), coordinates)

        logger.info(f"Successfully computed UMAP projection for {len(feature_ids_ordered)} features")

        return self._build_response(feature_ids_ordered.tolist(), coordinates, request)

    async def get_decision_function_umap_projection(
        self,
        request: DecisionFunctionUmapRequest
    ) -> UmapProjectionResponse:
        """
        Compute UMAP projection from SVM decision function space.

        Trains One-vs-Rest SVMs for each category and uses the decision function
        values as a 4D feature vector for each feature.

        Args:
            request: Request containing feature_ids, cause_selections, and UMAP parameters

        Returns:
            Response with 2D coordinates for each feature
        """
        if not self.data_service.is_ready():
            raise RuntimeError("DataService not ready")

        feature_ids = request.feature_ids
        cause_selections = request.cause_selections

        # Validate minimum features
        if len(feature_ids) < 3:
            raise ValueError("UMAP requires at least 3 features")

        # Validate that all categories have at least 1 manual tag
        category_counts = {cat: 0 for cat in CAUSE_CATEGORIES}
        for fid, cat in cause_selections.items():
            if cat in category_counts:
                category_counts[cat] += 1

        missing_categories = [cat for cat, count in category_counts.items() if count == 0]
        if missing_categories:
            raise ValueError(
                f"Missing manual tags for categories: {missing_categories}. "
                "Tag at least one feature per category to enable SVM Space."
            )

        logger.info(f"Computing decision function UMAP for {len(feature_ids)} features")
        logger.info(f"Category counts: {category_counts}")

        # Extract metrics for all features (using same 7 metrics as regular UMAP)
        metrics_df = await self._extract_metrics(feature_ids)

        if metrics_df is None or len(metrics_df) == 0:
            logger.warning("No metrics extracted, returning empty result")
            return UmapProjectionResponse(
                points=[],
                total_features=0,
                params_used={}
            )

        # Build feature matrix
        feature_ids_ordered = metrics_df[COL_FEATURE_ID].to_numpy()
        metrics_matrix = np.column_stack([
            metrics_df[metric].to_numpy() for metric in self.METRICS
        ])

        # Map feature_ids to indices for cause_selections lookup
        feature_id_to_idx = {int(fid): idx for idx, fid in enumerate(feature_ids_ordered)}

        # Train One-vs-Rest SVMs and compute decision function vectors
        decision_vectors = self._compute_decision_function_vectors(
            metrics_matrix,
            feature_ids_ordered,
            cause_selections,
            feature_id_to_idx
        )

        # Standardize decision vectors before UMAP
        scaler = StandardScaler()
        decision_scaled = scaler.fit_transform(decision_vectors)

        # Compute effective n_neighbors
        effective_n_neighbors = min(request.n_neighbors, len(feature_ids_ordered) - 1)
        if effective_n_neighbors < 2:
            effective_n_neighbors = 2

        # Compute UMAP on decision function space
        logger.info(f"Computing UMAP on decision function space with n_neighbors={effective_n_neighbors}")
        umap = UMAP(
            n_components=2,
            n_neighbors=effective_n_neighbors,
            min_dist=request.min_dist,
            random_state=request.random_state,
            metric='euclidean'
        )
        coordinates = umap.fit_transform(decision_scaled)

        logger.info(f"Successfully computed decision function UMAP for {len(feature_ids_ordered)} features")

        # Build response (reuse same format as regular UMAP)
        points = [
            UmapPoint(
                feature_id=int(fid),
                x=float(coordinates[i, 0]),
                y=float(coordinates[i, 1])
            )
            for i, fid in enumerate(feature_ids_ordered)
        ]

        return UmapProjectionResponse(
            points=points,
            total_features=len(points),
            params_used={
                "n_neighbors": request.n_neighbors,
                "min_dist": request.min_dist,
                "random_state": request.random_state if request.random_state else 42
            }
        )

    def _compute_decision_function_vectors(
        self,
        metrics_matrix: np.ndarray,
        feature_ids: np.ndarray,
        cause_selections: Dict[int, str],
        feature_id_to_idx: Dict[int, int]
    ) -> np.ndarray:
        """
        Train One-vs-Rest SVMs and compute decision function vectors.

        Args:
            metrics_matrix: (N, 7) feature metric matrix
            feature_ids: Array of feature IDs
            cause_selections: Dict mapping feature_id to category
            feature_id_to_idx: Dict mapping feature_id to matrix index

        Returns:
            (N, 4) matrix of decision function values
        """
        n_features = len(feature_ids)
        n_categories = len(CAUSE_CATEGORIES)
        decision_vectors = np.zeros((n_features, n_categories))

        # Standardize metrics for SVM training
        scaler = StandardScaler()
        metrics_scaled = scaler.fit_transform(metrics_matrix)

        # Train OvR SVM for each category
        for cat_idx, category in enumerate(CAUSE_CATEGORIES):
            # Build labels: 1 for this category, 0 for all others
            positive_indices = []
            negative_indices = []

            for fid, cat in cause_selections.items():
                if fid in feature_id_to_idx:
                    idx = feature_id_to_idx[fid]
                    if cat == category:
                        positive_indices.append(idx)
                    else:
                        negative_indices.append(idx)

            if len(positive_indices) == 0 or len(negative_indices) == 0:
                # Cannot train SVM without both classes
                logger.warning(f"Skipping SVM for {category}: missing positive or negative samples")
                continue

            # Build training data
            train_indices = positive_indices + negative_indices
            X_train = metrics_scaled[train_indices]
            y_train = np.array([1] * len(positive_indices) + [0] * len(negative_indices))

            # Train SVM
            svm = SVC(
                kernel='rbf',
                C=1.0,
                gamma='scale',
                class_weight='balanced'
            )
            svm.fit(X_train, y_train)

            # Compute decision function for ALL features
            decision_values = svm.decision_function(metrics_scaled)
            decision_vectors[:, cat_idx] = decision_values

            logger.info(f"Trained SVM for {category}: {len(positive_indices)} positive, {len(negative_indices)} negative")

        return decision_vectors

    async def _extract_metrics(self, feature_ids: List[int]) -> Optional[pl.DataFrame]:
        """
        Extract all 7 metrics for the specified features.

        Metrics extracted:
        - From activation_display: intra_ngram_jaccard, intra_semantic_sim
        - From main dataframe: decoder_sim, score_embedding, score_fuzz, score_detection, explanation_semantic_sim

        Args:
            feature_ids: List of feature IDs to extract metrics for

        Returns:
            DataFrame with feature_id and all 7 metrics
        """
        try:
            lf = self.data_service._df_lazy

            if lf is None:
                logger.error("Main dataframe not initialized")
                return None

            # Filter to requested features
            lf = lf.filter(pl.col(COL_FEATURE_ID).is_in(feature_ids))

            # Extract metrics from main dataframe
            base_df = lf.select([
                COL_FEATURE_ID,
                # decoder_sim: max cosine_similarity from decoder_similarity list
                pl.col("decoder_similarity")
                  .list.eval(pl.element().struct.field("cosine_similarity"))
                  .list.max()
                  .fill_null(0.0)
                  .alias("decoder_sim"),
                # Score metrics
                pl.col("score_embedding").fill_null(0.0).alias("score_embedding"),
                pl.col("score_fuzz").fill_null(0.0).alias("score_fuzz"),
                pl.col("score_detection").fill_null(0.0).alias("score_detection"),
                # Explanation semantic similarity (semsim_mean)
                pl.col("semsim_mean").fill_null(0.0).alias("explanation_semantic_sim"),
            ]).unique(subset=[COL_FEATURE_ID]).collect()

            # Cast feature_id to UInt32 to match activation dataframe
            base_df = base_df.with_columns(pl.col(COL_FEATURE_ID).cast(pl.UInt32))

            # Extract activation-level metrics (intra-feature)
            activation_df = await self._extract_activation_metrics(feature_ids)

            # Join activation metrics
            result_df = base_df
            if activation_df is not None:
                result_df = result_df.join(activation_df, on=COL_FEATURE_ID, how="left")

            # Fill null values with 0
            for metric in self.METRICS:
                if metric not in result_df.columns:
                    result_df = result_df.with_columns(pl.lit(0.0).alias(metric))
                else:
                    result_df = result_df.with_columns(
                        pl.col(metric).fill_null(0.0)
                    )

            logger.info(f"Extracted {len(self.METRICS)} metrics for {len(result_df)} features")
            return result_df

        except Exception as e:
            logger.error(f"Failed to extract metrics: {e}", exc_info=True)
            return None

    async def _extract_activation_metrics(self, feature_ids: List[int]) -> Optional[pl.DataFrame]:
        """
        Extract intra-feature activation metrics.

        Args:
            feature_ids: List of feature IDs

        Returns:
            DataFrame with feature_id, intra_ngram_jaccard, intra_semantic_sim
        """
        try:
            # Try optimized activation_display file first
            if self.data_service._activation_display_lazy is not None:
                df = self.data_service._activation_display_lazy.filter(
                    pl.col(COL_FEATURE_ID).is_in(feature_ids)
                ).collect()

                # Extract metrics
                df = df.select([
                    COL_FEATURE_ID,
                    # Max of char and word ngram jaccard
                    pl.max_horizontal("char_ngram_max_jaccard", "word_ngram_max_jaccard")
                      .fill_null(0.0)
                      .alias("intra_ngram_jaccard"),
                    # Semantic similarity
                    pl.col("semantic_similarity")
                      .fill_null(0.0)
                      .alias("intra_semantic_sim")
                ]).unique(subset=[COL_FEATURE_ID])

                logger.info(f"Extracted activation metrics for {len(df)} features")
                return df

            # Fallback to legacy files
            elif self.data_service._activation_similarity_lazy is not None:
                df = self.data_service._activation_similarity_lazy.filter(
                    pl.col(COL_FEATURE_ID).is_in(feature_ids)
                ).collect()

                df = df.select([
                    COL_FEATURE_ID,
                    pl.max_horizontal("char_ngram_max_jaccard", "word_ngram_max_jaccard")
                      .fill_null(0.0)
                      .alias("intra_ngram_jaccard"),
                    pl.col("semantic_similarity")
                      .fill_null(0.0)
                      .alias("intra_semantic_sim")
                ]).unique(subset=[COL_FEATURE_ID])

                logger.info(f"Extracted activation metrics from legacy file for {len(df)} features")
                return df

            else:
                logger.warning("No activation data available")
                return None

        except Exception as e:
            logger.warning(f"Failed to extract activation metrics: {e}")
            return None

    def _get_cache_key(
        self,
        feature_ids: List[int],
        n_neighbors: int,
        min_dist: float,
        random_state: Optional[int]
    ) -> str:
        """Generate unique cache key from parameters."""
        key_str = f"{sorted(feature_ids)}_{n_neighbors}_{min_dist}_{random_state}"
        return hashlib.md5(key_str.encode()).hexdigest()

    def _cache_result(
        self,
        cache_key: str,
        feature_ids: List[int],
        coordinates: np.ndarray
    ):
        """Cache UMAP result with size limit."""
        # Evict oldest if cache full
        if len(self._umap_cache) >= self._max_cache_size:
            oldest_key = next(iter(self._umap_cache))
            self._umap_cache.pop(oldest_key)
            logger.info(f"UMAP cache full, evicted oldest entry")

        self._umap_cache[cache_key] = (feature_ids, coordinates)
        logger.info(f"UMAP projection cached (key: {cache_key[:8]}..., cache size: {len(self._umap_cache)})")

    def _build_response(
        self,
        feature_ids: List[int],
        coordinates: np.ndarray,
        request: UmapProjectionRequest
    ) -> UmapProjectionResponse:
        """Build response from feature IDs and coordinates."""
        points = [
            UmapPoint(
                feature_id=int(fid),
                x=float(coordinates[i, 0]),
                y=float(coordinates[i, 1])
            )
            for i, fid in enumerate(feature_ids)
        ]

        return UmapProjectionResponse(
            points=points,
            total_features=len(points),
            params_used={
                "n_neighbors": request.n_neighbors,
                "min_dist": request.min_dist,
                "random_state": request.random_state if request.random_state else 42
            }
        )

    def clear_cache(self):
        """Clear UMAP projection cache."""
        self._umap_cache.clear()
        logger.info("UMAP projection cache cleared")
