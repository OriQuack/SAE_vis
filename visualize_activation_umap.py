#!/usr/bin/env python3
"""
UMAP Visualization Script for Activation Example Embeddings

Visualizes UMAP projections of activation examples to demonstrate that
"activation examples belonging to the same feature cluster together".

Key insight: If activation examples from the same feature cluster in the
embedding space, it indicates semantic consistency within that feature.

Data:
  - 16,384 features × ~16 examples each = ~255k activation examples
  - Each example has a 768D embedding

Visualization modes:
  1. Centroid view (default): One centroid per feature (~16k points, fast)
  2. Global view: All examples colored by feature_id (density-based coloring)
  3. Highlight view: Specific features highlighted to show clustering
  4. Convex hull view: Draw convex hulls around feature clusters

GPU Acceleration:
  - Uses CUDA-accelerated UMAP (cuML) if available
  - Falls back to CPU UMAP (umap-learn) otherwise

Usage:
    python visualize_activation_umap.py                      # Default centroid view (fast)
    python visualize_activation_umap.py --main-feature 865   # Highlight main feature with similar features
    python visualize_activation_umap.py --main-feature 865 --top-k 15
    python visualize_activation_umap.py --no-centroid        # Use all embeddings (slower)
    python visualize_activation_umap.py --no-centroid --mode highlight --features 100 200 300
    python visualize_activation_umap.py --no-centroid --mode hull --n-features 10
    python visualize_activation_umap.py --no-centroid --sample 50000
    python visualize_activation_umap.py --n-neighbors 30 --min-dist 0.2
"""

import argparse
import sys
from pathlib import Path
from typing import Tuple, Optional, List
from functools import wraps

# Apply sklearn compatibility patch BEFORE importing umap
def _apply_sklearn_compat_patch():
    """Patch sklearn.utils.validation.check_array for umap compatibility."""
    try:
        from sklearn.utils.validation import check_array as _original_check_array

        @wraps(_original_check_array)
        def _patched_check_array(*args, **kwargs):
            if 'ensure_all_finite' in kwargs:
                kwargs['force_all_finite'] = kwargs.pop('ensure_all_finite')
            return _original_check_array(*args, **kwargs)

        import sklearn.utils.validation
        sklearn.utils.validation.check_array = _patched_check_array
    except Exception:
        pass

_apply_sklearn_compat_patch()

import numpy as np
import polars as pl
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
from matplotlib.collections import PatchCollection
from sklearn.preprocessing import StandardScaler
from scipy.spatial import ConvexHull

# Try CUDA-accelerated UMAP (cuML) first, fall back to CPU
CUDA_AVAILABLE = False
try:
    from cuml.manifold import UMAP as cumlUMAP
    CUDA_AVAILABLE = True
    print("Using CUDA-accelerated UMAP (cuML)")
except ImportError:
    pass

# CPU fallback (umap-learn)
try:
    import umap
    import sklearn.utils.validation
    umap.umap_.check_array = sklearn.utils.validation.check_array
    if not CUDA_AVAILABLE:
        print("Using CPU UMAP (umap-learn)")
except ImportError:
    if not CUDA_AVAILABLE:
        print("Error: Neither cuML nor umap-learn installed.")
        print("  Install umap-learn with: pip install umap-learn")
        print("  Or install cuML for CUDA acceleration: pip install cuml-cu12")
        sys.exit(1)


# =============================================================================
# HYPERPARAMETERS
# =============================================================================
UMAP_N_NEIGHBORS = 15      # Higher = more global structure, lower = more local detail
UMAP_MIN_DIST = 0.1        # Higher = more spread out, lower = tighter clusters
UMAP_METRIC = "cosine"     # cosine works well for text embeddings
RANDOM_SEED = 42
SAMPLE_SIZE = 50000        # Default sample size for faster iteration
OUTPUT_FILE = "umap_activation_embeddings.png"

# Data paths
DATA_DIR = Path(__file__).parent / "data" / "master"
ACTIVATION_EMBEDDINGS_PARQUET = DATA_DIR / "activation_embeddings.parquet"


def load_activation_embeddings(
    sample_size: Optional[int] = None,
    feature_ids_filter: Optional[List[int]] = None,
    random_state: int = RANDOM_SEED
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Load activation embeddings, flattening the structure so each row is one example.

    Returns:
        embeddings: (N, 768) array of embeddings
        feature_ids: (N,) array of feature IDs for each embedding
    """
    print("Loading activation embeddings...")

    df = pl.read_parquet(ACTIVATION_EMBEDDINGS_PARQUET)

    if feature_ids_filter is not None:
        df = df.filter(pl.col("feature_id").is_in(feature_ids_filter))
        print(f"  Filtered to {len(df)} features")

    # Explode to one row per activation example
    # First rename, then explode as DataFrame method
    df_exploded = (
        df.select(["feature_id", pl.col("embeddings").alias("embedding")])
        .explode("embedding")
        .filter(pl.col("embedding").is_not_null())
    )

    print(f"  Total examples: {len(df_exploded)}")

    # Sample if needed
    if sample_size and len(df_exploded) > sample_size:
        df_exploded = df_exploded.sample(n=sample_size, seed=random_state)
        print(f"  Sampled to {len(df_exploded)} examples")

    # Extract arrays
    feature_ids = df_exploded["feature_id"].to_numpy()

    # Convert list of embeddings to numpy array
    embeddings_list = df_exploded["embedding"].to_list()
    embeddings = np.array(embeddings_list, dtype=np.float32)

    print(f"  Embeddings shape: {embeddings.shape}")

    return embeddings, feature_ids


def load_feature_centroids(
    feature_ids_filter: Optional[List[int]] = None,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Load activation embeddings and compute centroid per feature.

    Returns:
        centroids: (N_features, 768) array of centroid embeddings
        feature_ids: (N_features,) array of feature IDs
    """
    print("Loading activation embeddings and computing centroids...")

    df = pl.read_parquet(ACTIVATION_EMBEDDINGS_PARQUET)

    if feature_ids_filter is not None:
        df = df.filter(pl.col("feature_id").is_in(feature_ids_filter))
        print(f"  Filtered to {len(df)} features")

    # Compute centroid for each feature
    centroids = []
    feature_ids = []

    for row in df.iter_rows(named=True):
        fid = row["feature_id"]
        embeddings_list = row["embeddings"]

        if embeddings_list and len(embeddings_list) > 0:
            embeddings_array = np.array(embeddings_list, dtype=np.float32)
            centroid = np.mean(embeddings_array, axis=0)
            centroids.append(centroid)
            feature_ids.append(fid)

    centroids = np.array(centroids, dtype=np.float32)
    feature_ids = np.array(feature_ids, dtype=np.int32)

    print(f"  Computed {len(centroids)} feature centroids")
    print(f"  Centroids shape: {centroids.shape}")

    return centroids, feature_ids


def compute_cosine_similarities(
    centroids: np.ndarray,
    feature_ids: np.ndarray,
    main_feature_id: int,
) -> Tuple[np.ndarray, int]:
    """
    Compute cosine similarity from main feature to all others.

    Returns:
        similarities: (N,) array of cosine similarities to main feature
        main_idx: index of the main feature in the arrays
    """
    # Find main feature index
    main_indices = np.where(feature_ids == main_feature_id)[0]
    if len(main_indices) == 0:
        raise ValueError(f"Main feature {main_feature_id} not found in feature_ids")
    main_idx = main_indices[0]
    main_centroid = centroids[main_idx]

    # Normalize for cosine similarity
    norms = np.linalg.norm(centroids, axis=1, keepdims=True)
    normalized = centroids / (norms + 1e-8)
    main_norm = main_centroid / (np.linalg.norm(main_centroid) + 1e-8)

    # Compute cosine similarities
    similarities = normalized @ main_norm

    return similarities, main_idx


def run_umap(
    data: np.ndarray,
    n_neighbors: int = 15,
    min_dist: float = 0.1,
    metric: str = "cosine",
    random_state: int = 42
) -> np.ndarray:
    """Run UMAP dimensionality reduction (CUDA if available, else CPU)."""
    backend = "CUDA (cuML)" if CUDA_AVAILABLE else "CPU (umap-learn)"
    print(f"Running UMAP [{backend}] (n_neighbors={n_neighbors}, min_dist={min_dist}, metric={metric})...")

    # Handle NaN/inf values
    data_clean = np.nan_to_num(data, nan=0.0, posinf=0.0, neginf=0.0)

    # Standardize for euclidean metric, skip for cosine
    if metric != "cosine":
        scaler = StandardScaler()
        data_clean = scaler.fit_transform(data_clean)
        data_clean = np.nan_to_num(data_clean, nan=0.0, posinf=0.0, neginf=0.0)

    if CUDA_AVAILABLE:
        # cuML prefers float32 and doesn't support low_memory parameter
        data_clean = np.ascontiguousarray(data_clean, dtype=np.float32)
        reducer = cumlUMAP(
            n_neighbors=n_neighbors,
            min_dist=min_dist,
            metric=metric,
            random_state=random_state,
            n_components=2,
            verbose=False
        )
    else:
        data_clean = np.ascontiguousarray(data_clean, dtype=np.float64)
        reducer = umap.UMAP(
            n_neighbors=n_neighbors,
            min_dist=min_dist,
            metric=metric,
            random_state=random_state,
            n_components=2,
            verbose=False,
            low_memory=True
        )

    reducer.fit(data_clean)
    embedding = reducer.embedding_
    print(f"  UMAP complete: {embedding.shape}")

    return embedding


def compute_cluster_metrics(
    umap_coords: np.ndarray,
    feature_ids: np.ndarray
) -> dict:
    """
    Compute metrics to quantify how well features cluster.

    Returns:
        dict with intra_dist_mean, inter_dist_mean, and clustering_ratio
    """
    from scipy.spatial.distance import cdist

    unique_features = np.unique(feature_ids)

    # Sample features for computation efficiency
    if len(unique_features) > 500:
        rng = np.random.default_rng(RANDOM_SEED)
        unique_features = rng.choice(unique_features, 500, replace=False)

    intra_distances = []
    centroids = []

    for fid in unique_features:
        mask = feature_ids == fid
        points = umap_coords[mask]
        if len(points) >= 2:
            # Intra-cluster: mean pairwise distance within feature
            dists = cdist(points, points)
            intra_distances.append(np.mean(dists[np.triu_indices(len(points), k=1)]))
            centroids.append(points.mean(axis=0))

    centroids = np.array(centroids)

    # Inter-cluster: distance between centroids
    if len(centroids) >= 2:
        centroid_dists = cdist(centroids, centroids)
        inter_dist_mean = np.mean(centroid_dists[np.triu_indices(len(centroids), k=1)])
    else:
        inter_dist_mean = 0.0

    intra_dist_mean = np.mean(intra_distances) if intra_distances else 0.0
    clustering_ratio = inter_dist_mean / intra_dist_mean if intra_dist_mean > 0 else 0.0

    return {
        "intra_dist_mean": intra_dist_mean,
        "inter_dist_mean": inter_dist_mean,
        "clustering_ratio": clustering_ratio  # Higher = better clustering
    }


def plot_global_view(
    umap_coords: np.ndarray,
    feature_ids: np.ndarray,
    output_path: str,
    metrics: dict
):
    """
    Plot all activation examples colored by feature ID.
    Uses a cyclic colormap to distinguish nearby feature IDs.
    """
    _fig, ax = plt.subplots(figsize=(12, 10))

    # Normalize feature IDs to [0, 1] for coloring
    # Use modulo to create visual distinction even for nearby IDs
    unique_features = np.unique(feature_ids)
    n_features = len(unique_features)

    # Create a mapping that spreads colors more evenly
    feature_to_idx = {fid: i for i, fid in enumerate(unique_features)}
    color_indices = np.array([feature_to_idx[fid] for fid in feature_ids])

    # Use HSV-based coloring with golden ratio increment for max distinction
    golden_ratio = (1 + np.sqrt(5)) / 2
    hues = (color_indices * golden_ratio) % 1.0

    ax.scatter(
        umap_coords[:, 0],
        umap_coords[:, 1],
        c=hues,
        cmap='hsv',
        alpha=0.4,
        s=3,
        edgecolors='none'
    )

    ax.set_title(
        f"Activation Examples UMAP (768D → 2D)\n"
        f"Each point = one activation example, colored by feature ID",
        fontsize=12
    )
    ax.set_xlabel("UMAP 1", fontsize=10)
    ax.set_ylabel("UMAP 2", fontsize=10)

    # Add statistics box
    stats_text = (
        f"Examples: {len(umap_coords):,}\n"
        f"Features: {n_features:,}\n"
        f"Clustering ratio: {metrics['clustering_ratio']:.2f}\n"
        f"(inter/intra dist, higher = better)"
    )
    ax.text(
        0.02, 0.98, stats_text,
        transform=ax.transAxes,
        fontsize=9,
        verticalalignment='top',
        bbox=dict(boxstyle='round', facecolor='white', alpha=0.9)
    )

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    print(f"Saved global view to: {output_path}")


def plot_highlight_view(
    umap_coords: np.ndarray,
    feature_ids: np.ndarray,
    highlight_features: List[int],
    output_path: str
):
    """
    Plot with specific features highlighted to show their clustering.
    """
    _fig, ax = plt.subplots(figsize=(12, 10))

    # Plot all points in gray
    ax.scatter(
        umap_coords[:, 0],
        umap_coords[:, 1],
        c='#cccccc',
        alpha=0.2,
        s=2,
        edgecolors='none',
        label='Other features'
    )

    # Highlight selected features with distinct colors
    tab10 = plt.colormaps.get_cmap('tab10')  # type: ignore
    colors = [tab10(i) for i in range(10)]
    for i, fid in enumerate(highlight_features):
        mask = feature_ids == fid
        if mask.sum() > 0:
            ax.scatter(
                umap_coords[mask, 0],
                umap_coords[mask, 1],
                c=[colors[i % len(colors)]],
                alpha=0.8,
                s=30,
                edgecolors='white',
                linewidths=0.5,
                label=f'Feature {fid} (n={mask.sum()})'
            )

    ax.set_title(
        f"Highlighted Features - Activation Examples\n"
        f"Showing {len(highlight_features)} features",
        fontsize=12
    )
    ax.set_xlabel("UMAP 1", fontsize=10)
    ax.set_ylabel("UMAP 2", fontsize=10)
    ax.legend(loc='upper right', fontsize=8)

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    print(f"Saved highlight view to: {output_path}")


def plot_centroid_view(
    umap_coords: np.ndarray,
    feature_ids: np.ndarray,
    output_path: str,
    main_feature_id: Optional[int] = None,
    similarities: Optional[np.ndarray] = None,
    main_idx: Optional[int] = None,
    top_k: int = 10,
):
    """
    Plot feature centroids in monochrome gray.
    Optionally highlight a main feature and its top-k similar features.

    Args:
        umap_coords: (N, 2) UMAP coordinates
        feature_ids: (N,) feature IDs
        output_path: path to save the figure
        main_feature_id: optional feature ID to highlight
        similarities: optional (N,) cosine similarities to main feature
        main_idx: optional index of main feature in arrays
        top_k: number of similar features to connect to main feature
    """
    _fig, ax = plt.subplots(figsize=(12, 10))

    n_features = len(feature_ids)

    # Plot all points in monochrome gray
    ax.scatter(
        umap_coords[:, 0],
        umap_coords[:, 1],
        c='#888888',
        alpha=0.5,
        s=8,
        edgecolors='none'
    )

    # If main feature is specified, highlight it with connections
    if main_feature_id is not None and similarities is not None and main_idx is not None:
        # Get top-k similar features (excluding main)
        sim_copy = similarities.copy()
        sim_copy[main_idx] = -np.inf  # Exclude self
        top_k_indices = np.argsort(sim_copy)[-top_k:][::-1]

        # Draw lines from main to similar features
        main_pos = umap_coords[main_idx]
        for idx in top_k_indices:
            target_pos = umap_coords[idx]
            sim_val = float(similarities[idx])
            ax.plot(
                [main_pos[0], target_pos[0]],
                [main_pos[1], target_pos[1]],
                color='steelblue',
                alpha=0.3 + 0.7 * max(0.0, sim_val),  # Opacity by similarity
                linewidth=1,
                zorder=1
            )

        # Highlight similar features
        ax.scatter(
            umap_coords[top_k_indices, 0],
            umap_coords[top_k_indices, 1],
            c='steelblue',
            s=30,
            edgecolors='white',
            linewidths=0.5,
            zorder=3,
            label=f'Top-{top_k} similar'
        )

        # Highlight main feature with a star
        ax.scatter(
            [main_pos[0]], [main_pos[1]],
            c='red',
            s=100,
            edgecolors='white',
            linewidths=1,
            marker='*',
            zorder=4,
            label=f'Main: {main_feature_id}'
        )

        ax.legend(loc='upper right', fontsize=9)

        # Print similarity info
        print(f"\nTop-{top_k} features most similar to feature {main_feature_id}:")
        for rank, idx in enumerate(top_k_indices, 1):
            print(f"  {rank}. Feature {feature_ids[idx]}: similarity = {similarities[idx]:.4f}")

    # Set title
    if main_feature_id is not None:
        title = (
            f"Feature Centroids UMAP (768D → 2D)\n"
            f"Main feature {main_feature_id} with top-{top_k} similar features"
        )
    else:
        title = (
            f"Feature Centroids UMAP (768D → 2D)\n"
            f"Each point = one feature centroid ({n_features:,} features)"
        )
    ax.set_title(title, fontsize=12)
    ax.set_xlabel("UMAP 1", fontsize=10)
    ax.set_ylabel("UMAP 2", fontsize=10)

    # Add statistics box
    stats_text = f"Features: {n_features:,}\nMode: Centroid per feature"
    if main_feature_id is not None:
        stats_text += f"\nMain feature: {main_feature_id}"
    ax.text(
        0.02, 0.98, stats_text,
        transform=ax.transAxes,
        fontsize=9,
        verticalalignment='top',
        bbox=dict(boxstyle='round', facecolor='white', alpha=0.9)
    )

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    print(f"Saved centroid view to: {output_path}")


def plot_hull_view(
    umap_coords: np.ndarray,
    feature_ids: np.ndarray,
    n_features: int,
    output_path: str
):
    """
    Plot with convex hulls around feature clusters.
    Randomly selects n_features to highlight with hulls.
    """
    _fig, ax = plt.subplots(figsize=(12, 10))

    # Plot all points in light gray
    ax.scatter(
        umap_coords[:, 0],
        umap_coords[:, 1],
        c='#dddddd',
        alpha=0.3,
        s=2,
        edgecolors='none'
    )

    # Select random features with enough points for convex hull
    unique_features = np.unique(feature_ids)
    rng = np.random.default_rng(RANDOM_SEED)

    # Filter features with at least 3 points (minimum for convex hull)
    valid_features = [
        fid for fid in unique_features
        if (feature_ids == fid).sum() >= 3
    ]

    selected_features = rng.choice(
        valid_features,
        min(n_features, len(valid_features)),
        replace=False
    )

    tab20 = plt.colormaps.get_cmap('tab20')  # type: ignore
    colors = [tab20(i) for i in range(20)]
    patches = []
    patch_colors = []

    for i, fid in enumerate(selected_features):
        mask = feature_ids == fid
        points = umap_coords[mask]

        if len(points) >= 3:
            try:
                hull = ConvexHull(points)
                hull_points = points[hull.vertices]

                # Draw hull
                polygon = Polygon(hull_points, closed=True)
                patches.append(polygon)
                patch_colors.append(colors[i % len(colors)])

                # Plot points
                ax.scatter(
                    points[:, 0],
                    points[:, 1],
                    c=[colors[i % len(colors)]],
                    alpha=0.8,
                    s=20,
                    edgecolors='white',
                    linewidths=0.3,
                    zorder=3
                )
            except Exception:
                pass

    # Add hulls as transparent patches
    collection = PatchCollection(
        patches,
        alpha=0.2,
        facecolors=patch_colors,
        edgecolors=patch_colors,
        linewidths=1.5
    )
    ax.add_collection(collection)

    ax.set_title(
        f"Convex Hulls Around Feature Clusters\n"
        f"Showing {len(selected_features)} random features",
        fontsize=12
    )
    ax.set_xlabel("UMAP 1", fontsize=10)
    ax.set_ylabel("UMAP 2", fontsize=10)

    # Add explanation
    ax.text(
        0.02, 0.98,
        "Each colored region = examples from one feature\n"
        "Tight clusters indicate semantic consistency",
        transform=ax.transAxes,
        fontsize=9,
        verticalalignment='top',
        bbox=dict(boxstyle='round', facecolor='white', alpha=0.9)
    )

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    print(f"Saved hull view to: {output_path}")


def main():
    parser = argparse.ArgumentParser(
        description="UMAP visualization for activation example embeddings",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python visualize_activation_umap.py                      # Default centroid view (fast)
    python visualize_activation_umap.py --main-feature 865   # Highlight main feature with similar features
    python visualize_activation_umap.py --main-feature 865 --top-k 15
    python visualize_activation_umap.py --no-centroid        # Use all embeddings (slow)
    python visualize_activation_umap.py --no-centroid --mode highlight --features 100 200 300 400 500
    python visualize_activation_umap.py --no-centroid --mode hull --n-features 15
    python visualize_activation_umap.py --no-centroid --sample 30000 --min-dist 0.2
    python visualize_activation_umap.py --no-centroid --no-sample  # Use all data (very slow)
        """
    )

    parser.add_argument(
        "--no-centroid", action="store_true",
        help="Use individual embeddings instead of centroids (slower, ~255k points)"
    )
    parser.add_argument(
        "--main-feature", type=int, default=None,
        help="Feature ID to highlight as main; draws lines to top-k similar features (centroid mode only)"
    )
    parser.add_argument(
        "--top-k", type=int, default=10,
        help="Number of similar features to connect to main feature (default: 10)"
    )
    parser.add_argument(
        "--mode", type=str, default="global",
        choices=["global", "highlight", "hull"],
        help="Visualization mode for non-centroid: global (all colored), highlight (specific features), hull (convex hulls)"
    )
    parser.add_argument(
        "--features", type=int, nargs="+", default=[100, 500, 1000, 2000, 5000],
        help="Feature IDs to highlight (for highlight mode)"
    )
    parser.add_argument(
        "--n-features", type=int, default=15,
        help="Number of features to show hulls for (for hull mode)"
    )
    parser.add_argument(
        "--n-neighbors", type=int, default=UMAP_N_NEIGHBORS,
        help=f"UMAP n_neighbors parameter (default: {UMAP_N_NEIGHBORS})"
    )
    parser.add_argument(
        "--min-dist", type=float, default=UMAP_MIN_DIST,
        help=f"UMAP min_dist parameter (default: {UMAP_MIN_DIST})"
    )
    parser.add_argument(
        "--metric", type=str, default=UMAP_METRIC,
        choices=["euclidean", "cosine", "manhattan"],
        help=f"UMAP distance metric (default: {UMAP_METRIC})"
    )
    parser.add_argument(
        "--sample", type=int, default=SAMPLE_SIZE,
        help=f"Sample N examples for faster iteration (default: {SAMPLE_SIZE})"
    )
    parser.add_argument(
        "--no-sample", action="store_true",
        help="Use all data without sampling (slower)"
    )
    parser.add_argument(
        "--output", "-o", type=str, default=OUTPUT_FILE,
        help=f"Output file path (default: {OUTPUT_FILE})"
    )
    parser.add_argument(
        "--seed", type=int, default=RANDOM_SEED,
        help=f"Random seed for reproducibility (default: {RANDOM_SEED})"
    )

    args = parser.parse_args()

    # Determine mode: centroid is default, --no-centroid uses individual embeddings
    use_centroid = not args.no_centroid

    print("=" * 60)
    print("UMAP Visualization for Activation Example Embeddings")
    print("=" * 60)
    if use_centroid:
        print("Mode: centroid (one centroid per feature)")
        if args.main_feature is not None:
            print(f"Main feature: {args.main_feature} (top-{args.top_k} similar)")
    else:
        print(f"Mode: {args.mode} (individual embeddings)")
    print(f"Parameters: n_neighbors={args.n_neighbors}, min_dist={args.min_dist}, metric={args.metric}")

    if use_centroid:
        # Centroid mode: compute centroid per feature, then UMAP
        print()
        embeddings, feature_ids = load_feature_centroids()

        # Compute similarities if main feature specified
        similarities, main_idx = None, None
        if args.main_feature is not None:
            print(f"Computing cosine similarities to feature {args.main_feature}...")
            similarities, main_idx = compute_cosine_similarities(
                embeddings, feature_ids, args.main_feature
            )

        # Run UMAP on centroids
        umap_coords = run_umap(
            embeddings,
            n_neighbors=args.n_neighbors,
            min_dist=args.min_dist,
            metric=args.metric,
            random_state=args.seed
        )
        print()

        # Generate centroid visualization
        plot_centroid_view(
            umap_coords,
            feature_ids,
            args.output,
            main_feature_id=args.main_feature,
            similarities=similarities,
            main_idx=main_idx,
            top_k=args.top_k
        )
    else:
        # Original behavior: individual embeddings
        sample_size = None if args.no_sample else args.sample
        if sample_size:
            print(f"Sampling: {sample_size} examples")
        else:
            print("Using all data (this may be slow)")
        print()

        # Load data
        # For highlight mode, we might want to ensure highlighted features are included
        feature_filter = None
        if args.mode == "highlight":
            # Load all data but ensure highlighted features are present
            feature_filter = None  # We'll filter after sampling to include highlights

        embeddings, feature_ids = load_activation_embeddings(
            sample_size=sample_size,
            feature_ids_filter=feature_filter,
            random_state=args.seed
        )

        # Run UMAP
        umap_coords = run_umap(
            embeddings,
            n_neighbors=args.n_neighbors,
            min_dist=args.min_dist,
            metric=args.metric,
            random_state=args.seed
        )
        print()

        # Compute clustering metrics
        print("Computing clustering metrics...")
        metrics = compute_cluster_metrics(umap_coords, feature_ids)
        print(f"  Intra-feature distance (mean): {metrics['intra_dist_mean']:.4f}")
        print(f"  Inter-feature distance (mean): {metrics['inter_dist_mean']:.4f}")
        print(f"  Clustering ratio: {metrics['clustering_ratio']:.4f}")
        print()

        # Generate visualization
        if args.mode == "global":
            plot_global_view(umap_coords, feature_ids, args.output, metrics)
        elif args.mode == "highlight":
            plot_highlight_view(umap_coords, feature_ids, args.features, args.output)
        elif args.mode == "hull":
            plot_hull_view(umap_coords, feature_ids, args.n_features, args.output)

    print("Done!")


if __name__ == "__main__":
    main()
