"""
Service for selecting candidate features using hierarchical clustering.

Uses pre-computed agglomerative clustering (average linkage) from decoder
weight similarities to intelligently select diverse candidate features.
"""

import numpy as np
import polars as pl
from scipy.cluster.hierarchy import fcluster
from pathlib import Path
from typing import List, Dict, Optional, Set, Tuple
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
        # Load linkage matrix from output directory
        linkage_path = project_root / "data" / "output" / "clustering_linkage.npy"

        if not linkage_path.exists():
            raise FileNotFoundError(
                f"Linkage matrix not found at {linkage_path}. "
                f"Please run the preprocessing pipeline."
            )

        logger.info(f"Loading linkage matrix from {linkage_path}")
        self.linkage_matrix = np.load(linkage_path)

        # Linkage matrix has n-1 rows for n features
        self.n_features = self.linkage_matrix.shape[0] + 1

        # Feature IDs are 0 to n_features-1, matching matrix indices (identity mapping)
        self.valid_feature_ids = list(range(self.n_features))
        self.feature_id_to_index = {i: i for i in range(self.n_features)}
        self.index_to_feature_id = {i: i for i in range(self.n_features)}

        # Fixed random seed for deterministic cluster selection
        self.random_seed = 42

        # Load interfeature similarity data for filtered pair generation
        interfeature_path = project_root / "data" / "output" / "interfeature_similarity.parquet"
        self._load_interfeature_data(interfeature_path)

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
            feature_ids: Feature IDs to cluster (actual feature IDs, not matrix indices)
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

        # Validate feature IDs are in valid set (features that have clustering data)
        invalid_features = [fid for fid in feature_ids if fid not in self.feature_id_to_index]
        if invalid_features:
            logger.warning(
                f"Found {len(invalid_features)} feature IDs not in clustering data: "
                f"{invalid_features[:20]}{'...' if len(invalid_features) > 20 else ''}"
            )
            # Filter to only valid features
            feature_ids = [fid for fid in feature_ids if fid in self.feature_id_to_index]
            logger.info(f"Continuing with {len(feature_ids)} valid features")

        if not feature_ids:
            raise ValueError("No valid feature IDs after filtering")

        # Step 1: Cut dendrogram at threshold
        all_labels = fcluster(self.linkage_matrix, t=threshold, criterion='distance')
        total_clusters = len(np.unique(all_labels))

        logger.info(
            f"Dendrogram cut at threshold={threshold} produced {total_clusters} clusters "
            f"for {len(feature_ids)} features"
        )

        # Step 2: Build feature_to_cluster mapping for ALL valid features
        # Use the mapping: feature_id -> matrix_index -> cluster_label
        feature_to_cluster = {}
        for feature_id in self.valid_feature_ids:
            matrix_index = self.feature_id_to_index[feature_id]
            feature_to_cluster[feature_id] = int(all_labels[matrix_index])

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

        singleton_count = len(cluster_to_features) - len(valid_clusters)
        logger.info(
            f"Available features span {len(cluster_to_features)} clusters "
            f"({len(valid_clusters)} have 2+ features, {singleton_count} singletons)"
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

        # Generate pairwise combinations within each cluster (with global cap)
        MAX_TOTAL_PAIRS = 16384 * 2  # 32,768 pairs max to prevent memory issues

        pairs = []
        pair_keys = []
        cluster_details = []
        pair_limit_reached = False

        for cluster_id, cluster_features in valid_clusters.items():
            sorted_features = sorted(cluster_features)
            cluster_pairs = []

            # Generate all pairs within this cluster: C(n, 2)
            for i in range(len(sorted_features)):
                if pair_limit_reached:
                    break
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

                    # Check global pair limit
                    if len(pairs) >= MAX_TOTAL_PAIRS:
                        pair_limit_reached = True
                        logger.warning(
                            f"Pair limit reached ({MAX_TOTAL_PAIRS}), stopping pair generation"
                        )
                        break

            cluster_details.append({
                "cluster_id": cluster_id,
                "feature_ids": sorted_features,
                "pair_count": len(cluster_pairs)
            })

            if pair_limit_reached:
                break

        total_pairs = len(pairs)
        logger.info(
            f"Generated {total_pairs} pairs from {len(valid_clusters)} clusters "
            f"({total_clusters} total clusters at threshold)"
        )

        return {
            "pairs": pairs,                          # Full pair objects for frontend
            "pair_keys": pair_keys,                  # For backward compatibility (histogram)
            "clusters": cluster_details,
            "feature_to_cluster": feature_to_cluster,
            "total_clusters": total_clusters,
            "total_pairs": total_pairs,
            "threshold_used": threshold,
            "truncated": pair_limit_reached          # True if pair limit was reached
        }

    def _load_interfeature_data(self, path: Path) -> None:
        """
        Load interfeature_similarity.parquet and build lookup structures.

        Builds three data structures:
        1. pair_data: {f1: {f2: {decoder_sim, semantic_sim}}} - similarity values for all pairs
        2. top_decoder: {f1: set(f2, f3, ...)} - top 10 decoder-similar features per feature
        3. top_semantic: {f1: set(f2, f3, ...)} - top 20 semantic-similar features per feature

        Args:
            path: Path to interfeature_similarity.parquet file
        """
        if not path.exists():
            logger.warning(
                f"Interfeature similarity data not found at {path}. "
                f"Filtered pair generation will not be available."
            )
            self.pair_data: Dict[int, Dict[int, Dict[str, Optional[float]]]] = {}
            self.top_decoder: Dict[int, Set[int]] = {}
            self.top_semantic: Dict[int, Set[int]] = {}
            self._interfeature_loaded = False
            return

        logger.info(f"Loading interfeature similarity data from {path}")

        df = pl.read_parquet(path)
        logger.info(f"Loaded {len(df)} interfeature similarity rows")

        # Initialize data structures
        self.pair_data = {}
        self.top_decoder = {}
        self.top_semantic = {}

        # Process data: group by main_feature_id for efficient processing
        for row in df.iter_rows(named=True):
            main_fid = row['main_feature_id']
            similar_fid = row['similar_feature_id']
            source_type = row['source_type']
            decoder_sim = row['decoder_similarity_score']
            semantic_sim = row['semantic_similarity']

            # Skip rows with null values in required fields
            if main_fid is None or similar_fid is None:
                continue

            main_fid = int(main_fid)
            similar_fid = int(similar_fid)

            # Initialize nested dicts if needed
            if main_fid not in self.pair_data:
                self.pair_data[main_fid] = {}
                self.top_decoder[main_fid] = set()
                self.top_semantic[main_fid] = set()

            # Store pair similarity data
            self.pair_data[main_fid][similar_fid] = {
                'decoder_sim': float(decoder_sim) if decoder_sim is not None else None,
                'semantic_sim': float(semantic_sim) if semantic_sim is not None else None
            }

            # Track top decoder features (source_type = 'decoder' or 'both')
            if source_type in ('decoder', 'both'):
                self.top_decoder[main_fid].add(similar_fid)

            # Track top semantic features (source_type = 'semantic' or 'both')
            if source_type in ('semantic', 'both'):
                self.top_semantic[main_fid].add(similar_fid)

        self._interfeature_loaded = True
        logger.info(
            f"Interfeature data loaded: {len(self.pair_data)} features with similarity data"
        )

    def _get_decoder_sim(self, f1: int, f2: int) -> Optional[float]:
        """
        Get decoder similarity for a pair from interfeature data.

        Checks both directions since similarity is symmetric.

        Args:
            f1: First feature ID
            f2: Second feature ID

        Returns:
            Decoder similarity value if found, None otherwise
        """
        if f1 in self.pair_data and f2 in self.pair_data[f1]:
            return self.pair_data[f1][f2]['decoder_sim']
        if f2 in self.pair_data and f1 in self.pair_data[f2]:
            return self.pair_data[f2][f1]['decoder_sim']
        return None

    def _get_semantic_sim(self, f1: int, f2: int) -> Optional[float]:
        """
        Get semantic similarity for a pair from interfeature data.

        Checks both directions since similarity is symmetric.

        Args:
            f1: First feature ID
            f2: Second feature ID

        Returns:
            Semantic similarity value if found, None otherwise
        """
        if f1 in self.pair_data and f2 in self.pair_data[f1]:
            return self.pair_data[f1][f2]['semantic_sim']
        if f2 in self.pair_data and f1 in self.pair_data[f2]:
            return self.pair_data[f2][f1]['semantic_sim']
        return None

    def _in_top_decoder(self, f1: int, f2: int) -> bool:
        """
        Check if f1 is in f2's top-10 decoder OR f2 is in f1's top-10 decoder.

        Args:
            f1: First feature ID
            f2: Second feature ID

        Returns:
            True if either feature is in the other's top-10 decoder list
        """
        return (
            f2 in self.top_decoder.get(f1, set()) or
            f1 in self.top_decoder.get(f2, set())
        )

    def _in_top_semantic(self, f1: int, f2: int) -> bool:
        """
        Check if f1 is in f2's top-20 semantic OR f2 is in f1's top-20 semantic.

        Args:
            f1: First feature ID
            f2: Second feature ID

        Returns:
            True if either feature is in the other's top-20 semantic list
        """
        return (
            f2 in self.top_semantic.get(f1, set()) or
            f1 in self.top_semantic.get(f2, set())
        )

    async def get_filtered_cluster_pairs(
        self,
        feature_ids: List[int],
        threshold: float = 0.5
    ) -> Dict:
        """
        Get cluster-based pairs filtered by decoder similarity and ranking criteria.

        Algorithm:
        For each cluster at threshold T:
          1. Generate all pairwise combinations within cluster
          2. Filter by Condition 1 (REQUIRED): decoder_similarity > (1 - T)
          3. From remaining, keep those meeting Condition 2 OR 3:
             - Condition 2: A in B's Top 20 semantic OR B in A's Top 20 semantic
             - Condition 3: A in B's Top 10 decoder OR B in A's Top 10 decoder
          4. Fallback (if no pairs remain after filtering):
             - Add pair with greatest decoder_similarity (ignores Condition 1)
             - Add pair with greatest semantic_similarity (ignores Condition 1)
             - May be same pair (allowed)

        Args:
            feature_ids: Feature IDs to process
            threshold: Distance threshold for cutting dendrogram (0-1)

        Returns:
            Dictionary with:
                - pairs: List of pair objects {main_id, similar_id, pair_key, cluster_id}
                - pair_keys: List of all pair keys for backward compatibility
                - clusters: Cluster metadata
                - stats: Filtering statistics
                - feature_to_cluster: Mapping of ALL feature IDs to cluster IDs
                - total_clusters: Total number of clusters
                - total_pairs: Total pairs after filtering
                - threshold_used: The threshold value used

        Raises:
            ValueError: If inputs are invalid or interfeature data not loaded
        """
        if not self._interfeature_loaded:
            raise ValueError(
                "Interfeature similarity data not loaded. "
                "Cannot use filtered pair generation."
            )

        logger.info(
            f"Getting filtered cluster pairs: "
            f"n_features={len(feature_ids)}, threshold={threshold}"
        )

        # Use shared clustering logic
        feature_to_cluster, valid_clusters, total_clusters = self._cluster_features_at_threshold(
            feature_ids, threshold
        )

        # Similarity threshold: distance threshold T means similarity > (1 - T)
        similarity_threshold = 1.0 - threshold

        all_pairs = []
        pair_keys = []
        cluster_details = []
        stats = {
            "pairs_before_filtering": 0,
            "pairs_after_filtering": 0,
            "fallback_clusters": 0,
            "clusters_processed": 0
        }

        MAX_TOTAL_PAIRS = 16384 * 2  # 32,768 pairs max
        pair_limit_reached = False

        for cluster_id, cluster_features in valid_clusters.items():
            if pair_limit_reached:
                break

            stats["clusters_processed"] += 1
            sorted_features = sorted(cluster_features)

            # Step 1: Generate all pairs within cluster that exist in interfeature data
            cluster_pairs: List[Tuple[int, int, Optional[float], Optional[float]]] = []
            for i in range(len(sorted_features)):
                for j in range(i + 1, len(sorted_features)):
                    f1, f2 = sorted_features[i], sorted_features[j]

                    # Get similarity values from interfeature data
                    decoder_sim = self._get_decoder_sim(f1, f2)
                    semantic_sim = self._get_semantic_sim(f1, f2)

                    # Only include pairs that exist in interfeature data
                    if decoder_sim is not None or semantic_sim is not None:
                        cluster_pairs.append((f1, f2, decoder_sim, semantic_sim))

            stats["pairs_before_filtering"] += len(cluster_pairs)

            # Step 2: Filter by Condition 1 (decoder_sim > similarity_threshold)
            passed_c1 = [
                (f1, f2, d, s) for f1, f2, d, s in cluster_pairs
                if d is not None and d > similarity_threshold
            ]

            # Step 3: Filter by Condition 2 OR 3 (ranking criteria)
            filtered = []
            for f1, f2, decoder_sim, semantic_sim in passed_c1:
                in_top20_semantic = self._in_top_semantic(f1, f2)
                in_top10_decoder = self._in_top_decoder(f1, f2)
                if in_top20_semantic or in_top10_decoder:
                    filtered.append((f1, f2, decoder_sim, semantic_sim, cluster_id))

            # Step 4: Fallback if no pairs remain
            if not filtered and cluster_pairs:
                stats["fallback_clusters"] += 1

                # Best decoder pair (ignore C1)
                pairs_with_decoder = [(f1, f2, d, s) for f1, f2, d, s in cluster_pairs if d is not None]
                if pairs_with_decoder:
                    best_decoder = max(pairs_with_decoder, key=lambda x: x[2])
                    filtered.append((*best_decoder, cluster_id))

                    # Best semantic pair (may be same as best_decoder)
                    pairs_with_semantic = [(f1, f2, d, s) for f1, f2, d, s in cluster_pairs if s is not None]
                    if pairs_with_semantic:
                        best_semantic = max(pairs_with_semantic, key=lambda x: x[3])
                        # Only add if different from best_decoder
                        if (best_semantic[0], best_semantic[1]) != (best_decoder[0], best_decoder[1]):
                            filtered.append((*best_semantic, cluster_id))

            # Build pair objects and add to results
            cluster_pair_keys = []
            for f1, f2, decoder_sim, semantic_sim, c_id in filtered:
                main_id = min(f1, f2)
                similar_id = max(f1, f2)
                pair_key = f"{main_id}-{similar_id}"

                pair_obj = {
                    "main_id": main_id,
                    "similar_id": similar_id,
                    "pair_key": pair_key,
                    "cluster_id": c_id
                }

                all_pairs.append(pair_obj)
                pair_keys.append(pair_key)
                cluster_pair_keys.append(pair_key)

                # Check global pair limit
                if len(all_pairs) >= MAX_TOTAL_PAIRS:
                    pair_limit_reached = True
                    logger.warning(
                        f"Pair limit reached ({MAX_TOTAL_PAIRS}), stopping pair generation"
                    )
                    break

            stats["pairs_after_filtering"] += len(cluster_pair_keys)

            cluster_details.append({
                "cluster_id": cluster_id,
                "feature_ids": sorted_features,
                "pair_count": len(cluster_pair_keys)
            })

        total_pairs = len(all_pairs)
        logger.info(
            f"Filtered pair generation complete: "
            f"{stats['pairs_before_filtering']} → {total_pairs} pairs "
            f"({stats['fallback_clusters']} clusters used fallback)"
        )

        return {
            "pairs": all_pairs,
            "pair_keys": pair_keys,
            "clusters": cluster_details,
            "feature_to_cluster": feature_to_cluster,
            "total_clusters": total_clusters,
            "total_pairs": total_pairs,
            "threshold_used": threshold,
            "truncated": pair_limit_reached,
            "stats": stats
        }
