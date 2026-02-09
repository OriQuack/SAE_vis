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
        Load interfeature_similarity.parquet and build lookup structures (OPTIMIZED v2.0).

        Builds three data structures:
        1. pair_data: {f1: {f2: {decoder_sim, semantic_sim}}} - similarity values for all pairs
        2. top_decoder: {f1: set(f2, f3, ...)} - top 10 decoder-similar features per feature
        3. top_semantic: {f1: set(f2, f3, ...)} - top 20 semantic-similar features per feature

        OPTIMIZATION: Uses Polars group_by + struct aggregation instead of iter_rows.
        Expected improvement: 6+ min → ~10-30 sec for 476k rows.

        Args:
            path: Path to interfeature_similarity.parquet file
        """
        import time
        start_time = time.time()

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
        logger.info(f"Loaded {len(df)} interfeature similarity rows in {time.time() - start_time:.2f}s")

        # Filter out rows with null main or similar feature IDs
        df = df.filter(
            pl.col("main_feature_id").is_not_null() &
            pl.col("similar_feature_id").is_not_null()
        )

        # ========================================================================
        # OPTIMIZATION 1: Build pair_data using group_by + struct aggregation
        # Old: iter_rows over 476k rows = O(n) Python iterations
        # New: Polars vectorized group_by = much faster
        # ========================================================================
        step_start = time.time()

        # Aggregate all pairs per main_feature_id into a list of structs
        pair_agg_df = df.group_by("main_feature_id").agg([
            pl.struct([
                pl.col("similar_feature_id"),
                pl.col("decoder_similarity_score").alias("decoder_sim"),
                pl.col("semantic_similarity").alias("semantic_sim")
            ]).alias("pairs")
        ])

        # Build pair_data dict from aggregated result
        # This still uses iteration but over ~16k features instead of 476k rows
        self.pair_data = {}
        for row in pair_agg_df.iter_rows(named=True):
            main_fid = int(row["main_feature_id"])
            pairs_list = row["pairs"]

            self.pair_data[main_fid] = {
                int(p["similar_feature_id"]): {
                    'decoder_sim': float(p["decoder_sim"]) if p["decoder_sim"] is not None else None,
                    'semantic_sim': float(p["semantic_sim"]) if p["semantic_sim"] is not None else None
                }
                for p in pairs_list
            }

        logger.info(f"Built pair_data in {time.time() - step_start:.2f}s ({len(self.pair_data)} features)")

        # ========================================================================
        # OPTIMIZATION 2: Build top_decoder using filter + group_by
        # Filter to decoder/both source types, then aggregate similar_feature_ids
        # ========================================================================
        step_start = time.time()

        decoder_df = df.filter(
            pl.col("source_type").is_in(["decoder", "both"])
        ).group_by("main_feature_id").agg(
            pl.col("similar_feature_id").alias("similar_ids")
        )

        self.top_decoder = {
            int(row["main_feature_id"]): set(int(sid) for sid in row["similar_ids"])
            for row in decoder_df.iter_rows(named=True)
        }

        # Initialize empty sets for features with no decoder neighbors
        for fid in self.pair_data.keys():
            if fid not in self.top_decoder:
                self.top_decoder[fid] = set()

        logger.info(f"Built top_decoder in {time.time() - step_start:.2f}s ({len(self.top_decoder)} features)")

        # ========================================================================
        # OPTIMIZATION 3: Build top_semantic using filter + group_by
        # Filter to semantic/both source types, then aggregate similar_feature_ids
        # ========================================================================
        step_start = time.time()

        semantic_df = df.filter(
            pl.col("source_type").is_in(["semantic", "both"])
        ).group_by("main_feature_id").agg(
            pl.col("similar_feature_id").alias("similar_ids")
        )

        self.top_semantic = {
            int(row["main_feature_id"]): set(int(sid) for sid in row["similar_ids"])
            for row in semantic_df.iter_rows(named=True)
        }

        # Initialize empty sets for features with no semantic neighbors
        for fid in self.pair_data.keys():
            if fid not in self.top_semantic:
                self.top_semantic[fid] = set()

        logger.info(f"Built top_semantic in {time.time() - step_start:.2f}s ({len(self.top_semantic)} features)")

        self._interfeature_loaded = True
        total_time = time.time() - start_time
        logger.info(
            f"✅ Interfeature data loaded (OPTIMIZED): {len(self.pair_data)} features in {total_time:.2f}s"
        )

    def _get_pair_similarities(self, f1: int, f2: int) -> Tuple[Optional[float], Optional[float]]:
        """
        Get both decoder and semantic similarity for a pair in one lookup.

        Checks both directions since similarity is symmetric.

        Args:
            f1: First feature ID
            f2: Second feature ID

        Returns:
            Tuple of (decoder_sim, semantic_sim), either may be None
        """
        if f1 in self.pair_data and f2 in self.pair_data[f1]:
            data = self.pair_data[f1][f2]
            return data['decoder_sim'], data['semantic_sim']
        if f2 in self.pair_data and f1 in self.pair_data[f2]:
            data = self.pair_data[f2][f1]
            return data['decoder_sim'], data['semantic_sim']
        return None, None

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
          4. Fallback (per-feature guarantee):
             - For each feature with no pairs after filtering, add best decoder pair
             - Ensures every feature has at least one pair

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
            "fallback_features": 0,
            "clusters_processed": 0
        }

        MAX_TOTAL_PAIRS = 16384 * 2  # 32,768 pairs max
        pair_limit_reached = False

        for cluster_id, cluster_features in valid_clusters.items():
            if pair_limit_reached:
                break

            stats["clusters_processed"] += 1
            sorted_features = sorted(cluster_features)  # Sort for deterministic f1 < f2

            # Step 1: Generate all pairs within cluster that exist in interfeature data
            # Also build index: feature_id -> list of pairs involving that feature
            cluster_pairs: List[Tuple[int, int, Optional[float], Optional[float]]] = []
            feature_to_pairs: Dict[int, List[int]] = {f: [] for f in sorted_features}

            for i in range(len(sorted_features)):
                for j in range(i + 1, len(sorted_features)):
                    f1, f2 = sorted_features[i], sorted_features[j]

                    # Get both similarities in one lookup
                    decoder_sim, semantic_sim = self._get_pair_similarities(f1, f2)

                    # Only include pairs that exist in interfeature data
                    if decoder_sim is not None or semantic_sim is not None:
                        pair_idx = len(cluster_pairs)
                        cluster_pairs.append((f1, f2, decoder_sim, semantic_sim))
                        feature_to_pairs[f1].append(pair_idx)
                        feature_to_pairs[f2].append(pair_idx)

            stats["pairs_before_filtering"] += len(cluster_pairs)

            # Step 2: Filter by Condition 1 (decoder_sim > similarity_threshold)
            passed_c1 = [
                (f1, f2, d, s) for f1, f2, d, s in cluster_pairs
                if d is not None and d > similarity_threshold
            ]

            # Step 3: Filter by Condition 2 OR 3 (ranking criteria)
            filtered: List[Tuple[int, int, Optional[float], Optional[float], int]] = []
            for f1, f2, decoder_sim, semantic_sim in passed_c1:
                in_top20_semantic = self._in_top_semantic(f1, f2)
                in_top10_decoder = self._in_top_decoder(f1, f2)
                if in_top20_semantic or in_top10_decoder:
                    filtered.append((f1, f2, decoder_sim, semantic_sim, cluster_id))

            # Step 4: Fallback - ensure every FEATURE has at least one pair
            # Track which features already have pairs
            features_with_pairs: Set[int] = set()
            for f1, f2, _, _, _ in filtered:
                features_with_pairs.add(f1)
                features_with_pairs.add(f2)

            # Find features without pairs
            features_without_pairs = set(sorted_features) - features_with_pairs

            # Build set of existing pair tuples once (not per iteration)
            existing_pairs: Set[Tuple[int, int]] = {(p[0], p[1]) for p in filtered}

            # For each feature without pairs, add best available pair
            for fid in features_without_pairs:
                # Use index to get pairs involving this feature (O(1) lookup)
                fid_pair_indices = feature_to_pairs[fid]
                fid_pairs = [
                    cluster_pairs[idx] for idx in fid_pair_indices
                    if cluster_pairs[idx][2] is not None  # decoder_sim not None
                ]

                if fid_pairs:
                    stats["fallback_features"] += 1
                    # Add best decoder pair for this feature
                    best_pair = max(fid_pairs, key=lambda x: x[2])
                    pair_tuple = (best_pair[0], best_pair[1])
                    # Avoid duplicates
                    if pair_tuple not in existing_pairs:
                        filtered.append((*best_pair, cluster_id))
                        existing_pairs.add(pair_tuple)

            # Build pair objects and add to results
            # f1 < f2 guaranteed since sorted_features is sorted and i < j
            cluster_pair_keys = []
            for f1, f2, decoder_sim, semantic_sim, c_id in filtered:
                # f1 < f2 guaranteed since sorted_features is sorted and i < j
                pair_key = f"{f1}-{f2}"

                pair_obj = {
                    "main_id": f1,
                    "similar_id": f2,
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
            f"({stats['fallback_features']} features used fallback)"
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
