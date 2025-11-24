"""
Service for selecting candidate features using hierarchical clustering.

Uses pre-computed agglomerative clustering (average linkage) from decoder
weight similarities to intelligently select diverse candidate features.
"""

import numpy as np
from scipy.cluster.hierarchy import fcluster
from pathlib import Path
from typing import List, Dict, Optional
import random
import logging

logger = logging.getLogger(__name__)


class HierarchicalClusterCandidateService:
    """
    Service for selecting candidate features using hierarchical clustering.

    This service uses a pre-computed agglomerative clustering linkage matrix
    to cut the dendrogram at a specified distance threshold, then randomly
    selects clusters to obtain approximately n candidate features.

    The linkage matrix is loaded once at service initialization for performance.
    """

    def __init__(self, project_root: Path):
        """
        Initialize the service by loading the linkage matrix.

        Args:
            project_root: Path to the project root directory

        Raises:
            FileNotFoundError: If linkage matrix file not found
        """
        linkage_path = (
            project_root /
            "data/feature_similarity/google--gemma-scope-9b-pt-res--layer_30--width_16k--average_l0_120/clustering_linkage.npy"
        )

        if not linkage_path.exists():
            raise FileNotFoundError(
                f"Linkage matrix not found at {linkage_path}. "
                f"Please run the agglomerative clustering preprocessing script."
            )

        logger.info(f"Loading linkage matrix from {linkage_path}")
        self.linkage_matrix = np.load(linkage_path)

        # Linkage matrix has n-1 rows for n features
        self.n_features = self.linkage_matrix.shape[0] + 1

        # Fixed random seed for deterministic cluster selection
        self.random_seed = 42

        logger.info(
            f"Hierarchical cluster candidate service initialized "
            f"(n_features={self.n_features}, linkage_shape={self.linkage_matrix.shape})"
        )

    async def get_cluster_candidates(
        self,
        feature_ids: List[int],
        n: int,
        threshold: float = 0.5
    ) -> Dict:
        """
        Get n clusters (each with 2+ features) and return all features grouped by cluster.

        Process:
        1. Cut dendrogram at specified distance threshold
        2. Assign all features to clusters
        3. Filter to only features in feature_ids
        4. Filter to only clusters with 2+ features
        5. Randomly select n clusters
        6. Return selected clusters with their feature members

        Args:
            feature_ids: Available feature IDs to sample from
            n: Number of clusters to select (default 10)
            threshold: Distance threshold for cutting dendrogram (0-1)
                      Higher threshold = fewer, larger clusters
                      Lower threshold = more, smaller clusters

        Returns:
            Dictionary with:
                - cluster_groups: List of {cluster_id, feature_ids} for selected clusters
                - feature_to_cluster: Mapping of ALL feature IDs to cluster IDs
                - total_clusters: Total clusters at this threshold
                - clusters_selected: Number of clusters selected (may be < n if not enough valid clusters)
                - threshold_used: The threshold value used

        Raises:
            ValueError: If inputs are invalid
        """
        # Validate inputs
        if not feature_ids:
            raise ValueError("feature_ids cannot be empty")

        if n <= 0:
            raise ValueError(f"n must be positive, got {n}")

        if not (0.0 < threshold < 1.0):
            raise ValueError(f"threshold must be in (0, 1), got {threshold}")

        # Validate feature IDs are in valid range
        invalid_features = [fid for fid in feature_ids if fid < 0 or fid >= self.n_features]
        if invalid_features:
            raise ValueError(
                f"Invalid feature IDs (must be 0-{self.n_features-1}): "
                f"{invalid_features[:10]}{'...' if len(invalid_features) > 10 else ''}"
            )

        logger.info(
            f"Getting cluster candidates: "
            f"n_input={len(feature_ids)}, n_clusters={n}, threshold={threshold}"
        )

        # Step 1: Get cluster labels for ALL features by cutting dendrogram
        all_labels = fcluster(self.linkage_matrix, t=threshold, criterion='distance')

        total_clusters = len(np.unique(all_labels))
        logger.info(f"Dendrogram cut at threshold={threshold} produced {total_clusters} clusters")

        # Step 2: Build feature_to_cluster mapping for ALL features
        feature_to_cluster = {
            feature_id: int(all_labels[feature_id])
            for feature_id in range(self.n_features)
        }

        # Step 3: Filter to available features and build cluster_to_features mapping
        cluster_to_features = {}
        for feature_id in feature_ids:
            cluster_id = feature_to_cluster[feature_id]
            if cluster_id not in cluster_to_features:
                cluster_to_features[cluster_id] = []
            cluster_to_features[cluster_id].append(feature_id)

        # Step 4: Filter to only clusters with 2+ features
        valid_clusters = {
            cluster_id: features
            for cluster_id, features in cluster_to_features.items()
            if len(features) >= 2
        }

        logger.info(
            f"Available features span {len(cluster_to_features)} clusters "
            f"({len(valid_clusters)} have 2+ features)"
        )

        # Step 5: Randomly select n clusters (or all if fewer available)
        cluster_groups = self._select_n_clusters(valid_clusters, n)

        clusters_selected = len(cluster_groups)
        logger.info(
            f"Selected {clusters_selected} clusters "
            f"(target was {n})"
        )

        return {
            "cluster_groups": cluster_groups,
            "feature_to_cluster": feature_to_cluster,
            "total_clusters": total_clusters,
            "clusters_selected": clusters_selected,
            "threshold_used": threshold
        }

    def _select_n_clusters(
        self,
        cluster_to_features: Dict[int, List[int]],
        n: int
    ) -> List[Dict]:
        """
        Randomly select n clusters and return them as cluster groups.

        Uses a fixed random seed for deterministic selection across calls.

        Args:
            cluster_to_features: Mapping of cluster ID to list of feature IDs
            n: Number of clusters to select

        Returns:
            List of cluster groups: [{"cluster_id": int, "feature_ids": List[int]}, ...]
        """
        # Use fixed seed for deterministic selection
        random.seed(self.random_seed)

        # Get all cluster IDs and shuffle them
        cluster_ids = list(cluster_to_features.keys())
        random.shuffle(cluster_ids)

        # Select up to n clusters (or all if fewer available)
        selected_cluster_ids = cluster_ids[:n]

        # Build cluster groups
        cluster_groups = [
            {
                "cluster_id": cluster_id,
                "feature_ids": sorted(cluster_to_features[cluster_id])
            }
            for cluster_id in selected_cluster_ids
        ]

        return cluster_groups

    async def get_all_cluster_pairs(
        self,
        feature_ids: List[int],
        threshold: float = 0.5
    ) -> Dict:
        """
        Get ALL cluster-based pair keys for a set of features.

        Unlike get_cluster_candidates which returns n random clusters,
        this returns ALL clusters and ALL pairs within those clusters.
        Used for histogram computation where we need complete pair distribution.

        Process:
        1. Cut dendrogram at threshold
        2. Assign features to clusters
        3. Generate ALL pairwise combinations within each cluster
        4. Return complete list of pair keys

        Args:
            feature_ids: Feature IDs to process
            threshold: Distance threshold for cutting dendrogram (0-1)

        Returns:
            Dictionary with:
                - pair_keys: List of all pair keys (format: "id1-id2")
                - total_clusters: Total number of clusters found
                - total_pairs: Total number of pairs generated
                - clusters: List of cluster objects with feature_ids

        Raises:
            ValueError: If inputs are invalid
        """
        # Validate inputs
        if not feature_ids:
            raise ValueError("feature_ids cannot be empty")

        if not (0.0 < threshold < 1.0):
            raise ValueError(f"threshold must be in (0, 1), got {threshold}")

        # Validate feature IDs are in valid range
        invalid_features = [fid for fid in feature_ids if fid < 0 or fid >= self.n_features]
        if invalid_features:
            raise ValueError(
                f"Invalid feature IDs (must be 0-{self.n_features-1}): "
                f"{invalid_features[:10]}{'...' if len(invalid_features) > 10 else ''}"
            )

        logger.info(
            f"Getting all cluster pairs: "
            f"n_features={len(feature_ids)}, threshold={threshold}"
        )

        # Step 1: Get cluster labels for ALL features by cutting dendrogram
        all_labels = fcluster(self.linkage_matrix, t=threshold, criterion='distance')

        # Step 2: Build feature_to_cluster mapping for requested features only
        feature_to_cluster = {
            feature_id: int(all_labels[feature_id])
            for feature_id in feature_ids
        }

        # Step 3: Build cluster_to_features mapping
        cluster_to_features = {}
        for feature_id in feature_ids:
            cluster_id = feature_to_cluster[feature_id]
            if cluster_id not in cluster_to_features:
                cluster_to_features[cluster_id] = []
            cluster_to_features[cluster_id].append(feature_id)

        # Step 4: Filter to only clusters with 2+ features (can make pairs)
        valid_clusters = {
            cluster_id: features
            for cluster_id, features in cluster_to_features.items()
            if len(features) >= 2
        }

        logger.info(
            f"Found {len(cluster_to_features)} clusters total, "
            f"{len(valid_clusters)} have 2+ features"
        )

        # Step 5: Generate ALL pairwise combinations within each cluster
        pair_keys = []
        cluster_details = []

        for cluster_id, cluster_features in valid_clusters.items():
            sorted_features = sorted(cluster_features)
            cluster_pairs = []

            # Generate all pairs within this cluster
            for i in range(len(sorted_features)):
                for j in range(i + 1, len(sorted_features)):
                    id1, id2 = sorted_features[i], sorted_features[j]
                    # Canonical pair key: smaller ID first
                    pair_key = f"{min(id1, id2)}-{max(id1, id2)}"
                    pair_keys.append(pair_key)
                    cluster_pairs.append(pair_key)

            cluster_details.append({
                "cluster_id": cluster_id,
                "feature_ids": sorted_features,
                "pair_count": len(cluster_pairs)
            })

        total_pairs = len(pair_keys)
        logger.info(f"Generated {total_pairs} pairs from {len(valid_clusters)} clusters")

        return {
            "pair_keys": pair_keys,
            "total_clusters": len(valid_clusters),
            "total_pairs": total_pairs,
            "clusters": cluster_details
        }
