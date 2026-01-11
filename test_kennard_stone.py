#!/usr/bin/env python3
"""
Temporary script to visualize max-min distance vs n for Kennard-Stone selection.
Shows diversity metric across Stage 1 (pairs), Stage 2 (features), Stage 3 (cause).
"""

import numpy as np
import polars as pl
import matplotlib.pyplot as plt
from sklearn.preprocessing import StandardScaler
from pathlib import Path

# Paths
DATA_DIR = Path(__file__).parent / "data" / "master"
FEATURES_PATH = DATA_DIR / "features.parquet"
BARYCENTRIC_PATH = DATA_DIR / "explanation_barycentric.parquet"
ACTIVATION_PATH = DATA_DIR / "activation_display.parquet"
INTERFEATURE_PATH = DATA_DIR / "interfeature_activation_similarity.parquet"

# Stage 2 & 3: 6D feature metrics
FEATURE_METRICS = [
    'intra_feature_sim', 'score_embedding', 'score_fuzz',
    'score_detection', 'explanation_semantic_sim', 'frac_nonzero'
]

# Stage 1: 5D pair metrics (becomes 11D for pairs)
PAIR_METRICS = [
    'intra_ngram_jaccard', 'intra_semantic_sim',
    'inter_ngram_jaccard', 'inter_semantic_sim', 'frac_nonzero'
]


def kennard_stone_with_distances(X: np.ndarray, max_n: int) -> tuple:
    """
    Run Kennard-Stone and track max-min distance at each step.

    Returns:
        ns: list of n values (2 to max_n)
        distances: max-min distance at each n
    """
    n_samples = X.shape[0]
    max_n = min(max_n, n_samples)

    # Compute pairwise distance matrix
    dist_matrix = np.linalg.norm(X[:, np.newaxis] - X, axis=2)

    # Start with the two points furthest apart
    i, j = np.unravel_index(np.argmax(dist_matrix), dist_matrix.shape)
    selected = [int(i), int(j)]

    ns = [2]
    # Initial max-min distance is the distance between first two points
    distances = [dist_matrix[i, j]]

    # Track min distances from each point to selected set
    min_dist_to_selected = np.minimum(dist_matrix[i], dist_matrix[j])

    while len(selected) < max_n:
        # Exclude already selected
        min_dist_to_selected[selected] = -1

        # Find point with max min-distance
        next_idx = int(np.argmax(min_dist_to_selected))
        max_min_dist = min_dist_to_selected[next_idx]

        selected.append(next_idx)
        ns.append(len(selected))
        distances.append(max_min_dist)

        # Update min distances
        min_dist_to_selected = np.minimum(min_dist_to_selected, dist_matrix[next_idx])

    return ns, distances


def load_stage2_data(sample_size: int = 500) -> np.ndarray:
    """Load Stage 2 (Feature/Quality) data - 6D metrics."""
    print(f"Loading Stage 2 data (features, sample={sample_size})...")

    bary_df = pl.read_parquet(BARYCENTRIC_PATH)
    feature_ids = bary_df["feature_id"].unique().to_list()

    if len(feature_ids) > sample_size:
        np.random.seed(42)
        feature_ids = list(np.random.choice(feature_ids, sample_size, replace=False))

    df = bary_df.filter(pl.col("feature_id").is_in(feature_ids)).group_by("feature_id").agg([
        pl.col("intra_feature_sim").mean(),
        pl.col("score_embedding").mean(),
        pl.col("score_fuzz").mean(),
        pl.col("score_detection").mean(),
        pl.col("explanation_semantic_sim").mean(),
    ])

    feat_df = pl.read_parquet(FEATURES_PATH).filter(
        pl.col("feature_id").is_in(feature_ids)
    ).select([
        "feature_id",
        pl.col("frac_nonzero").fill_null(0.0)
    ]).unique(subset=["feature_id"])

    df = df.join(feat_df, on="feature_id", how="left")

    for metric in FEATURE_METRICS:
        if metric in df.columns:
            df = df.with_columns(pl.col(metric).fill_null(0.0))
        else:
            df = df.with_columns(pl.lit(0.0).alias(metric))

    matrix = df.select(FEATURE_METRICS).to_numpy()
    scaler = StandardScaler()
    return scaler.fit_transform(matrix)


def load_stage3_data(sample_size: int = 500) -> np.ndarray:
    """Load Stage 3 (Cause) data - same 6D metrics as Stage 2."""
    print(f"Loading Stage 3 data (cause, sample={sample_size})...")
    # Stage 3 uses the same 6D metric space as Stage 2
    return load_stage2_data(sample_size)


def load_stage1_data(sample_size: int = 300) -> np.ndarray:
    """Load Stage 1 (Pair/Feature Split) data - 11D pair vectors."""
    print(f"Loading Stage 1 data (pairs, sample={sample_size})...")

    feat_df = pl.read_parquet(FEATURES_PATH).select([
        pl.col("feature_id").cast(pl.UInt32),
        pl.col("frac_nonzero").fill_null(0.0)
    ]).unique(subset=["feature_id"])

    act_df = pl.read_parquet(ACTIVATION_PATH).select([
        pl.col("feature_id").cast(pl.UInt32),
        pl.max_horizontal("char_ngram_max_jaccard", "word_ngram_max_jaccard")
          .fill_null(0.0).alias("intra_ngram_jaccard"),
        pl.col("semantic_similarity").fill_null(0.0).alias("intra_semantic_sim")
    ]).unique(subset=["feature_id"])

    inter_df = pl.read_parquet(INTERFEATURE_PATH)
    inter_df = inter_df.select([
        pl.col("feature_id").cast(pl.UInt32),
        pl.max_horizontal([
            pl.col("semantic_pairs").list.eval(pl.element().struct.field("char_jaccard")).list.max().fill_null(0.0),
            pl.col("lexical_pairs").list.eval(pl.element().struct.field("char_jaccard")).list.max().fill_null(0.0)
        ]).alias("max_char"),
        pl.max_horizontal([
            pl.col("semantic_pairs").list.eval(pl.element().struct.field("word_jaccard")).list.max().fill_null(0.0),
            pl.col("lexical_pairs").list.eval(pl.element().struct.field("word_jaccard")).list.max().fill_null(0.0)
        ]).alias("max_word"),
        pl.max_horizontal([
            pl.col("semantic_pairs").list.eval(pl.element().struct.field("semantic_similarity")).list.max().fill_null(0.0),
            pl.col("lexical_pairs").list.eval(pl.element().struct.field("semantic_similarity")).list.max().fill_null(0.0)
        ]).alias("inter_semantic_sim")
    ]).select([
        "feature_id",
        pl.max_horizontal("max_char", "max_word").alias("inter_ngram_jaccard"),
        "inter_semantic_sim"
    ]).unique(subset=["feature_id"])

    df = feat_df.join(act_df, on="feature_id", how="left")
    df = df.join(inter_df, on="feature_id", how="left")

    for metric in PAIR_METRICS:
        if metric in df.columns:
            df = df.with_columns(pl.col(metric).fill_null(0.0))
        else:
            df = df.with_columns(pl.lit(0.0).alias(metric))

    # Create synthetic pairs
    feature_ids = df["feature_id"].to_list()
    np.random.seed(42)

    if len(feature_ids) > sample_size * 2:
        feature_ids = list(np.random.choice(feature_ids, sample_size * 2, replace=False))

    metrics_arr = df.filter(pl.col("feature_id").is_in(feature_ids)).select(PAIR_METRICS).to_numpy()
    n = len(metrics_arr)

    pair_vectors = []
    for i in range(min(n - 1, sample_size)):
        j = (i + 1) % n
        pair_sum = metrics_arr[i] + metrics_arr[j]
        pair_diff = np.abs(metrics_arr[i] - metrics_arr[j])
        pair_vector = np.concatenate([pair_sum, pair_diff, [0.0]])  # 11D
        pair_vectors.append(pair_vector)

    matrix = np.array(pair_vectors)
    scaler = StandardScaler()
    return scaler.fit_transform(matrix)


def main():
    print("=" * 60)
    print("Max-Min Distance vs N (Kennard-Stone Diversity Analysis)")
    print("=" * 60)

    # Load data for all stages
    stage1_data = load_stage1_data(sample_size=300)
    stage2_data = load_stage2_data(sample_size=500)
    stage3_data = load_stage3_data(sample_size=500)

    print(f"\nStage 1 (Pairs) shape: {stage1_data.shape}")
    print(f"Stage 2 (Features) shape: {stage2_data.shape}")
    print(f"Stage 3 (Cause) shape: {stage3_data.shape}")

    # Run Kennard-Stone with distance tracking
    max_n = 50
    print(f"\nRunning Kennard-Stone up to n={max_n}...")

    ns1, dist1 = kennard_stone_with_distances(stage1_data, max_n)
    ns2, dist2 = kennard_stone_with_distances(stage2_data, max_n)
    ns3, dist3 = kennard_stone_with_distances(stage3_data, max_n)

    # Print key values
    print(f"\n{'='*60}")
    print("MAX-MIN DISTANCE AT KEY N VALUES")
    print(f"{'='*60}")
    print(f"{'n':>4} | {'Stage 1 (Pairs)':>16} | {'Stage 2 (Features)':>18} | {'Stage 3 (Cause)':>16}")
    print("-" * 60)
    for n in [5, 10, 15, 20, 25, 30, 40, 50]:
        if n <= len(ns1):
            d1 = dist1[ns1.index(n)] if n in ns1 else 0
            d2 = dist2[ns2.index(n)] if n in ns2 else 0
            d3 = dist3[ns3.index(n)] if n in ns3 else 0
            print(f"{n:>4} | {d1:>16.3f} | {d2:>18.3f} | {d3:>16.3f}")

    # Plot
    fig, ax = plt.subplots(figsize=(10, 6))

    ax.plot(ns1, dist1, 'g-o', linewidth=2, markersize=4, label='Stage 1: Pairs (11D)', alpha=0.8)
    ax.plot(ns2, dist2, 'b-s', linewidth=2, markersize=4, label='Stage 2: Features (6D)', alpha=0.8)
    ax.plot(ns3, dist3, 'r-^', linewidth=2, markersize=4, label='Stage 3: Cause (6D)', alpha=0.8)

    # Mark n=20 (default)
    ax.axvline(x=20, color='gray', linestyle='--', alpha=0.7, label='Default n=20')

    ax.set_xlabel('n (number of samples selected)', fontsize=12)
    ax.set_ylabel('Max-Min Distance (diversity metric)', fontsize=12)
    ax.set_title('Kennard-Stone: Max-Min Distance vs Number of Samples\n(Higher = more diverse coverage)', fontsize=12)
    ax.grid(True, alpha=0.3)
    ax.legend(loc='upper right')
    ax.set_xlim(0, max_n + 2)

    plt.tight_layout()

    output_path = Path(__file__).parent / "kennard_stone_analysis.png"
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    print(f"\nPlot saved to: {output_path}")

    plt.show()


if __name__ == "__main__":
    main()
