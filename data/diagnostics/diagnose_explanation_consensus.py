#!/usr/bin/env python3
"""
Diagnostic Script: Verify Explanation Consensus Clustering

This script displays clustered phrases and outliers for a specific feature
from the explanation_consensus.parquet output.

Usage:
    python data/diagnostics/diagnose_explanation_consensus.py <feature_id>
    python data/diagnostics/diagnose_explanation_consensus.py 0
    python data/diagnostics/diagnose_explanation_consensus.py 100 --show-embeddings

Examples:
    # Show clusters for feature 0
    python data/diagnostics/diagnose_explanation_consensus.py 0

    # Show multiple features
    python data/diagnostics/diagnose_explanation_consensus.py 0 1 2 100

    # Show with original explanations
    python data/diagnostics/diagnose_explanation_consensus.py 0 --show-explanations
"""

import argparse
import sys
from pathlib import Path

import polars as pl

# Add pipeline to path for core utilities
sys.path.insert(0, str(Path(__file__).parent.parent / "pipeline"))

from core.paths import find_project_root


def load_data(project_root: Path):
    """Load required parquet files."""
    consensus_path = project_root / "data/output/explanation_consensus.parquet"
    features_path = project_root / "data/output/features.parquet"

    if not consensus_path.exists():
        print(f"Error: {consensus_path} not found")
        print("Run step_14_explanation_consensus first.")
        sys.exit(1)

    consensus_df = pl.read_parquet(consensus_path)
    features_df = pl.read_parquet(features_path) if features_path.exists() else None

    return consensus_df, features_df


def display_feature_consensus(
    feature_id: int,
    consensus_df: pl.DataFrame,
    features_df: "pl.DataFrame | None" = None,
    show_explanations: bool = False,
):
    """Display consensus analysis for a single feature."""
    # Filter for the feature
    row = consensus_df.filter(pl.col("feature_id") == feature_id)

    if len(row) == 0:
        print(f"\nFeature {feature_id}: NOT FOUND")
        return

    data = row.to_dicts()[0]

    print(f"\n{'='*70}")
    print(f"FEATURE {feature_id}")
    print(f"{'='*70}")

    # Show original explanations if requested
    if show_explanations and features_df is not None:
        feature_rows = features_df.filter(
            pl.col("feature_id") == feature_id
        ).to_dicts()

        print("\n--- Original Explanations ---")
        for fr in feature_rows:
            explainer = fr.get("llm_explainer", "unknown")
            explanation = fr.get("explanation_text", "N/A")
            # Shorten explainer name
            short_name = explainer.split("/")[-1] if "/" in explainer else explainer
            print(f"  [{short_name}]: {explanation}")

    # Summary
    print(f"\n--- Summary ---")
    print(f"  Consensus Score: {data['consensus_score']:.3f}")
    print(f"  Num Clusters:    {data['num_clusters']}")
    print(f"  Num Outliers:    {data['num_outliers']}")

    clusters = data["clusters"]

    if not clusters:
        print("\n  No clusters found.")
        return

    # Separate clusters and outliers
    real_clusters = [c for c in clusters if c["cluster_id"] != -1]
    outlier_entries = [c for c in clusters if c["cluster_id"] == -1]

    # Display clusters
    if real_clusters:
        print(f"\n--- Clusters ({len(real_clusters)}) ---")
        for cluster in sorted(real_clusters, key=lambda x: x["cluster_id"]):
            cid = cluster["cluster_id"]
            medoid = cluster["medoid_phrase"]
            medoid_explainer = cluster["medoid_explainer"]
            coherence = cluster["cluster_coherence"]
            activation_sim = cluster["medoid_activation_similarity"]

            # Shorten explainer name
            short_explainer = medoid_explainer.split("/")[-1] if "/" in medoid_explainer else medoid_explainer

            print(f"\n  Cluster {cid} (coherence={coherence:.3f}):")
            print(f"    Medoid: \"{medoid}\" [{short_explainer}]")
            print(f"    Activation Sim: {activation_sim:.3f}")
            print(f"    Phrases ({len(cluster['phrases'])}):")

            for phrase in cluster["phrases"]:
                text = phrase["text"]
                explainer = phrase["explainer"]
                dist = phrase["distance_to_medoid"]
                act_sim = phrase["activation_similarity"]
                short_exp = explainer.split("/")[-1] if "/" in explainer else explainer

                marker = "*" if text == medoid else " "
                print(f"     {marker} \"{text}\" [{short_exp}] (dist={dist:.3f}, act_sim={act_sim:.3f})")

    # Display outliers
    if outlier_entries:
        total_outliers = sum(len(c["phrases"]) for c in outlier_entries)
        print(f"\n--- Outliers ({total_outliers}) ---")
        for entry in outlier_entries:
            for phrase in entry["phrases"]:
                text = phrase["text"]
                explainer = phrase["explainer"]
                act_sim = phrase["activation_similarity"]
                short_exp = explainer.split("/")[-1] if "/" in explainer else explainer
                print(f"    \"{text}\" [{short_exp}] (act_sim={act_sim:.3f})")


def display_statistics(consensus_df: pl.DataFrame):
    """Display overall statistics."""
    print("\n" + "="*70)
    print("OVERALL STATISTICS")
    print("="*70)

    print(f"\nTotal features: {len(consensus_df):,}")

    # Consensus score distribution
    scores = consensus_df["consensus_score"]
    print(f"\nConsensus Score:")
    print(f"  Mean:   {scores.mean():.3f}")
    print(f"  Median: {scores.median():.3f}")
    print(f"  Min:    {scores.min():.3f}")
    print(f"  Max:    {scores.max():.3f}")

    # Cluster counts
    num_clusters = consensus_df["num_clusters"]
    print(f"\nClusters per Feature:")
    print(f"  Mean:   {num_clusters.mean():.2f}")
    print(f"  Median: {num_clusters.median():.0f}")
    print(f"  Max:    {num_clusters.max()}")

    # Features with no clusters
    no_clusters = consensus_df.filter(pl.col("num_clusters") == 0)
    print(f"\nFeatures with no clusters: {len(no_clusters):,} ({100*len(no_clusters)/len(consensus_df):.1f}%)")

    # High consensus features
    high_consensus = consensus_df.filter(pl.col("consensus_score") > 0.7)
    print(f"Features with high consensus (>0.7): {len(high_consensus):,} ({100*len(high_consensus)/len(consensus_df):.1f}%)")


def main():
    parser = argparse.ArgumentParser(
        description="Diagnose explanation consensus clustering for specific features"
    )
    parser.add_argument(
        "feature_ids",
        type=int,
        nargs="*",
        help="Feature ID(s) to analyze. If none provided, shows statistics only."
    )
    parser.add_argument(
        "--show-explanations", "-e",
        action="store_true",
        help="Show original explanations from each LLM"
    )
    parser.add_argument(
        "--stats", "-s",
        action="store_true",
        help="Show overall statistics"
    )
    parser.add_argument(
        "--random", "-r",
        type=int,
        metavar="N",
        help="Show N random features"
    )
    parser.add_argument(
        "--high-consensus",
        type=int,
        metavar="N",
        help="Show top N features with highest consensus"
    )
    parser.add_argument(
        "--low-consensus",
        type=int,
        metavar="N",
        help="Show top N features with lowest consensus (excluding 0)"
    )

    args = parser.parse_args()

    # Find project root
    project_root = find_project_root()
    print(f"Project root: {project_root}")

    # Load data
    consensus_df, features_df = load_data(project_root)
    print(f"Loaded {len(consensus_df):,} features from explanation_consensus.parquet")

    # Show statistics if requested or no features specified
    if args.stats or (not args.feature_ids and not args.random
                      and not args.high_consensus and not args.low_consensus):
        display_statistics(consensus_df)

    # Collect feature IDs to display
    feature_ids = list(args.feature_ids) if args.feature_ids else []

    if args.random:
        random_ids = consensus_df.sample(n=min(args.random, len(consensus_df)))["feature_id"].to_list()
        feature_ids.extend(random_ids)
        print(f"\nRandom features selected: {random_ids}")

    if args.high_consensus:
        high = consensus_df.sort("consensus_score", descending=True).head(args.high_consensus)
        high_ids = high["feature_id"].to_list()
        feature_ids.extend(high_ids)
        print(f"\nHigh consensus features: {high_ids}")

    if args.low_consensus:
        low = consensus_df.filter(pl.col("consensus_score") > 0).sort("consensus_score").head(args.low_consensus)
        low_ids = low["feature_id"].to_list()
        feature_ids.extend(low_ids)
        print(f"\nLow consensus features: {low_ids}")

    # Display each feature
    for fid in feature_ids:
        display_feature_consensus(
            fid,
            consensus_df,
            features_df,
            show_explanations=args.show_explanations
        )

    print()


if __name__ == "__main__":
    main()
