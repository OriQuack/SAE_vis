"""
UMAP projection service for feature visualization.

Projects features into 2D space using cause-related metrics:
- semantic_similarity (semsim_mean)
- score_detection
- score_embedding
- score_fuzz
"""

import polars as pl
import numpy as np
import logging
import hashlib
from typing import List, Dict, Tuple, Optional, TYPE_CHECKING
from umap import UMAP
from sklearn.preprocessing import StandardScaler

from ..models.umap import (
    UmapProjectionRequest,
    UmapProjectionResponse,
    UmapPoint
)
from .data_constants import (
    COL_FEATURE_ID,
    COL_SEMSIM_MEAN,
    COL_SCORE_DETECTION,
    COL_SCORE_EMBEDDING,
    COL_SCORE_FUZZ
)

if TYPE_CHECKING:
    from .data_service import DataService

logger = logging.getLogger(__name__)


class UMAPService:
    """Service for computing UMAP projections of features."""

    # Metrics used for UMAP embedding (cause-related)
    METRICS = [
        COL_SEMSIM_MEAN,      # semantic_similarity
        COL_SCORE_DETECTION,
        COL_SCORE_EMBEDDING,
        COL_SCORE_FUZZ
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

    async def _extract_metrics(self, feature_ids: List[int]) -> Optional[pl.DataFrame]:
        """
        Extract cause-related metrics for the specified features.

        Args:
            feature_ids: List of feature IDs to extract metrics for

        Returns:
            DataFrame with feature_id and all cause metrics
        """
        try:
            lf = self.data_service._df_lazy

            if lf is None:
                logger.error("Main dataframe not initialized")
                return None

            # Filter to requested features and select required columns
            df = lf.filter(
                pl.col(COL_FEATURE_ID).is_in(feature_ids)
            ).select([
                COL_FEATURE_ID,
                COL_SEMSIM_MEAN,
                COL_SCORE_DETECTION,
                COL_SCORE_EMBEDDING,
                COL_SCORE_FUZZ
            ]).unique(subset=[COL_FEATURE_ID]).collect()

            # Fill null values with 0
            for metric in self.METRICS:
                if metric in df.columns:
                    df = df.with_columns(
                        pl.col(metric).fill_null(0.0)
                    )

            logger.info(f"Extracted metrics for {len(df)} features")
            return df

        except Exception as e:
            logger.error(f"Failed to extract metrics: {e}", exc_info=True)
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
