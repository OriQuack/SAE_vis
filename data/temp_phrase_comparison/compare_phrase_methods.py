"""
Compare phrase extraction methods on sampled features.

Usage:
    python compare_phrase_methods.py --limit 100
"""

import argparse
import sys
from pathlib import Path
from typing import Dict, List

import polars as pl
import spacy

from methods import METHODS


def compute_metrics(phrases: List[str]) -> Dict[str, float]:
    """Compute quality metrics for a list of phrases."""
    if not phrases:
        return {
            "phrase_count": 0,
            "avg_length": 0.0,
            "single_word_ratio": 0.0,
            "short_phrase_ratio": 0.0,
        }

    word_counts = [len(p.split()) for p in phrases]
    char_counts = [len(p) for p in phrases]

    single_word = sum(1 for wc in word_counts if wc == 1)
    short_phrases = sum(1 for cc in char_counts if cc <= 2)

    return {
        "phrase_count": len(phrases),
        "avg_length": sum(word_counts) / len(word_counts),
        "single_word_ratio": single_word / len(phrases),
        "short_phrase_ratio": short_phrases / len(phrases),
    }


def main():
    parser = argparse.ArgumentParser(description="Compare phrase extraction methods")
    parser.add_argument("--limit", type=int, default=100, help="Number of features to sample")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for sampling")
    args = parser.parse_args()

    # Paths
    data_dir = Path(__file__).parent.parent / "output"
    results_dir = Path(__file__).parent / "results"
    results_dir.mkdir(exist_ok=True)

    features_path = data_dir / "features.parquet"
    if not features_path.exists():
        print(f"Error: {features_path} not found")
        sys.exit(1)

    print("Loading spaCy model...")
    nlp = spacy.load("en_core_web_sm")

    print(f"Loading features from {features_path}...")
    df = pl.read_parquet(features_path)

    # Sample features (unique feature_ids)
    unique_features = df.select("feature_id").unique()
    print(f"Total unique features: {len(unique_features)}")

    print(f"Sampling {args.limit} features (seed={args.seed})...")
    sampled_ids = unique_features.sample(n=min(args.limit, len(unique_features)), seed=args.seed)

    # Get all rows for sampled features
    sampled = df.filter(pl.col("feature_id").is_in(sampled_ids["feature_id"]))

    # Collect all explanations
    explanations = []

    for row in sampled.iter_rows(named=True):
        feature_id = row["feature_id"]
        explainer = row.get("llm_explainer", "unknown")
        exp_text = row.get("explanation_text", "")

        if exp_text and isinstance(exp_text, str) and exp_text.strip():
            explanations.append({
                "feature_id": feature_id,
                "explainer": explainer,
                "text": exp_text,
            })

    print(f"Total explanations: {len(explanations)}")

    # Run each method and collect results
    method_results = {}
    detailed_results = []

    for method_name, method_fn in METHODS.items():
        print(f"Running {method_name}...")
        all_phrases = []

        for exp in explanations:
            phrases = method_fn(exp["text"], nlp)
            all_phrases.extend(phrases)

            # Store detailed results
            for phrase in phrases:
                detailed_results.append({
                    "feature_id": exp["feature_id"],
                    "explainer": exp["explainer"],
                    "method": method_name,
                    "phrase": phrase,
                    "word_count": len(phrase.split()),
                    "char_count": len(phrase),
                })

        method_results[method_name] = compute_metrics(all_phrases)

    # Create summary table
    print("\n" + "=" * 70)
    print("=== Phrase Extraction Method Comparison ===")
    print("=" * 70)
    print(f"Features sampled: {len(sampled)}")
    print(f"Total explanations: {len(explanations)}")
    print()

    # Header
    header = f"{'Method':<22} | {'Phrases':>8} | {'Avg Len':>8} | {'1-word%':>8} | {'Short%':>8}"
    print(header)
    print("-" * len(header))

    # Results rows
    summary_lines = [header, "-" * len(header)]
    for method_name, metrics in method_results.items():
        row = (
            f"{method_name:<22} | "
            f"{metrics['phrase_count']:>8,} | "
            f"{metrics['avg_length']:>8.1f} | "
            f"{metrics['single_word_ratio'] * 100:>7.1f}% | "
            f"{metrics['short_phrase_ratio'] * 100:>7.1f}%"
        )
        print(row)
        summary_lines.append(row)

    print()

    # Show sample phrases from each method
    print("=" * 70)
    print("=== Sample Phrases (first 5 per method) ===")
    print("=" * 70)

    sample_lines = []
    for method_name in METHODS.keys():
        sample_lines.append(f"\n{method_name}:")
        print(f"\n{method_name}:")
        method_phrases = [r["phrase"] for r in detailed_results if r["method"] == method_name]
        for i, phrase in enumerate(method_phrases[:5]):
            line = f"  {i+1}. {phrase[:80]}{'...' if len(phrase) > 80 else ''}"
            print(line)
            sample_lines.append(line)

    # Save detailed results to parquet
    results_df = pl.DataFrame(detailed_results)
    results_path = results_dir / "comparison_results.parquet"
    results_df.write_parquet(results_path)
    print(f"\nDetailed results saved to: {results_path}")

    # Save summary report
    report_path = results_dir / "summary_report.txt"
    with open(report_path, "w") as f:
        f.write("=== Phrase Extraction Method Comparison ===\n")
        f.write(f"Features sampled: {len(sampled)}\n")
        f.write(f"Total explanations: {len(explanations)}\n\n")
        f.write("\n".join(summary_lines))
        f.write("\n\n=== Sample Phrases (first 5 per method) ===\n")
        f.write("\n".join(sample_lines))
        f.write("\n")

    print(f"Summary report saved to: {report_path}")

    # Print additional analysis
    print("\n" + "=" * 70)
    print("=== Method Analysis ===")
    print("=" * 70)

    # Find best method for each metric
    best_avg_len = max(method_results.items(), key=lambda x: x[1]["avg_length"])
    lowest_single = min(method_results.items(), key=lambda x: x[1]["single_word_ratio"])
    lowest_short = min(method_results.items(), key=lambda x: x[1]["short_phrase_ratio"])

    print(f"Highest avg phrase length: {best_avg_len[0]} ({best_avg_len[1]['avg_length']:.1f} words)")
    print(f"Lowest single-word ratio: {lowest_single[0]} ({lowest_single[1]['single_word_ratio']*100:.1f}%)")
    print(f"Lowest short-phrase ratio: {lowest_short[0]} ({lowest_short[1]['short_phrase_ratio']*100:.1f}%)")


if __name__ == "__main__":
    main()
