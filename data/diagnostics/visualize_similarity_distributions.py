#!/usr/bin/env python3
"""
Visualize distributions from Step 8 and Step 9 similarity results.

Creates PNG visualizations showing:
- Step 8: Intra-feature similarity distributions (semantic, char/word Jaccard)
  - Per-k Jaccard distributions for character n-grams (k=2-8)
  - Per-k Jaccard distributions for word n-grams (k=1-3)
- Step 9: Inter-feature similarity distributions by source (decoder/semantic/both)
  - Per-k Jaccard distributions for cross-feature patterns

Usage:
    python data/diagnostics/visualize_similarity_distributions.py
    python data/diagnostics/visualize_similarity_distributions.py --limit 1000
"""

import argparse
from pathlib import Path
from typing import List, Dict

import numpy as np
import polars as pl
import matplotlib.pyplot as plt
from matplotlib.gridspec import GridSpec

# ============================================================================
# CONFIGURATION
# ============================================================================

DATA_DIR = Path(__file__).parent.parent
INTERMEDIATE_DIR = DATA_DIR / "intermediate"
OUTPUT_DIR = DATA_DIR / "diagnostics" / "output"

# Input files
STEP8_PATH = INTERMEDIATE_DIR / "activation_example_similarity.parquet"
STEP9_PATH = INTERMEDIATE_DIR / "interfeature_similarity.parquet"

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

def extract_step8_per_k(df: pl.DataFrame) -> Dict[str, Dict[str, List[float]]]:
    """Extract per-k Jaccard values from Step 8 data using native Polars ops.

    Returns:
        Dict with 'char' and 'word' keys, each containing k -> values mapping
    """
    char_per_k = {}
    word_per_k = {}

    # Extract char n-gram per-k values (k2-k8) using struct field access
    for k in range(2, 9):
        key = f"k{k}"
        try:
            values = df.select(
                pl.col("char_ngram_per_k_jaccard").struct.field(key)
            ).to_series().drop_nulls().to_list()
            char_per_k[key] = values
        except Exception:
            char_per_k[key] = []

    # Extract word n-gram per-k values (k1-k3)
    for k in range(1, 4):
        key = f"k{k}"
        try:
            values = df.select(
                pl.col("word_ngram_per_k_jaccard").struct.field(key)
            ).to_series().drop_nulls().to_list()
            word_per_k[key] = values
        except Exception:
            word_per_k[key] = []

    return {"char": char_per_k, "word": word_per_k}


def extract_step9_per_k(df: pl.DataFrame, limit: int = None) -> Dict[str, Dict[str, List[float]]]:
    """Extract per-k Jaccard values from Step 9 pair data using native Polars ops.

    Returns:
        Dict with 'char' and 'word' keys, each containing k -> values mapping
    """
    # Apply limit if specified
    if limit:
        df = df.head(limit)

    # Explode all_pairs to get one row per pair
    pairs_df = df.select(pl.col("all_pairs")).explode("all_pairs")

    char_per_k = {}
    word_per_k = {}

    # Extract char n-gram per-k values (k2-k5) from nested struct
    for k in range(2, 6):
        key = f"k{k}"
        try:
            values = pairs_df.select(
                pl.col("all_pairs").struct.field("char_ngram_per_k_jaccard").struct.field(key)
            ).to_series().drop_nulls().to_list()
            char_per_k[key] = values
        except Exception:
            char_per_k[key] = []

    # Extract word n-gram per-k values (k1-k3)
    for k in range(1, 4):
        key = f"k{k}"
        try:
            values = pairs_df.select(
                pl.col("all_pairs").struct.field("word_ngram_per_k_jaccard").struct.field(key)
            ).to_series().drop_nulls().to_list()
            word_per_k[key] = values
        except Exception:
            word_per_k[key] = []

    return {"char": char_per_k, "word": word_per_k}


def extract_step9_pairs(df: pl.DataFrame, limit: int = None) -> Dict[str, List[float]]:
    """Extract similarity values from step 9 nested structure using native Polars ops."""
    # Apply limit if specified
    if limit:
        df = df.head(limit)

    # Explode all_pairs to get one row per pair, then extract fields
    pairs_df = df.select(pl.col("all_pairs")).explode("all_pairs").select(
        pl.col("all_pairs").struct.field("semantic_similarity").alias("semantic_similarity"),
        pl.col("all_pairs").struct.field("decoder_similarity").alias("decoder_similarity"),
        pl.col("all_pairs").struct.field("char_ngram_max_jaccard").alias("char_jaccard"),
        pl.col("all_pairs").struct.field("word_ngram_max_jaccard").alias("word_jaccard"),
        pl.col("all_pairs").struct.field("similarity_source").alias("source"),
    )

    # Extract all values
    semantic_sim = pairs_df["semantic_similarity"].drop_nulls().to_list()
    decoder_sim = pairs_df["decoder_similarity"].drop_nulls().to_list()
    char_jaccard = pairs_df["char_jaccard"].drop_nulls().to_list()
    word_jaccard = pairs_df["word_jaccard"].drop_nulls().to_list()

    # Extract by source
    source_decoder = pairs_df.filter(pl.col("source") == "decoder")["semantic_similarity"].drop_nulls().to_list()
    source_semantic = pairs_df.filter(pl.col("source") == "semantic")["semantic_similarity"].drop_nulls().to_list()
    source_both = pairs_df.filter(pl.col("source") == "both")["semantic_similarity"].drop_nulls().to_list()

    return {
        "semantic_similarity": semantic_sim,
        "decoder_similarity": decoder_sim,
        "char_jaccard": char_jaccard,
        "word_jaccard": word_jaccard,
        "source_decoder": source_decoder,
        "source_semantic": source_semantic,
        "source_both": source_both,
    }


def plot_histogram(ax, values: List[float], title: str, xlabel: str,
                   color: str = "steelblue", bins: int = 50, ylim: int = None):
    """Plot a histogram with statistics."""
    if not values:
        ax.text(0.5, 0.5, "No data", ha='center', va='center', transform=ax.transAxes)
        ax.set_title(title)
        return

    values = np.array(values)
    ax.hist(values, bins=bins, color=color, alpha=0.7, edgecolor='black', linewidth=0.5)

    # Add statistics
    mean_val = np.mean(values)
    median_val = np.median(values)
    std_val = np.std(values)

    ax.axvline(mean_val, color='red', linestyle='--', linewidth=1.5, label=f'Mean: {mean_val:.3f}')
    ax.axvline(median_val, color='orange', linestyle=':', linewidth=1.5, label=f'Median: {median_val:.3f}')

    ax.set_title(f"{title}\n(n={len(values):,}, std={std_val:.3f})", fontsize=10)
    ax.set_xlabel(xlabel, fontsize=9)
    ax.set_ylabel("Count", fontsize=9)
    ax.legend(fontsize=7, loc='upper right')
    ax.grid(True, alpha=0.3)
    if ylim is not None:
        ax.set_ylim(0, ylim)


def plot_stacked_histogram(ax, data_dict: Dict[str, List[float]], title: str, xlabel: str,
                           ylim: int = None):
    """Plot overlapping histograms for comparison."""
    colors = {"decoder": "steelblue", "semantic": "coral", "both": "green"}

    has_data = False
    for key, values in data_dict.items():
        if values:
            has_data = True
            ax.hist(values, bins=50, alpha=0.5, label=f"{key} (n={len(values):,})",
                   color=colors.get(key, "gray"), edgecolor='black', linewidth=0.3)

    if not has_data:
        ax.text(0.5, 0.5, "No data", ha='center', va='center', transform=ax.transAxes)

    ax.set_title(title, fontsize=10)
    ax.set_xlabel(xlabel, fontsize=9)
    ax.set_ylabel("Count", fontsize=9)
    ax.legend(fontsize=7)
    ax.grid(True, alpha=0.3)
    if ylim is not None:
        ax.set_ylim(0, ylim)


def plot_per_k_row(axes: List, per_k_data: Dict[str, List[float]], title_prefix: str,
                   k_values: List[str], colors: List[str], ylim: int = None):
    """Plot per-k Jaccard distributions across a row of axes.

    Args:
        axes: List of matplotlib axes (one per k value)
        per_k_data: Dict mapping k labels (e.g., 'k2') to list of values
        title_prefix: Prefix for subplot titles (e.g., 'Char')
        k_values: List of k labels to plot (e.g., ['k2', 'k3', 'k4'])
        colors: List of colors for each k subplot
        ylim: Optional y-axis upper limit
    """
    for idx, (ax, k_label) in enumerate(zip(axes, k_values)):
        values = per_k_data.get(k_label, [])
        color = colors[idx % len(colors)]

        if not values:
            ax.text(0.5, 0.5, "No data", ha='center', va='center', transform=ax.transAxes)
            ax.set_title(f"{title_prefix} {k_label}", fontsize=10)
            continue

        values_arr = np.array(values)
        ax.hist(values_arr, bins=50, color=color, alpha=0.7, edgecolor='black', linewidth=0.3)

        mean_val = np.mean(values_arr)
        median_val = np.median(values_arr)
        nonzero_pct = 100 * np.sum(values_arr > 0) / len(values_arr)

        ax.axvline(mean_val, color='red', linestyle='--', linewidth=1.2, label=f'Mean: {mean_val:.3f}')
        ax.axvline(median_val, color='orange', linestyle=':', linewidth=1.2, label=f'Med: {median_val:.3f}')

        ax.set_title(f"{title_prefix} {k_label}\n(n={len(values):,}, {nonzero_pct:.1f}% > 0)", fontsize=9)
        ax.set_xlabel("Jaccard", fontsize=8)
        ax.set_ylabel("Count", fontsize=8)
        ax.legend(fontsize=6, loc='upper right')
        ax.grid(True, alpha=0.3)
        if ylim is not None:
            ax.set_ylim(0, ylim)


def create_per_k_summary_stats(char_per_k: Dict[str, List[float]],
                                word_per_k: Dict[str, List[float]]) -> str:
    """Create summary statistics text for per-k Jaccard distributions."""
    lines = ["Per-k Jaccard Summary", "=" * 25, ""]

    lines.append("Character N-grams:")
    for k_label in sorted(char_per_k.keys(), key=lambda x: int(x[1:])):
        values = char_per_k[k_label]
        if values:
            arr = np.array(values)
            nonzero_pct = 100 * np.sum(arr > 0) / len(arr)
            lines.append(f"  {k_label}: mean={np.mean(arr):.4f}, {nonzero_pct:.1f}% > 0")

    lines.append("")
    lines.append("Word N-grams:")
    for k_label in sorted(word_per_k.keys(), key=lambda x: int(x[1:])):
        values = word_per_k[k_label]
        if values:
            arr = np.array(values)
            nonzero_pct = 100 * np.sum(arr > 0) / len(arr)
            lines.append(f"  {k_label}: mean={np.mean(arr):.4f}, {nonzero_pct:.1f}% > 0")

    return "\n".join(lines)


# ============================================================================
# MAIN VISUALIZATION
# ============================================================================

def visualize_step8(df: pl.DataFrame, output_path: Path):
    """Create visualization for Step 8 results.

    Layout:
    - Row 1: Semantic Mean, Semantic Std, Max Char Jaccard, Max Word Jaccard
    - Row 2: Char n-gram per-k (k=2, k=3, k=4, k=5)
    - Row 3: Word n-gram per-k (k=1, k=2, k=3), Per-k Summary Stats
    """
    print("\n" + "=" * 60)
    print("STEP 8: Activation Example Similarity Distributions")
    print("=" * 60)

    fig = plt.figure(figsize=(16, 12))
    gs = GridSpec(3, 4, figure=fig, hspace=0.35, wspace=0.3)

    # Extract values from actual schema
    print("Extracting values...")

    # Intra-feature semantic similarity (avg_pairwise_semantic_similarity)
    sem_sim = df.filter(pl.col("avg_pairwise_semantic_similarity").is_not_null())["avg_pairwise_semantic_similarity"].to_list()
    print(f"  Avg pairwise semantic similarity: {len(sem_sim):,} values")

    # Std of pairwise semantic similarity
    sem_sim_std = df.filter(pl.col("std_pairwise_semantic_similarity").is_not_null())["std_pairwise_semantic_similarity"].to_list()
    print(f"  Std pairwise semantic similarity: {len(sem_sim_std):,} values")

    # Char ngram max Jaccard
    char_ngram_jaccard = df.filter(pl.col("char_ngram_max_jaccard").is_not_null())["char_ngram_max_jaccard"].to_list()
    print(f"  Char n-gram max Jaccard: {len(char_ngram_jaccard):,} values")

    # Word ngram max Jaccard
    word_ngram_jaccard = df.filter(pl.col("word_ngram_max_jaccard").is_not_null())["word_ngram_max_jaccard"].to_list()
    print(f"  Word n-gram max Jaccard: {len(word_ngram_jaccard):,} values")

    # Extract per-k data
    print("Extracting per-k Jaccard distributions...")
    per_k_data = extract_step8_per_k(df)
    for k_label, values in per_k_data["char"].items():
        if values:
            print(f"  Char {k_label}: {len(values):,} values")
    for k_label, values in per_k_data["word"].items():
        if values:
            print(f"  Word {k_label}: {len(values):,} values")

    # Row 1: Overview distributions
    ax1 = fig.add_subplot(gs[0, 0])
    plot_histogram(ax1, sem_sim, "Avg Pairwise Semantic Similarity", "Cosine Similarity", "purple")

    ax2 = fig.add_subplot(gs[0, 1])
    plot_histogram(ax2, sem_sim_std, "Std Pairwise Semantic Similarity", "Standard Deviation", "mediumpurple")

    ax3 = fig.add_subplot(gs[0, 2])
    plot_histogram(ax3, char_ngram_jaccard, "Char N-gram Max Jaccard", "Jaccard Similarity", "darkgreen")

    ax4 = fig.add_subplot(gs[0, 3])
    plot_histogram(ax4, word_ngram_jaccard, "Word N-gram Max Jaccard", "Jaccard Similarity", "darkred")

    # Row 2: Character n-gram per-k distributions (k=2,3,4,5)
    char_axes = [fig.add_subplot(gs[1, i]) for i in range(4)]
    char_colors = ["#2E8B57", "#3CB371", "#66CDAA", "#90EE90"]  # Green shades
    plot_per_k_row(char_axes, per_k_data["char"], "Char", ["k2", "k3", "k4", "k5"], char_colors)

    # Row 3: Word n-gram per-k distributions (k=1,2,3) + summary
    word_axes = [fig.add_subplot(gs[2, i]) for i in range(3)]
    word_colors = ["#8B0000", "#CD5C5C", "#F08080"]  # Red shades
    plot_per_k_row(word_axes, per_k_data["word"], "Word", ["k1", "k2", "k3"], word_colors)

    # Summary statistics (Row 3, Col 4)
    ax_summary = fig.add_subplot(gs[2, 3])
    ax_summary.axis('off')

    summary_text = create_per_k_summary_stats(per_k_data["char"], per_k_data["word"])
    ax_summary.text(0.05, 0.95, summary_text, transform=ax_summary.transAxes, fontsize=9,
                    verticalalignment='top', fontfamily='monospace',
                    bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5))

    fig.suptitle("Step 8: Intra-Feature Activation Similarity Distributions (with Per-k Breakdown)",
                 fontsize=14, fontweight='bold', y=0.98)

    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    print(f"\nSaved: {output_path}")


def visualize_step9(df: pl.DataFrame, output_path: Path, limit: int = None):
    """Create visualization for Step 9 results.

    Layout:
    - Row 1: Semantic Similarity, Decoder Similarity, Semantic by Source
    - Row 2: Char n-gram per-k (k=2, k=3, k=4, k=5)
    - Row 3: Word n-gram per-k (k=1, k=2, k=3), Scatter/Stats
    - Row 4: Pair Count by Source, Char vs Word Scatter, Summary Stats
    """
    print("\n" + "=" * 60)
    print("STEP 9: Inter-Feature Similarity Distributions")
    print("=" * 60)

    fig = plt.figure(figsize=(16, 16))
    gs = GridSpec(4, 4, figure=fig, hspace=0.35, wspace=0.3)

    # Extract all pair data
    print("Extracting pair data...")
    data = extract_step9_pairs(df, limit)

    print(f"  Total pairs: {len(data['semantic_similarity']):,}")
    print(f"  Decoder-source pairs: {len(data['source_decoder']):,}")
    print(f"  Semantic-source pairs: {len(data['source_semantic']):,}")
    print(f"  Both-source pairs: {len(data['source_both']):,}")

    # Extract per-k data
    print("Extracting per-k Jaccard distributions...")
    per_k_data = extract_step9_per_k(df, limit)
    for k_label, values in per_k_data["char"].items():
        if values:
            print(f"  Char {k_label}: {len(values):,} values")
    for k_label, values in per_k_data["word"].items():
        if values:
            print(f"  Word {k_label}: {len(values):,} values")

    # Y-axis limit for inter-feature plots (counts beyond 20k are not meaningful)
    INTER_FEATURE_YLIM = 20000

    # Row 1: Overall distributions (spans 3 columns, leave last empty for balance)
    ax1 = fig.add_subplot(gs[0, 0])
    plot_histogram(ax1, data["semantic_similarity"], "Semantic Similarity (All Pairs)",
                   "Cosine Similarity", "purple", ylim=INTER_FEATURE_YLIM)

    ax2 = fig.add_subplot(gs[0, 1])
    plot_histogram(ax2, data["decoder_similarity"], "Decoder Similarity (All Pairs)",
                   "Cosine Similarity", "steelblue", ylim=INTER_FEATURE_YLIM)

    ax3 = fig.add_subplot(gs[0, 2])
    plot_stacked_histogram(ax3, {
        "decoder": data["source_decoder"],
        "semantic": data["source_semantic"],
        "both": data["source_both"]
    }, "Semantic Similarity by Source", "Cosine Similarity", ylim=INTER_FEATURE_YLIM)

    # Row 1, Col 4: Max Jaccard overview
    ax_max_overview = fig.add_subplot(gs[0, 3])
    if data["char_jaccard"] and data["word_jaccard"]:
        ax_max_overview.hist(data["char_jaccard"], bins=50, alpha=0.6, color="teal",
                             label=f"Char (n={len(data['char_jaccard']):,})", edgecolor='black', linewidth=0.3)
        ax_max_overview.hist(data["word_jaccard"], bins=50, alpha=0.6, color="coral",
                             label=f"Word (n={len(data['word_jaccard']):,})", edgecolor='black', linewidth=0.3)
        ax_max_overview.set_title("Max Jaccard (Char vs Word)", fontsize=10)
        ax_max_overview.set_xlabel("Jaccard Similarity", fontsize=9)
        ax_max_overview.set_ylabel("Count", fontsize=9)
        ax_max_overview.legend(fontsize=7)
        ax_max_overview.grid(True, alpha=0.3)
        ax_max_overview.set_ylim(0, INTER_FEATURE_YLIM)

    # Row 2: Character n-gram per-k distributions (k=2,3,4,5)
    char_axes = [fig.add_subplot(gs[1, i]) for i in range(4)]
    char_colors = ["#2E8B57", "#3CB371", "#66CDAA", "#90EE90"]  # Green shades
    plot_per_k_row(char_axes, per_k_data["char"], "Char", ["k2", "k3", "k4", "k5"], char_colors, ylim=INTER_FEATURE_YLIM)

    # Row 3: Word n-gram per-k distributions (k=1,2,3) + scatter
    word_axes = [fig.add_subplot(gs[2, i]) for i in range(3)]
    word_colors = ["#8B0000", "#CD5C5C", "#F08080"]  # Red shades
    plot_per_k_row(word_axes, per_k_data["word"], "Word", ["k1", "k2", "k3"], word_colors, ylim=INTER_FEATURE_YLIM)

    # Row 3, Col 4: Semantic vs Decoder scatter
    ax_scatter1 = fig.add_subplot(gs[2, 3])
    if data["semantic_similarity"] and data["decoder_similarity"]:
        n_points = min(len(data["semantic_similarity"]), len(data["decoder_similarity"]))
        if n_points > 5000:
            indices = np.random.choice(n_points, 5000, replace=False)
            sem = np.array(data["semantic_similarity"])[indices]
            dec = np.array(data["decoder_similarity"])[indices]
        else:
            sem = np.array(data["semantic_similarity"][:n_points])
            dec = np.array(data["decoder_similarity"][:n_points])

        ax_scatter1.scatter(dec, sem, alpha=0.3, s=5, c='purple')
        ax_scatter1.set_xlabel("Decoder Similarity", fontsize=9)
        ax_scatter1.set_ylabel("Semantic Similarity", fontsize=9)
        ax_scatter1.set_title("Semantic vs Decoder", fontsize=10)

        corr = np.corrcoef(dec, sem)[0, 1]
        ax_scatter1.text(0.05, 0.95, f"r = {corr:.3f}", transform=ax_scatter1.transAxes, fontsize=9,
                         verticalalignment='top', bbox=dict(boxstyle='round', facecolor='white', alpha=0.8))
        ax_scatter1.grid(True, alpha=0.3)

    # Row 4: Source breakdown, char vs word scatter, and summary
    ax7 = fig.add_subplot(gs[3, 0])
    sources = ["Decoder", "Semantic", "Both"]
    counts = [len(data["source_decoder"]), len(data["source_semantic"]), len(data["source_both"])]
    bar_colors = ["steelblue", "coral", "green"]
    bars = ax7.bar(sources, counts, color=bar_colors)
    ax7.set_title("Pair Count by Source", fontsize=10)
    ax7.set_ylabel("Count", fontsize=9)
    for bar, count in zip(bars, counts):
        ax7.text(bar.get_x() + bar.get_width()/2, bar.get_height(), f'{count:,}',
                ha='center', va='bottom', fontsize=8)
    ax7.grid(True, alpha=0.3, axis='y')

    # Scatter of char vs word Jaccard
    ax8 = fig.add_subplot(gs[3, 1])
    if data["char_jaccard"] and data["word_jaccard"]:
        n_points = min(len(data["char_jaccard"]), len(data["word_jaccard"]))
        if n_points > 5000:
            indices = np.random.choice(n_points, 5000, replace=False)
            char_j = np.array(data["char_jaccard"])[indices]
            word_j = np.array(data["word_jaccard"])[indices]
        else:
            char_j = np.array(data["char_jaccard"][:n_points])
            word_j = np.array(data["word_jaccard"][:n_points])

        ax8.scatter(char_j, word_j, alpha=0.3, s=5, c='teal')
        ax8.set_xlabel("Character Jaccard", fontsize=9)
        ax8.set_ylabel("Word Jaccard", fontsize=9)
        ax8.set_title("Char vs Word Jaccard", fontsize=10)

        corr = np.corrcoef(char_j, word_j)[0, 1]
        ax8.text(0.05, 0.95, f"r = {corr:.3f}", transform=ax8.transAxes, fontsize=9,
                verticalalignment='top', bbox=dict(boxstyle='round', facecolor='white', alpha=0.8))
        ax8.grid(True, alpha=0.3)

    # Per-k summary statistics
    ax_perk_summary = fig.add_subplot(gs[3, 2])
    ax_perk_summary.axis('off')
    per_k_summary = create_per_k_summary_stats(per_k_data["char"], per_k_data["word"])
    ax_perk_summary.text(0.05, 0.95, per_k_summary, transform=ax_perk_summary.transAxes, fontsize=9,
                         verticalalignment='top', fontfamily='monospace',
                         bbox=dict(boxstyle='round', facecolor='lightcyan', alpha=0.5))

    # Overall summary statistics
    ax9 = fig.add_subplot(gs[3, 3])
    ax9.axis('off')

    stats_text = (
        f"Step 9 Summary\n"
        f"{'=' * 22}\n\n"
        f"Features: {len(df):,}\n"
        f"Pairs: {len(data['semantic_similarity']):,}\n\n"
        f"By source:\n"
        f"  Decoder: {len(data['source_decoder']):,}\n"
        f"  Semantic: {len(data['source_semantic']):,}\n"
        f"  Both: {len(data['source_both']):,}\n\n"
        f"Semantic Sim:\n"
        f"  Mean: {np.mean(data['semantic_similarity']):.4f}\n"
        f"  Std:  {np.std(data['semantic_similarity']):.4f}\n\n"
        f"Decoder Sim:\n"
        f"  Mean: {np.mean(data['decoder_similarity']):.4f}\n"
        f"  Std:  {np.std(data['decoder_similarity']):.4f}\n"
    )
    ax9.text(0.05, 0.95, stats_text, transform=ax9.transAxes, fontsize=9,
             verticalalignment='top', fontfamily='monospace',
             bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5))

    fig.suptitle("Step 9: Inter-Feature Activation Similarity Distributions (with Per-k Breakdown)",
                 fontsize=14, fontweight='bold', y=0.98)

    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    print(f"\nSaved: {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Visualize Step 8 and Step 9 similarity distributions")
    parser.add_argument("--limit", type=int, help="Limit number of features to process")
    parser.add_argument("--step8-only", action="store_true", help="Only process Step 8")
    parser.add_argument("--step9-only", action="store_true", help="Only process Step 9")
    args = parser.parse_args()

    print("=" * 70)
    print("SIMILARITY DISTRIBUTION VISUALIZATION")
    print("=" * 70)

    # Create output directory
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Process Step 8
    if not args.step9_only:
        if STEP8_PATH.exists():
            print(f"\nLoading Step 8 data from: {STEP8_PATH}")
            df8 = pl.read_parquet(STEP8_PATH)
            if args.limit:
                df8 = df8.head(args.limit)
            print(f"Loaded {len(df8):,} rows")

            output_path = OUTPUT_DIR / "step8_similarity_distributions.png"
            visualize_step8(df8, output_path)
        else:
            print(f"\nWarning: Step 8 file not found: {STEP8_PATH}")

    # Process Step 9
    if not args.step8_only:
        if STEP9_PATH.exists():
            print(f"\nLoading Step 9 data from: {STEP9_PATH}")
            df9 = pl.read_parquet(STEP9_PATH)
            if args.limit:
                df9 = df9.head(args.limit)
            print(f"Loaded {len(df9):,} rows")

            output_path = OUTPUT_DIR / "step9_similarity_distributions.png"
            visualize_step9(df9, output_path, args.limit)
        else:
            print(f"\nWarning: Step 9 file not found: {STEP9_PATH}")

    print("\n" + "=" * 70)
    print("VISUALIZATION COMPLETE")
    print("=" * 70)
    print(f"\nOutput directory: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
