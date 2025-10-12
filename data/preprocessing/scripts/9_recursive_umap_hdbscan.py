#!/usr/bin/env python3
"""
Recursive UMAP + HDBSCAN Clustering

This script implements the recursive embedding and clustering approach described by
Spotify Engineering (https://engineering.atspotify.com/2023/12/recursive-embedding-and-clustering).

The algorithm works on HIGH-DIMENSIONAL embeddings and recursively applies:
1. UMAP dimensionality reduction (high-dim → 2D)
2. HDBSCAN clustering on 2D space
3. For each cluster, extract high-dim subset and recurse

Input:
  - SAE decoder weights (high-dimensional feature vectors)
  - Explanation embeddings (high-dimensional semantic vectors)

Output:
  - Hierarchical cluster tree with recursive subclusters
  - Cluster metadata at each recursion level

Usage:
    python 9_recursive_umap_hdbscan.py [--config CONFIG_FILE]
"""

import json
import logging
import numpy as np
import torch
import torch.nn as nn
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
import argparse
from datetime import datetime
from huggingface_hub import hf_hub_download

import hdbscan
from umap import UMAP
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
from sklearn.metrics import silhouette_score, davies_bouldin_score, calinski_harabasz_score


class NumpyEncoder(json.JSONEncoder):
    """Custom JSON encoder for numpy types."""
    def default(self, obj):
        if isinstance(obj, (np.integer, np.int64, np.int32)):
            return int(obj)
        elif isinstance(obj, (np.floating, np.float64, np.float32)):
            return float(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class JumpReluSae(nn.Module):
    """SAE model for loading decoder weights from HuggingFace."""
    def __init__(self, d_model, d_sae):
        super().__init__()
        self.W_enc = nn.Parameter(torch.zeros(d_model, d_sae))
        self.W_dec = nn.Parameter(torch.zeros(d_sae, d_model))
        self.threshold = nn.Parameter(torch.zeros(d_sae))
        self.b_enc = nn.Parameter(torch.zeros(d_sae))
        self.b_dec = nn.Parameter(torch.zeros(d_model))

    @classmethod
    def from_pretrained(cls, model_name_or_path, position, device):
        path_to_params = hf_hub_download(
            repo_id=model_name_or_path,
            filename=f"{position}/params.npz",
            force_download=False,
        )
        params = np.load(path_to_params)
        pt_params = {k: torch.from_numpy(v) for k, v in params.items()}
        model = cls(params["W_enc"].shape[0], params["W_enc"].shape[1])
        model.load_state_dict(pt_params)
        model = model.to(device)
        return model


class ClusterNode:
    """Represents a node in the hierarchical cluster tree."""

    def __init__(
        self,
        cluster_id: str,
        level: int,
        parent_id: Optional[str] = None,
        member_indices: Optional[List[int]] = None
    ):
        self.cluster_id = cluster_id
        self.level = level
        self.parent_id = parent_id
        self.member_indices = member_indices or []
        self.children: List[ClusterNode] = []
        self.metadata: Dict[str, Any] = {}

    def add_child(self, child: 'ClusterNode'):
        """Add a child cluster node."""
        self.children.append(child)

    def to_dict(self) -> Dict:
        """Convert cluster node to dictionary format."""
        return {
            "cluster_id": self.cluster_id,
            "level": self.level,
            "parent_id": self.parent_id,
            "size": len(self.member_indices),
            "member_indices": self.member_indices,
            "metadata": self.metadata,
            "children": [child.to_dict() for child in self.children]
        }


class RecursiveUMAPHDBSCAN:
    """Implements recursive UMAP + HDBSCAN clustering on high-dimensional data."""

    def __init__(self, config: Dict):
        self.config = config

        # Load separate parameter sets for features and explanations
        self.feature_params = config.get("feature_parameters", {
            "umap_n_neighbors": 20,
            "umap_min_dist": 0.3,
            "umap_metric": "cosine",
            "umap_n_components": 2,
            "hdbscan_min_cluster_size": 15,
            "hdbscan_min_samples": 5,
            "hdbscan_metric": "euclidean",
            "min_cluster_size_for_recursion": 15
        })

        self.explanation_params = config.get("explanation_parameters", {
            "umap_n_neighbors": 30,
            "umap_min_dist": 0.2,
            "umap_metric": "cosine",
            "umap_n_components": 2,
            "hdbscan_min_cluster_size": 20,
            "hdbscan_min_samples": 5,
            "hdbscan_metric": "euclidean",
            "min_cluster_size_for_recursion": 20
        })

        # Global recursion parameters
        self.max_recursion_depth = config.get("max_recursion_depth", 3)
        self.min_cluster_percentage = config.get("min_cluster_percentage", 0.01)
        self.save_visualizations = config.get("save_visualizations", False)

        # SAE parameters (for feature loading)
        self.sae_model_name = config.get("sae_model_name", "google/gemma-scope-9b-pt-res")
        self.sae_position = config.get("sae_position", "layer_30/width_16k/average_l0_120")
        self.feature_range_start = config.get("feature_range_start", 0)
        self.feature_range_end = config.get("feature_range_end", 1000)

        # Explanation embedding sources
        self.explanation_sources = config.get("explanation_sources", [
            "llama_e-llama_s",
            "gwen_e-llama_s",
            "openai_e-llama_s"
        ])

        # Resolve paths
        self._resolve_paths()

        # Cluster counter for unique IDs
        self._cluster_counter = 0

    def _resolve_paths(self):
        """Resolve input and output paths relative to project root."""
        output_dir = self.config.get("output_directory", "data/recursive_clustering")
        embeddings_dir = self.config.get("embeddings_directory", "data/embeddings")

        # Find project root
        project_root = Path.cwd()
        while project_root.name != "interface" and project_root.parent != project_root:
            project_root = project_root.parent

        if project_root.name == "interface":
            if not Path(output_dir).is_absolute():
                self.output_dir = project_root / output_dir
            else:
                self.output_dir = Path(output_dir)

            if not Path(embeddings_dir).is_absolute():
                self.embeddings_dir = project_root / embeddings_dir
            else:
                self.embeddings_dir = Path(embeddings_dir)
        else:
            self.output_dir = Path(output_dir)
            self.embeddings_dir = Path(embeddings_dir)

        # Ensure output directory exists
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Create visualization subdirectory if enabled
        if self.save_visualizations:
            self.viz_dir = self.output_dir / "visualizations"
            self.viz_dir.mkdir(parents=True, exist_ok=True)

    def _get_next_cluster_id(self) -> str:
        """Generate unique cluster ID."""
        cluster_id = f"cluster_{self._cluster_counter}"
        self._cluster_counter += 1
        return cluster_id

    def load_sae_decoder_weights(self) -> Tuple[np.ndarray, List[int]]:
        """
        Load high-dimensional SAE decoder weights from HuggingFace.

        Returns:
            Tuple of (decoder_weights_array, feature_ids)
        """
        logger.info("Loading SAE decoder weights from HuggingFace...")
        logger.info(f"  Model: {self.sae_model_name}")
        logger.info(f"  Position: {self.sae_position}")

        # Determine device
        device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info(f"  Device: {device}")

        # Load SAE model
        sae = JumpReluSae.from_pretrained(self.sae_model_name, self.sae_position, device)
        decoder_weights = sae.W_dec.detach().cpu().numpy()

        logger.info(f"  Full decoder weights shape: {decoder_weights.shape}")

        # Apply feature range filter
        start = self.feature_range_start
        end = min(self.feature_range_end, decoder_weights.shape[0])

        filtered_weights = decoder_weights[start:end]
        feature_ids = list(range(start, end))

        logger.info(f"  Filtered to features {start}-{end}: shape {filtered_weights.shape}")
        logger.info(f"  Dimensionality: {filtered_weights.shape[1]}")

        return filtered_weights.astype(np.float32), feature_ids

    def load_explanation_embeddings(self) -> Tuple[np.ndarray, List[str]]:
        """
        Load high-dimensional explanation embeddings from multiple sources.

        Returns:
            Tuple of (embeddings_array, explanation_ids)
        """
        logger.info("Loading explanation embeddings...")

        all_embeddings = []
        all_ids = []

        for source in self.explanation_sources:
            source_path = self.embeddings_dir / source / "embeddings.json"

            if not source_path.exists():
                logger.warning(f"  Skipping {source}: file not found at {source_path}")
                continue

            logger.info(f"  Loading from {source}...")

            with open(source_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            embeddings_dict = data.get("embeddings", {})

            for feature_id_str, feature_data in embeddings_dict.items():
                embedding = feature_data.get("embedding", [])
                if embedding:
                    all_embeddings.append(embedding)
                    explanation_id = f"feature_{feature_id_str}_{source}"
                    all_ids.append(explanation_id)

            logger.info(f"    Loaded {len(embeddings_dict)} embeddings")

        if not all_embeddings:
            logger.error("No embeddings loaded from any source")
            return None, None

        embeddings_array = np.array(all_embeddings, dtype=np.float32)

        logger.info(f"  Total embeddings: {len(all_embeddings)}")
        logger.info(f"  Embedding shape: {embeddings_array.shape}")
        logger.info(f"  Dimensionality: {embeddings_array.shape[1]}")

        return embeddings_array, all_ids

    def apply_umap(self, data: np.ndarray, params: Dict, random_state: int = 42) -> np.ndarray:
        """
        Apply UMAP dimensionality reduction to high-dimensional data.

        Args:
            data: High-dimensional input data (n_samples, n_features)
            params: Parameter dictionary containing UMAP settings
            random_state: Random seed for reproducibility

        Returns:
            Reduced embeddings (n_samples, n_components)
        """
        n_samples = len(data)

        # Adjust n_neighbors if data is too small
        # UMAP requires n_neighbors < n_samples
        n_neighbors = min(params["umap_n_neighbors"], n_samples - 1)
        n_neighbors = max(n_neighbors, 2)  # Minimum 2 neighbors

        # Adjust n_components if data is too small
        # For spectral initialization, we need n_components < n_samples
        # Safe rule: n_components <= min(n_samples - 2, requested_n_components)
        n_components = min(params["umap_n_components"], n_samples - 2)
        n_components = max(n_components, 2)  # Minimum 2 components

        reducer = UMAP(
            n_neighbors=n_neighbors,
            min_dist=params["umap_min_dist"],
            n_components=n_components,
            metric=params["umap_metric"],
            random_state=random_state
        )

        embeddings_reduced = reducer.fit_transform(data)
        return embeddings_reduced

    def apply_hdbscan(self, embeddings_reduced: np.ndarray, params: Dict) -> Tuple[np.ndarray, hdbscan.HDBSCAN]:
        """
        Apply HDBSCAN clustering to UMAP-reduced embeddings.

        Args:
            embeddings_reduced: UMAP-reduced embeddings (n_samples, n_components)
            params: Parameter dictionary containing HDBSCAN settings

        Returns:
            Tuple of (cluster_labels, hdbscan_object)
        """
        # Adjust parameters if data is too small
        min_cluster_size = min(params["hdbscan_min_cluster_size"], len(embeddings_reduced) // 3)
        min_cluster_size = max(min_cluster_size, 2)

        min_samples = min(params["hdbscan_min_samples"], min_cluster_size)

        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=min_cluster_size,
            min_samples=min_samples,
            metric=params["hdbscan_metric"]
        )

        labels = clusterer.fit_predict(embeddings_reduced)
        return labels, clusterer

    def save_umap_visualization(
        self,
        embeddings_2d: np.ndarray,
        labels: np.ndarray,
        cluster_id: str,
        level: int,
        data_type: str
    ) -> None:
        """
        Save UMAP visualization with cluster coloring.

        Args:
            embeddings_2d: 2D UMAP embeddings
            labels: Cluster labels from HDBSCAN
            cluster_id: Unique cluster ID
            level: Recursion level
            data_type: 'feature' or 'explanation'
        """
        if not self.save_visualizations:
            return

        try:
            # Create figure
            fig, ax = plt.subplots(figsize=(12, 10))

            # Get unique labels (excluding noise)
            unique_labels = np.unique(labels[labels >= 0])
            n_clusters = len(unique_labels)
            n_noise = np.sum(labels == -1)

            # Generate colors for clusters
            if n_clusters > 0:
                colors = plt.cm.tab20(np.linspace(0, 1, min(n_clusters, 20)))
                if n_clusters > 20:
                    # Use additional colormap for more clusters
                    extra_colors = plt.cm.tab20b(np.linspace(0, 1, n_clusters - 20))
                    colors = np.vstack([colors, extra_colors])

                # Plot each cluster
                for idx, label in enumerate(unique_labels):
                    mask = labels == label
                    ax.scatter(
                        embeddings_2d[mask, 0],
                        embeddings_2d[mask, 1],
                        c=[colors[idx % len(colors)]],
                        label=f'Cluster {label}',
                        alpha=0.6,
                        s=50,
                        edgecolors='k',
                        linewidths=0.5
                    )

            # Plot noise points if any
            if n_noise > 0:
                noise_mask = labels == -1
                ax.scatter(
                    embeddings_2d[noise_mask, 0],
                    embeddings_2d[noise_mask, 1],
                    c='lightgray',
                    label=f'Noise ({n_noise})',
                    alpha=0.3,
                    s=30,
                    marker='x'
                )

            # Set title and labels
            ax.set_title(
                f'UMAP Clustering - {data_type.capitalize()}\n'
                f'Level {level}, {cluster_id}\n'
                f'{n_clusters} clusters, {n_noise} noise points',
                fontsize=14,
                fontweight='bold'
            )
            ax.set_xlabel('UMAP Dimension 1', fontsize=12)
            ax.set_ylabel('UMAP Dimension 2', fontsize=12)

            # Add legend (limit to avoid clutter)
            if n_clusters + (1 if n_noise > 0 else 0) <= 15:
                ax.legend(loc='best', fontsize=9, framealpha=0.9)

            # Add grid
            ax.grid(True, alpha=0.3, linestyle='--')

            # Save figure
            filename = f"{data_type}_level{level}_{cluster_id}.png"
            filepath = self.viz_dir / filename
            plt.tight_layout()
            plt.savefig(filepath, dpi=150, bbox_inches='tight')
            plt.close(fig)

            logger.info(f"{'  ' * level}  → Visualization saved: {filename}")

        except Exception as e:
            logger.warning(f"{'  ' * level}  → Failed to save visualization: {e}")

    def compute_cluster_metadata(
        self,
        embeddings_reduced: np.ndarray,
        original_high_dim: np.ndarray,
        labels: np.ndarray
    ) -> Dict:
        """
        Compute metadata for clusters including quality metrics.

        Args:
            embeddings_reduced: UMAP-reduced embeddings
            original_high_dim: Original high-dimensional data
            labels: Cluster labels

        Returns:
            Dictionary with cluster metadata and quality metrics
        """
        unique_labels = np.unique(labels[labels >= 0])
        n_clusters = len(unique_labels)
        n_noise = np.sum(labels == -1)

        metadata = {
            "n_clusters": n_clusters,
            "n_noise": int(n_noise),
            "noise_percentage": float(n_noise / len(labels) * 100),
            "cluster_sizes": {},
            "cluster_centroids": {},
            "cluster_bounds": {},
            "quality_metrics": {}
        }

        # Compute cluster-specific metadata
        for label in unique_labels:
            mask = labels == label
            cluster_points = embeddings_reduced[mask]

            metadata["cluster_sizes"][int(label)] = int(np.sum(mask))

            # Compute centroids (works for any dimensionality)
            if embeddings_reduced.shape[1] == 2:
                metadata["cluster_centroids"][int(label)] = {
                    "x": float(np.mean(cluster_points[:, 0])),
                    "y": float(np.mean(cluster_points[:, 1]))
                }
                metadata["cluster_bounds"][int(label)] = {
                    "x_min": float(np.min(cluster_points[:, 0])),
                    "x_max": float(np.max(cluster_points[:, 0])),
                    "y_min": float(np.min(cluster_points[:, 1])),
                    "y_max": float(np.max(cluster_points[:, 1]))
                }
            else:
                # For higher dimensions, just store centroid as list
                metadata["cluster_centroids"][int(label)] = cluster_points.mean(axis=0).tolist()

        # Compute clustering quality metrics (only if we have actual clusters, not just noise)
        if n_clusters >= 2:
            # Filter out noise points for quality metrics
            non_noise_mask = labels >= 0
            labels_no_noise = labels[non_noise_mask]
            embeddings_no_noise = embeddings_reduced[non_noise_mask]

            # Only compute if we have enough samples per cluster
            if len(labels_no_noise) >= n_clusters:
                try:
                    # Silhouette Score: measures how similar objects are to their own cluster vs others
                    # Range: [-1, 1], higher is better
                    silhouette = silhouette_score(embeddings_no_noise, labels_no_noise, metric='euclidean')
                    metadata["quality_metrics"]["silhouette_score"] = float(silhouette)
                except Exception as e:
                    metadata["quality_metrics"]["silhouette_score"] = None
                    metadata["quality_metrics"]["silhouette_error"] = str(e)

                try:
                    # Davies-Bouldin Index: average similarity between clusters
                    # Range: [0, ∞), lower is better
                    davies_bouldin = davies_bouldin_score(embeddings_no_noise, labels_no_noise)
                    metadata["quality_metrics"]["davies_bouldin_index"] = float(davies_bouldin)
                except Exception as e:
                    metadata["quality_metrics"]["davies_bouldin_index"] = None
                    metadata["quality_metrics"]["davies_bouldin_error"] = str(e)

                try:
                    # Calinski-Harabasz Score: ratio of between-cluster to within-cluster dispersion
                    # Range: [0, ∞), higher is better
                    calinski = calinski_harabasz_score(embeddings_no_noise, labels_no_noise)
                    metadata["quality_metrics"]["calinski_harabasz_score"] = float(calinski)
                except Exception as e:
                    metadata["quality_metrics"]["calinski_harabasz_score"] = None
                    metadata["quality_metrics"]["calinski_harabasz_error"] = str(e)
            else:
                metadata["quality_metrics"]["note"] = "Too few samples for quality metrics"
        else:
            metadata["quality_metrics"]["note"] = "Need at least 2 clusters for quality metrics"

        return metadata

    def recursive_cluster(
        self,
        high_dim_data: np.ndarray,
        data_ids: List,
        params: Dict,
        data_type: str = "data",
        parent_node: Optional[ClusterNode] = None,
        level: int = 0,
        total_data_size: Optional[int] = None,
        original_indices: Optional[List[int]] = None
    ) -> ClusterNode:
        """
        Recursively apply UMAP + HDBSCAN clustering on high-dimensional data.

        This is the core of the Spotify algorithm:
        1. Apply UMAP to reduce high-dim → 2D
        2. Apply HDBSCAN on 2D to find clusters
        3. For each cluster, extract high-dim subset and recurse

        Args:
            high_dim_data: HIGH-DIMENSIONAL data to cluster (n_samples, n_features)
            data_ids: IDs corresponding to data points
            params: Parameter dictionary for UMAP/HDBSCAN settings
            data_type: Type of data ('feature' or 'explanation') for visualization
            parent_node: Parent cluster node (None for root)
            level: Current recursion level
            total_data_size: Total size of original dataset
            original_indices: Global indices mapping to data_id_mapping (for tracking across recursion)

        Returns:
            Root cluster node with recursive structure
        """
        if total_data_size is None:
            total_data_size = len(high_dim_data)

        # Initialize original_indices on first call
        if original_indices is None:
            original_indices = list(range(len(high_dim_data)))

        cluster_id = self._get_next_cluster_id()
        parent_id = parent_node.cluster_id if parent_node else None

        node = ClusterNode(
            cluster_id=cluster_id,
            level=level,
            parent_id=parent_id,
            member_indices=original_indices  # Store global indices, not local
        )

        logger.info(f"{'  ' * level}Level {level}: {cluster_id} ({len(high_dim_data)} points, dim={high_dim_data.shape[1]})")

        # Check stopping criteria
        if level >= self.max_recursion_depth:
            logger.info(f"{'  ' * level}  → Stop: Max depth ({self.max_recursion_depth})")
            node.metadata["stop_reason"] = "max_depth"
            return node

        min_cluster_size_for_recursion = params["min_cluster_size_for_recursion"]
        if len(high_dim_data) < min_cluster_size_for_recursion:
            logger.info(f"{'  ' * level}  → Stop: Too small ({len(high_dim_data)} < {min_cluster_size_for_recursion})")
            node.metadata["stop_reason"] = "too_small"
            return node

        percentage = (len(high_dim_data) / total_data_size) * 100
        if percentage < self.min_cluster_percentage:
            logger.info(f"{'  ' * level}  → Stop: Below threshold ({percentage:.2f}% < {self.min_cluster_percentage}%)")
            node.metadata["stop_reason"] = "below_percentage"
            return node

        # Step 1: Apply UMAP to reduce high-dim → n_components
        requested_n_components = params["umap_n_components"]
        logger.info(f"{'  ' * level}  → UMAP: {high_dim_data.shape[1]}D → {requested_n_components}D")
        embeddings_reduced = self.apply_umap(high_dim_data, params, random_state=42 + level)
        actual_n_components = embeddings_reduced.shape[1]

        # Log if parameters were adjusted for small sample size
        if actual_n_components != requested_n_components:
            logger.info(f"{'  ' * level}     (adjusted to {actual_n_components}D due to small sample size)")

        # Step 2: Apply HDBSCAN on reduced space to find clusters
        logger.info(f"{'  ' * level}  → HDBSCAN on {actual_n_components}D space")
        labels, clusterer = self.apply_hdbscan(embeddings_reduced, params)

        # Compute metadata
        metadata = self.compute_cluster_metadata(embeddings_reduced, high_dim_data, labels)
        node.metadata.update(metadata)

        logger.info(f"{'  ' * level}  → Found {metadata['n_clusters']} clusters, {metadata['n_noise']} noise")

        # Log quality metrics if available
        if "quality_metrics" in metadata and metadata["quality_metrics"]:
            quality = metadata["quality_metrics"]
            if "silhouette_score" in quality and quality["silhouette_score"] is not None:
                sil = quality['silhouette_score']
                db = quality.get('davies_bouldin_index')
                ch = quality.get('calinski_harabasz_score')

                db_str = f"{db:.3f}" if db is not None else "N/A"
                ch_str = f"{ch:.1f}" if ch is not None else "N/A"

                logger.info(f"{'  ' * level}  → Quality: Silhouette={sil:.3f}, "
                           f"Davies-Bouldin={db_str}, "
                           f"Calinski-Harabasz={ch_str}")
            elif "note" in quality:
                logger.info(f"{'  ' * level}  → Quality: {quality['note']}")

        # Save visualization if enabled (only for 2D)
        if self.save_visualizations and actual_n_components == 2:
            self.save_umap_visualization(embeddings_reduced, labels, cluster_id, level, data_type)

        # Check if recursion should continue
        if metadata['n_clusters'] == 0:
            logger.info(f"{'  ' * level}  → Stop: No clusters (all noise)")
            node.metadata["stop_reason"] = "no_clusters"
            return node

        if metadata['n_clusters'] == 1:
            logger.info(f"{'  ' * level}  → Stop: Single cluster (no subdivision)")
            node.metadata["stop_reason"] = "single_cluster"
            return node

        # Step 3: For each cluster, extract high-dim subset and recurse
        for cluster_label in range(metadata['n_clusters']):
            mask = labels == cluster_label

            # CRITICAL: Extract high-dimensional data for this cluster
            cluster_high_dim_data = high_dim_data[mask]
            cluster_ids = [data_ids[i] for i in range(len(data_ids)) if mask[i]]
            cluster_original_indices = [original_indices[i] for i in range(len(original_indices)) if mask[i]]

            # Recurse with high-dimensional subset
            child_node = self.recursive_cluster(
                high_dim_data=cluster_high_dim_data,
                data_ids=cluster_ids,
                params=params,
                data_type=data_type,
                parent_node=node,
                level=level + 1,
                total_data_size=total_data_size,
                original_indices=cluster_original_indices  # Pass subset of global indices
            )

            node.add_child(child_node)

        return node

    def process_feature_clustering(self) -> Optional[Dict]:
        """Process recursive clustering for SAE feature decoder weights."""
        high_dim_data, feature_ids = self.load_sae_decoder_weights()

        if high_dim_data is None:
            logger.warning("Skipping feature clustering (no data)")
            return None

        logger.info("\n" + "="*70)
        logger.info("RECURSIVE CLUSTERING: SAE FEATURE DECODER WEIGHTS")
        logger.info("="*70)
        logger.info("Using FEATURE parameters:")
        logger.info(f"  UMAP: n_neighbors={self.feature_params['umap_n_neighbors']}, "
                   f"min_dist={self.feature_params['umap_min_dist']}, "
                   f"metric={self.feature_params['umap_metric']}, "
                   f"n_components={self.feature_params['umap_n_components']}")
        logger.info(f"  HDBSCAN: min_cluster_size={self.feature_params['hdbscan_min_cluster_size']}, "
                   f"min_samples={self.feature_params['hdbscan_min_samples']}")

        self._cluster_counter = 0

        root_node = self.recursive_cluster(
            high_dim_data=high_dim_data,
            data_ids=feature_ids,
            params=self.feature_params,
            data_type="feature",
            parent_node=None,
            level=0
        )

        results = {
            "metadata": {
                "description": "Recursive UMAP + HDBSCAN on high-dimensional SAE decoder weights (orthogonal features)",
                "algorithm": "Recursive UMAP + HDBSCAN (Spotify Engineering approach)",
                "data_type": "sae_decoder_weights",
                "n_features": len(feature_ids),
                "feature_range": {
                    "start": self.feature_range_start,
                    "end": min(self.feature_range_end, len(feature_ids) + self.feature_range_start)
                },
                "original_dimensionality": int(high_dim_data.shape[1]),
                "max_recursion_depth": self.max_recursion_depth,
                "timestamp": datetime.now().isoformat(),
                "sae_model": self.sae_model_name,
                "sae_position": self.sae_position,
                "umap_parameters": {
                    "n_neighbors": self.feature_params["umap_n_neighbors"],
                    "min_dist": self.feature_params["umap_min_dist"],
                    "n_components": self.feature_params["umap_n_components"],
                    "metric": self.feature_params["umap_metric"]
                },
                "hdbscan_parameters": {
                    "min_cluster_size": self.feature_params["hdbscan_min_cluster_size"],
                    "min_samples": self.feature_params["hdbscan_min_samples"],
                    "metric": self.feature_params["hdbscan_metric"]
                },
                "recursion_parameters": {
                    "max_depth": self.max_recursion_depth,
                    "min_cluster_size_for_recursion": self.feature_params["min_cluster_size_for_recursion"],
                    "min_cluster_percentage": self.min_cluster_percentage
                }
            },
            "cluster_tree": root_node.to_dict(),
            "feature_id_mapping": {int(i): int(feature_ids[i]) for i in range(len(feature_ids))}
        }

        return results

    def process_explanation_clustering(self) -> Optional[Dict]:
        """Process recursive clustering for explanation embeddings."""
        high_dim_data, explanation_ids = self.load_explanation_embeddings()

        if high_dim_data is None:
            logger.warning("Skipping explanation clustering (no data)")
            return None

        logger.info("\n" + "="*70)
        logger.info("RECURSIVE CLUSTERING: EXPLANATION EMBEDDINGS")
        logger.info("="*70)
        logger.info("Using EXPLANATION parameters:")
        logger.info(f"  UMAP: n_neighbors={self.explanation_params['umap_n_neighbors']}, "
                   f"min_dist={self.explanation_params['umap_min_dist']}, "
                   f"metric={self.explanation_params['umap_metric']}, "
                   f"n_components={self.explanation_params['umap_n_components']}")
        logger.info(f"  HDBSCAN: min_cluster_size={self.explanation_params['hdbscan_min_cluster_size']}, "
                   f"min_samples={self.explanation_params['hdbscan_min_samples']}")

        self._cluster_counter = 0

        root_node = self.recursive_cluster(
            high_dim_data=high_dim_data,
            data_ids=explanation_ids,
            params=self.explanation_params,
            data_type="explanation",
            parent_node=None,
            level=0
        )

        results = {
            "metadata": {
                "description": "Recursive UMAP + HDBSCAN on high-dimensional explanation embeddings",
                "algorithm": "Recursive UMAP + HDBSCAN (Spotify Engineering approach)",
                "data_type": "explanation_embeddings",
                "n_explanations": len(explanation_ids),
                "sources": self.explanation_sources,
                "original_dimensionality": int(high_dim_data.shape[1]),
                "max_recursion_depth": self.max_recursion_depth,
                "timestamp": datetime.now().isoformat(),
                "umap_parameters": {
                    "n_neighbors": self.explanation_params["umap_n_neighbors"],
                    "min_dist": self.explanation_params["umap_min_dist"],
                    "n_components": self.explanation_params["umap_n_components"],
                    "metric": self.explanation_params["umap_metric"]
                },
                "hdbscan_parameters": {
                    "min_cluster_size": self.explanation_params["hdbscan_min_cluster_size"],
                    "min_samples": self.explanation_params["hdbscan_min_samples"],
                    "metric": self.explanation_params["hdbscan_metric"]
                },
                "recursion_parameters": {
                    "max_depth": self.max_recursion_depth,
                    "min_cluster_size_for_recursion": self.explanation_params["min_cluster_size_for_recursion"],
                    "min_cluster_percentage": self.min_cluster_percentage
                }
            },
            "cluster_tree": root_node.to_dict(),
            "explanation_id_mapping": {int(i): explanation_ids[i] for i in range(len(explanation_ids))}
        }

        return results

    def extract_quality_metrics_summary(self, cluster_tree: Dict) -> Dict:
        """
        Recursively extract quality metrics from cluster tree.

        Args:
            cluster_tree: Cluster tree dictionary

        Returns:
            Dictionary with aggregated quality metrics
        """
        metrics_list = []

        def traverse(node, level=0):
            if "metadata" in node and "quality_metrics" in node["metadata"]:
                quality = node["metadata"]["quality_metrics"]
                if "silhouette_score" in quality and quality["silhouette_score"] is not None:
                    metrics_list.append({
                        "level": level,
                        "cluster_id": node["cluster_id"],
                        "n_clusters": node["metadata"]["n_clusters"],
                        "size": node["size"],
                        "silhouette_score": quality["silhouette_score"],
                        "davies_bouldin_index": quality.get("davies_bouldin_index"),
                        "calinski_harabasz_score": quality.get("calinski_harabasz_score")
                    })

            for child in node.get("children", []):
                traverse(child, level + 1)

        traverse(cluster_tree)

        # Compute aggregated statistics
        if metrics_list:
            silhouette_scores = [m["silhouette_score"] for m in metrics_list]
            db_scores = [m["davies_bouldin_index"] for m in metrics_list if m["davies_bouldin_index"] is not None]
            ch_scores = [m["calinski_harabasz_score"] for m in metrics_list if m["calinski_harabasz_score"] is not None]

            summary = {
                "all_metrics": metrics_list,
                "aggregated": {
                    "mean_silhouette": float(np.mean(silhouette_scores)),
                    "max_silhouette": float(np.max(silhouette_scores)),
                    "min_silhouette": float(np.min(silhouette_scores)),
                    "mean_davies_bouldin": float(np.mean(db_scores)) if db_scores else None,
                    "mean_calinski_harabasz": float(np.mean(ch_scores)) if ch_scores else None,
                    "n_evaluated_nodes": len(metrics_list)
                }
            }
        else:
            summary = {
                "all_metrics": [],
                "aggregated": {
                    "note": "No quality metrics available"
                }
            }

        return summary

    def save_results(
        self,
        feature_results: Optional[Dict],
        explanation_results: Optional[Dict]
    ) -> None:
        """Save clustering results to JSON files."""

        if feature_results:
            feature_output_path = self.output_dir / "feature_recursive_clustering.json"
            with open(feature_output_path, 'w', encoding='utf-8') as f:
                json.dump(feature_results, f, indent=2, ensure_ascii=False, cls=NumpyEncoder)
            logger.info(f"Feature results → {feature_output_path}")

        if explanation_results:
            explanation_output_path = self.output_dir / "explanation_recursive_clustering.json"
            with open(explanation_output_path, 'w', encoding='utf-8') as f:
                json.dump(explanation_results, f, indent=2, ensure_ascii=False, cls=NumpyEncoder)
            logger.info(f"Explanation results → {explanation_output_path}")

        # Save config
        config_path = self.output_dir / "config.json"
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(self.config, f, indent=2, ensure_ascii=False, cls=NumpyEncoder)
        logger.info(f"Config → {config_path}")

        # Save hyperparameter tracking summary
        self.save_hyperparameter_tracking(feature_results, explanation_results)

    def save_hyperparameter_tracking(
        self,
        feature_results: Optional[Dict],
        explanation_results: Optional[Dict]
    ) -> None:
        """
        Save hyperparameters and quality scores to tracking file for comparison.

        Args:
            feature_results: Feature clustering results
            explanation_results: Explanation clustering results
        """
        tracking_file = self.output_dir / "hyperparameter_tracking.jsonl"

        # Create tracking entry
        tracking_entry = {
            "timestamp": datetime.now().isoformat(),
            "run_id": datetime.now().strftime("%Y%m%d_%H%M%S"),
            "hyperparameters": {
                "global": {
                    "max_recursion_depth": self.max_recursion_depth,
                    "min_cluster_percentage": self.min_cluster_percentage
                },
                "features": self.feature_params,
                "explanations": self.explanation_params
            },
            "results": {}
        }

        # Extract quality metrics for features
        if feature_results:
            feature_quality = self.extract_quality_metrics_summary(feature_results["cluster_tree"])
            tracking_entry["results"]["features"] = {
                "n_features": feature_results["metadata"]["n_features"],
                "original_dimensionality": feature_results["metadata"]["original_dimensionality"],
                "quality_summary": feature_quality["aggregated"],
                "detailed_metrics": feature_quality["all_metrics"]
            }

        # Extract quality metrics for explanations
        if explanation_results:
            explanation_quality = self.extract_quality_metrics_summary(explanation_results["cluster_tree"])
            tracking_entry["results"]["explanations"] = {
                "n_explanations": explanation_results["metadata"]["n_explanations"],
                "original_dimensionality": explanation_results["metadata"]["original_dimensionality"],
                "quality_summary": explanation_quality["aggregated"],
                "detailed_metrics": explanation_quality["all_metrics"]
            }

        # Append to JSONL file (one line per run)
        with open(tracking_file, 'a', encoding='utf-8') as f:
            f.write(json.dumps(tracking_entry, cls=NumpyEncoder) + '\n')

        logger.info(f"Hyperparameter tracking → {tracking_file}")

        # Also save a human-readable summary for latest run
        summary_file = self.output_dir / "latest_run_summary.txt"
        with open(summary_file, 'w', encoding='utf-8') as f:
            f.write("="*80 + "\n")
            f.write("RECURSIVE CLUSTERING - HYPERPARAMETER TRACKING SUMMARY\n")
            f.write("="*80 + "\n\n")
            f.write(f"Run ID: {tracking_entry['run_id']}\n")
            f.write(f"Timestamp: {tracking_entry['timestamp']}\n\n")

            f.write("HYPERPARAMETERS\n")
            f.write("-" * 80 + "\n")
            f.write(f"Global:\n")
            f.write(f"  Max Recursion Depth: {self.max_recursion_depth}\n")
            f.write(f"  Min Cluster Percentage: {self.min_cluster_percentage}%\n\n")

            f.write(f"Features:\n")
            for key, val in self.feature_params.items():
                f.write(f"  {key}: {val}\n")
            f.write("\n")

            f.write(f"Explanations:\n")
            for key, val in self.explanation_params.items():
                f.write(f"  {key}: {val}\n")
            f.write("\n")

            f.write("QUALITY METRICS SUMMARY\n")
            f.write("-" * 80 + "\n")

            if "features" in tracking_entry["results"]:
                f.write("Features:\n")
                agg = tracking_entry["results"]["features"]["quality_summary"]
                if "mean_silhouette" in agg:
                    f.write(f"  Mean Silhouette Score: {agg['mean_silhouette']:.3f}\n")
                    f.write(f"  Max Silhouette Score: {agg['max_silhouette']:.3f}\n")
                    f.write(f"  Min Silhouette Score: {agg['min_silhouette']:.3f}\n")
                    if agg.get("mean_davies_bouldin"):
                        f.write(f"  Mean Davies-Bouldin Index: {agg['mean_davies_bouldin']:.3f}\n")
                    if agg.get("mean_calinski_harabasz"):
                        f.write(f"  Mean Calinski-Harabasz Score: {agg['mean_calinski_harabasz']:.1f}\n")
                    f.write(f"  Evaluated Nodes: {agg['n_evaluated_nodes']}\n")
                f.write("\n")

            if "explanations" in tracking_entry["results"]:
                f.write("Explanations:\n")
                agg = tracking_entry["results"]["explanations"]["quality_summary"]
                if "mean_silhouette" in agg:
                    f.write(f"  Mean Silhouette Score: {agg['mean_silhouette']:.3f}\n")
                    f.write(f"  Max Silhouette Score: {agg['max_silhouette']:.3f}\n")
                    f.write(f"  Min Silhouette Score: {agg['min_silhouette']:.3f}\n")
                    if agg.get("mean_davies_bouldin"):
                        f.write(f"  Mean Davies-Bouldin Index: {agg['mean_davies_bouldin']:.3f}\n")
                    if agg.get("mean_calinski_harabasz"):
                        f.write(f"  Mean Calinski-Harabasz Score: {agg['mean_calinski_harabasz']:.1f}\n")
                    f.write(f"  Evaluated Nodes: {agg['n_evaluated_nodes']}\n")

        logger.info(f"Latest run summary → {summary_file}")

    def process_all(self) -> None:
        """Process recursive clustering for both features and explanations."""
        logger.info("="*70)
        logger.info("RECURSIVE UMAP + HDBSCAN CLUSTERING (Spotify Engineering)")
        logger.info("="*70)
        logger.info(f"Max recursion depth: {self.max_recursion_depth}")
        logger.info(f"Min cluster percentage: {self.min_cluster_percentage}%")
        logger.info(f"Save visualizations: {'✓ ENABLED' if self.save_visualizations else '✗ DISABLED'}")
        if self.save_visualizations:
            logger.info(f"Visualization directory: {self.viz_dir}")
        logger.info("")
        logger.info("CLUSTERING QUALITY METRICS:")
        logger.info("  • Silhouette Score: [-1, 1], higher is better (cluster separation)")
        logger.info("  • Davies-Bouldin Index: [0, ∞), lower is better (cluster compactness)")
        logger.info("  • Calinski-Harabasz Score: [0, ∞), higher is better (variance ratio)")
        logger.info("")
        logger.info("SEPARATE PARAMETER SETS:")
        logger.info("  Features (orthogonal, cosine similarity < 0.25):")
        logger.info(f"    - UMAP: n_neighbors={self.feature_params['umap_n_neighbors']}, "
                   f"min_dist={self.feature_params['umap_min_dist']}, "
                   f"metric={self.feature_params['umap_metric']}, "
                   f"n_components={self.feature_params['umap_n_components']}")
        logger.info(f"    - HDBSCAN: min_cluster_size={self.feature_params['hdbscan_min_cluster_size']}")
        logger.info(f"    - Recursion: min_size={self.feature_params['min_cluster_size_for_recursion']}")
        logger.info("  Explanations (higher internal similarity):")
        logger.info(f"    - UMAP: n_neighbors={self.explanation_params['umap_n_neighbors']}, "
                   f"min_dist={self.explanation_params['umap_min_dist']}, "
                   f"metric={self.explanation_params['umap_metric']}, "
                   f"n_components={self.explanation_params['umap_n_components']}")
        logger.info(f"    - HDBSCAN: min_cluster_size={self.explanation_params['hdbscan_min_cluster_size']}")
        logger.info(f"    - Recursion: min_size={self.explanation_params['min_cluster_size_for_recursion']}")

        # Process features
        feature_results = self.process_feature_clustering()

        # Process explanations
        explanation_results = self.process_explanation_clustering()

        # Save results
        logger.info("\n" + "="*70)
        logger.info("SAVING RESULTS")
        logger.info("="*70)
        self.save_results(feature_results, explanation_results)

        logger.info("\n" + "="*70)
        logger.info("COMPLETE")
        logger.info("="*70)


def load_config(config_path: Optional[str] = None) -> Dict:
    """Load configuration from file or use defaults."""
    default_config = {
        "output_directory": "data/recursive_clustering",
        "embeddings_directory": "data/embeddings",
        "sae_model_name": "google/gemma-scope-9b-pt-res",
        "sae_position": "layer_30/width_16k/average_l0_120",
        "feature_range_start": 0,
        "feature_range_end": 1000,
        "explanation_sources": [
            "llama_e-llama_s",
            "gwen_e-llama_s",
            "openai_e-llama_s"
        ],
        "max_recursion_depth": 3,
        "min_cluster_percentage": 1.0,
        "save_visualizations": False,
        "feature_parameters": {
            "umap_n_neighbors": 20,
            "umap_min_dist": 0.3,
            "umap_metric": "cosine",
            "umap_n_components": 2,
            "hdbscan_min_cluster_size": 15,
            "hdbscan_min_samples": 5,
            "hdbscan_metric": "euclidean",
            "min_cluster_size_for_recursion": 15
        },
        "explanation_parameters": {
            "umap_n_neighbors": 30,
            "umap_min_dist": 0.2,
            "umap_metric": "cosine",
            "umap_n_components": 2,
            "hdbscan_min_cluster_size": 20,
            "hdbscan_min_samples": 5,
            "hdbscan_metric": "euclidean",
            "min_cluster_size_for_recursion": 20
        }
    }

    if config_path and Path(config_path).exists():
        logger.info(f"Loading config: {config_path}")
        with open(config_path, 'r') as f:
            file_config = json.load(f)
        default_config.update(file_config)
    else:
        logger.info("Using default configuration")

    return default_config


def main():
    """Main execution function."""
    parser = argparse.ArgumentParser(
        description="Recursive UMAP + HDBSCAN clustering on high-dimensional embeddings"
    )
    parser.add_argument("--config", help="Path to configuration file")
    args = parser.parse_args()

    try:
        config = load_config(args.config)
        processor = RecursiveUMAPHDBSCAN(config)
        processor.process_all()

        logger.info("\nRecursive clustering completed successfully!")
        return 0

    except Exception as e:
        logger.error(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit(main())
