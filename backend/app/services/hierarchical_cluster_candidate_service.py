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

    def _cluster_features_at_threshold(
        self,
        feature_ids: List[int],
        threshold: float
    ) -> tuple[Dict[int, int], Dict[int, List[int]], int]:
        """
        Core clustering logic: cut dendrogram and group features into clusters.

        This is the shared foundation for all cluster-based operations.

        Args:
            feature_ids: Feature IDs to cluster
            threshold: Distance threshold for cutting dendrogram (0-1)

        Returns:
            Tuple of:
                - feature_to_cluster: Mapping of feature_id -> cluster_id for ALL features
                - valid_clusters: Mapping of cluster_id -> feature_ids (only clusters with 2+ features)
                - total_clusters: Total number of clusters at this threshold

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

        # Step 1: Cut dendrogram at threshold
        all_labels = fcluster(self.linkage_matrix, t=threshold, criterion='distance')
        total_clusters = len(np.unique(all_labels))

        logger.info(
            f"Dendrogram cut at threshold={threshold} produced {total_clusters} clusters "
            f"for {len(feature_ids)} features"
        )

        # Step 2: Build feature_to_cluster mapping for ALL features (used by frontend)
        feature_to_cluster = {
            feature_id: int(all_labels[feature_id])
            for feature_id in range(self.n_features)
        }

        # Step 3: Build cluster_to_features mapping for requested features only
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
            f"Available features span {len(cluster_to_features)} clusters "
            f"({len(valid_clusters)} have 2+ features)"
        )

        return feature_to_cluster, valid_clusters, total_clusters

    async def get_cluster_candidates(
        self,
        feature_ids: List[int],
        n: int,
        threshold: float = 0.5
    ) -> Dict:
        """
        Get n clusters (each with 2+ features) and return all features grouped by cluster.

        Process:
        1. Use shared clustering logic (_cluster_features_at_threshold)
        2. Randomly select n clusters (with fixed seed for determinism)
        3. Return selected clusters with their feature members

        Args:
            feature_ids: Available feature IDs to sample from
            n: Number of clusters to select
            threshold: Distance threshold for cutting dendrogram (0-1)

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

        logger.info(
            f"Getting cluster candidates: "
            f"n_input={len(feature_ids)}, n_clusters={n}, threshold={threshold}"
        )

        # Use shared clustering logic
        feature_to_cluster, valid_clusters, total_clusters = self._cluster_features_at_threshold(
            feature_ids, threshold
        )

        # Randomly select n clusters (or all if fewer available)
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
        Get ALL cluster-based pairs for a set of features.

        This returns ALL clusters and ALL pairs within those clusters.
        No sampling - complete pair distribution for both candidate display and histogram.

        Process:
        1. Use shared clustering logic (_cluster_features_at_threshold)
        2. Generate ALL pairwise combinations within each cluster
        3. Return pair objects with metadata for frontend use

        Args:
            feature_ids: Feature IDs to process
            threshold: Distance threshold for cutting dendrogram (0-1)

        Returns:
            Dictionary with:
                - pairs: List of pair objects with {main_id, similar_id, pair_key, cluster_id}
                - pair_keys: List of all pair keys (format: "id1-id2") for backward compatibility
                - clusters: List of cluster objects with feature_ids
                - feature_to_cluster: Mapping of ALL feature IDs to cluster IDs
                - total_clusters: Total number of clusters found
                - total_pairs: Total number of pairs generated
                - threshold_used: The threshold value used

        Raises:
            ValueError: If inputs are invalid
        """
        logger.info(
            f"Getting all cluster pairs: "
            f"n_features={len(feature_ids)}, threshold={threshold}"
        )

        # Use shared clustering logic
        feature_to_cluster, valid_clusters, total_clusters = self._cluster_features_at_threshold(
            feature_ids, threshold
        )

        # Generate ALL pairwise combinations within each cluster
        pairs = []
        pair_keys = []
        cluster_details = []

        for cluster_id, cluster_features in valid_clusters.items():
            sorted_features = sorted(cluster_features)
            cluster_pairs = []

            # Generate all pairs within this cluster: C(n, 2)
            for i in range(len(sorted_features)):
                for j in range(i + 1, len(sorted_features)):
                    id1, id2 = sorted_features[i], sorted_features[j]

                    # Canonical pair key: smaller ID first
                    main_id = min(id1, id2)
                    similar_id = max(id1, id2)
                    pair_key = f"{main_id}-{similar_id}"

                    # Create pair object with metadata
                    pair_obj = {
                        "main_id": main_id,
                        "similar_id": similar_id,
                        "pair_key": pair_key,
                        "cluster_id": cluster_id
                    }

                    pairs.append(pair_obj)
                    pair_keys.append(pair_key)
                    cluster_pairs.append(pair_key)

            cluster_details.append({
                "cluster_id": cluster_id,
                "feature_ids": sorted_features,
                "pair_count": len(cluster_pairs)
            })

        total_pairs = len(pairs)
        logger.info(
            f"Generated {total_pairs} pairs from {len(valid_clusters)} clusters "
            f"({total_clusters} total clusters at threshold)"
        )

        return {
            "pairs": pairs,                          # NEW: Full pair objects for frontend
            "pair_keys": pair_keys,                  # For backward compatibility (histogram)
            "clusters": cluster_details,
            "feature_to_cluster": feature_to_cluster,
            "total_clusters": total_clusters,
            "total_pairs": total_pairs,
            "threshold_used": threshold
        }
