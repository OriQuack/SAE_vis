#!/usr/bin/env python3
"""
Compute agglomerative clustering tree from SAE decoder weight similarities.

This script loads pre-computed feature similarities and performs hierarchical
clustering using average linkage to identify feature groupings at various
distance thresholds. The clustering results allow reconstruction of cluster
memberships at any threshold value using the saved linkage matrix.

Input:
- feature_similarities.json: Top-10 cosine similarities per feature from decoder weights

Output:
- first_merge_clustering.parquet: Feature-level first merge distances
- clustering_linkage.npy: Scipy linkage matrix for threshold reconstruction
- first_merge_clustering.parquet.metadata.json: Processing statistics

Features:
- Builds full 16384×16384 distance matrix from sparse top-10 neighbors
- Uses average linkage agglomerative clustering (sklearn)
- Tracks first merge distance (singleton → cluster transition)
- Saves scipy-compatible linkage matrix for flexible threshold queries

Usage:
    python 4_agglomerative_clustering.py
    python 4_agglomerative_clustering.py --config ../config/4_agglomerative_clustering.json

Example:
    # Run with default config
    python 4_agglomerative_clustering.py

    # Later, reconstruct clusters at threshold 0.3:
    from scipy.cluster.hierarchy import fcluster
    linkage = np.load("clustering_linkage.npy")
    clusters = fcluster(linkage, t=0.3, criterion='distance')
"""

import json
import logging
import argparse
import time
import numpy as np
import polars as pl
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from scipy.cluster.hierarchy import linkage
from scipy.spatial.distance import squareform

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def find_project_root() -> Path:
    """Find project root by looking for 'interface' directory."""
    project_root = Path.cwd()
    while project_root.name != "interface" and project_root.parent != project_root:
        project_root = project_root.parent

    if project_root.name == "interface":
        return project_root
    else:
        raise RuntimeError("Could not find interface project root")


def load_config(config_path: Optional[str] = None) -> Dict:
    """Load configuration from JSON file or use defaults."""
    default_config = {
        "sae_id": "google--gemma-scope-9b-pt-res--layer_30--width_16k--average_l0_120",
        "input_path": "data/feature_similarity/google--gemma-scope-9b-pt-res--layer_30--width_16k--average_l0_120/feature_similarities.json",
        "output_dir": "data/feature_similarity/google--gemma-scope-9b-pt-res--layer_30--width_16k--average_l0_120",
        "output_files": {
            "first_merge_parquet": "first_merge_clustering.parquet",
            "linkage_matrix": "clustering_linkage.npy",
            "metadata": "first_merge_clustering.parquet.metadata.json"
        },
        "processing_parameters": {
            "linkage_method": "average",
            "default_distance": 1.0,
            "expected_n_features": 16384
        },
        # Optional: Filter to only features present in this parquet file
        # If specified, clustering will only include these features
        "valid_features_parquet": None  # e.g., "data/master/feature_analysis.parquet"
    }

    if config_path and Path(config_path).exists():
        logger.info(f"Loading config from {config_path}")
        with open(config_path, 'r') as f:
            file_config = json.load(f)
        # Deep merge
        for key in file_config:
            if isinstance(file_config[key], dict) and key in default_config:
                if isinstance(default_config[key], dict):
                    default_config[key].update(file_config[key])
                else:
                    default_config[key] = file_config[key]
            else:
                default_config[key] = file_config[key]
    else:
        logger.info("Using default configuration")

    return default_config


class AgglomerativeClusteringProcessor:
    """Process feature similarities to compute agglomerative clustering tree."""

    def __init__(self, config: Dict):
        """Initialize processor with configuration."""
        self.config = config
        self.project_root = find_project_root()

        # Resolve paths
        self.input_path = self._resolve_path(config["input_path"])
        self.output_dir = self._resolve_path(config["output_dir"])

        # Configuration
        self.sae_id = config["sae_id"]
        self.linkage_method = config["processing_parameters"]["linkage_method"]
        self.default_distance = config["processing_parameters"]["default_distance"]
        self.expected_n_features = config["processing_parameters"]["expected_n_features"]

        # Output files
        self.first_merge_path = self.output_dir / config["output_files"]["first_merge_parquet"]
        self.linkage_path = self.output_dir / config["output_files"]["linkage_matrix"]
        self.metadata_path = self.output_dir / config["output_files"]["metadata"]

        # Statistics tracking
        self.stats = {
            "n_features": 0,
            "n_neighbors_loaded": 0,
            "n_distances_filled": 0,
            "matrix_memory_mb": 0,
            "min_first_merge": float('inf'),
            "max_first_merge": 0.0,
            "mean_first_merge": 0.0,
            "clustering_time_seconds": 0.0,
            "total_processing_time_seconds": 0.0
        }

        # Load valid feature IDs if specified (for filtering to features with scores only)
        self.valid_feature_ids: Optional[List[int]] = None
        self.feature_id_to_index: Optional[Dict[int, int]] = None
        self.index_to_feature_id: Optional[Dict[int, int]] = None

        # Option 1: Load from scores directory (union of all features with scores)
        valid_features_scores_dir = config.get("valid_features_scores_dir")
        if valid_features_scores_dir:
            self._load_valid_features_from_scores(valid_features_scores_dir)
        else:
            # Option 2: Load from parquet file (legacy)
            valid_features_path = config.get("valid_features_parquet")
            if valid_features_path:
                self._load_valid_features_from_parquet(valid_features_path)

    def _load_valid_features_from_scores(self, scores_dir: str):
        """Load valid feature IDs from scores directory (union of all features with scores)."""
        import os

        resolved_dir = self._resolve_path(scores_dir)
        if not resolved_dir.exists():
            logger.warning(f"Scores directory not found: {resolved_dir}")
            return

        logger.info(f"Loading valid feature IDs from scores directory: {resolved_dir}")

        # Find union of all features with scores
        all_features = set()
        score_files_loaded = 0

        for subdir in os.listdir(resolved_dir):
            scores_file = resolved_dir / subdir / "scores.json"
            if scores_file.exists():
                try:
                    with open(scores_file, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    latent_scores = data.get("latent_scores", {})
                    features = {int(fid) for fid in latent_scores.keys()}
                    logger.info(f"  {subdir}: {len(features):,} features")
                    all_features.update(features)
                    score_files_loaded += 1
                except (json.JSONDecodeError, FileNotFoundError) as e:
                    logger.warning(f"Error loading {scores_file}: {e}")

        if not all_features:
            logger.warning("No valid features found in scores directory")
            return

        # Get unique feature IDs sorted
        self.valid_feature_ids = sorted(all_features)

        # Create bidirectional mappings
        self.feature_id_to_index = {fid: idx for idx, fid in enumerate(self.valid_feature_ids)}
        self.index_to_feature_id = {idx: fid for idx, fid in enumerate(self.valid_feature_ids)}

        logger.info(f"Loaded {len(self.valid_feature_ids):,} valid feature IDs from {score_files_loaded} score files")
        logger.info(f"Feature ID range: {min(self.valid_feature_ids)} to {max(self.valid_feature_ids)}")

        # Update expected_n_features to match
        self.expected_n_features = len(self.valid_feature_ids)
        self.stats["valid_features_filtered"] = True
        self.stats["valid_features_source"] = "scores_dir"
        self.stats["original_n_features"] = 16384  # Original SAE size

    def _load_valid_features_from_parquet(self, parquet_path: str):
        """Load valid feature IDs from a parquet file and create mappings."""
        resolved_path = self._resolve_path(parquet_path)
        if not resolved_path.exists():
            logger.warning(f"Valid features parquet not found: {resolved_path}")
            return

        logger.info(f"Loading valid feature IDs from {resolved_path}")
        df = pl.read_parquet(resolved_path, columns=["feature_id"])

        # Get unique feature IDs sorted
        self.valid_feature_ids = sorted(df["feature_id"].unique().to_list())

        # Create bidirectional mappings
        self.feature_id_to_index = {fid: idx for idx, fid in enumerate(self.valid_feature_ids)}
        self.index_to_feature_id = {idx: fid for idx, fid in enumerate(self.valid_feature_ids)}

        logger.info(f"Loaded {len(self.valid_feature_ids):,} valid feature IDs")
        logger.info(f"Feature ID range: {min(self.valid_feature_ids)} to {max(self.valid_feature_ids)}")

        # Update expected_n_features to match
        self.expected_n_features = len(self.valid_feature_ids)
        self.stats["valid_features_filtered"] = True
        self.stats["valid_features_source"] = "parquet"
        self.stats["original_n_features"] = 16384  # Original SAE size

    def _resolve_path(self, path_str: str) -> Path:
        """Resolve path relative to project root if not absolute."""
        path = Path(path_str)
        if not path.is_absolute():
            return self.project_root / path
        return path

    def load_similarity_data(self) -> Tuple[int, List[Dict]]:
        """
        Load feature similarities from JSON file.

        Returns:
            Tuple of (n_features, feature_mappings)
        """
        logger.info(f"Loading similarity data from {self.input_path}")

        if not self.input_path.exists():
            raise FileNotFoundError(
                f"Required file not found: {self.input_path}\n"
                f"Please run: python 0_feature_similarities.py"
            )

        try:
            with open(self.input_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except (json.JSONDecodeError, FileNotFoundError) as e:
            logger.error(f"Error loading {self.input_path}: {e}")
            raise

        n_features = data.get("n_features", self.expected_n_features)
        feature_mappings = data.get("feature_mappings", [])

        logger.info(f"Loaded {len(feature_mappings):,} feature mappings")
        logger.info(f"Expected n_features: {n_features:,}")

        if n_features != self.expected_n_features:
            logger.warning(
                f"Feature count mismatch: expected {self.expected_n_features:,}, "
                f"got {n_features:,}"
            )

        self.stats["n_features"] = n_features

        return n_features, feature_mappings

    def build_distance_matrix(self, n_features: int, feature_mappings: List[Dict]) -> np.ndarray:
        """
        Build full pairwise distance matrix from sparse top-10 similarities.

        Args:
            n_features: Total number of features (or number of valid features if filtered)
            feature_mappings: List of feature similarity data

        Returns:
            Symmetric distance matrix (n_features × n_features)
        """
        # Use valid_feature_ids size if filtering is enabled
        matrix_size = len(self.valid_feature_ids) if self.valid_feature_ids else n_features
        logger.info(f"Building {matrix_size:,} × {matrix_size:,} distance matrix")

        if self.valid_feature_ids:
            logger.info(f"Filtering to {len(self.valid_feature_ids):,} valid features (from {n_features:,} total)")

        # Initialize with default distance (1.0) for non-neighbors
        distance_matrix = np.full(
            (matrix_size, matrix_size),
            self.default_distance,
            dtype=np.float32
        )

        # Set diagonal to 0 (self-distance)
        np.fill_diagonal(distance_matrix, 0.0)

        # Track matrix memory
        matrix_size_mb = (matrix_size * matrix_size * 4) / (1024**2)  # float32 = 4 bytes
        self.stats["matrix_memory_mb"] = matrix_size_mb
        logger.info(f"Distance matrix size: {matrix_size_mb:.2f} MB")

        # Fill in known distances from top-10 neighbors
        neighbor_count = 0
        skipped_count = 0

        for feature in feature_mappings:
            source_id = feature.get("source_feature_id")
            top_10_neighbors = feature.get("top_10_neighbors", [])

            if source_id is None:
                logger.warning(f"Feature missing source_feature_id: {feature}")
                continue

            # Skip if source is not in valid features
            if self.valid_feature_ids and source_id not in self.feature_id_to_index:
                skipped_count += 1
                continue

            # Get matrix index for source
            source_idx = self.feature_id_to_index[source_id] if self.feature_id_to_index else source_id

            for neighbor in top_10_neighbors:
                neighbor_id = neighbor.get("feature_id")
                cosine_similarity = neighbor.get("cosine_similarity")

                if neighbor_id is None or cosine_similarity is None:
                    continue

                # Skip if neighbor is not in valid features
                if self.valid_feature_ids and neighbor_id not in self.feature_id_to_index:
                    continue

                # Get matrix index for neighbor
                neighbor_idx = self.feature_id_to_index[neighbor_id] if self.feature_id_to_index else neighbor_id

                # Convert cosine similarity to distance: distance = 1 - similarity
                distance = 1.0 - cosine_similarity

                # Fill symmetrically
                distance_matrix[source_idx, neighbor_idx] = distance
                distance_matrix[neighbor_idx, source_idx] = distance

                neighbor_count += 1

        if skipped_count > 0:
            logger.info(f"Skipped {skipped_count:,} features not in valid set")

        self.stats["n_neighbors_loaded"] = neighbor_count

        # Count how many distances are default (not from neighbors)
        n_default = np.sum(distance_matrix == self.default_distance)
        # Subtract diagonal (which is 0, not default)
        n_default -= n_features
        self.stats["n_distances_filled"] = n_features * n_features - n_features - n_default

        logger.info(f"Filled {neighbor_count:,} neighbor distances")
        logger.info(f"Remaining {n_default:,} pairs use default distance ({self.default_distance})")

        return distance_matrix

    def perform_clustering(self, distance_matrix: np.ndarray) -> np.ndarray:
        """
        Perform agglomerative clustering using scipy.

        Args:
            distance_matrix: Symmetric pairwise distance matrix

        Returns:
            Linkage matrix (n_features-1 × 4)
        """
        logger.info(f"Performing agglomerative clustering with {self.linkage_method} linkage")

        start_time = time.time()

        # Convert to condensed distance matrix (upper triangle only)
        logger.info("Converting to condensed distance matrix...")
        condensed = squareform(distance_matrix, checks=False)

        # Perform hierarchical clustering
        logger.info("Running hierarchical clustering...")
        linkage_matrix = linkage(condensed, method=self.linkage_method)

        elapsed = time.time() - start_time
        self.stats["clustering_time_seconds"] = elapsed

        logger.info(f"Clustering completed in {elapsed:.2f} seconds")
        logger.info(f"Linkage matrix shape: {linkage_matrix.shape}")

        return linkage_matrix

    def extract_first_merge_distances(
        self,
        n_features: int,
        linkage_matrix: np.ndarray
    ) -> np.ndarray:
        """
        Extract first merge distance for each feature.

        The first merge distance is the threshold at which a feature transitions
        from being a singleton to being part of a cluster.

        Args:
            n_features: Total number of features
            linkage_matrix: Scipy linkage matrix

        Returns:
            Array of first merge distances (length n_features)
        """
        logger.info("Extracting first merge distances for each feature...")

        # Initialize with infinity (features that never merge)
        first_merge = np.full(n_features, np.inf, dtype=np.float64)

        # Linkage matrix format: [cluster1_id, cluster2_id, distance, size]
        # IDs < n_features are original features (singletons)
        # IDs >= n_features are newly formed clusters

        for cluster1, cluster2, distance, size in linkage_matrix:
            cluster1 = int(cluster1)
            cluster2 = int(cluster2)

            # Check if cluster1 is an original feature (singleton)
            if cluster1 < n_features:
                first_merge[cluster1] = min(first_merge[cluster1], distance)

            # Check if cluster2 is an original feature (singleton)
            if cluster2 < n_features:
                first_merge[cluster2] = min(first_merge[cluster2], distance)

        # Calculate statistics
        finite_merges = first_merge[np.isfinite(first_merge)]

        if len(finite_merges) > 0:
            self.stats["min_first_merge"] = float(finite_merges.min())
            self.stats["max_first_merge"] = float(finite_merges.max())
            self.stats["mean_first_merge"] = float(finite_merges.mean())

            logger.info(f"First merge distance statistics:")
            logger.info(f"  Min: {self.stats['min_first_merge']:.6f}")
            logger.info(f"  Max: {self.stats['max_first_merge']:.6f}")
            logger.info(f"  Mean: {self.stats['mean_first_merge']:.6f}")
            logger.info(f"  Features with finite merge: {len(finite_merges):,} / {n_features:,}")
        else:
            logger.warning("No features have finite merge distances")

        return first_merge

    def save_results(self, n_features: int, first_merge: np.ndarray, linkage_matrix: np.ndarray):
        """
        Save clustering results to parquet, numpy, and metadata files.

        Args:
            n_features: Total number of features (may be filtered count)
            first_merge: First merge distances per feature (indexed by matrix position)
            linkage_matrix: Scipy linkage matrix
        """
        # Create output directory
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # 1. Save first merge distances as parquet
        logger.info(f"Saving first merge distances to {self.first_merge_path}")

        # Use original feature_ids if filtering was applied, otherwise 0 to n-1
        if self.valid_feature_ids:
            feature_ids = np.array(self.valid_feature_ids, dtype=np.int32)
            logger.info(f"Using original feature IDs from valid_features_parquet")
        else:
            feature_ids = np.arange(n_features, dtype=np.int32)

        df = pl.DataFrame({
            "feature_id": feature_ids,
            "first_merge_distance": first_merge.astype(np.float32)
        })

        df.write_parquet(self.first_merge_path)
        logger.info(f"Saved {len(df):,} rows to parquet")

        # 2. Save linkage matrix as numpy array
        logger.info(f"Saving linkage matrix to {self.linkage_path}")
        np.save(self.linkage_path, linkage_matrix)
        logger.info(f"Saved linkage matrix with shape {linkage_matrix.shape}")

        # 3. Save metadata
        logger.info(f"Saving metadata to {self.metadata_path}")

        # Convert numpy types to native Python types for JSON serialization
        stats_serializable = {}
        for key, value in self.stats.items():
            if isinstance(value, (np.integer, np.int64, np.int32)):
                stats_serializable[key] = int(value)
            elif isinstance(value, (np.floating, np.float64, np.float32)):
                stats_serializable[key] = float(value)
            else:
                stats_serializable[key] = value

        metadata = {
            "created_at": datetime.now().isoformat(),
            "script_version": "1.0",
            "sae_id": self.sae_id,
            "n_features": int(n_features),
            "linkage_method": self.linkage_method,
            "schema": {
                "first_merge_clustering.parquet": {
                    "feature_id": "int32 - Feature index (0 to n_features-1)",
                    "first_merge_distance": "float32 - Distance threshold when feature first merges from singleton"
                },
                "clustering_linkage.npy": {
                    "shape": f"({n_features-1}, 4)",
                    "format": "scipy linkage matrix",
                    "columns": ["cluster1_id", "cluster2_id", "merge_distance", "cluster_size"],
                    "usage": "Use scipy.cluster.hierarchy.fcluster(linkage, t=threshold, criterion='distance') to get clusters"
                }
            },
            "processing_stats": stats_serializable,
            "config_used": self.config
        }

        with open(self.metadata_path, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=2)

        logger.info(f"Metadata saved successfully")

    def process(self) -> Dict:
        """
        Main processing pipeline.

        Returns:
            Dictionary with processing results and statistics
        """
        start_time = time.time()

        try:
            # 1. Load similarity data
            n_features, feature_mappings = self.load_similarity_data()

            # 2. Build distance matrix (uses filtered count if valid_feature_ids is set)
            distance_matrix = self.build_distance_matrix(n_features, feature_mappings)

            # Use filtered feature count if filtering is enabled
            actual_n_features = len(self.valid_feature_ids) if self.valid_feature_ids else n_features

            # 3. Perform clustering
            linkage_matrix = self.perform_clustering(distance_matrix)

            # 4. Extract first merge distances (uses matrix indices, not feature_ids)
            first_merge = self.extract_first_merge_distances(actual_n_features, linkage_matrix)

            # 5. Save results (maps back to original feature_ids if filtered)
            self.save_results(actual_n_features, first_merge, linkage_matrix)

            # Calculate total time
            total_time = time.time() - start_time
            self.stats["total_processing_time_seconds"] = total_time

            logger.info(f"Total processing time: {total_time:.2f} seconds")

            return {
                "status": "success",
                "n_features": n_features,
                "stats": self.stats,
                "output_files": {
                    "first_merge_parquet": str(self.first_merge_path),
                    "linkage_matrix": str(self.linkage_path),
                    "metadata": str(self.metadata_path)
                }
            }

        except Exception as e:
            logger.error(f"Error during processing: {e}", exc_info=True)
            raise


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Compute agglomerative clustering tree from SAE feature similarities"
    )
    parser.add_argument(
        "--config",
        type=str,
        default="../config/4_agglomerative_clustering.json",
        help="Path to configuration file"
    )

    args = parser.parse_args()

    try:
        # Load configuration
        config = load_config(args.config)

        # Create processor and run
        processor = AgglomerativeClusteringProcessor(config)
        result = processor.process()

        logger.info("=" * 60)
        logger.info("Processing completed successfully!")
        logger.info(f"Features processed: {result['n_features']:,}")
        logger.info(f"Output directory: {processor.output_dir}")
        logger.info("=" * 60)

        return 0

    except Exception as e:
        logger.error(f"Error during processing: {e}", exc_info=True)
        return 1


if __name__ == "__main__":
    exit(main())
