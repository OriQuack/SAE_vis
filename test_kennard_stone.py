#!/usr/bin/env python3
"""
Compare feature sampling methods: Kennard-Stone, K-Means, K-Medoids, Density-based.

Selects 20 representative features from the 14D SVM metric space and compares
coverage, spread, and overlap between methods.
"""

import numpy as np
import polars as pl
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from sklearn_extra.cluster import KMedoids
from scipy.spatial.distance import pdist, squareform
from scipy.stats import gaussian_kde
from itertools import combinations

# Same 14 metrics used by the backend SVM pipeline
SVM_FEATURE_METRICS = [
    'intra_ngram_jaccard', 'intra_semantic_sim',
    'score_embedding', 'score_fuzz', 'score_detection',
    'explanation_semantic_sim', 'log_frac_nonzero', 'consensus_score',
    'intra_ngram_jaccard_std', 'intra_semantic_sim_std',
    'explanation_semantic_sim_std',
    'score_embedding_std', 'score_fuzz_std', 'score_detection_std',
]

N_SELECT = 20
RANDOM_STATE = 42


def load_data():
    """Load svm_feature_metrics.parquet and prepare 14D scaled matrix."""
    df = pl.read_parquet("data/output/svm_feature_metrics.parquet")
    # Compute log_frac_nonzero at runtime (same as backend)
    df = df.with_columns([
        (pl.col("frac_nonzero") + 1e-8).log().alias("log_frac_nonzero")
    ])
    for col in SVM_FEATURE_METRICS:
        df = df.with_columns(pl.col(col).fill_null(0.0))

    feature_ids = df["feature_id"].to_numpy()
    X_raw = df.select(SVM_FEATURE_METRICS).to_numpy()

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_raw)

    print(f"Loaded {len(feature_ids)} features, {X_scaled.shape[1]}D metric space")
    return feature_ids, X_scaled


# ---------- Method 1: Kennard-Stone ----------
def kennard_stone(X, n):
    """Greedy max-min distance selection (from cold_start_service.py)."""
    dist_matrix = squareform(pdist(X))
    i, j = np.unravel_index(np.argmax(dist_matrix), dist_matrix.shape)
    selected = [int(i), int(j)]

    # Track min distances incrementally
    min_dist_to_selected = np.minimum(dist_matrix[i], dist_matrix[j])

    while len(selected) < n:
        min_dist_to_selected[selected] = -1
        next_idx = int(np.argmax(min_dist_to_selected))
        selected.append(next_idx)
        min_dist_to_selected = np.minimum(min_dist_to_selected, dist_matrix[next_idx])

    return selected


# ---------- Method 2: K-Means ----------
def kmeans_select(X, n):
    """K-Means clustering, pick nearest point to each centroid."""
    km = KMeans(n_clusters=n, random_state=RANDOM_STATE, n_init=10)
    km.fit(X)
    centroids = km.cluster_centers_

    selected = []
    for c in centroids:
        dists = np.linalg.norm(X - c, axis=1)
        idx = int(np.argmin(dists))
        # Avoid duplicates
        while idx in selected:
            dists[idx] = np.inf
            idx = int(np.argmin(dists))
        selected.append(idx)

    return selected


# ---------- Method 3: K-Medoids ----------
def kmedoids_select(X, n):
    """K-Medoids (PAM) — selected points are actual data points."""
    km = KMedoids(n_clusters=n, random_state=RANDOM_STATE, method='pam')
    km.fit(X)
    return list(km.medoid_indices_)


# ---------- Method 4: Density-based ----------
def density_based_select(X, n):
    """KDE density estimation, then stratified selection across density quantiles.

    Picks samples spread across the density distribution so both dense clusters
    and sparse outlier regions are represented.
    """
    rng = np.random.RandomState(RANDOM_STATE)
    # Subsample for KDE fitting if dataset is large
    if len(X) > 5000:
        subsample_idx = rng.choice(len(X), 5000, replace=False)
        kde = gaussian_kde(X[subsample_idx].T, bw_method='scott')
    else:
        kde = gaussian_kde(X.T, bw_method='scott')

    # Evaluate density at all points
    densities = kde(X.T)

    # Bin into n quantile bins, pick one per bin
    quantile_edges = np.linspace(0, 100, n + 1)
    density_thresholds = np.percentile(densities, quantile_edges)

    selected = []
    for i in range(n):
        lo, hi = density_thresholds[i], density_thresholds[i + 1]
        if i == n - 1:
            mask = (densities >= lo) & (densities <= hi)
        else:
            mask = (densities >= lo) & (densities < hi)
        candidates = np.where(mask)[0]
        if len(candidates) == 0:
            continue

        # Pick the one closest to bin's median density
        bin_median = np.median(densities[candidates])
        best = candidates[np.argmin(np.abs(densities[candidates] - bin_median))]

        if int(best) in selected:
            for c in candidates:
                if int(c) not in selected:
                    best = c
                    break
        selected.append(int(best))

    return selected


# ---------- Evaluation ----------
def compute_metrics(X, indices):
    """Compute coverage metrics for a set of selected indices."""
    subset = X[indices]
    pairwise_dists = pdist(subset)
    return {
        'avg_pairwise_dist': float(np.mean(pairwise_dists)),
        'min_pairwise_dist': float(np.min(pairwise_dists)),
        'max_pairwise_dist': float(np.max(pairwise_dists)),
        'std_pairwise_dist': float(np.std(pairwise_dists)),
    }


def jaccard(a, b):
    sa, sb = set(a), set(b)
    if len(sa | sb) == 0:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def main():
    feature_ids, X = load_data()

    methods = {
        'Kennard-Stone': kennard_stone,
        'K-Means':       kmeans_select,
        'K-Medoids':     kmedoids_select,
        'Density-Based': density_based_select,
    }

    results = {}
    for name, func in methods.items():
        print(f"\nRunning {name}...")
        indices = func(X, N_SELECT)
        fids = feature_ids[indices].tolist()
        metrics = compute_metrics(X, indices)
        results[name] = {'indices': indices, 'feature_ids': fids, 'metrics': metrics}
        print(f"  Selected {len(fids)} features: {fids}")

    # --- Coverage comparison ---
    print("\n" + "=" * 70)
    print(f"{'Method':<16} {'Avg Dist':>10} {'Min Dist':>10} {'Max Dist':>10} {'Std Dist':>10}")
    print("-" * 70)
    for name, r in results.items():
        m = r['metrics']
        print(f"{name:<16} {m['avg_pairwise_dist']:>10.4f} {m['min_pairwise_dist']:>10.4f} "
              f"{m['max_pairwise_dist']:>10.4f} {m['std_pairwise_dist']:>10.4f}")
    print("=" * 70)

    # --- Overlap (Jaccard) ---
    method_names = list(results.keys())
    print(f"\nPairwise Overlap (Jaccard on feature IDs):")
    print(f"{'':>16}", end="")
    for name in method_names:
        print(f" {name:>16}", end="")
    print()
    for a in method_names:
        print(f"{a:>16}", end="")
        for b in method_names:
            j = jaccard(results[a]['feature_ids'], results[b]['feature_ids'])
            print(f" {j:>16.3f}", end="")
        print()

    # --- Overlap count ---
    print(f"\nPairwise Overlap (count of shared feature IDs):")
    for a, b in combinations(method_names, 2):
        shared = set(results[a]['feature_ids']) & set(results[b]['feature_ids'])
        print(f"  {a} & {b}: {len(shared)} shared — {sorted(shared) if shared else '(none)'}")


if __name__ == "__main__":
    main()
