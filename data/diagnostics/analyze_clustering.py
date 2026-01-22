#!/usr/bin/env python3
"""
Analyze hierarchical clustering results at specific distance thresholds.

This script loads the pre-computed linkage matrix and generates cluster
assignments at various threshold values, showing:
- Number of clusters at each threshold
- Distribution of cluster sizes
- Singleton features vs. merged clusters

Usage:
    python analyze_clustering.py
    python analyze_clustering.py --thresholds 0.1 0.2 0.3 0.4 0.5
    python analyze_clustering.py --detailed --thresholds 0.3
    python analyze_clustering.py --plot clustering_analysis.png
"""

import argparse
import json
import logging
import numpy as np
import polars as pl
import matplotlib.pyplot as plt
from pathlib import Path
from typing import Dict, List, Tuple
from scipy.cluster.hierarchy import fcluster
from collections import Counter

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


def load_clustering_data(base_dir: Path) -> Tuple[np.ndarray, Dict]:
    """
    Load linkage matrix and metadata.

    Args:
        base_dir: Directory containing clustering outputs

    Returns:
        Tuple of (linkage_matrix, metadata)
    """
    linkage_path = base_dir / "clustering_linkage.npy"
    metadata_path = base_dir / "first_merge_clustering.parquet.metadata.json"

    if not linkage_path.exists():
        raise FileNotFoundError(
            f"Linkage matrix not found: {linkage_path}\n"
            f"Please run: python 2_feature_clustering.py"
        )

    logger.info(f"Loading linkage matrix from {linkage_path}")
    linkage_matrix = np.load(linkage_path)

    metadata = {}
    if metadata_path.exists():
        with open(metadata_path, 'r') as f:
            metadata = json.load(f)

    logger.info(f"Linkage matrix shape: {linkage_matrix.shape}")

    return linkage_matrix, metadata


def analyze_clusters_at_threshold(
    linkage_matrix: np.ndarray,
    threshold: float,
    n_features: int
) -> Dict:
    """
    Analyze cluster composition at a specific threshold.

    Args:
        linkage_matrix: Scipy linkage matrix
        threshold: Distance threshold for clustering
        n_features: Total number of features

    Returns:
        Dictionary with cluster statistics
    """
    # Get cluster assignments
    cluster_labels = fcluster(linkage_matrix, t=threshold, criterion='distance')

    # Count cluster sizes
    cluster_sizes = Counter(cluster_labels)

    # Statistics
    n_clusters = len(cluster_sizes)
    n_singletons = sum(1 for size in cluster_sizes.values() if size == 1)
    n_merged = n_clusters - n_singletons

    # Cluster size distribution
    sizes = sorted(cluster_sizes.values(), reverse=True)
    largest_cluster = sizes[0] if sizes else 0
    smallest_cluster = sizes[-1] if sizes else 0

    # Calculate size percentiles
    size_array = np.array(sizes)
    percentiles = {
        "min": int(size_array.min()) if len(size_array) > 0 else 0,
        "25th": int(np.percentile(size_array, 25)) if len(size_array) > 0 else 0,
        "50th": int(np.median(size_array)) if len(size_array) > 0 else 0,
        "75th": int(np.percentile(size_array, 75)) if len(size_array) > 0 else 0,
        "max": int(size_array.max()) if len(size_array) > 0 else 0,
        "mean": float(size_array.mean()) if len(size_array) > 0 else 0.0
    }

    return {
        "threshold": threshold,
        "n_clusters": n_clusters,
        "n_singletons": n_singletons,
        "n_merged_clusters": n_merged,
        "largest_cluster_size": largest_cluster,
        "smallest_cluster_size": smallest_cluster,
        "cluster_sizes": sizes,
        "size_percentiles": percentiles,
        "cluster_labels": cluster_labels
    }


def print_summary_table(results: List[Dict]):
    """
    Print a formatted table summarizing clustering at multiple thresholds.

    Args:
        results: List of result dictionaries from analyze_clusters_at_threshold
    """
    print("\n" + "=" * 100)
    print("CLUSTERING ANALYSIS SUMMARY")
    print("=" * 100)

    # Header
    print(f"{'Threshold':<12} {'# Clusters':<12} {'# Singletons':<14} "
          f"{'# Merged':<12} {'Largest':<10} {'Mean Size':<10}")
    print("-" * 100)

    # Rows
    for result in results:
        print(f"{result['threshold']:<12.4f} "
              f"{result['n_clusters']:<12,} "
              f"{result['n_singletons']:<14,} "
              f"{result['n_merged_clusters']:<12,} "
              f"{result['largest_cluster_size']:<10,} "
              f"{result['size_percentiles']['mean']:<10.2f}")

    print("=" * 100)


def print_detailed_analysis(result: Dict):
    """
    Print detailed analysis for a single threshold.

    Args:
        result: Result dictionary from analyze_clusters_at_threshold
    """
    print("\n" + "=" * 80)
    print(f"DETAILED ANALYSIS FOR THRESHOLD = {result['threshold']:.4f}")
    print("=" * 80)

    print(f"\n📊 CLUSTER STATISTICS:")
    print(f"  Total clusters: {result['n_clusters']:,}")
    print(f"  Singleton clusters (size=1): {result['n_singletons']:,}")
    print(f"  Merged clusters (size>1): {result['n_merged_clusters']:,}")

    print(f"\n📏 CLUSTER SIZE DISTRIBUTION:")
    percentiles = result['size_percentiles']
    print(f"  Min:    {percentiles['min']:,}")
    print(f"  25th:   {percentiles['25th']:,}")
    print(f"  Median: {percentiles['50th']:,}")
    print(f"  75th:   {percentiles['75th']:,}")
    print(f"  Max:    {percentiles['max']:,}")
    print(f"  Mean:   {percentiles['mean']:.2f}")

    # Show top 20 largest clusters
    sizes = result['cluster_sizes']
    top_n = min(20, len(sizes))

    print(f"\n🔝 TOP {top_n} LARGEST CLUSTERS:")
    print(f"  {'Rank':<6} {'Size':<10} {'% of Features':<15}")
    print(f"  {'-' * 6} {'-' * 10} {'-' * 15}")

    n_features = sum(sizes)
    for i, size in enumerate(sizes[:top_n], 1):
        pct = 100.0 * size / n_features
        print(f"  {i:<6} {size:<10,} {pct:<15.2f}%")

    # Size histogram
    print(f"\n📊 CLUSTER SIZE HISTOGRAM (By Cluster Count):")
    size_bins = [1, 2, 3, 5, 10, 20, 50, 100, 500, 1000, float('inf')]
    bin_labels = ['1', '2', '3-4', '5-9', '10-19', '20-49', '50-99', '100-499', '500-999', '1000+']

    histogram = Counter()
    features_in_bins = Counter()

    for size in sizes:
        for i, (lower, upper) in enumerate(zip(size_bins[:-1], size_bins[1:])):
            if lower <= size < upper:
                histogram[bin_labels[i]] += 1
                features_in_bins[bin_labels[i]] += size
                break

    print(f"  {'Size Range':<12} {'# Clusters':<12} {'% Clusters':<12} {'# Features':<12} {'% Features':<12} {'Bar'}")
    print(f"  {'-' * 12} {'-' * 12} {'-' * 12} {'-' * 12} {'-' * 12} {'-' * 20}")

    for label in bin_labels:
        count = histogram.get(label, 0)
        features = features_in_bins.get(label, 0)
        pct_clusters = 100.0 * count / len(sizes) if sizes else 0
        pct_features = 100.0 * features / n_features if n_features > 0 else 0
        if count > 0:
            bar = '█' * min(50, int(pct_clusters / 2))
            print(f"  {label:<12} {count:<12,} {pct_clusters:<11.2f}% {features:<12,} {pct_features:<11.2f}% {bar}")

    # Detailed size distribution (all unique sizes)
    print(f"\n📈 DETAILED SIZE DISTRIBUTION:")
    size_counts = Counter(sizes)
    unique_sizes = sorted(size_counts.keys())

    print(f"  {'Size':<8} {'# Clusters':<12} {'# Features':<12} {'% of Total Features':<20} {'Cumulative %':<15}")
    print(f"  {'-' * 8} {'-' * 12} {'-' * 12} {'-' * 20} {'-' * 15}")

    cumulative_features = 0
    for size in unique_sizes[:30]:  # Show first 30 unique sizes
        count = size_counts[size]
        total_features = size * count
        cumulative_features += total_features
        pct = 100.0 * total_features / n_features
        cum_pct = 100.0 * cumulative_features / n_features
        bar = '█' * min(30, int(pct))
        print(f"  {size:<8} {count:<12,} {total_features:<12,} {pct:<7.2f}% {bar:<12} {cum_pct:<7.2f}%")

    if len(unique_sizes) > 30:
        print(f"  ... ({len(unique_sizes) - 30} more unique sizes)")

    print("=" * 80)


def save_cluster_assignments(
    result: Dict,
    output_path: Path,
    n_features: int
):
    """
    Save cluster assignments to parquet file.

    Args:
        result: Result dictionary with cluster_labels
        output_path: Path to save parquet file
        n_features: Number of features
    """
    df = pl.DataFrame({
        "feature_id": np.arange(n_features, dtype=np.int32),
        "cluster_id": result['cluster_labels'].astype(np.int32)
    })

    df.write_parquet(output_path)
    logger.info(f"Saved cluster assignments to {output_path}")


def plot_threshold_vs_clusters(
    results: List[Dict],
    output_path: Path,
    n_features: int
):
    """
    Plot threshold vs number of clusters and save as PNG.

    Args:
        results: List of result dictionaries from analyze_clusters_at_threshold
        output_path: Path to save PNG file
        n_features: Total number of features
    """
    thresholds = [r['threshold'] for r in results]
    n_clusters = [r['n_clusters'] for r in results]
    n_singletons = [r['n_singletons'] for r in results]
    n_merged = [r['n_merged_clusters'] for r in results]

    fig, axes = plt.subplots(2, 2, figsize=(12, 10))
    fig.suptitle('Hierarchical Clustering Analysis (Ward\'s Linkage)', fontsize=14, fontweight='bold')

    # Plot 1: Number of clusters vs threshold
    ax1 = axes[0, 0]
    ax1.plot(thresholds, n_clusters, 'b-o', linewidth=2, markersize=6)
    ax1.set_xlabel('Distance Threshold (Euclidean)')
    ax1.set_ylabel('Number of Clusters')
    ax1.set_title('Total Clusters vs Threshold')
    ax1.grid(True, alpha=0.3)
    ax1.axhline(y=n_features, color='r', linestyle='--', alpha=0.5, label=f'Max ({n_features:,})')
    ax1.legend()

    # Plot 2: Singletons vs merged clusters
    ax2 = axes[0, 1]
    ax2.plot(thresholds, n_singletons, 'g-s', linewidth=2, markersize=6, label='Singletons')
    ax2.plot(thresholds, n_merged, 'r-^', linewidth=2, markersize=6, label='Merged Clusters')
    ax2.set_xlabel('Distance Threshold (Euclidean)')
    ax2.set_ylabel('Count')
    ax2.set_title('Singleton vs Merged Clusters')
    ax2.legend()
    ax2.grid(True, alpha=0.3)

    # Plot 3: Percentage of features in singletons
    pct_singleton_features = [100.0 * s / n_features for s in n_singletons]
    ax3 = axes[1, 0]
    ax3.plot(thresholds, pct_singleton_features, 'm-d', linewidth=2, markersize=6)
    ax3.set_xlabel('Distance Threshold (Euclidean)')
    ax3.set_ylabel('% Features in Singletons')
    ax3.set_title('Feature Isolation Rate')
    ax3.grid(True, alpha=0.3)
    ax3.set_ylim(0, 105)

    # Plot 4: Average cluster size (excluding singletons)
    avg_merged_size = []
    for r in results:
        merged_sizes = [s for s in r['cluster_sizes'] if s > 1]
        if merged_sizes:
            avg_merged_size.append(np.mean(merged_sizes))
        else:
            avg_merged_size.append(0)

    ax4 = axes[1, 1]
    ax4.plot(thresholds, avg_merged_size, 'c-o', linewidth=2, markersize=6)
    ax4.set_xlabel('Distance Threshold (Euclidean)')
    ax4.set_ylabel('Average Size')
    ax4.set_title('Average Merged Cluster Size')
    ax4.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()

    logger.info(f"Saved threshold vs clusters plot to {output_path}")


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Analyze hierarchical clustering results at specific thresholds"
    )
    parser.add_argument(
        "--thresholds",
        type=float,
        nargs='+',
        default=[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
        help="Distance thresholds to analyze (default: 0.1 to 0.9)"
    )
    parser.add_argument(
        "--detailed",
        action="store_true",
        help="Show detailed analysis (only works with single threshold)"
    )
    parser.add_argument(
        "--save",
        type=str,
        help="Save cluster assignments to parquet file (requires single threshold)"
    )
    parser.add_argument(
        "--data-dir",
        type=str,
        default="data/feature_similarity/google--gemma-scope-9b-pt-res--layer_30--width_16k--average_l0_120",
        help="Directory containing clustering outputs"
    )
    parser.add_argument(
        "--plot",
        type=str,
        help="Save threshold vs clusters plot to PNG file (e.g., --plot clustering_analysis.png)"
    )

    args = parser.parse_args()

    try:
        # Find project root and resolve paths
        project_root = find_project_root()
        data_dir = project_root / args.data_dir

        # Load clustering data
        linkage_matrix, metadata = load_clustering_data(data_dir)

        # Get number of features
        n_features = metadata.get("n_features", linkage_matrix.shape[0] + 1)
        logger.info(f"Number of features: {n_features:,}")

        # Analyze at each threshold
        results = []
        for threshold in args.thresholds:
            logger.info(f"\nAnalyzing threshold = {threshold:.4f}")
            result = analyze_clusters_at_threshold(linkage_matrix, threshold, n_features)
            results.append(result)

        # Display results
        if args.detailed and len(args.thresholds) == 1:
            print_detailed_analysis(results[0])
        else:
            print_summary_table(results)

        # Save cluster assignments if requested
        if args.save and len(args.thresholds) == 1:
            output_path = data_dir / args.save
            save_cluster_assignments(results[0], output_path, n_features)

        # Save plot if requested
        if args.plot:
            plot_path = Path(args.plot)
            if not plot_path.is_absolute():
                plot_path = data_dir / plot_path
            plot_threshold_vs_clusters(results, plot_path, n_features)

        logger.info("\nAnalysis complete!")

        return 0

    except Exception as e:
        logger.error(f"Error during analysis: {e}", exc_info=True)
        return 1


if __name__ == "__main__":
    exit(main())
