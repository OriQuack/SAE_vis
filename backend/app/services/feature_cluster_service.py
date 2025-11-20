"""
Distributed features service for evenly sampling features in metric space.

Uses K-Means clustering in the same 9-dimensional metric space as SimilaritySortService
to select n evenly distributed features.
"""

import numpy as np
import logging
from typing import List, Dict, TYPE_CHECKING
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

if TYPE_CHECKING:
    from .similarity_sort_service import SimilaritySortService

logger = logging.getLogger(__name__)


class FeatureClusterService:
    """Service for selecting evenly distributed features in metric space."""

    def __init__(self, similarity_service: "SimilaritySortService"):
        """
        Initialize DistributedFeaturesService.

        Args:
            similarity_service: Instance of SimilaritySortService for metric extraction
        """
        self.similarity_service = similarity_service

    async def get_distributed_features(
        self,
        feature_ids: List[int],
        n: int,
        method: str = 'kmeans'
    ) -> Dict:
        """
        Select n evenly distributed features from the input list.

        Uses K-Means clustering in the 9-dimensional metric space to ensure
        even distribution across the feature space.

        Args:
            feature_ids: List of feature IDs to sample from
            n: Number of features to select
            method: Distribution method ('kmeans' only for now)

        Returns:
            Dict with selected_features, total_available, method_used
        """
        logger.info(f"Selecting {n} distributed features from {len(feature_ids)} candidates using {method}")

        # Validate inputs
        if n <= 0:
            return {
                "selected_features": [],
                "total_available": len(feature_ids),
                "method_used": method
            }

        if n >= len(feature_ids):
            # If n >= total features, return all features
            logger.info(f"Requested {n} features but only {len(feature_ids)} available, returning all")
            return {
                "selected_features": feature_ids,
                "total_available": len(feature_ids),
                "method_used": method
            }

        # Extract 9 metrics using similarity service
        logger.info(f"Extracting metrics for {len(feature_ids)} features")
        metrics_df = await self.similarity_service._extract_metrics(feature_ids)

        if metrics_df is None or len(metrics_df) == 0:
            logger.warning("No metrics extracted, returning empty result")
            return {
                "selected_features": [],
                "total_available": len(feature_ids),
                "method_used": method
            }

        # Convert to numpy arrays
        feature_ids_np = metrics_df["feature_id"].to_numpy()

        # Build metrics matrix (9 columns)
        metrics_matrix = np.column_stack([
            metrics_df[metric].to_numpy()
            for metric in self.similarity_service.METRICS
        ])

        logger.info(f"Built metrics matrix: {metrics_matrix.shape}")

        # Normalize metrics using StandardScaler (same as SVM)
        scaler = StandardScaler()
        scaled_metrics = scaler.fit_transform(metrics_matrix)

        logger.info(f"Normalized metrics: mean={scaled_metrics.mean():.3f}, std={scaled_metrics.std():.3f}")

        # Apply K-Means clustering
        if method == 'kmeans':
            selected_indices = self._kmeans_selection(
                scaled_metrics,
                feature_ids_np,
                n
            )
        else:
            logger.warning(f"Unknown method '{method}', falling back to kmeans")
            selected_indices = self._kmeans_selection(
                scaled_metrics,
                feature_ids_np,
                n
            )

        logger.info(f"Selected {len(selected_indices)} distributed features")

        return {
            "selected_features": [int(x) for x in selected_indices],
            "total_available": len(feature_ids),
            "method_used": method
        }

    def _kmeans_selection(
        self,
        scaled_metrics: np.ndarray,
        feature_ids: np.ndarray,
        n: int
    ) -> List[int]:
        """
        Select n features using K-Means clustering.

        For each cluster, select the feature closest to the cluster centroid.

        Args:
            scaled_metrics: Normalized metric matrix (n_features × 9)
            feature_ids: Feature IDs corresponding to rows
            n: Number of clusters/features to select

        Returns:
            List of selected feature IDs
        """
        logger.info(f"Running K-Means with {n} clusters")

        # Run K-Means clustering
        kmeans = KMeans(
            n_clusters=n,
            n_init=10,  # Number of initializations
            random_state=42,  # For reproducibility
            max_iter=300
        )
        kmeans.fit(scaled_metrics)

        logger.info(f"K-Means converged in {kmeans.n_iter_} iterations")

        # For each cluster, find the feature closest to the centroid
        selected_indices = []
        for i in range(n):
            # Get features in this cluster
            cluster_mask = kmeans.labels_ == i
            cluster_points = scaled_metrics[cluster_mask]
            cluster_feature_ids = feature_ids[cluster_mask]

            if len(cluster_feature_ids) == 0:
                logger.warning(f"Cluster {i} is empty, skipping")
                continue

            # Calculate distances to centroid
            centroid = kmeans.cluster_centers_[i]
            distances = np.linalg.norm(
                cluster_points - centroid,
                axis=1
            )

            # Select closest feature
            closest_idx = np.argmin(distances)
            selected_feature_id = cluster_feature_ids[closest_idx]
            selected_indices.append(selected_feature_id)

            logger.debug(f"Cluster {i}: {len(cluster_feature_ids)} features, selected {selected_feature_id}")

        return selected_indices
