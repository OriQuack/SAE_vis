#!/usr/bin/env env python3
"""
Visualize feature distribution across clustering thresholds

Creates a PNG showing:
- X-axis: Similarity threshold values (0.0 to 1.0)
- Y-axis: Feature IDs
- Color: Cluster membership at each threshold

Note: Internally uses distance thresholds for scipy.fcluster,
but displays as similarity (1 - distance) for intuitive interpretation.
Higher similarity threshold = looser clustering = fewer clusters
"""

import numpy as np
import matplotlib.pyplot as plt
from scipy.cluster.hierarchy import fcluster
from pathlib import Path
import json

# ============================================================================
# CONFIGURATION
# ============================================================================

# Input paths
LINKAGE_MATRIX_PATH = Path(__file__).parent.parent.parent / "feature_similarity/google--gemma-scope-9b-pt-res--layer_30--width_16k--average_l0_120/clustering_linkage.npy"
OUTPUT_PATH = Path(__file__).parent.parent.parent / "feature_similarity/google--gemma-scope-9b-pt-res--layer_30--width_16k--average_l0_120/clustering_distribution.png"

# Threshold range
THRESHOLD_MIN = 0.0
THRESHOLD_MAX = 1.0
THRESHOLD_STEP = 0.01  # Every 0.01

# Sampling (for visualization - 16k features is too many to show clearly)
SAMPLE_SIZE = 1000  # Show 1000 randomly sampled features

# ============================================================================
# MAIN SCRIPT
# ============================================================================

def main():
    print("=" * 80)
    print("HIERARCHICAL CLUSTERING DISTRIBUTION VISUALIZATION")
    print("=" * 80)

    # Load linkage matrix
    print(f"\n1. Loading linkage matrix from: {LINKAGE_MATRIX_PATH}")
    linkage_matrix = np.load(LINKAGE_MATRIX_PATH)
    n_features = linkage_matrix.shape[0] + 1
    print(f"   ✓ Loaded linkage matrix: {linkage_matrix.shape}")
    print(f"   ✓ Number of features: {n_features}")

    # Generate threshold values
    thresholds = np.arange(THRESHOLD_MIN, THRESHOLD_MAX + THRESHOLD_STEP, THRESHOLD_STEP)
    print(f"\n2. Testing {len(thresholds)} threshold values from {THRESHOLD_MIN} to {THRESHOLD_MAX}")

    # Sample features for visualization
    np.random.seed(42)
    sampled_feature_indices = np.sort(np.random.choice(n_features, size=min(SAMPLE_SIZE, n_features), replace=False))
    print(f"\n3. Sampling {len(sampled_feature_indices)} features for visualization")

    # Build cluster membership matrix
    print(f"\n4. Computing cluster membership at each threshold...")
    cluster_matrix = np.zeros((len(sampled_feature_indices), len(thresholds)), dtype=np.int32)

    for i, threshold in enumerate(thresholds):
        # Cut dendrogram at this threshold
        labels = fcluster(linkage_matrix, t=threshold, criterion='distance')

        # Store cluster labels for sampled features
        cluster_matrix[:, i] = labels[sampled_feature_indices]

        if i % 10 == 0:
            n_clusters = len(np.unique(labels))
            print(f"   Threshold {threshold:.2f}: {n_clusters} clusters")

    print(f"   ✓ Computed cluster membership matrix: {cluster_matrix.shape}")

    # Create visualization
    print(f"\n5. Creating visualization...")
    fig, ax = plt.subplots(figsize=(16, 10))

    # Plot cluster membership as heatmap
    # Use a colormap that shows cluster transitions
    im = ax.imshow(cluster_matrix, aspect='auto', cmap='tab20', interpolation='nearest')

    # Set axis labels
    ax.set_xlabel('Similarity Threshold', fontsize=12)
    ax.set_ylabel('Feature ID (sampled)', fontsize=12)
    ax.set_title(f'Feature Cluster Membership Across Similarity Thresholds\n({len(sampled_feature_indices)} sampled features)',
                 fontsize=14, fontweight='bold')

    # Set x-axis ticks to show SIMILARITY values (1 - distance)
    x_tick_indices = np.arange(0, len(thresholds), 10)
    ax.set_xticks(x_tick_indices)
    # Convert distance to similarity for display
    ax.set_xticklabels([f'{1.0 - thresholds[i]:.2f}' for i in x_tick_indices], rotation=45)

    # Set y-axis ticks to show feature IDs
    y_tick_indices = np.arange(0, len(sampled_feature_indices), max(1, len(sampled_feature_indices) // 20))
    ax.set_yticks(y_tick_indices)
    ax.set_yticklabels([f'{sampled_feature_indices[i]}' for i in y_tick_indices])

    # Add colorbar
    cbar = plt.colorbar(im, ax=ax, label='Cluster ID')

    # Add grid for readability
    ax.grid(False)

    # Add statistics text
    stats_text = (
        f"Total features: {n_features:,}\n"
        f"Sampled features: {len(sampled_feature_indices)}\n"
        f"Similarity threshold range: {1.0 - THRESHOLD_MAX:.1f} - {1.0 - THRESHOLD_MIN:.1f}\n"
        f"Threshold step: {THRESHOLD_STEP}"
    )
    ax.text(1.15, 0.5, stats_text, transform=ax.transAxes,
            fontsize=10, verticalalignment='center',
            bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5))

    # Tight layout
    plt.tight_layout()

    # Save figure
    print(f"\n6. Saving visualization to: {OUTPUT_PATH}")
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(OUTPUT_PATH, dpi=150, bbox_inches='tight')
    print(f"   ✓ Saved: {OUTPUT_PATH}")
    print(f"   ✓ File size: {OUTPUT_PATH.stat().st_size / 1024:.1f} KB")

    # Also create a summary statistics plot
    print(f"\n7. Creating cluster count summary...")
    fig2, ax2 = plt.subplots(figsize=(12, 6))

    cluster_counts = []
    for i, threshold in enumerate(thresholds):
        labels = fcluster(linkage_matrix, t=threshold, criterion='distance')
        n_clusters = len(np.unique(labels))
        cluster_counts.append(n_clusters)

    # Convert x-axis to similarity for plotting
    similarity_thresholds = 1.0 - thresholds
    ax2.plot(similarity_thresholds, cluster_counts, linewidth=2, color='steelblue')
    ax2.set_xlabel('Similarity Threshold', fontsize=12)
    ax2.set_ylabel('Number of Clusters', fontsize=12)
    ax2.set_title('Number of Clusters vs Similarity Threshold', fontsize=14, fontweight='bold')
    ax2.grid(True, alpha=0.3)

    # Mark common similarity thresholds
    common_similarity_thresholds = [0.3, 0.5, 0.7]
    for sim_t in common_similarity_thresholds:
        # Convert similarity back to distance for indexing
        dist_t = 1.0 - sim_t
        if THRESHOLD_MIN <= dist_t <= THRESHOLD_MAX:
            idx = int((dist_t - THRESHOLD_MIN) / THRESHOLD_STEP)
            if idx < len(cluster_counts):
                ax2.axvline(x=sim_t, color='red', linestyle='--', alpha=0.5)
                ax2.text(sim_t, max(cluster_counts) * 0.9, f's={sim_t}\n{cluster_counts[idx]} clusters',
                        ha='center', fontsize=9, bbox=dict(boxstyle='round', facecolor='yellow', alpha=0.5))

    plt.tight_layout()

    summary_path = OUTPUT_PATH.parent / "clustering_summary.png"
    plt.savefig(summary_path, dpi=150, bbox_inches='tight')
    print(f"   ✓ Saved summary: {summary_path}")

    print("\n" + "=" * 80)
    print("VISUALIZATION COMPLETE")
    print("=" * 80)
    print(f"\nOutput files:")
    print(f"  1. Distribution: {OUTPUT_PATH}")
    print(f"  2. Summary: {summary_path}")

if __name__ == "__main__":
    main()
