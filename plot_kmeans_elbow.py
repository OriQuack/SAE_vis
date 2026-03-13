#!/usr/bin/env python3
"""
K-Means elbow plot for determining optimal K in cold-start representative sampling.

Plots elbow curves (inertia + silhouette) separately for:
- Stage 1: 12D pair vectors (A+B, |A-B|, inter-feature metrics)
- Stages 2&3: 14D feature vectors (SVM_FEATURE_METRICS)
"""

import numpy as np
import polars as pl
import matplotlib.pyplot as plt
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans, MiniBatchKMeans
from sklearn.metrics import silhouette_score
from tqdm import tqdm

# Same metric lists as backend (data_constants.py)
SVM_FEATURE_METRICS = [
    'intra_ngram_jaccard', 'intra_semantic_sim',
    'score_embedding', 'score_fuzz', 'score_detection',
    'explanation_semantic_sim', 'log_frac_nonzero', 'consensus_score',
    'intra_ngram_jaccard_std', 'intra_semantic_sim_std',
    'explanation_semantic_sim_std',
    'score_embedding_std', 'score_fuzz_std', 'score_detection_std',
]

SVM_PAIR_INTRA_METRICS = [
    'intra_ngram_jaccard', 'intra_ngram_jaccard_std',
    'intra_semantic_sim', 'intra_semantic_sim_std',
]

SVM_PAIR_INTER_METRICS = [
    'inter_ngram_jaccard', 'inter_semantic_sim',
    'decoder_sim', 'feature_correlation',
]

K_RANGE = range(2, 31)
RANDOM_STATE = 42
LARGE_DATASET_THRESHOLD = 50_000  # Switch to MiniBatchKMeans + sampled silhouette
SILHOUETTE_SAMPLE_SIZE = 10_000


def load_feature_vectors():
    """Load and prepare 14D scaled feature vectors for Stages 2&3."""
    df = pl.read_parquet("data/output/svm_feature_metrics.parquet")
    df = df.with_columns(
        (pl.col("frac_nonzero") + 1e-8).log().alias("log_frac_nonzero"),
        *[pl.col(c).fill_null(0.0) for c in SVM_FEATURE_METRICS if c != "log_frac_nonzero"],
    )

    X_raw = df.select(SVM_FEATURE_METRICS).to_numpy()
    X = StandardScaler().fit_transform(X_raw)
    print(f"Features (Stages 2&3): {X.shape[0]} samples, {X.shape[1]}D")
    return X


def load_pair_vectors():
    """Load and prepare 12D scaled pair vectors for Stage 1.

    12D = [A+B (4)] + [|A-B| (4)] + [inter_ngram, inter_semantic, decoder_sim, correlation]

    Uses Polars joins instead of row-wise Python loop.
    """
    # Intra-feature metrics per feature
    feat_df = pl.read_parquet("data/output/svm_feature_metrics.parquet").select(
        "feature_id", *SVM_PAIR_INTRA_METRICS
    ).with_columns(*[pl.col(c).fill_null(0.0) for c in SVM_PAIR_INTRA_METRICS])

    # Inter-feature (pair-specific) metrics
    pair_df = pl.read_parquet("data/output/svm_pair_metrics.parquet").select(
        "feature_a", "feature_b", *SVM_PAIR_INTER_METRICS
    ).with_columns(*[pl.col(c).fill_null(0.0) for c in SVM_PAIR_INTER_METRICS])

    # Join intra metrics for feature_a
    a_suffix = "_a"
    pair_df = pair_df.join(
        feat_df.rename({m: m + a_suffix for m in SVM_PAIR_INTRA_METRICS}),
        left_on="feature_a", right_on="feature_id", how="inner",
    )
    # Join intra metrics for feature_b
    b_suffix = "_b"
    pair_df = pair_df.join(
        feat_df.rename({m: m + b_suffix for m in SVM_PAIR_INTRA_METRICS}),
        left_on="feature_b", right_on="feature_id", how="inner",
    )

    # Compute A+B and |A-B| columns in Polars
    sum_cols = [(pl.col(m + a_suffix) + pl.col(m + b_suffix)).alias(f"sum_{m}") for m in SVM_PAIR_INTRA_METRICS]
    diff_cols = [(pl.col(m + a_suffix) - pl.col(m + b_suffix)).abs().alias(f"diff_{m}") for m in SVM_PAIR_INTRA_METRICS]
    pair_df = pair_df.with_columns(*sum_cols, *diff_cols)

    # Select final 12D columns in order: sum(4) + diff(4) + inter(4)
    final_cols = (
        [f"sum_{m}" for m in SVM_PAIR_INTRA_METRICS]
        + [f"diff_{m}" for m in SVM_PAIR_INTRA_METRICS]
        + SVM_PAIR_INTER_METRICS
    )
    X_raw = pair_df.select(final_cols).to_numpy()
    X = StandardScaler().fit_transform(X_raw)
    print(f"Pairs (Stage 1): {X.shape[0]} samples, {X.shape[1]}D")
    return X


def run_elbow(X, label):
    """Run K-means for K_RANGE, return inertias and silhouette scores.

    Auto-selects MiniBatchKMeans + sampled silhouette for large datasets (>50k).
    """
    large = X.shape[0] > LARGE_DATASET_THRESHOLD
    if large:
        print(f"  [{label}] Large dataset ({X.shape[0]:,} samples) → MiniBatchKMeans + sampled silhouette")

    inertias = []
    silhouettes = []
    ks = list(K_RANGE)

    for k in tqdm(ks, desc=label, unit="K"):
        if large:
            km = MiniBatchKMeans(n_clusters=k, random_state=RANDOM_STATE, batch_size=1024, n_init=3)
        else:
            km = KMeans(n_clusters=k, random_state=RANDOM_STATE, n_init=10)
        labels = km.fit_predict(X)
        inertias.append(km.inertia_)
        sil = silhouette_score(
            X, labels,
            sample_size=SILHOUETTE_SAMPLE_SIZE if large else None,
            random_state=RANDOM_STATE,
        )
        silhouettes.append(sil)
        tqdm.write(f"  {label} K={k:>2d}  inertia={km.inertia_:>12.1f}  silhouette={sil:.4f}")

    return ks, inertias, silhouettes


def main():
    X_feat = load_feature_vectors()
    X_pair = load_pair_vectors()

    print("\nRunning K-Means elbow analysis...")
    ks_f, inertias_f, sils_f = run_elbow(X_feat, "Features")
    ks_p, inertias_p, sils_p = run_elbow(X_pair, "Pairs")

    # Best K by silhouette
    best_k_feat = ks_f[int(np.argmax(sils_f))]
    best_k_pair = ks_p[int(np.argmax(sils_p))]
    print(f"\nBest K by silhouette — Features: {best_k_feat}, Pairs: {best_k_pair}")

    # Plot
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    fig.suptitle("K-Means Elbow Analysis for Cold-Start Sampling", fontsize=14, fontweight="bold")

    # Features - Inertia
    ax = axes[0, 0]
    ax.plot(ks_f, inertias_f, "o-", color="#2196F3", markersize=4)
    ax.set_title("Stages 2&3: Features (14D) — Inertia")
    ax.set_xlabel("K")
    ax.set_ylabel("Inertia (WCSS)")
    ax.grid(True, alpha=0.3)

    # Features - Silhouette
    ax = axes[0, 1]
    ax.plot(ks_f, sils_f, "o-", color="#4CAF50", markersize=4)
    ax.axvline(best_k_feat, color="red", linestyle="--", alpha=0.7, label=f"Best K={best_k_feat}")
    ax.set_title("Stages 2&3: Features (14D) — Silhouette")
    ax.set_xlabel("K")
    ax.set_ylabel("Silhouette Score")
    ax.legend()
    ax.grid(True, alpha=0.3)

    # Pairs - Inertia
    ax = axes[1, 0]
    ax.plot(ks_p, inertias_p, "o-", color="#FF9800", markersize=4)
    ax.set_title("Stage 1: Pairs (12D) — Inertia")
    ax.set_xlabel("K")
    ax.set_ylabel("Inertia (WCSS)")
    ax.grid(True, alpha=0.3)

    # Pairs - Silhouette
    ax = axes[1, 1]
    ax.plot(ks_p, sils_p, "o-", color="#E91E63", markersize=4)
    ax.axvline(best_k_pair, color="red", linestyle="--", alpha=0.7, label=f"Best K={best_k_pair}")
    ax.set_title("Stage 1: Pairs (12D) — Silhouette")
    ax.set_xlabel("K")
    ax.set_ylabel("Silhouette Score")
    ax.legend()
    ax.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig("kmeans_elbow.png", dpi=150, bbox_inches="tight")
    print("Saved kmeans_elbow.png")


if __name__ == "__main__":
    main()
