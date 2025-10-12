#!/usr/bin/env python3
"""
Agglomerative Hierarchical Clustering on UMAP Embeddings

This script applies hierarchical clustering with ward linkage to UMAP embeddings
for both SAE feature vectors and explanation embeddings.

Clustering is performed with 10, 30, and 90 clusters for analysis at different granularities.

Input:
  - UMAP feature embeddings: data/umap_feature/.../umap_embeddings.json
  - UMAP explanation embeddings: data/umap_explanations/explanation_umap.json

Output:
  - Cluster assignments for features at different granularities
  - Cluster statistics and metadata

Usage:
    python 8_umap_clustering.py [--config CONFIG_FILE]
"""

import json
import logging
import numpy as np
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import argparse
from datetime import datetime

from sklearn.cluster import AgglomerativeClustering

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class UMAPClusteringProcessor:
    """Applies hierarchical clustering to UMAP embeddings."""

    def __init__(self, config: Dict):
        self.config = config
        self.cluster_counts = config.get("cluster_counts", [10, 30, 90])
        self.linkage = config.get("linkage", "ward")

        # Resolve paths relative to project root if not absolute
        self._resolve_paths()

    def _resolve_paths(self):
        """Resolve input and output paths relative to project root."""
        umap_feature_path = self.config.get("umap_feature_path")
        umap_explanation_path = self.config.get("umap_explanation_path")
        output_dir = self.config.get("output_directory", "data/umap_clustering")

        # Find project root
        project_root = Path.cwd()
        while project_root.name != "interface" and project_root.parent != project_root:
            project_root = project_root.parent

        if project_root.name == "interface":
            if umap_feature_path and not Path(umap_feature_path).is_absolute():
                self.umap_feature_path = project_root / umap_feature_path
            else:
                self.umap_feature_path = Path(umap_feature_path) if umap_feature_path else None

            if umap_explanation_path and not Path(umap_explanation_path).is_absolute():
                self.umap_explanation_path = project_root / umap_explanation_path
            else:
                self.umap_explanation_path = Path(umap_explanation_path) if umap_explanation_path else None

            if not Path(output_dir).is_absolute():
                self.output_dir = project_root / output_dir
            else:
                self.output_dir = Path(output_dir)
        else:
            # Fallback to relative paths
            self.umap_feature_path = Path(umap_feature_path) if umap_feature_path else None
            self.umap_explanation_path = Path(umap_explanation_path) if umap_explanation_path else None
            self.output_dir = Path(output_dir)

        # Ensure output directory exists
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def load_feature_umap_data(self) -> Tuple[np.ndarray, List[int], Dict]:
        """
        Load UMAP feature embeddings.

        Returns:
            Tuple of (embeddings_array, feature_ids, metadata)
        """
        if not self.umap_feature_path or not self.umap_feature_path.exists():
            logger.warning(f"UMAP feature file not found: {self.umap_feature_path}")
            return None, None, None

        logger.info(f"Loading UMAP feature data from {self.umap_feature_path}")

        with open(self.umap_feature_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        metadata = data.get("metadata", {})
        feature_embeddings = data.get("feature_embeddings", [])

        # Extract coordinates and feature IDs
        embeddings = []
        feature_ids = []

        for feature_data in feature_embeddings:
            feature_id = feature_data["feature_id"]
            umap_x = feature_data["umap_x"]
            umap_y = feature_data["umap_y"]

            embeddings.append([umap_x, umap_y])
            feature_ids.append(feature_id)

        embeddings_array = np.array(embeddings, dtype=np.float32)

        logger.info(f"Loaded {len(feature_ids)} UMAP feature embeddings")
        logger.info(f"Embedding shape: {embeddings_array.shape}")

        return embeddings_array, feature_ids, metadata

    def load_explanation_umap_data(self) -> Tuple[np.ndarray, List[str], Dict]:
        """
        Load UMAP explanation embeddings.

        Returns:
            Tuple of (embeddings_array, explanation_ids, metadata)
        """
        if not self.umap_explanation_path or not self.umap_explanation_path.exists():
            logger.warning(f"UMAP explanation file not found: {self.umap_explanation_path}")
            return None, None, None

        logger.info(f"Loading UMAP explanation data from {self.umap_explanation_path}")

        with open(self.umap_explanation_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        metadata = data.get("metadata", {})
        feature_embeddings = data.get("feature_embeddings", {})

        # Extract coordinates and explanation IDs
        embeddings = []
        explanation_ids = []

        for feature_name, sources in feature_embeddings.items():
            for source_name, coords in sources.items():
                x = coords["x"]
                y = coords["y"]

                embeddings.append([x, y])
                explanation_id = f"{feature_name}_{source_name}"
                explanation_ids.append(explanation_id)

        embeddings_array = np.array(embeddings, dtype=np.float32)

        logger.info(f"Loaded {len(explanation_ids)} UMAP explanation embeddings")
        logger.info(f"Embedding shape: {embeddings_array.shape}")

        return embeddings_array, explanation_ids, metadata

    def apply_clustering(
        self,
        embeddings: np.ndarray,
        n_clusters: int
    ) -> np.ndarray:
        """
        Apply agglomerative hierarchical clustering to embeddings.

        Args:
            embeddings: UMAP embeddings (n_samples, 2)
            n_clusters: Number of clusters

        Returns:
            Cluster labels array
        """
        logger.info(f"Applying hierarchical clustering with {n_clusters} clusters (linkage: {self.linkage})")

        clustering = AgglomerativeClustering(
            n_clusters=n_clusters,
            linkage=self.linkage
        )

        labels = clustering.fit_predict(embeddings)

        logger.info(f"Clustering complete. Unique labels: {len(np.unique(labels))}")

        return labels

    def compute_cluster_statistics(
        self,
        embeddings: np.ndarray,
        labels: np.ndarray
    ) -> Dict:
        """
        Compute statistics for each cluster.

        Args:
            embeddings: UMAP embeddings
            labels: Cluster labels

        Returns:
            Dictionary with cluster statistics
        """
        unique_labels = np.unique(labels)
        cluster_stats = {}

        for label in unique_labels:
            mask = labels == label
            cluster_points = embeddings[mask]

            cluster_stats[int(label)] = {
                "size": int(np.sum(mask)),
                "centroid": {
                    "x": float(np.mean(cluster_points[:, 0])),
                    "y": float(np.mean(cluster_points[:, 1]))
                },
                "std": {
                    "x": float(np.std(cluster_points[:, 0])),
                    "y": float(np.std(cluster_points[:, 1]))
                },
                "bounds": {
                    "x_min": float(np.min(cluster_points[:, 0])),
                    "x_max": float(np.max(cluster_points[:, 0])),
                    "y_min": float(np.min(cluster_points[:, 1])),
                    "y_max": float(np.max(cluster_points[:, 1]))
                }
            }

        return cluster_stats

    def process_feature_clustering(self) -> Optional[Dict]:
        """Process clustering for UMAP feature embeddings."""
        embeddings, feature_ids, metadata = self.load_feature_umap_data()

        if embeddings is None:
            logger.warning("Skipping feature clustering (no data)")
            return None

        results = {
            "metadata": {
                "description": "Hierarchical clustering results for UMAP feature embeddings",
                "n_features": len(feature_ids),
                "linkage": self.linkage,
                "timestamp": datetime.now().isoformat(),
                "source_file": str(self.umap_feature_path),
                "umap_metadata": metadata
            },
            "cluster_assignments": {},
            "cluster_statistics": {}
        }

        # Apply clustering for each specified cluster count
        for n_clusters in self.cluster_counts:
            logger.info(f"\nProcessing {n_clusters} clusters for feature embeddings...")

            labels = self.apply_clustering(embeddings, n_clusters)
            stats = self.compute_cluster_statistics(embeddings, labels)

            # Create assignment mapping
            assignments = {
                feature_ids[i]: int(labels[i])
                for i in range(len(feature_ids))
            }

            results["cluster_assignments"][f"{n_clusters}_clusters"] = assignments
            results["cluster_statistics"][f"{n_clusters}_clusters"] = stats

            # Log cluster size distribution
            unique, counts = np.unique(labels, return_counts=True)
            logger.info(f"Cluster size distribution (n={n_clusters}):")
            logger.info(f"  Min: {counts.min()}, Max: {counts.max()}, Mean: {counts.mean():.1f}, Std: {counts.std():.1f}")

        return results

    def process_explanation_clustering(self) -> Optional[Dict]:
        """Process clustering for UMAP explanation embeddings."""
        embeddings, explanation_ids, metadata = self.load_explanation_umap_data()

        if embeddings is None:
            logger.warning("Skipping explanation clustering (no data)")
            return None

        results = {
            "metadata": {
                "description": "Hierarchical clustering results for UMAP explanation embeddings",
                "n_explanations": len(explanation_ids),
                "linkage": self.linkage,
                "timestamp": datetime.now().isoformat(),
                "source_file": str(self.umap_explanation_path),
                "umap_metadata": metadata
            },
            "cluster_assignments": {},
            "cluster_statistics": {}
        }

        # Apply clustering for each specified cluster count
        for n_clusters in self.cluster_counts:
            logger.info(f"\nProcessing {n_clusters} clusters for explanation embeddings...")

            labels = self.apply_clustering(embeddings, n_clusters)
            stats = self.compute_cluster_statistics(embeddings, labels)

            # Create assignment mapping
            assignments = {
                explanation_ids[i]: int(labels[i])
                for i in range(len(explanation_ids))
            }

            results["cluster_assignments"][f"{n_clusters}_clusters"] = assignments
            results["cluster_statistics"][f"{n_clusters}_clusters"] = stats

            # Log cluster size distribution
            unique, counts = np.unique(labels, return_counts=True)
            logger.info(f"Cluster size distribution (n={n_clusters}):")
            logger.info(f"  Min: {counts.min()}, Max: {counts.max()}, Mean: {counts.mean():.1f}, Std: {counts.std():.1f}")

        return results

    def save_results(
        self,
        feature_results: Optional[Dict],
        explanation_results: Optional[Dict]
    ) -> None:
        """Save clustering results to JSON files."""

        # Save feature clustering results
        if feature_results:
            feature_output_path = self.output_dir / "feature_clustering.json"
            with open(feature_output_path, 'w', encoding='utf-8') as f:
                json.dump(feature_results, f, indent=2, ensure_ascii=False)
            logger.info(f"Feature clustering results saved to: {feature_output_path}")

        # Save explanation clustering results
        if explanation_results:
            explanation_output_path = self.output_dir / "explanation_clustering.json"
            with open(explanation_output_path, 'w', encoding='utf-8') as f:
                json.dump(explanation_results, f, indent=2, ensure_ascii=False)
            logger.info(f"Explanation clustering results saved to: {explanation_output_path}")

        # Save config file
        config_path = self.output_dir / "config.json"
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(self.config, f, indent=2, ensure_ascii=False)
        logger.info(f"Config saved to: {config_path}")

    def process_all(self) -> None:
        """Process clustering for both feature and explanation embeddings."""
        logger.info("Starting UMAP clustering processing...")
        logger.info(f"Cluster counts: {self.cluster_counts}")
        logger.info(f"Linkage method: {self.linkage}")

        # Process feature embeddings
        logger.info("\n" + "="*60)
        logger.info("PROCESSING FEATURE EMBEDDINGS")
        logger.info("="*60)
        feature_results = self.process_feature_clustering()

        # Process explanation embeddings
        logger.info("\n" + "="*60)
        logger.info("PROCESSING EXPLANATION EMBEDDINGS")
        logger.info("="*60)
        explanation_results = self.process_explanation_clustering()

        # Save results
        logger.info("\n" + "="*60)
        logger.info("SAVING RESULTS")
        logger.info("="*60)
        self.save_results(feature_results, explanation_results)

        logger.info("\n" + "="*60)
        logger.info("CLUSTERING COMPLETE")
        logger.info("="*60)


def load_config(config_path: Optional[str] = None) -> Dict:
    """Load configuration from file or use defaults."""
    default_config = {
        "umap_feature_path": "data/umap_feature/google--gemma-scope-9b-pt-res--layer_30--width_16k--average_l0_120/umap_embeddings.json",
        "umap_explanation_path": "data/umap_explanations/explanation_umap.json",
        "output_directory": "data/umap_clustering",
        "cluster_counts": [10, 30, 90],
        "linkage": "ward"
    }

    if config_path and Path(config_path).exists():
        logger.info(f"Loading config from {config_path}")
        with open(config_path, 'r') as f:
            file_config = json.load(f)
        default_config.update(file_config)
    else:
        logger.info("Using default configuration")

    return default_config


def main():
    """Main execution function."""
    parser = argparse.ArgumentParser(
        description="Apply hierarchical clustering to UMAP embeddings"
    )
    parser.add_argument(
        "--config",
        help="Path to configuration file"
    )
    args = parser.parse_args()

    try:
        # Load configuration
        config = load_config(args.config)

        # Create processor and run
        processor = UMAPClusteringProcessor(config)
        processor.process_all()

        logger.info("\nUMAP clustering processing completed successfully!")
        return 0

    except Exception as e:
        logger.error(f"Error during processing: {e}")
        raise


if __name__ == "__main__":
    exit(main())
