#!/usr/bin/env python3
"""
Step 6: Feature Clustering (Agglomerative)

This step performs hierarchical clustering on SAE features using decoder
weight similarities to identify feature groupings.

Input:
- decoder_similarity_matrix.npz: Full cosine similarity matrix from Step 2

Output:
- clustering_linkage.npy: Scipy linkage matrix for threshold reconstruction

Features:
- Loads full similarity matrix from NPZ
- Converts cosine similarity to cosine distance (1 - similarity)
- Average linkage agglomerative clustering
- Outputs scipy-compatible linkage matrix
"""

import logging
import time
from pathlib import Path

import numpy as np
from scipy.cluster.hierarchy import linkage
from scipy.spatial.distance import squareform

# Add parent directory to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.base import BaseProcessor, load_yaml_config
from core.logging import setup_logging

logger = logging.getLogger(__name__)


class ClusteringProcessor(BaseProcessor):
    """Perform hierarchical clustering on SAE features."""

    @property
    def step_name(self) -> str:
        return "Step 6: Feature Clustering"

    @property
    def version(self) -> str:
        return "3.0"

    def _init_paths(self) -> None:
        """Initialize paths from configuration."""
        super()._init_paths()

        global_config = self.config.get("global", {})
        paths = global_config.get("paths", {})

        # Resolve base directories
        intermediate_dir = paths.get("intermediate", "data/intermediate")
        output_dir = paths.get("output", "data/output")

        # Input: similarity matrix from step 2
        self.similarities_path = self._resolve_path(
            f"{intermediate_dir}/decoder_similarity_matrix.npz"
        )

        # Output: linkage matrix only
        self.linkage_output = self._resolve_path(
            f"{output_dir}/clustering_linkage.npy"
        )

        # Processing parameters
        params = self.config.get("parameters", {})
        self.linkage_method = params.get("linkage_method", "average")

        # Statistics tracking
        self.stats = {
            "n_features": 0,
            "matrix_memory_mb": 0,
            "clustering_time_seconds": 0.0
        }

    def _load_distance_matrix(self) -> np.ndarray:
        """Load similarity matrix from NPZ and convert to distance matrix.

        Returns:
            Cosine distance matrix: 1 - cosine_similarity
            Range is 0 (identical) to 2 (opposite), but typically 0-1 for similar features.
        """
        logger.info(f"Loading similarity data from {self.similarities_path}")

        if not self.similarities_path.exists():
            raise FileNotFoundError(f"Similarity file not found: {self.similarities_path}")

        data = np.load(self.similarities_path)
        similarity_matrix = data['cosine_similarity']

        n_features = similarity_matrix.shape[0]
        self.stats["n_features"] = n_features
        logger.info(f"Loaded {n_features:,} × {n_features:,} similarity matrix")

        # Convert cosine similarity to cosine distance
        # Range: 0 (identical, sim=1) to 2 (opposite, sim=-1)
        distance_matrix = 1.0 - similarity_matrix

        # Track memory
        matrix_size_mb = (distance_matrix.shape[0] * distance_matrix.shape[1] * 4) / (1024**2)
        self.stats["matrix_memory_mb"] = matrix_size_mb
        logger.info(f"Distance matrix size: {matrix_size_mb:.2f} MB")

        return distance_matrix.astype(np.float32)

    def _perform_clustering(self, distance_matrix: np.ndarray) -> np.ndarray:
        """Perform agglomerative clustering.

        Args:
            distance_matrix: Symmetric pairwise distance matrix

        Returns:
            Linkage matrix
        """
        logger.info(f"Performing clustering with {self.linkage_method} linkage")

        start_time = time.time()

        # Convert to condensed distance matrix
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

    def process(self) -> None:
        """Execute the main processing logic."""
        # Load distance matrix from NPZ
        distance_matrix = self._load_distance_matrix()

        # Perform clustering
        linkage_matrix = self._perform_clustering(distance_matrix)

        # Save linkage matrix
        self.linkage_output.parent.mkdir(parents=True, exist_ok=True)
        logger.info(f"Saving linkage matrix to {self.linkage_output}")
        np.save(self.linkage_output, linkage_matrix)

        logger.info(f"Completed {self.step_name}")

    def run(self) -> None:
        """Run the processing pipeline."""
        logger.info(f"Starting {self.step_name} v{self.version}")
        self.process()
        logger.info(f"Statistics: {self.stats}")


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Perform feature clustering")
    parser.add_argument("--config", type=str, help="Path to configuration file")

    args = parser.parse_args()

    setup_logging()

    if args.config:
        full_config = load_yaml_config(args.config)
        # Extract step-specific config if present
        config = full_config.get("steps", {}).get("step_06_clustering", {})
        if not config:
            # Fallback: treat entire config as step config (legacy format)
            config = full_config
        config["sae_id"] = full_config.get("global", {}).get("sae_id_sanitized", "")
        config["global"] = full_config.get("global", {})
    else:
        config_path = Path(__file__).parent.parent / "config.yaml"
        if config_path.exists():
            full_config = load_yaml_config(config_path)
            config = full_config.get("steps", {}).get("step_06_clustering", {})
            config["sae_id"] = full_config.get("global", {}).get("sae_id_sanitized", "")
            config["global"] = full_config.get("global", {})
        else:
            config = {}

    processor = ClusteringProcessor(config)
    processor.run()


if __name__ == "__main__":
    main()
