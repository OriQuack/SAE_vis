#!/usr/bin/env python3
"""
Visualize distributions from Step 8 and Step 9 similarity results.

Creates PNG visualizations showing:
- Step 8: Intra-feature similarity distributions (semantic, char/word Jaccard)
- Step 9: Inter-feature similarity distributions by source (decoder/semantic/both)

Usage:
    python data/diagnostics/visualize_similarity_distributions.py
    python data/diagnostics/visualize_similarity_distributions.py --limit 1000
"""

import argparse
from pathlib import Path
from typing import List, Dict, Any

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

def extract_step9_pairs(df: pl.DataFrame, limit: int = None) -> Dict[str, List[float]]:
    """Extract similarity values from step 9 nested structure."""
    data = {
        "semantic_similarity": [],
        "decoder_similarity": [],
        "char_jaccard": [],
        "word_jaccard": [],
        "source_decoder": [],
        "source_semantic": [],
        "source_both": [],
    }

    rows = df.to_dicts()
    if limit:
        rows = rows[:limit]

    for row in rows:
        pairs = row.get("all_pairs", [])
        if not pairs:
            continue

        for pair in pairs:
            source = pair.get("similarity_source", "")

            # Semantic similarity
            sem_sim = pair.get("semantic_similarity")
            if sem_sim is not None:
                data["semantic_similarity"].append(sem_sim)
                if source == "decoder":
                    data["source_decoder"].append(sem_sim)
                elif source == "semantic":
                    data["source_semantic"].append(sem_sim)
                elif source == "both":
                    data["source_both"].append(sem_sim)

            # Decoder similarity
            dec_sim = pair.get("decoder_similarity")
            if dec_sim is not None:
                data["decoder_similarity"].append(dec_sim)

            # Jaccard similarities
            char_j = pair.get("char_ngram_max_jaccard")
            if char_j is not None:
                data["char_jaccard"].append(char_j)

            word_j = pair.get("word_ngram_max_jaccard")
            if word_j is not None:
                data["word_jaccard"].append(word_j)

    return data


def plot_histogram(ax, values: List[float], title: str, xlabel: str,
                   color: str = "steelblue", bins: int = 50):
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


def plot_stacked_histogram(ax, data_dict: Dict[str, List[float]], title: str, xlabel: str):
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


# ============================================================================
# MAIN VISUALIZATION
# ============================================================================

def visualize_step8(df: pl.DataFrame, output_path: Path):
    """Create visualization for Step 8 results."""
    print("\n" + "=" * 60)
    print("STEP 8: Activation Example Similarity Distributions")
    print("=" * 60)

    fig = plt.figure(figsize=(14, 10))
    gs = GridSpec(2, 3, figure=fig, hspace=0.3, wspace=0.3)

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

    # Plot histograms
    ax1 = fig.add_subplot(gs[0, 0])
    plot_histogram(ax1, sem_sim, "Avg Pairwise Semantic Similarity", "Cosine Similarity", "purple")

    ax2 = fig.add_subplot(gs[0, 1])
    plot_histogram(ax2, sem_sim_std, "Std Pairwise Semantic Similarity", "Standard Deviation", "mediumpurple")

    ax3 = fig.add_subplot(gs[0, 2])
    plot_histogram(ax3, char_ngram_jaccard, "Char N-gram Max Jaccard", "Jaccard Similarity", "darkgreen")

    ax4 = fig.add_subplot(gs[1, 0])
    plot_histogram(ax4, word_ngram_jaccard, "Word N-gram Max Jaccard", "Jaccard Similarity", "darkred")

    # Summary statistics
    ax5 = fig.add_subplot(gs[1, 1])
    ax5.axis('off')

    stats_text = (
        f"Step 8 Summary Statistics\n"
        f"{'=' * 30}\n\n"
        f"Total features: {len(df):,}\n\n"
        f"Avg Semantic Similarity:\n"
        f"  Mean: {np.mean(sem_sim):.4f}\n"
        f"  Std:  {np.std(sem_sim):.4f}\n\n"
        f"Char N-gram Max Jaccard:\n"
        f"  Mean: {np.mean(char_ngram_jaccard):.4f}\n"
        f"  Std:  {np.std(char_ngram_jaccard):.4f}\n\n"
        f"Word N-gram Max Jaccard:\n"
        f"  Mean: {np.mean(word_ngram_jaccard):.4f}\n"
        f"  Std:  {np.std(word_ngram_jaccard):.4f}\n"
    )
    ax5.text(0.1, 0.9, stats_text, transform=ax5.transAxes, fontsize=10,
             verticalalignment='top', fontfamily='monospace',
             bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5))

    fig.suptitle("Step 8: Intra-Feature Activation Similarity Distributions",
                 fontsize=14, fontweight='bold', y=0.98)

    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    print(f"\nSaved: {output_path}")


def visualize_step9(df: pl.DataFrame, output_path: Path, limit: int = None):
    """Create visualization for Step 9 results."""
    print("\n" + "=" * 60)
    print("STEP 9: Inter-Feature Similarity Distributions")
    print("=" * 60)

    fig = plt.figure(figsize=(16, 12))
    gs = GridSpec(3, 3, figure=fig, hspace=0.35, wspace=0.3)

    # Extract all pair data
    print("Extracting pair data...")
    data = extract_step9_pairs(df, limit)

    print(f"  Total pairs: {len(data['semantic_similarity']):,}")
    print(f"  Decoder-source pairs: {len(data['source_decoder']):,}")
    print(f"  Semantic-source pairs: {len(data['source_semantic']):,}")
    print(f"  Both-source pairs: {len(data['source_both']):,}")

    # Row 1: Overall distributions
    ax1 = fig.add_subplot(gs[0, 0])
    plot_histogram(ax1, data["semantic_similarity"], "Semantic Similarity (All Pairs)",
                   "Cosine Similarity", "purple")

    ax2 = fig.add_subplot(gs[0, 1])
    plot_histogram(ax2, data["decoder_similarity"], "Decoder Similarity (All Pairs)",
                   "Cosine Similarity", "steelblue")

    ax3 = fig.add_subplot(gs[0, 2])
    plot_stacked_histogram(ax3, {
        "decoder": data["source_decoder"],
        "semantic": data["source_semantic"],
        "both": data["source_both"]
    }, "Semantic Similarity by Source", "Cosine Similarity")

    # Row 2: Jaccard distributions
    ax4 = fig.add_subplot(gs[1, 0])
    plot_histogram(ax4, data["char_jaccard"], "Character Jaccard (Cross-Feature)",
                   "Jaccard Similarity", "teal")

    ax5 = fig.add_subplot(gs[1, 1])
    plot_histogram(ax5, data["word_jaccard"], "Word Jaccard (Cross-Feature)",
                   "Jaccard Similarity", "coral")

    # Row 2, col 2: Scatter of semantic vs decoder
    ax6 = fig.add_subplot(gs[1, 2])
    if data["semantic_similarity"] and data["decoder_similarity"]:
        # Sample if too many points
        n_points = min(len(data["semantic_similarity"]), len(data["decoder_similarity"]))
        if n_points > 5000:
            indices = np.random.choice(n_points, 5000, replace=False)
            sem = np.array(data["semantic_similarity"])[indices]
            dec = np.array(data["decoder_similarity"])[indices]
        else:
            sem = data["semantic_similarity"][:n_points]
            dec = data["decoder_similarity"][:n_points]

        ax6.scatter(dec, sem, alpha=0.3, s=5, c='purple')
        ax6.set_xlabel("Decoder Similarity", fontsize=9)
        ax6.set_ylabel("Semantic Similarity", fontsize=9)
        ax6.set_title("Semantic vs Decoder Similarity", fontsize=10)

        # Add correlation
        corr = np.corrcoef(dec, sem)[0, 1]
        ax6.text(0.05, 0.95, f"r = {corr:.3f}", transform=ax6.transAxes, fontsize=9,
                verticalalignment='top', bbox=dict(boxstyle='round', facecolor='white', alpha=0.8))
        ax6.grid(True, alpha=0.3)

    # Row 3: Pair source breakdown and summary
    ax7 = fig.add_subplot(gs[2, 0])
    sources = ["Decoder", "Semantic", "Both"]
    counts = [len(data["source_decoder"]), len(data["source_semantic"]), len(data["source_both"])]
    colors = ["steelblue", "coral", "green"]
    bars = ax7.bar(sources, counts, color=colors)
    ax7.set_title("Pair Count by Source", fontsize=10)
    ax7.set_ylabel("Count", fontsize=9)
    for bar, count in zip(bars, counts):
        ax7.text(bar.get_x() + bar.get_width()/2, bar.get_height(), f'{count:,}',
                ha='center', va='bottom', fontsize=8)
    ax7.grid(True, alpha=0.3, axis='y')

    # Scatter of char vs word Jaccard
    ax8 = fig.add_subplot(gs[2, 1])
    if data["char_jaccard"] and data["word_jaccard"]:
        n_points = min(len(data["char_jaccard"]), len(data["word_jaccard"]))
        if n_points > 5000:
            indices = np.random.choice(n_points, 5000, replace=False)
            char_j = np.array(data["char_jaccard"])[indices]
            word_j = np.array(data["word_jaccard"])[indices]
        else:
            char_j = data["char_jaccard"][:n_points]
            word_j = data["word_jaccard"][:n_points]

        ax8.scatter(char_j, word_j, alpha=0.3, s=5, c='teal')
        ax8.set_xlabel("Character Jaccard", fontsize=9)
        ax8.set_ylabel("Word Jaccard", fontsize=9)
        ax8.set_title("Char vs Word Jaccard", fontsize=10)

        corr = np.corrcoef(char_j, word_j)[0, 1]
        ax8.text(0.05, 0.95, f"r = {corr:.3f}", transform=ax8.transAxes, fontsize=9,
                verticalalignment='top', bbox=dict(boxstyle='round', facecolor='white', alpha=0.8))
        ax8.grid(True, alpha=0.3)

    # Summary statistics
    ax9 = fig.add_subplot(gs[2, 2])
    ax9.axis('off')

    stats_text = (
        f"Step 9 Summary Statistics\n"
        f"{'=' * 30}\n\n"
        f"Total features: {len(df):,}\n"
        f"Total pairs: {len(data['semantic_similarity']):,}\n\n"
        f"Pairs by source:\n"
        f"  Decoder: {len(data['source_decoder']):,}\n"
        f"  Semantic: {len(data['source_semantic']):,}\n"
        f"  Both: {len(data['source_both']):,}\n\n"
        f"Semantic Similarity:\n"
        f"  Mean: {np.mean(data['semantic_similarity']):.4f}\n"
        f"  Std:  {np.std(data['semantic_similarity']):.4f}\n\n"
        f"Decoder Similarity:\n"
        f"  Mean: {np.mean(data['decoder_similarity']):.4f}\n"
        f"  Std:  {np.std(data['decoder_similarity']):.4f}\n"
    )
    ax9.text(0.1, 0.95, stats_text, transform=ax9.transAxes, fontsize=10,
             verticalalignment='top', fontfamily='monospace',
             bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5))

    fig.suptitle("Step 9: Inter-Feature Activation Similarity Distributions",
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
