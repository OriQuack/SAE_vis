#!/usr/bin/env python3
"""
Comprehensive Analysis of SAE Feature Data
==========================================

This script performs in-depth analysis of the feature_analysis.parquet file
containing SAE (Sparse Autoencoder) feature interpretability metrics.

Analysis includes:
1. Data quality and completeness assessment
2. Statistical summaries and distributions
3. Correlation analysis between metrics
4. Feature splitting patterns
5. Model comparison (LLM explainers and scorers)
6. Semantic similarity patterns
7. Score agreement analysis
8. Outlier detection
9. Export detailed results and visualizations
"""

import polars as pl
import json
from pathlib import Path
from datetime import datetime
import numpy as np
from collections import defaultdict

# Configuration
DATA_PATH = Path("/home/dohyun/interface/data/master/feature_analysis.parquet")
OUTPUT_DIR = Path("/home/dohyun/interface/data/master")
TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M%S")


def load_data():
    """Load the parquet file with proper categorical handling."""
    print("Loading data...")
    df = pl.read_parquet(DATA_PATH)
    print(f"✓ Loaded {df.shape[0]:,} rows × {df.shape[1]} columns\n")
    return df


def basic_statistics(df):
    """Generate basic statistics and data quality metrics."""
    print("=" * 80)
    print("1. BASIC STATISTICS & DATA QUALITY")
    print("=" * 80)

    results = {
        "dataset_info": {
            "total_rows": df.shape[0],
            "total_columns": df.shape[1],
            "total_features": df.select("feature_id").n_unique(),
            "timestamp": TIMESTAMP
        },
        "columns": {},
        "missing_values": {},
        "unique_counts": {}
    }

    print(f"\nDataset Shape: {df.shape[0]:,} rows × {df.shape[1]} columns")
    print(f"Unique Features: {df.select('feature_id').n_unique():,}")
    print(f"\nColumns and Types:")

    for col in df.columns:
        dtype = str(df[col].dtype)
        n_missing = df[col].null_count()
        n_unique = df[col].n_unique()
        pct_missing = (n_missing / len(df)) * 100

        results["columns"][col] = {
            "dtype": dtype,
            "n_missing": n_missing,
            "pct_missing": round(pct_missing, 2),
            "n_unique": n_unique
        }

        print(f"  {col:25} {dtype:15} | Missing: {n_missing:4} ({pct_missing:5.2f}%) | Unique: {n_unique:5}")

    return results


def numerical_analysis(df):
    """Analyze distributions of numerical columns."""
    print("\n" + "=" * 80)
    print("2. NUMERICAL DISTRIBUTIONS")
    print("=" * 80)

    numerical_cols = [
        "feature_splitting", "semsim_mean", "semsim_max",
        "score_fuzz", "score_simulation", "score_detection", "score_embedding"
    ]

    results = {}

    for col in numerical_cols:
        if col not in df.columns:
            continue

        # Calculate statistics excluding nulls
        col_data = df.select(pl.col(col).drop_nulls())

        stats = {
            "count": col_data.shape[0],
            "mean": float(col_data[col].mean()) if col_data.shape[0] > 0 else None,
            "std": float(col_data[col].std()) if col_data.shape[0] > 0 else None,
            "min": float(col_data[col].min()) if col_data.shape[0] > 0 else None,
            "q25": float(col_data[col].quantile(0.25)) if col_data.shape[0] > 0 else None,
            "median": float(col_data[col].median()) if col_data.shape[0] > 0 else None,
            "q75": float(col_data[col].quantile(0.75)) if col_data.shape[0] > 0 else None,
            "max": float(col_data[col].max()) if col_data.shape[0] > 0 else None,
        }

        results[col] = stats

        print(f"\n{col}:")
        print(f"  Count:   {stats['count']:,}")
        if stats['mean'] is not None:
            print(f"  Mean:    {stats['mean']:.6f}  ± {stats['std']:.6f}")
            print(f"  Min:     {stats['min']:.6f}")
            print(f"  Q25:     {stats['q25']:.6f}")
            print(f"  Median:  {stats['median']:.6f}")
            print(f"  Q75:     {stats['q75']:.6f}")
            print(f"  Max:     {stats['max']:.6f}")

    return results


def correlation_analysis(df):
    """Calculate correlations between numerical metrics."""
    print("\n" + "=" * 80)
    print("3. CORRELATION ANALYSIS")
    print("=" * 80)

    numerical_cols = [
        "feature_splitting", "semsim_mean", "semsim_max",
        "score_fuzz", "score_simulation", "score_detection", "score_embedding"
    ]

    # Filter to only existing columns and drop nulls
    existing_cols = [col for col in numerical_cols if col in df.columns]
    df_numeric = df.select(existing_cols).drop_nulls()

    print(f"\nCorrelation matrix (n={df_numeric.shape[0]:,} complete cases):\n")

    # Calculate correlation matrix
    correlations = {}
    print(f"{'':20}", end="")
    for col in existing_cols:
        print(f"{col[:12]:>13}", end="")
    print()
    print("-" * (20 + 13 * len(existing_cols)))

    for col1 in existing_cols:
        print(f"{col1:20}", end="")
        correlations[col1] = {}

        for col2 in existing_cols:
            if col1 == col2:
                corr = 1.0
            else:
                # Calculate Pearson correlation
                col1_data = df_numeric[col1].to_numpy()
                col2_data = df_numeric[col2].to_numpy()

                if len(col1_data) > 1:
                    corr = np.corrcoef(col1_data, col2_data)[0, 1]
                else:
                    corr = np.nan

            correlations[col1][col2] = float(corr) if not np.isnan(corr) else None

            if np.isnan(corr):
                print(f"{'N/A':>13}", end="")
            else:
                print(f"{corr:>13.3f}", end="")
        print()

    # Highlight strong correlations
    print("\nStrong correlations (|r| > 0.5):")
    for col1 in existing_cols:
        for col2 in existing_cols:
            if col1 < col2:  # Only upper triangle
                corr = correlations[col1][col2]
                if corr is not None and abs(corr) > 0.5:
                    print(f"  {col1} ↔ {col2}: r = {corr:.3f}")

    return correlations


def categorical_analysis(df):
    """Analyze categorical variables."""
    print("\n" + "=" * 80)
    print("4. CATEGORICAL VARIABLE ANALYSIS")
    print("=" * 80)

    categorical_cols = ["explanation_method", "llm_explainer", "llm_scorer"]
    results = {}

    for col in categorical_cols:
        if col not in df.columns:
            continue

        print(f"\n{col}:")
        # Use group_by for more reliable counting
        value_counts = (df.group_by(col)
                          .agg(pl.count().alias("n"))
                          .sort("n", descending=True))

        results[col] = {}
        for row in value_counts.iter_rows(named=False):
            value, count = row
            pct = (count / len(df)) * 100
            results[col][str(value)] = {"count": count, "percentage": round(pct, 2)}
            print(f"  {str(value):40} {count:6,} ({pct:5.2f}%)")

    return results


def feature_splitting_analysis(df):
    """Analyze feature splitting patterns."""
    print("\n" + "=" * 80)
    print("5. FEATURE SPLITTING ANALYSIS")
    print("=" * 80)

    if "feature_splitting" not in df.columns:
        print("Feature splitting column not found")
        return {}

    # Get statistics
    non_null = df.filter(pl.col("feature_splitting").is_not_null())

    results = {
        "total_rows": len(df),
        "non_null_count": len(non_null),
        "null_count": len(df) - len(non_null)
    }

    if len(non_null) > 0:
        # Analyze as continuous values
        mean_val = non_null["feature_splitting"].mean()
        median_val = non_null["feature_splitting"].median()

        # Create bins for analysis
        bins = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0]

        print(f"\nFeature Splitting Statistics (n={len(non_null):,}):")
        print(f"  Mean:   {mean_val:.4f}")
        print(f"  Median: {median_val:.4f}")

        results["mean"] = float(mean_val)
        results["median"] = float(median_val)

        print(f"\nDistribution by bins:")
        for i in range(len(bins) - 1):
            low, high = bins[i], bins[i+1]
            count = len(non_null.filter(
                (pl.col("feature_splitting") >= low) &
                (pl.col("feature_splitting") < high if i < len(bins)-2 else pl.col("feature_splitting") <= high)
            ))
            pct = (count / len(non_null)) * 100
            print(f"  [{low:.1f}, {high:.1f}{')'if i < len(bins)-2 else ']':1} {count:6,} ({pct:5.2f}%)")

    return results


def score_agreement_analysis(df):
    """Analyze agreement between different scoring methods."""
    print("\n" + "=" * 80)
    print("6. SCORE AGREEMENT ANALYSIS")
    print("=" * 80)

    score_cols = ["score_fuzz", "score_simulation", "score_detection", "score_embedding"]
    existing_scores = [col for col in score_cols if col in df.columns]

    if len(existing_scores) < 2:
        print("Insufficient score columns for agreement analysis")
        return {}

    # Filter to rows with all scores present
    df_complete = df.select(["feature_id"] + existing_scores).drop_nulls()

    print(f"\nComplete cases: {len(df_complete):,} / {len(df):,} ({len(df_complete)/len(df)*100:.1f}%)")

    # Define high/low threshold (using median as cutoff)
    threshold = 0.5

    results = {
        "complete_cases": len(df_complete),
        "threshold": threshold,
        "agreement_patterns": {}
    }

    if len(df_complete) > 0:
        # Calculate agreement patterns
        print(f"\nUsing threshold = {threshold} for high/low classification:")

        # Create binary classifications
        df_binary = df_complete.with_columns([
            (pl.col(col) >= threshold).alias(f"{col}_high")
            for col in existing_scores
        ])

        # Count agreement patterns
        high_cols = [f"{col}_high" for col in existing_scores]
        df_agreement = df_binary.with_columns([
            pl.sum_horizontal(high_cols).alias("n_high_scores")
        ])

        agreement_counts = df_agreement["n_high_scores"].value_counts().sort("n_high_scores")

        print(f"\nNumber of scores ≥ {threshold}:")
        for row in agreement_counts.iter_rows():
            n_high, count = row
            pct = (count / len(df_complete)) * 100
            results["agreement_patterns"][f"{n_high}_high"] = {
                "count": count,
                "percentage": round(pct, 2)
            }
            print(f"  {n_high}/{len(existing_scores)} scores high: {count:6,} ({pct:5.2f}%)")

    return results


def semantic_similarity_analysis(df):
    """Analyze semantic similarity patterns."""
    print("\n" + "=" * 80)
    print("7. SEMANTIC SIMILARITY ANALYSIS")
    print("=" * 80)

    if "semsim_mean" not in df.columns or "semsim_max" not in df.columns:
        print("Semantic similarity columns not found")
        return {}

    df_semsim = df.select(["feature_id", "semsim_mean", "semsim_max"]).drop_nulls()

    results = {
        "complete_cases": len(df_semsim),
        "patterns": {}
    }

    print(f"\nComplete cases: {len(df_semsim):,} / {len(df):,}")

    if len(df_semsim) > 0:
        # Analyze the gap between max and mean
        df_gap = df_semsim.with_columns([
            (pl.col("semsim_max") - pl.col("semsim_mean")).alias("gap")
        ])

        gap_mean = df_gap["gap"].mean()
        gap_median = df_gap["gap"].median()

        print(f"\nGap between max and mean similarity:")
        print(f"  Mean gap:   {gap_mean:.4f}")
        print(f"  Median gap: {gap_median:.4f}")

        results["gap_analysis"] = {
            "mean": float(gap_mean),
            "median": float(gap_median)
        }

        # Categorize consistency
        print(f"\nConsistency categories (based on gap):")
        categories = [
            ("Very consistent (gap < 0.1)", 0.0, 0.1),
            ("Consistent (gap 0.1-0.2)", 0.1, 0.2),
            ("Moderate (gap 0.2-0.3)", 0.2, 0.3),
            ("Variable (gap > 0.3)", 0.3, float('inf'))
        ]

        for label, low, high in categories:
            if high == float('inf'):
                count = len(df_gap.filter(pl.col("gap") >= low))
            else:
                count = len(df_gap.filter((pl.col("gap") >= low) & (pl.col("gap") < high)))
            pct = (count / len(df_gap)) * 100
            results["patterns"][label] = {
                "count": count,
                "percentage": round(pct, 2)
            }
            print(f"  {label:30} {count:6,} ({pct:5.2f}%)")

    return results


def outlier_detection(df):
    """Detect outliers in numerical columns using IQR method."""
    print("\n" + "=" * 80)
    print("8. OUTLIER DETECTION (IQR Method)")
    print("=" * 80)

    numerical_cols = [
        "feature_splitting", "semsim_mean", "semsim_max",
        "score_fuzz", "score_simulation", "score_detection", "score_embedding"
    ]

    results = {}

    for col in numerical_cols:
        if col not in df.columns:
            continue

        df_col = df.select(pl.col(col).drop_nulls())

        if df_col.shape[0] == 0:
            continue

        q25 = df_col[col].quantile(0.25)
        q75 = df_col[col].quantile(0.75)
        iqr = q75 - q25

        lower_bound = q25 - 1.5 * iqr
        upper_bound = q75 + 1.5 * iqr

        outliers_low = len(df_col.filter(pl.col(col) < lower_bound))
        outliers_high = len(df_col.filter(pl.col(col) > upper_bound))
        total_outliers = outliers_low + outliers_high

        if total_outliers > 0:
            pct = (total_outliers / df_col.shape[0]) * 100
            results[col] = {
                "lower_bound": float(lower_bound),
                "upper_bound": float(upper_bound),
                "outliers_low": outliers_low,
                "outliers_high": outliers_high,
                "total_outliers": total_outliers,
                "percentage": round(pct, 2)
            }

            print(f"\n{col}:")
            print(f"  Bounds: [{lower_bound:.4f}, {upper_bound:.4f}]")
            print(f"  Outliers: {total_outliers:,} / {df_col.shape[0]:,} ({pct:.2f}%)")
            print(f"    Below lower: {outliers_low:,}")
            print(f"    Above upper: {outliers_high:,}")

    return results


def model_performance_comparison(df):
    """Compare performance across different LLM models."""
    print("\n" + "=" * 80)
    print("9. MODEL PERFORMANCE COMPARISON")
    print("=" * 80)

    score_cols = ["score_fuzz", "score_simulation", "score_detection", "score_embedding"]
    existing_scores = [col for col in score_cols if col in df.columns]

    if "llm_explainer" not in df.columns or len(existing_scores) == 0:
        print("Insufficient data for model comparison")
        return {}

    results = {
        "by_explainer": {},
        "by_scorer": {}
    }

    # Compare by explainer
    print("\n--- By LLM Explainer ---")
    explainers = df["llm_explainer"].unique().to_list()

    for explainer in sorted([str(e) for e in explainers if e is not None]):
        df_exp = df.filter(pl.col("llm_explainer") == explainer)
        print(f"\n{explainer} (n={len(df_exp):,}):")

        results["by_explainer"][explainer] = {}

        for score_col in existing_scores:
            mean_score = df_exp[score_col].drop_nulls().mean()
            if mean_score is not None:
                results["by_explainer"][explainer][score_col] = float(mean_score)
                print(f"  {score_col:20} {mean_score:.4f}")

    # Compare by scorer
    if "llm_scorer" in df.columns:
        print("\n--- By LLM Scorer ---")
        scorers = df["llm_scorer"].unique().to_list()

        for scorer in sorted([str(s) for s in scorers if s is not None]):
            df_scorer = df.filter(pl.col("llm_scorer") == scorer)
            print(f"\n{scorer} (n={len(df_scorer):,}):")

            results["by_scorer"][scorer] = {}

            for score_col in existing_scores:
                mean_score = df_scorer[score_col].drop_nulls().mean()
                if mean_score is not None:
                    results["by_scorer"][scorer][score_col] = float(mean_score)
                    print(f"  {score_col:20} {mean_score:.4f}")

    return results


def generate_summary_report(all_results):
    """Generate executive summary of key findings."""
    print("\n" + "=" * 80)
    print("EXECUTIVE SUMMARY")
    print("=" * 80)

    summary = {
        "timestamp": TIMESTAMP,
        "key_findings": []
    }

    print("\nKey Findings:")

    # Dataset overview
    info = all_results["basic_statistics"]["dataset_info"]
    finding = f"Dataset contains {info['total_rows']:,} observations across {info['total_features']:,} unique features"
    print(f"\n1. {finding}")
    summary["key_findings"].append(finding)

    # Missing data
    missing_info = all_results["basic_statistics"]["columns"]
    high_missing = [(col, info["pct_missing"]) for col, info in missing_info.items()
                    if info["pct_missing"] > 5]
    if high_missing:
        finding = f"Columns with >5% missing data: {', '.join([f'{col} ({pct:.1f}%)' for col, pct in high_missing])}"
        print(f"\n2. {finding}")
        summary["key_findings"].append(finding)

    # Score statistics
    if "numerical_distributions" in all_results:
        score_means = {col: stats["mean"] for col, stats in all_results["numerical_distributions"].items()
                      if col.startswith("score_") and stats["mean"] is not None}
        if score_means:
            best_score = max(score_means.items(), key=lambda x: x[1])
            finding = f"Highest average score: {best_score[0]} = {best_score[1]:.4f}"
            print(f"\n3. {finding}")
            summary["key_findings"].append(finding)

    # Correlation insights
    if "correlations" in all_results:
        strong_corrs = []
        for col1, corr_dict in all_results["correlations"].items():
            for col2, corr_val in corr_dict.items():
                if col1 < col2 and corr_val is not None and abs(corr_val) > 0.5:
                    strong_corrs.append((col1, col2, corr_val))
        if strong_corrs:
            finding = f"Found {len(strong_corrs)} strong correlations (|r| > 0.5) between metrics"
            print(f"\n4. {finding}")
            summary["key_findings"].append(finding)

    # Feature splitting
    if "feature_splitting" in all_results and "mean" in all_results["feature_splitting"]:
        mean_split = all_results["feature_splitting"]["mean"]
        finding = f"Average feature splitting value: {mean_split:.4f}"
        print(f"\n5. {finding}")
        summary["key_findings"].append(finding)

    return summary


def main():
    """Run complete analysis pipeline."""
    print("\n" + "=" * 80)
    print("SAE FEATURE ANALYSIS")
    print("=" * 80)
    print(f"Data: {DATA_PATH}")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80)

    # Load data
    df = load_data()

    # Run all analyses
    all_results = {}

    all_results["basic_statistics"] = basic_statistics(df)
    all_results["numerical_distributions"] = numerical_analysis(df)
    all_results["correlations"] = correlation_analysis(df)
    all_results["categorical_analysis"] = categorical_analysis(df)
    all_results["feature_splitting"] = feature_splitting_analysis(df)
    all_results["score_agreement"] = score_agreement_analysis(df)
    all_results["semantic_similarity"] = semantic_similarity_analysis(df)
    all_results["outliers"] = outlier_detection(df)
    all_results["model_comparison"] = model_performance_comparison(df)
    all_results["summary"] = generate_summary_report(all_results)

    # Save results
    output_file = OUTPUT_DIR / f"analysis_results_{TIMESTAMP}.json"
    with open(output_file, 'w') as f:
        json.dump(all_results, f, indent=2)

    print(f"\n{'=' * 80}")
    print(f"Analysis complete! Results saved to:")
    print(f"  {output_file}")
    print(f"{'=' * 80}\n")

    return all_results


if __name__ == "__main__":
    main()
