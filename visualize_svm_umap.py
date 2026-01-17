#!/usr/bin/env python3
"""
UMAP Visualization Script for SVM Feature Spaces

Visualizes UMAP projections for the feature space data used in SVM training
across all three stages of the tagging workflow.

Stage 1 (Pair Similarity) - 11D:
  5 metrics per feature: intra_ngram_jaccard, intra_semantic_sim,
                         inter_ngram_jaccard, inter_semantic_sim, frac_nonzero
  Pair vector: [A+B (5), |A-B| (5), decoder_sim (1)] = 11 dimensions

Stage 2 & 3 (Feature Similarity / Cause) - 9D:
  6 mean metrics: intra_feature_sim, score_embedding, score_fuzz,
                  score_detection, explanation_semantic_sim, frac_nonzero
  3 std metrics: score_embedding_std, score_fuzz_std, score_detection_std
                 (captures cross-explainer disagreement)

Usage:
    python visualize_svm_umap.py                          # All stages with defaults
    python visualize_svm_umap.py --stage 2                # Stage 2 only
    python visualize_svm_umap.py --stage 2 --n-neighbors 30 --min-dist 0.2
    python visualize_svm_umap.py --output umap_results.png
    python visualize_svm_umap.py --sample 5000            # Sample 5000 features
"""

import argparse
import sys
from pathlib import Path
from typing import Tuple, Dict, List
from functools import wraps

# Apply sklearn compatibility patch BEFORE importing umap
# sklearn 1.4+ renamed 'ensure_all_finite' to 'force_all_finite'
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
from sklearn.preprocessing import StandardScaler

try:
    import umap
    # Patch umap's local reference to check_array after import
    import sklearn.utils.validation
    umap.umap_.check_array = sklearn.utils.validation.check_array
except ImportError:
    print("Error: umap-learn not installed. Install with: pip install umap-learn")
    sys.exit(1)


# =============================================================================
# HYPERPARAMETERS - Edit these for quick experimentation
# =============================================================================
UMAP_N_NEIGHBORS = 40      # Higher = more global structure, lower = more local detail
UMAP_MIN_DIST = 0.3        # Higher = more spread out, lower = tighter clusters
UMAP_METRIC = "euclidean"  # Options: "euclidean", "cosine", "manhattan"
RANDOM_SEED = 42           # For reproducibility
SAMPLE_SIZE = None         # Set to int (e.g., 5000) for faster iteration, None for full data
OUTPUT_FILE = "umap_svm_feature_spaces.png"  # Default output filename

# Stage 1 specific
STAGE1_MAX_PAIRS = 50000   # Cap on synthetic pairs to generate

# =============================================================================
# Data paths
DATA_DIR = Path(__file__).parent / "data" / "master"
FEATURES_PARQUET = DATA_DIR / "features.parquet"
ACTIVATION_DISPLAY_PARQUET = DATA_DIR / "activation_display.parquet"
INTERFEATURE_PARQUET = DATA_DIR / "interfeature_activation_similarity.parquet"
BARYCENTRIC_PARQUET = DATA_DIR / "explanation_barycentric.parquet"


# Stage 1: Pair metrics (per-feature, before combining into pairs)
PAIR_METRICS = [
    'intra_ngram_jaccard',       # Activation-level: lexical consistency
    'intra_semantic_sim',        # Activation-level: semantic consistency
    'inter_ngram_jaccard',       # Inter-feature: lexical similarity
    'inter_semantic_sim',        # Inter-feature: semantic similarity
    'frac_nonzero',              # Neuronpedia: fraction of non-zero activations
]

# Stage 2 & 3: Feature metrics (9D)
FEATURE_METRICS = [
    # Mean metrics (6)
    'intra_feature_sim',         # Composite: max(char_ngram, word_ngram, semantic)
    'score_embedding',           # Score: embedding-based scoring
    'score_fuzz',                # Score: fuzzy matching score
    'score_detection',           # Score: detection score
    'explanation_semantic_sim',  # Explanation: semantic similarity between explanations
    'frac_nonzero',              # Neuronpedia: fraction of non-zero activations
    # Std metrics - scores only (3) - captures cross-explainer disagreement
    'score_embedding_std',
    'score_fuzz_std',
    'score_detection_std',
]


def load_stage1_data() -> Tuple[np.ndarray, np.ndarray]:
    """
    Load Stage 1 pair feature data (5D per feature, 11D for pairs).

    Returns feature-level metrics (5D) - pair construction is simulated
    by creating synthetic pairs from nearby features.
    """
    print("Loading Stage 1 data...")

    # Load activation display for intra-feature metrics
    activation_df = pl.read_parquet(ACTIVATION_DISPLAY_PARQUET).select([
        pl.col("feature_id").cast(pl.Int64),
        pl.max_horizontal("char_ngram_max_jaccard", "word_ngram_max_jaccard")
          .fill_null(0.0).alias("intra_ngram_jaccard"),
        pl.col("semantic_similarity").fill_null(0.0).alias("intra_semantic_sim")
    ]).unique(subset=["feature_id"])

    # Load inter-feature metrics
    interfeature_df = pl.read_parquet(INTERFEATURE_PARQUET).select([
        pl.col("feature_id").cast(pl.Int64),
        pl.col("all_pairs").list.eval(pl.element().struct.field("char_jaccard")).list.max().fill_null(0.0).alias("max_char_jaccard"),
        pl.col("all_pairs").list.eval(pl.element().struct.field("word_jaccard")).list.max().fill_null(0.0).alias("max_word_jaccard"),
        pl.col("all_pairs").list.eval(pl.element().struct.field("semantic_similarity")).list.max().fill_null(0.0).alias("inter_semantic_sim")
    ]).select([
        "feature_id",
        pl.max_horizontal("max_char_jaccard", "max_word_jaccard").alias("inter_ngram_jaccard"),
        "inter_semantic_sim"
    ]).unique(subset=["feature_id"])

    # Load frac_nonzero from features
    features_df = pl.read_parquet(FEATURES_PARQUET).select([
        pl.col("feature_id").cast(pl.Int64),
        pl.col("frac_nonzero").fill_null(0.0)
    ]).unique(subset=["feature_id"])

    # Join all metrics
    df = activation_df.join(interfeature_df, on="feature_id", how="left")
    df = df.join(features_df, on="feature_id", how="left")

    # Fill nulls
    for metric in PAIR_METRICS:
        if metric in df.columns:
            df = df.with_columns(pl.col(metric).fill_null(0.0))
        else:
            df = df.with_columns(pl.lit(0.0).alias(metric))

    feature_ids = df["feature_id"].to_numpy()
    metrics_matrix = np.column_stack([df[m].to_numpy() for m in PAIR_METRICS])

    print(f"  Loaded {len(feature_ids)} features with 5D metrics")

    # Simulate pairs: create synthetic 11D vectors by combining random pairs
    # This approximates the actual pair space for visualization
    n_pairs = min(len(feature_ids) * 2, STAGE1_MAX_PAIRS)
    rng = np.random.default_rng(RANDOM_SEED)

    pair_vectors = []
    for _ in range(n_pairs):
        i, j = rng.choice(len(feature_ids), 2, replace=False)
        a, b = metrics_matrix[i], metrics_matrix[j]
        # 11D: [A+B (5), |A-B| (5), decoder_sim (1)]
        # Use placeholder for decoder_sim since we don't have pair-specific values
        decoder_sim = rng.uniform(0.3, 0.9)  # Simulated decoder similarity
        pair_vec = np.concatenate([a + b, np.abs(a - b), [decoder_sim]])
        pair_vectors.append(pair_vec)

    pair_matrix = np.array(pair_vectors)
    print(f"  Created {len(pair_matrix)} synthetic pairs with 11D vectors")

    return pair_matrix, np.arange(len(pair_matrix))


def load_stage2_3_data() -> Tuple[np.ndarray, np.ndarray]:
    """
    Load Stage 2 & 3 feature data (9D).
    Uses pre-aggregated barycentric parquet for fast extraction.
    """
    print("Loading Stage 2 & 3 data...")

    # Load barycentric data (pre-aggregated per explainer)
    bary_df = pl.read_parquet(BARYCENTRIC_PARQUET)

    # Compute mean and std across explainers for each feature
    df = bary_df.group_by("feature_id").agg([
        # Mean metrics (6)
        pl.col("intra_feature_sim").mean().alias("intra_feature_sim"),
        pl.col("score_embedding").mean().alias("score_embedding"),
        pl.col("score_fuzz").mean().alias("score_fuzz"),
        pl.col("score_detection").mean().alias("score_detection"),
        pl.col("explanation_semantic_sim").mean().alias("explanation_semantic_sim"),
        # Std metrics - scores only (3) - captures cross-explainer disagreement
        pl.col("score_embedding").std().alias("score_embedding_std"),
        pl.col("score_fuzz").std().alias("score_fuzz_std"),
        pl.col("score_detection").std().alias("score_detection_std"),
    ]).with_columns(pl.col("feature_id").cast(pl.Int64))

    # Load frac_nonzero from features
    features_df = pl.read_parquet(FEATURES_PARQUET).select([
        pl.col("feature_id").cast(pl.Int64),
        pl.col("frac_nonzero").fill_null(0.0)
    ]).unique(subset=["feature_id"])

    df = df.join(features_df, on="feature_id", how="left")

    # Fill nulls
    for metric in FEATURE_METRICS:
        if metric in df.columns:
            df = df.with_columns(pl.col(metric).fill_null(0.0))
        else:
            df = df.with_columns(pl.lit(0.0).alias(metric))

    feature_ids = df["feature_id"].to_numpy()
    metrics_matrix = np.column_stack([df[m].to_numpy() for m in FEATURE_METRICS])

    print(f"  Loaded {len(feature_ids)} features with 9D metrics")

    return metrics_matrix, feature_ids


def run_umap(
    data: np.ndarray,
    n_neighbors: int = 15,
    min_dist: float = 0.1,
    metric: str = "euclidean",
    random_state: int = 42
) -> np.ndarray:
    """Run UMAP dimensionality reduction."""
    print(f"Running UMAP (n_neighbors={n_neighbors}, min_dist={min_dist}, metric={metric})...")

    # Handle NaN/inf values before standardization
    data_clean = np.nan_to_num(data, nan=0.0, posinf=0.0, neginf=0.0)

    # Standardize features before UMAP
    scaler = StandardScaler()
    data_scaled = scaler.fit_transform(data_clean)

    # Handle any NaN/inf introduced by standardization (e.g., zero variance columns)
    data_scaled = np.nan_to_num(data_scaled, nan=0.0, posinf=0.0, neginf=0.0)

    # Ensure data is float64 and contiguous for UMAP
    data_scaled = np.ascontiguousarray(data_scaled, dtype=np.float64)

    reducer = umap.UMAP(
        n_neighbors=n_neighbors,
        min_dist=min_dist,
        metric=metric,
        random_state=random_state,
        n_components=2,
        verbose=False,
        low_memory=True
    )

    # Use fit() then embedding_ to avoid sklearn compatibility issues
    reducer.fit(data_scaled)
    embedding = reducer.embedding_
    print(f"  UMAP complete: {embedding.shape}")

    return embedding


def plot_umap(
    embeddings: Dict[str, np.ndarray],
    output_path: str,
    figsize: Tuple[int, int] = (15, 5)
):
    """Plot UMAP embeddings for all stages."""
    n_plots = len(embeddings)
    fig, axes = plt.subplots(1, n_plots, figsize=figsize)

    if n_plots == 1:
        axes = [axes]

    titles = {
        "stage1": "Stage 1: Pair Similarity (11D → 2D)",
        "stage2_3": "Stage 2 & 3: Feature Similarity (9D → 2D)"
    }

    colors = {
        "stage1": "#3498db",
        "stage2_3": "#e74c3c"
    }

    for ax, (stage, embedding) in zip(axes, embeddings.items()):
        ax.scatter(
            embedding[:, 0],
            embedding[:, 1],
            c=colors.get(stage, "#333333"),
            alpha=0.3,
            s=5,
            edgecolors='none'
        )
        ax.set_title(titles.get(stage, stage), fontsize=12)
        ax.set_xlabel("UMAP 1", fontsize=10)
        ax.set_ylabel("UMAP 2", fontsize=10)
        ax.tick_params(labelsize=8)

        # Add sample count
        ax.text(
            0.02, 0.98, f"n={len(embedding):,}",
            transform=ax.transAxes,
            fontsize=9,
            verticalalignment='top',
            bbox=dict(boxstyle='round', facecolor='white', alpha=0.8)
        )

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    print(f"Saved plot to: {output_path}")


def main():
    parser = argparse.ArgumentParser(
        description="UMAP visualization for SVM feature spaces",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python visualize_svm_umap.py                           # All stages with defaults
    python visualize_svm_umap.py --stage 1                 # Stage 1 only (pair similarity)
    python visualize_svm_umap.py --stage 2                 # Stage 2/3 only (feature similarity)
    python visualize_svm_umap.py --n-neighbors 30 --min-dist 0.2
    python visualize_svm_umap.py --output umap_results.png # Save to file
    python visualize_svm_umap.py --sample 5000             # Sample 5000 items
        """
    )

    parser.add_argument(
        "--stage", type=int, choices=[1, 2], default=None,
        help="Stage to visualize: 1 (pair similarity, 11D) or 2 (feature similarity, 9D). Default: all"
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
        help="Sample N items for faster iteration"
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

    print("=" * 60)
    print("UMAP Visualization for SVM Feature Spaces")
    print("=" * 60)
    print(f"Parameters: n_neighbors={args.n_neighbors}, min_dist={args.min_dist}, metric={args.metric}")
    if args.sample:
        print(f"Sampling: {args.sample} items")
    print()

    embeddings = {}

    # Stage 1: Pair similarity (11D)
    if args.stage is None or args.stage == 1:
        data, _ = load_stage1_data()
        if args.sample and len(data) > args.sample:
            rng = np.random.default_rng(args.seed)
            idx = rng.choice(len(data), args.sample, replace=False)
            data = data[idx]
            print(f"  Sampled to {len(data)} pairs")
        embedding = run_umap(
            data,
            n_neighbors=args.n_neighbors,
            min_dist=args.min_dist,
            metric=args.metric,
            random_state=args.seed
        )
        embeddings["stage1"] = embedding
        print()

    # Stage 2 & 3: Feature similarity (6D)
    if args.stage is None or args.stage == 2:
        data, _ = load_stage2_3_data()
        if args.sample and len(data) > args.sample:
            rng = np.random.default_rng(args.seed)
            idx = rng.choice(len(data), args.sample, replace=False)
            data = data[idx]
            print(f"  Sampled to {len(data)} features")
        embedding = run_umap(
            data,
            n_neighbors=args.n_neighbors,
            min_dist=args.min_dist,
            metric=args.metric,
            random_state=args.seed
        )
        embeddings["stage2_3"] = embedding
        print()

    # Plot results
    if embeddings:
        figsize = (8, 6) if len(embeddings) == 1 else (15, 6)
        plot_umap(embeddings, output_path=args.output, figsize=figsize)
    else:
        print("No data to visualize!")
        sys.exit(1)

    print("Done!")


if __name__ == "__main__":
    main()
