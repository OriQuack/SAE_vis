#!/usr/bin/env python3
"""
Compare 5 sampling methods on Stage 1 (12D pair) and Stage 2&3 (14D feature) metric spaces.

Methods: Kennard-Stone, K-Means, K-Medoids, Density-Based, Cluster-Typical.
Selects 20 representative samples and compares coverage, spread, and overlap.
"""

import numpy as np
import polars as pl
from tqdm import tqdm
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from sklearn.neighbors import NearestNeighbors
from sklearn_extra.cluster import KMedoids
from scipy.spatial.distance import pdist, squareform
from scipy.stats import gaussian_kde
from itertools import combinations

# Same 14 metrics used by the backend SVM pipeline (Stage 2 & 3)
SVM_FEATURE_METRICS = [
    'intra_ngram_jaccard', 'intra_semantic_sim',
    'score_embedding', 'score_fuzz', 'score_detection',
    'explanation_semantic_sim', 'log_frac_nonzero', 'consensus_score',
    'intra_ngram_jaccard_std', 'intra_semantic_sim_std',
    'explanation_semantic_sim_std',
    'score_embedding_std', 'score_fuzz_std', 'score_detection_std',
]

# 4D intra-feature metrics for pair SVM (Stage 1)
SVM_PAIR_INTRA_METRICS = [
    'intra_ngram_jaccard', 'intra_ngram_jaccard_std',
    'intra_semantic_sim', 'intra_semantic_sim_std',
]

# 4D pair-specific inter-feature metrics (Stage 1)
SVM_PAIR_INTER_METRICS = [
    'inter_ngram_jaccard', 'inter_semantic_sim',
    'decoder_sim', 'feature_correlation',
]

N_SELECT = 20
RANDOM_STATE = 42
K_NN = 10          # kNN neighbors for Cluster-Typical typicality
MAX_FEATURES = 5000  # Subsample features for feasibility
MAX_PAIRS = 5000     # Subsample pairs for feasibility (pdist on 375k is infeasible)
RESULTS_FILE = "test_kennard_stone_results.txt"


# ---------- Output helper ----------
def log(msg, out_file=None):
    """Print to stdout and optionally write to file."""
    print(msg)
    if out_file is not None:
        out_file.write(msg + "\n")


# ---------- Data loading ----------
def load_feature_data():
    """Load svm_feature_metrics.parquet and prepare 14D scaled matrix (Stage 2 & 3)."""
    df = pl.read_parquet("data/output/svm_feature_metrics.parquet")
    df = df.with_columns(
        [(pl.col("frac_nonzero") + 1e-8).log().alias("log_frac_nonzero")]
        + [pl.col(c).fill_null(0.0) for c in SVM_FEATURE_METRICS if c != "log_frac_nonzero"]
    )

    feature_ids = df["feature_id"].to_numpy()
    X_raw = df.select(SVM_FEATURE_METRICS).to_numpy()

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_raw)

    # Subsample for feasibility
    rng = np.random.RandomState(RANDOM_STATE)
    if len(X_scaled) > MAX_FEATURES:
        idx = rng.choice(len(X_scaled), MAX_FEATURES, replace=False)
        X_scaled = X_scaled[idx]
        feature_ids = feature_ids[idx]

    return feature_ids, X_scaled


def load_pair_data():
    """Load pair metrics and build 12D pair vectors (Stage 1).

    12D = [A+B (4D intra)] + [|A-B| (4D intra)] + [4D inter]
    Uses Polars joins instead of Python row iteration for performance.
    """
    # Load intra-feature metrics (4D per feature)
    feat_df = pl.read_parquet("data/output/svm_feature_metrics.parquet")
    feat_df = feat_df.with_columns([pl.col(c).fill_null(0.0) for c in SVM_PAIR_INTRA_METRICS])
    feat_df = feat_df.select(["feature_id"] + SVM_PAIR_INTRA_METRICS)

    # Load inter-feature pair metrics
    pair_df = pl.read_parquet("data/output/svm_pair_metrics.parquet")
    pair_df = pair_df.with_columns([pl.col(c).fill_null(0.0) for c in SVM_PAIR_INTER_METRICS])

    # Join intra metrics for feature_a
    pair_df = pair_df.join(
        feat_df.rename({c: f"{c}_a" for c in SVM_PAIR_INTRA_METRICS}),
        left_on="feature_a", right_on="feature_id", how="inner",
    )
    # Join intra metrics for feature_b
    pair_df = pair_df.join(
        feat_df.rename({c: f"{c}_b" for c in SVM_PAIR_INTRA_METRICS}),
        left_on="feature_b", right_on="feature_id", how="inner",
    )

    # Compute 12D columns: sum(4) + abs_diff(4) + inter(4)
    pair_df = pair_df.with_columns([
        (pl.col(f"{c}_a") + pl.col(f"{c}_b")).alias(f"sum_{c}")
        for c in SVM_PAIR_INTRA_METRICS
    ] + [
        (pl.col(f"{c}_a") - pl.col(f"{c}_b")).abs().alias(f"diff_{c}")
        for c in SVM_PAIR_INTRA_METRICS
    ])

    # Build pair keys and extract 12D matrix
    pair_df = pair_df.with_columns(
        (pl.col("feature_a").cast(pl.Utf8) + pl.lit("-") + pl.col("feature_b").cast(pl.Utf8)).alias("pair_key")
    )
    vector_cols = (
        [f"sum_{c}" for c in SVM_PAIR_INTRA_METRICS]
        + [f"diff_{c}" for c in SVM_PAIR_INTRA_METRICS]
        + SVM_PAIR_INTER_METRICS
    )
    pair_keys = pair_df["pair_key"].to_numpy()
    pair_vectors = pair_df.select(vector_cols).to_numpy()

    # Subsample for feasibility
    rng = np.random.RandomState(RANDOM_STATE)
    if len(pair_vectors) > MAX_PAIRS:
        idx = rng.choice(len(pair_vectors), MAX_PAIRS, replace=False)
        pair_vectors = pair_vectors[idx]
        pair_keys = pair_keys[idx]

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(pair_vectors)

    return pair_keys, X_scaled


# ---------- Method 1: Kennard-Stone ----------
def kennard_stone(X, n):
    """Greedy max-min distance selection."""
    pbar = tqdm(total=3, desc="    Kennard-Stone", leave=False)

    pbar.set_postfix_str("pdist")
    dist_matrix = squareform(pdist(X))
    pbar.update(1)

    pbar.set_postfix_str("init pair")
    i, j = np.unravel_index(np.argmax(dist_matrix), dist_matrix.shape)
    selected = [int(i), int(j)]
    min_dist_to_selected = np.minimum(dist_matrix[i], dist_matrix[j])
    pbar.update(1)

    pbar.set_postfix_str("selecting")
    while len(selected) < n:
        min_dist_to_selected[selected] = -1
        next_idx = int(np.argmax(min_dist_to_selected))
        selected.append(next_idx)
        min_dist_to_selected = np.minimum(min_dist_to_selected, dist_matrix[next_idx])
    pbar.update(1)
    pbar.close()

    return selected


# ---------- Method 2: K-Means ----------
def kmeans_select(X, n):
    """K-Means clustering, pick nearest point to each centroid."""
    pbar = tqdm(total=2, desc="    K-Means", leave=False)

    pbar.set_postfix_str("fitting")
    km = KMeans(n_clusters=n, random_state=RANDOM_STATE, n_init=10)
    km.fit(X)
    pbar.update(1)

    pbar.set_postfix_str("nearest to centroids")
    centroids = km.cluster_centers_
    selected = []
    for c in centroids:
        dists = np.linalg.norm(X - c, axis=1)
        idx = int(np.argmin(dists))
        while idx in selected:
            dists[idx] = np.inf
            idx = int(np.argmin(dists))
        selected.append(idx)
    pbar.update(1)
    pbar.close()

    return selected


# ---------- Method 3: K-Medoids ----------
def kmedoids_select(X, n):
    """K-Medoids (PAM) — selected points are actual data points."""
    pbar = tqdm(total=1, desc="    K-Medoids", leave=False)
    pbar.set_postfix_str("PAM fitting")
    km = KMedoids(n_clusters=n, random_state=RANDOM_STATE, method='pam')
    km.fit(X)
    pbar.update(1)
    pbar.close()
    return list(km.medoid_indices_)


# ---------- Method 4: Density-based ----------
def density_based_select(X, n):
    """KDE density estimation, then stratified selection across density quantiles."""
    pbar = tqdm(total=3, desc="    Density-Based", leave=False)

    rng = np.random.RandomState(RANDOM_STATE)
    pbar.set_postfix_str("KDE fitting")
    if len(X) > 5000:
        subsample_idx = rng.choice(len(X), 5000, replace=False)
        kde = gaussian_kde(X[subsample_idx].T, bw_method='scott')
    else:
        kde = gaussian_kde(X.T, bw_method='scott')
    pbar.update(1)

    pbar.set_postfix_str("evaluating densities")
    densities = kde(X.T)
    pbar.update(1)

    pbar.set_postfix_str("stratified selection")
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

        bin_median = np.median(densities[candidates])
        best = candidates[np.argmin(np.abs(densities[candidates] - bin_median))]

        if int(best) in selected:
            for c in candidates:
                if int(c) not in selected:
                    best = c
                    break
        selected.append(int(best))
    pbar.update(1)
    pbar.close()

    return selected


# ---------- Method 5: Cluster-Typical ----------
def cluster_typical_select(X, n):
    """KMeans + kNN typicality: pick most typical point per cluster."""
    pbar = tqdm(total=2, desc="    Cluster-Typical", leave=False)

    pbar.set_postfix_str("KMeans fitting")
    km = KMeans(n_clusters=n, random_state=RANDOM_STATE, n_init=10)
    labels = km.fit_predict(X)
    pbar.update(1)

    pbar.set_postfix_str("kNN typicality")
    selected = []
    for c in range(n):
        cluster_mask = np.where(labels == c)[0]
        if len(cluster_mask) == 0:
            continue

        if len(cluster_mask) <= K_NN:
            # Fallback: nearest to centroid
            dists = np.linalg.norm(X[cluster_mask] - km.cluster_centers_[c], axis=1)
            best_local = int(np.argmin(dists))
            idx = int(cluster_mask[best_local])
        else:
            # kNN typicality
            cluster_points = X[cluster_mask]
            nn = NearestNeighbors(n_neighbors=K_NN + 1)
            nn.fit(cluster_points)
            distances, _ = nn.kneighbors(cluster_points)
            mean_dists = distances[:, 1:].mean(axis=1)  # exclude self
            typicality = 1.0 / (mean_dists + 1e-8)
            best_local = int(np.argmax(typicality))
            idx = int(cluster_mask[best_local])

        # Avoid duplicates
        if idx in selected:
            if len(cluster_mask) > K_NN:
                order = np.argsort(-typicality)
                for alt in order:
                    alt_idx = int(cluster_mask[alt])
                    if alt_idx not in selected:
                        idx = alt_idx
                        break
            else:
                dists = np.linalg.norm(X[cluster_mask] - km.cluster_centers_[c], axis=1)
                order = np.argsort(dists)
                for alt in order:
                    alt_idx = int(cluster_mask[alt])
                    if alt_idx not in selected:
                        idx = alt_idx
                        break

        selected.append(idx)
    pbar.update(1)
    pbar.close()

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


# ---------- Experiment runner ----------
def run_experiment(ids, X, methods, space_label, out=None):
    """Run all methods on given data matrix and print results."""
    log(f"\n{'#' * 70}", out)
    log(f"# {space_label}", out)
    log(f"# {len(ids)} samples, {X.shape[1]}D", out)
    log(f"{'#' * 70}", out)

    results = {}
    for name, func in methods.items():
        indices = func(X, N_SELECT)
        selected_ids = [ids[i] for i in indices]
        metrics = compute_metrics(X, indices)
        results[name] = {'indices': indices, 'ids': selected_ids, 'metrics': metrics}
        log(f"    {name}: selected {len(selected_ids)} items", out)

    # Coverage comparison
    log(f"\n{'=' * 78}", out)
    log(f"  {space_label} — Coverage", out)
    log(f"{'=' * 78}", out)
    log(f"{'Method':<18} {'Avg Dist':>10} {'Min Dist':>10} {'Max Dist':>10} {'Std Dist':>10}", out)
    log("-" * 78, out)
    for name, r in results.items():
        m = r['metrics']
        log(f"{name:<18} {m['avg_pairwise_dist']:>10.4f} {m['min_pairwise_dist']:>10.4f} "
            f"{m['max_pairwise_dist']:>10.4f} {m['std_pairwise_dist']:>10.4f}", out)
    log("=" * 78, out)

    # Overlap (Jaccard)
    method_names = list(results.keys())
    header = f"{'':>18}" + "".join(f" {n:>18}" for n in method_names)
    log(f"\nPairwise Overlap (Jaccard):", out)
    log(header, out)
    for a in method_names:
        row = f"{a:>18}"
        for b in method_names:
            j = jaccard(results[a]['ids'], results[b]['ids'])
            row += f" {j:>18.3f}"
        log(row, out)

    # Overlap count
    log(f"\nPairwise Overlap (shared count):", out)
    for a, b in combinations(method_names, 2):
        shared = set(results[a]['ids']) & set(results[b]['ids'])
        detail = sorted(shared)[:10] if shared else '(none)'
        suffix = f" ... ({len(shared)} total)" if len(shared) > 10 else ""
        log(f"  {a} & {b}: {len(shared)} shared — {detail}{suffix}", out)

    return results


def main():
    methods = {
        'Kennard-Stone':   kennard_stone,
        'K-Means':         kmeans_select,
        'K-Medoids':       kmedoids_select,
        'Density-Based':   density_based_select,
        'Cluster-Typical': cluster_typical_select,
    }

    with open(RESULTS_FILE, 'w') as f:
        # --- Stage 2 & 3: Feature Space (14D) ---
        print("Loading feature data...")
        feature_ids, X_features = load_feature_data()
        print(f"  Loaded {len(feature_ids)} features, {X_features.shape[1]}D")
        run_experiment(feature_ids, X_features, methods,
                       space_label="Stage 2 & 3: Feature Space (14D)", out=f)

        # --- Stage 1: Pair Space (12D) ---
        print("\nLoading pair data...")
        pair_keys, X_pairs = load_pair_data()
        print(f"  Loaded {len(pair_keys)} pairs, {X_pairs.shape[1]}D")
        run_experiment(pair_keys, X_pairs, methods,
                       space_label="Stage 1: Pair Space (12D)", out=f)

    print(f"\nResults saved to {RESULTS_FILE}")


if __name__ == "__main__":
    main()
