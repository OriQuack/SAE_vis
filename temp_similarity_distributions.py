#!/usr/bin/env python3
"""
Temporary script to analyze similarity value distributions for both:
1. activation_example_similarity.parquet (within-feature similarity)
2. interfeature_activation_similarity.parquet (cross-feature similarity)

Creates two PNG files with simplified visualizations:
- Semantic similarity distribution
- Top char n-gram Jaccard distribution
- Top word n-gram Jaccard distribution
- Scatter plot: char vs word Jaccard
"""

import polars as pl
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path
from typing import Tuple


def load_activation_similarity() -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Load activation_example_similarity.parquet and extract similarity values.

    Returns:
        Tuple of (semantic_sim, char_jaccard, word_jaccard) arrays
    """
    path = Path("data/master/activation_example_similarity.parquet")
    print(f"Loading {path.name}...")
    df = pl.read_parquet(path)

    # Extract values, filtering out nulls
    semantic_sim = df.filter(
        pl.col("avg_pairwise_semantic_similarity").is_not_null()
    )["avg_pairwise_semantic_similarity"].to_numpy()

    char_jaccard = df.filter(
        pl.col("top_char_ngram_jaccard").is_not_null()
    )["top_char_ngram_jaccard"].to_numpy()

    word_jaccard = df.filter(
        pl.col("top_word_ngram_jaccard").is_not_null()
    )["top_word_ngram_jaccard"].to_numpy()

    print(f"  Loaded {len(df)} features")
    print(f"  Semantic sim: {len(semantic_sim)} values")
    print(f"  Char Jaccard: {len(char_jaccard)} values")
    print(f"  Word Jaccard: {len(word_jaccard)} values")

    return semantic_sim, char_jaccard, word_jaccard


def load_interfeature_similarity() -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Load interfeature_activation_similarity.parquet and extract similarity values.

    Returns:
        Tuple of (semantic_sim, char_jaccard, word_jaccard) arrays
    """
    path = Path("data/master/interfeature_activation_similarity.parquet")
    print(f"Loading {path.name}...")
    df = pl.read_parquet(path)

    semantic_sim = []
    char_jaccard = []
    word_jaccard = []

    # Collect from all pairs (semantic, lexical, both)
    for row in df.iter_rows(named=True):
        for pair in (row.get("semantic_pairs", []) or []):
            if pair.get("semantic_similarity") is not None:
                semantic_sim.append(pair["semantic_similarity"])
            if pair.get("char_jaccard") is not None:
                char_jaccard.append(pair["char_jaccard"])
            if pair.get("word_jaccard") is not None:
                word_jaccard.append(pair["word_jaccard"])

        for pair in (row.get("lexical_pairs", []) or []):
            if pair.get("semantic_similarity") is not None:
                semantic_sim.append(pair["semantic_similarity"])
            if pair.get("char_jaccard") is not None:
                char_jaccard.append(pair["char_jaccard"])
            if pair.get("word_jaccard") is not None:
                word_jaccard.append(pair["word_jaccard"])

        for pair in (row.get("both_pairs", []) or []):
            if pair.get("semantic_similarity") is not None:
                semantic_sim.append(pair["semantic_similarity"])
            if pair.get("char_jaccard") is not None:
                char_jaccard.append(pair["char_jaccard"])
            if pair.get("word_jaccard") is not None:
                word_jaccard.append(pair["word_jaccard"])

    print(f"  Loaded {len(df)} features")
    print(f"  Semantic sim: {len(semantic_sim)} values")
    print(f"  Char Jaccard: {len(char_jaccard)} values")
    print(f"  Word Jaccard: {len(word_jaccard)} values")

    return np.array(semantic_sim), np.array(char_jaccard), np.array(word_jaccard)


def create_visualization(semantic_sim: np.ndarray, char_jaccard: np.ndarray,
                        word_jaccard: np.ndarray, title: str, output_path: str):
    """Create 2x2 visualization with simplified plots.

    Args:
        semantic_sim: Semantic similarity values
        char_jaccard: Character Jaccard values
        word_jaccard: Word Jaccard values
        title: Plot title
        output_path: Output PNG file path
    """
    fig, axes = plt.subplots(2, 2, figsize=(12, 10))
    fig.suptitle(title, fontsize=16, fontweight='bold')

    # 1. Semantic Similarity Distribution
    ax1 = axes[0, 0]
    ax1.hist(semantic_sim, bins=50, color='steelblue', alpha=0.7, edgecolor='black')
    ax1.axvline(np.mean(semantic_sim), color='red', linestyle='--', linewidth=2,
                label=f'Mean: {np.mean(semantic_sim):.3f}')
    ax1.axvline(0.3, color='green', linestyle=':', linewidth=2, label='Threshold: 0.3')
    ax1.set_xlabel('Semantic Similarity', fontsize=12)
    ax1.set_ylabel('Frequency', fontsize=12)
    ax1.set_title('Semantic Similarity Distribution', fontsize=13, fontweight='bold')
    ax1.legend(fontsize=10)
    ax1.grid(axis='y', alpha=0.3)

    # Add stats text
    stats_text = f'N={len(semantic_sim)}\nMean={np.mean(semantic_sim):.3f}\nStd={np.std(semantic_sim):.3f}'
    ax1.text(0.98, 0.98, stats_text, transform=ax1.transAxes, fontsize=10,
             verticalalignment='top', horizontalalignment='right',
             bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5))

    # 2. Top Char N-gram Jaccard Distribution
    ax2 = axes[0, 1]
    ax2.hist(char_jaccard, bins=50, color='coral', alpha=0.7, edgecolor='black')
    ax2.axvline(np.mean(char_jaccard), color='red', linestyle='--', linewidth=2,
                label=f'Mean: {np.mean(char_jaccard):.3f}')
    ax2.axvline(0.3, color='green', linestyle=':', linewidth=2, label='Threshold: 0.3')
    ax2.set_xlabel('Top Char N-gram Jaccard', fontsize=12)
    ax2.set_ylabel('Frequency', fontsize=12)
    ax2.set_title('Character N-gram Jaccard Distribution', fontsize=13, fontweight='bold')
    ax2.legend(fontsize=10)
    ax2.grid(axis='y', alpha=0.3)

    stats_text = f'N={len(char_jaccard)}\nMean={np.mean(char_jaccard):.3f}\nStd={np.std(char_jaccard):.3f}'
    ax2.text(0.98, 0.98, stats_text, transform=ax2.transAxes, fontsize=10,
             verticalalignment='top', horizontalalignment='right',
             bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5))

    # 3. Top Word N-gram Jaccard Distribution
    ax3 = axes[1, 0]
    ax3.hist(word_jaccard, bins=50, color='skyblue', alpha=0.7, edgecolor='black')
    ax3.axvline(np.mean(word_jaccard), color='red', linestyle='--', linewidth=2,
                label=f'Mean: {np.mean(word_jaccard):.3f}')
    ax3.axvline(0.3, color='green', linestyle=':', linewidth=2, label='Threshold: 0.3')
    ax3.set_xlabel('Top Word N-gram Jaccard', fontsize=12)
    ax3.set_ylabel('Frequency', fontsize=12)
    ax3.set_title('Word N-gram Jaccard Distribution', fontsize=13, fontweight='bold')
    ax3.legend(fontsize=10)
    ax3.grid(axis='y', alpha=0.3)

    stats_text = f'N={len(word_jaccard)}\nMean={np.mean(word_jaccard):.3f}\nStd={np.std(word_jaccard):.3f}'
    ax3.text(0.98, 0.98, stats_text, transform=ax3.transAxes, fontsize=10,
             verticalalignment='top', horizontalalignment='right',
             bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5))

    # 4. Scatter: Char vs Word Jaccard
    ax4 = axes[1, 1]

    # Need to align arrays if lengths differ
    min_len = min(len(char_jaccard), len(word_jaccard))
    char_aligned = char_jaccard[:min_len]
    word_aligned = word_jaccard[:min_len]

    scatter = ax4.scatter(char_aligned, word_aligned, alpha=0.4, s=20,
                         c=semantic_sim[:min_len] if len(semantic_sim) >= min_len else 'blue',
                         cmap='viridis', edgecolors='black', linewidths=0.5)
    ax4.plot([0, 1], [0, 1], 'r--', linewidth=2, alpha=0.5, label='y=x')
    ax4.axhline(0.3, color='green', linestyle=':', linewidth=1, alpha=0.5)
    ax4.axvline(0.3, color='green', linestyle=':', linewidth=1, alpha=0.5)
    ax4.set_xlabel('Top Char N-gram Jaccard', fontsize=12)
    ax4.set_ylabel('Top Word N-gram Jaccard', fontsize=12)
    ax4.set_title('Char vs Word N-gram Jaccard', fontsize=13, fontweight='bold')
    ax4.grid(alpha=0.3)
    ax4.legend(fontsize=10)

    if len(semantic_sim) >= min_len:
        cbar = plt.colorbar(scatter, ax=ax4)
        cbar.set_label('Semantic Sim', fontsize=10)

    # Add correlation
    if len(char_aligned) > 1:
        correlation = np.corrcoef(char_aligned, word_aligned)[0, 1]
        ax4.text(0.05, 0.95, f'Correlation: {correlation:.3f}',
                transform=ax4.transAxes, fontsize=11, verticalalignment='top',
                bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5))

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    print(f"✅ Saved visualization to: {output_path}")
    plt.close()


def main():
    """Main execution."""
    print("=" * 80)
    print("SIMILARITY DISTRIBUTIONS ANALYSIS")
    print("=" * 80)
    print()

    # 1. Activation Example Similarity (within-feature)
    print("1. ACTIVATION EXAMPLE SIMILARITY (Within-Feature)")
    print("-" * 80)
    try:
        act_semantic, act_char, act_word = load_activation_similarity()
        print()

        create_visualization(
            act_semantic, act_char, act_word,
            'Activation Example Similarity (Within-Feature)',
            'temp_activation_similarity_dist.png'
        )
        print()
    except Exception as e:
        print(f"Error processing activation similarity: {e}")
        print()

    # 2. Inter-Feature Similarity (cross-feature)
    print("2. INTER-FEATURE SIMILARITY (Cross-Feature)")
    print("-" * 80)
    try:
        inter_semantic, inter_char, inter_word = load_interfeature_similarity()
        print()

        create_visualization(
            inter_semantic, inter_char, inter_word,
            'Inter-Feature Similarity (Cross-Feature)',
            'temp_interfeature_similarity_dist.png'
        )
        print()
    except Exception as e:
        print(f"Error processing inter-feature similarity: {e}")
        print()

    print("=" * 80)
    print("ANALYSIS COMPLETE")
    print("=" * 80)


if __name__ == "__main__":
    main()
