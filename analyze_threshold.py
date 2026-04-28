#!/usr/bin/env python3
"""Analyze agglomerative clustering at different thresholds.

Re-uses phrase embeddings from step_13 logic but cuts the dendrogram
at multiple thresholds, reporting per-threshold statistics without
re-running the full pipeline.

Usage:
    python analyze_threshold.py
    python analyze_threshold.py --limit 500
    python analyze_threshold.py --thresholds 0.3 0.4 0.5 0.6 0.7
"""

import argparse
import sys
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import polars as pl
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.spatial.distance import pdist
from tqdm import tqdm

# Add pipeline to path for core imports
sys.path.insert(0, str(Path(__file__).parent / "data" / "pipeline"))
from core.phrases import extract_all_phrases_with_offsets
from core.embeddings import get_projection_modules, apply_projection_layers

# Enable string cache
pl.enable_string_cache()

DEFAULT_THRESHOLDS = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7]


def load_data(data_dir: Path):
    """Load features and activation embeddings."""
    features_df = pl.read_parquet(data_dir / "output" / "features.parquet")
    act_emb_df = pl.read_parquet(data_dir / "intermediate" / "activation_embeddings.parquet")
    print(f"Loaded {len(features_df):,} feature rows, {len(act_emb_df):,} activation embedding rows")
    return features_df, act_emb_df


def load_embedding_model():
    """Load sentence transformer + projection layers."""
    from sentence_transformers import SentenceTransformer

    model_name = "google/embeddinggemma-300m"
    print(f"Loading embedding model ({model_name})...")
    model = SentenceTransformer(model_name)
    dense1, dense2, normalize = get_projection_modules(model)
    return model, dense1, dense2, normalize


def embed_phrases(texts: List[str], model, dense1, dense2, normalize) -> np.ndarray:
    """Embed phrases using token_embeddings + mean pooling + projection (same as step_13)."""
    if not texts:
        return np.empty((0, 768), dtype=np.float32)

    token_embeddings_batch = model.encode(
        texts,
        output_value="token_embeddings",
        convert_to_tensor=True,
        show_progress_bar=False,
    )

    embeddings = []
    for token_emb in token_embeddings_batch:
        if hasattr(token_emb, "cpu"):
            token_emb = token_emb.cpu().numpy()
        else:
            token_emb = np.array(token_emb)
        pooled = np.mean(token_emb, axis=0)
        projected = apply_projection_layers(pooled, model, dense1, dense2, normalize)
        embeddings.append(projected.astype(np.float32))

    return np.array(embeddings)


def get_activation_centroid(act_emb_df: pl.DataFrame, feature_id: int) -> Optional[np.ndarray]:
    """Get mean activation embedding for a feature."""
    row = act_emb_df.filter(pl.col("feature_id") == feature_id)
    if len(row) == 0:
        return None
    embs = row["embeddings"].to_list()[0]
    if not embs:
        return None
    centroid = np.mean(np.array(embs), axis=0)
    norm = np.linalg.norm(centroid)
    return centroid / norm if norm > 0 else centroid


def analyze_feature_at_thresholds(
    phrases: List[Tuple],
    phrase_embeddings: np.ndarray,
    explainer_names: List[str],
    phrase_weights: List[float],
    thresholds: List[float],
    num_explainers: int,
) -> Dict[float, Dict]:
    """Cluster one feature's phrases at multiple thresholds via single linkage + fcluster."""

    n = len(phrases)
    if n < 2:
        # Single or no phrase -> outlier at every threshold
        return {
            t: {
                "num_clusters": 0,
                "num_outliers": n,
                "consensus_score": 0.0,
                "avg_intra_cluster_sim": float("nan"),
                "avg_cluster_size": 0.0,
                "num_phrases": n,
            }
            for t in thresholds
        }

    # Compute linkage once
    distances = pdist(phrase_embeddings, metric="cosine")
    Z = linkage(distances, method="average")

    # Pre-compute full pairwise cosine similarity matrix for intra-cluster sim
    sim_matrix = phrase_embeddings @ phrase_embeddings.T

    results = {}
    for threshold in thresholds:
        labels = fcluster(Z, t=threshold, criterion="distance") - 1  # 0-indexed

        # Reclassify single-explainer clusters as outliers
        for cid in set(labels):
            mask = labels == cid
            indices = np.where(mask)[0]
            explainers_in = set(explainer_names[phrases[i][1]] for i in indices)
            if len(explainers_in) < 2:
                labels[mask] = -1

        # Compute metrics
        unique_labels = set(labels)
        real_clusters = [cid for cid in unique_labels if cid != -1]
        num_clusters = len(real_clusters)
        num_outliers = int(np.sum(labels == -1))

        # Consensus score
        total_cluster_score = 0.0
        intra_sims = []
        cluster_sizes = []

        for cid in real_clusters:
            mask = labels == cid
            indices = np.where(mask)[0]
            cluster_sizes.append(len(indices))

            # Intra-cluster similarity (upper triangle of sim submatrix)
            if len(indices) > 1:
                sub_sim = sim_matrix[np.ix_(indices, indices)]
                tri = np.triu_indices(len(indices), k=1)
                intra_sims.append(float(np.mean(sub_sim[tri])))
            else:
                intra_sims.append(1.0)

            # Cluster score: coverage_factor * sum(phrase_weights)
            explainers_in = set(explainer_names[phrases[i][1]] for i in indices)
            coverage = (len(explainers_in) - 1) / (num_explainers - 1) if num_explainers > 1 else 0.0
            total_cluster_score += coverage * sum(phrase_weights[i] for i in indices)

        consensus_score = total_cluster_score / num_explainers if num_explainers > 0 else 0.0
        avg_intra = float(np.mean(intra_sims)) if intra_sims else float("nan")
        avg_size = float(np.mean(cluster_sizes)) if cluster_sizes else 0.0

        results[threshold] = {
            "num_clusters": num_clusters,
            "num_outliers": num_outliers,
            "consensus_score": consensus_score,
            "avg_intra_cluster_sim": avg_intra,
            "avg_cluster_size": avg_size,
            "num_phrases": n,
        }

    return results


def main():
    parser = argparse.ArgumentParser(description="Analyze agglomerative threshold sensitivity")
    parser.add_argument("--limit", type=int, default=None, help="Limit features (for testing)")
    parser.add_argument("--thresholds", type=float, nargs="+", default=DEFAULT_THRESHOLDS,
                        help="Thresholds to evaluate")
    args = parser.parse_args()

    data_dir = Path(__file__).parent / "data"
    features_df, _act_emb_df = load_data(data_dir)
    model, dense1, dense2, normalize = load_embedding_model()

    unique_features = sorted(features_df["feature_id"].unique().to_list())
    if args.limit:
        unique_features = unique_features[: args.limit]
        print(f"Limited to {args.limit} features")

    thresholds = sorted(args.thresholds)
    print(f"Thresholds: {thresholds}")
    print(f"Processing {len(unique_features):,} features...\n")

    # Accumulate per-threshold stats
    accum: Dict[float, List[Dict]] = {t: [] for t in thresholds}

    for feature_id in tqdm(unique_features, desc="Features"):
        rows = features_df.filter(pl.col("feature_id") == feature_id).to_dicts()
        if not rows:
            continue

        explanations = [r["explanation_text"] for r in rows]
        explainer_names = [r["llm_explainer"] for r in rows]
        num_explainers = len(set(explainer_names))

        # Extract phrases
        phrases = extract_all_phrases_with_offsets(explanations, method="clause")
        if not phrases:
            continue

        # Phrase weights (each explanation contributes 1.0 total)
        phrases_per_exp: Dict[int, int] = defaultdict(int)
        for _, exp_idx, _, _ in phrases:
            phrases_per_exp[exp_idx] += 1
        phrase_weights = [1.0 / phrases_per_exp[p[1]] for p in phrases]

        # Embed
        phrase_texts = [p[0] for p in phrases]
        phrase_embs = embed_phrases(phrase_texts, model, dense1, dense2, normalize)

        # Analyze at all thresholds
        per_threshold = analyze_feature_at_thresholds(
            phrases, phrase_embs, explainer_names,
            phrase_weights, thresholds, num_explainers,
        )

        for t, stats in per_threshold.items():
            accum[t].append(stats)

    # Aggregate and print results
    print("\n" + "=" * 100)
    print(f"{'Threshold':>10} | {'Clusters':>10} | {'Outliers':>10} | {'Consensus':>12} | "
          f"{'IntraClSim':>12} | {'AvgClSize':>10} | {'Phrases':>10} | "
          f"{'Features w/ clusters':>20}")
    print("-" * 100)

    for t in thresholds:
        records = accum[t]
        n = len(records)
        if n == 0:
            continue

        avg_clusters = np.mean([r["num_clusters"] for r in records])
        avg_outliers = np.mean([r["num_outliers"] for r in records])
        avg_consensus = np.mean([r["consensus_score"] for r in records])
        intra_vals = [r["avg_intra_cluster_sim"] for r in records if not np.isnan(r["avg_intra_cluster_sim"])]
        avg_intra = np.mean(intra_vals) if intra_vals else float("nan")
        size_vals = [r["avg_cluster_size"] for r in records if r["avg_cluster_size"] > 0]
        avg_size = np.mean(size_vals) if size_vals else 0.0
        avg_phrases = np.mean([r["num_phrases"] for r in records])
        features_with_clusters = sum(1 for r in records if r["num_clusters"] > 0)

        intra_str = f"{avg_intra:.4f}" if not np.isnan(avg_intra) else "N/A"
        print(f"{t:>10.2f} | {avg_clusters:>10.2f} | {avg_outliers:>10.2f} | "
              f"{avg_consensus:>12.4f} | {intra_str:>12} | {avg_size:>10.2f} | "
              f"{avg_phrases:>10.1f} | {features_with_clusters:>14} / {n}")

    print("=" * 100)

    # Distribution of consensus scores at each threshold
    print("\n\nConsensus Score Distribution (percentiles)")
    print(f"{'Threshold':>10} | {'p10':>8} | {'p25':>8} | {'p50':>8} | {'p75':>8} | {'p90':>8} | {'mean':>8} | {'std':>8}")
    print("-" * 85)
    for t in thresholds:
        scores = [r["consensus_score"] for r in accum[t]]
        if not scores:
            continue
        arr = np.array(scores)
        p10, p25, p50, p75, p90 = np.percentile(arr, [10, 25, 50, 75, 90])
        print(f"{t:>10.2f} | {p10:>8.4f} | {p25:>8.4f} | {p50:>8.4f} | {p75:>8.4f} | {p90:>8.4f} | {np.mean(arr):>8.4f} | {np.std(arr):>8.4f}")

    print("\n\nIntra-Cluster Similarity Distribution (percentiles)")
    print(f"{'Threshold':>10} | {'p10':>8} | {'p25':>8} | {'p50':>8} | {'p75':>8} | {'p90':>8} | {'mean':>8}")
    print("-" * 75)
    for t in thresholds:
        vals = [r["avg_intra_cluster_sim"] for r in accum[t] if not np.isnan(r["avg_intra_cluster_sim"])]
        if not vals:
            continue
        arr = np.array(vals)
        p10, p25, p50, p75, p90 = np.percentile(arr, [10, 25, 50, 75, 90])
        print(f"{t:>10.2f} | {p10:>8.4f} | {p25:>8.4f} | {p50:>8.4f} | {p75:>8.4f} | {p90:>8.4f} | {np.mean(arr):>8.4f}")


if __name__ == "__main__":
    main()
