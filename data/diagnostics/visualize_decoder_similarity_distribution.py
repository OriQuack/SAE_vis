#!/usr/bin/env python3
"""
Visualize distribution of top-K decoder similarities per feature.

Shows boxplot of top-K decoder similarities by rank position.

Usage:
    python data/diagnostics/visualize_decoder_similarity_distribution.py
"""

from pathlib import Path

import numpy as np
import matplotlib.pyplot as plt

# ============================================================================
# CONFIGURATION
# ============================================================================

TOP_K = 10  # Number of top similarities to analyze

DATA_DIR = Path(__file__).parent.parent
INTERMEDIATE_DIR = DATA_DIR / "intermediate"
OUTPUT_DIR = DATA_DIR / "diagnostics" / "output"

DECODER_SIM_PATH = INTERMEDIATE_DIR / "decoder_similarity_matrix.npz"

# ============================================================================
# MAIN
# ============================================================================

def main():
    print("=" * 70)
    print("DECODER SIMILARITY DISTRIBUTION ANALYSIS")
    print("=" * 70)

    # Load decoder similarity matrix
    print(f"\n1. Loading decoder similarity matrix from: {DECODER_SIM_PATH}")
    data = np.load(DECODER_SIM_PATH)
    sim_matrix = data['cosine_similarity']
    n_features = sim_matrix.shape[0]
    print(f"   Matrix shape: {sim_matrix.shape}")
    print(f"   Number of features: {n_features:,}")

    # Get top-K similarities for each feature
    print(f"\n2. Computing top-{TOP_K} similarities per feature...")

    top_k_sims = np.zeros((n_features, TOP_K), dtype=np.float32)

    for i in range(n_features):
        row = sim_matrix[i].copy()
        row[i] = -np.inf  # Exclude self
        top_indices = np.argsort(row)[::-1][:TOP_K]
        top_k_sims[i] = row[top_indices]

    print(f"   Computed top-{TOP_K} for all {n_features:,} features")

    # Statistics per rank position
    print(f"\n3. Statistics by Rank Position:")
    print(f"   {'Rank':<6} {'Mean':>10} {'Median':>10} {'Std':>10} {'Min':>10} {'Max':>10}")
    print(f"   {'-'*6} {'-'*10} {'-'*10} {'-'*10} {'-'*10} {'-'*10}")

    rank_stats = []
    for rank in range(TOP_K):
        values = top_k_sims[:, rank]
        stats = {
            'rank': rank + 1,
            'mean': np.mean(values),
            'median': np.median(values),
            'std': np.std(values),
            'min': np.min(values),
            'max': np.max(values),
        }
        rank_stats.append(stats)
        print(f"   {rank+1:<6} {stats['mean']:>10.4f} {stats['median']:>10.4f} "
              f"{stats['std']:>10.4f} {stats['min']:>10.4f} {stats['max']:>10.4f}")

    # Percentiles per rank
    percentiles = [5, 25, 50, 75, 95]
    print(f"\n4. Percentiles by Rank Position:")
    print(f"   {'Rank':<6} {'P5':>10} {'P25':>10} {'P50':>10} {'P75':>10} {'P95':>10}")
    print(f"   {'-'*6} " + " ".join(['-'*10]*5))

    for rank in range(TOP_K):
        values = top_k_sims[:, rank]
        percs = [np.percentile(values, p) for p in percentiles]
        print(f"   {rank+1:<6} " + " ".join([f"{p:>10.4f}" for p in percs]))

    # Create boxplot visualization
    print(f"\n5. Creating boxplot visualization...")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    fig, ax = plt.subplots(figsize=(12, 6))

    colors = plt.cm.viridis(np.linspace(0.2, 0.9, TOP_K))

    bp = ax.boxplot([top_k_sims[:, r] for r in range(TOP_K)],
                    tick_labels=[f'{r+1}' for r in range(TOP_K)],
                    patch_artist=True)

    for patch, color in zip(bp['boxes'], colors):
        patch.set_facecolor(color)
        patch.set_alpha(0.7)

    # Add mean markers
    means = [rank_stats[r]['mean'] for r in range(TOP_K)]
    ax.scatter(range(1, TOP_K + 1), means, color='red', marker='D', s=50,
               zorder=3, label='Mean')

    ax.set_xlabel('Rank', fontsize=12)
    ax.set_ylabel('Decoder Cosine Similarity', fontsize=12)
    ax.set_title(f'Top-{TOP_K} Decoder Similarity Distribution by Rank ({n_features:,} features)',
                fontsize=14, fontweight='bold')
    ax.legend(loc='upper right', fontsize=10)
    ax.grid(True, alpha=0.3, axis='y')

    # Add text annotation with key stats
    stats_text = (
        f"Rank 1:  mean={rank_stats[0]['mean']:.3f}, median={rank_stats[0]['median']:.3f}\n"
        f"Rank {TOP_K}: mean={rank_stats[TOP_K-1]['mean']:.3f}, median={rank_stats[TOP_K-1]['median']:.3f}\n"
        f"Drop 1→{TOP_K}: {rank_stats[0]['mean'] - rank_stats[TOP_K-1]['mean']:.3f}"
    )
    ax.text(0.98, 0.98, stats_text, transform=ax.transAxes, fontsize=10,
            verticalalignment='top', horizontalalignment='right',
            bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.8),
            fontfamily='monospace')

    plt.tight_layout()

    output_path = OUTPUT_DIR / f"decoder_similarity_top{TOP_K}_boxplot.png"
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    print(f"   Saved: {output_path}")

    # Summary
    print(f"\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"\n  Rank 1 mean:  {rank_stats[0]['mean']:.4f}")
    print(f"  Rank {TOP_K} mean: {rank_stats[TOP_K-1]['mean']:.4f}")
    print(f"  Drop 1→{TOP_K}:    {rank_stats[0]['mean'] - rank_stats[TOP_K-1]['mean']:.4f}")

    high_sim_count = np.sum(top_k_sims[:, 0] > 0.5)
    low_sim_count = np.sum(top_k_sims[:, 0] < 0.2)
    print(f"\n  Features with Rank-1 > 0.5: {high_sim_count:,} ({100*high_sim_count/n_features:.1f}%)")
    print(f"  Features with Rank-1 < 0.2: {low_sim_count:,} ({100*low_sim_count/n_features:.1f}%)")


if __name__ == "__main__":
    main()
