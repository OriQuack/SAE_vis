#!/usr/bin/env python3
"""
Parquet Data Analysis
Analyzes feature_analysis.parquet and umap_projections.parquet.
Shows columns, keys, and counts only.
"""

import polars as pl
import json
from pathlib import Path
from datetime import datetime

OUTPUT_DIR = Path("/home/dohyun/interface/data/master")
TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M%S")


def analyze_parquet(parquet_path: Path, dataset_name: str) -> dict:
    """
    Analyze a parquet file structure and content.

    Args:
        parquet_path: Path to the parquet file
        dataset_name: Human-readable name for the dataset

    Returns:
        Dictionary with analysis results
    """
    print("=" * 80)
    print(f"{dataset_name.upper()}")
    print("=" * 80)

    # Load data
    print(f"\nLoading: {parquet_path}")
    df = pl.read_parquet(parquet_path)
    print(f"✓ Loaded {df.shape[0]:,} rows × {df.shape[1]} columns\n")

    # Initialize results dictionary
    results = {
        "timestamp": TIMESTAMP,
        "parquet_file": str(parquet_path),
        "dataset_name": dataset_name,
        "dataset_info": {
            "total_rows": df.shape[0],
            "total_columns": df.shape[1]
        },
        "columns": {}
    }

    # Add feature_id unique count if column exists
    if "feature_id" in df.columns:
        results["dataset_info"]["unique_features"] = df.select("feature_id").n_unique()

    # Column information
    print("=" * 80)
    print("COLUMNS")
    print("=" * 80)

    for col in df.columns:
        dtype = str(df[col].dtype)
        n_unique = df[col].n_unique()
        n_null = df[col].null_count()

        print(f"\n{col}")
        print(f"  Type:   {dtype}")
        print(f"  Unique: {n_unique:,}")
        print(f"  Nulls:  {n_null:,}")

        # Store column info
        col_info = {
            "dtype": dtype,
            "n_unique": n_unique,
            "n_nulls": n_null
        }

        # Show values for categorical/low-cardinality columns
        if n_unique <= 20:
            print(f"  Values:")
            value_counts = (df.group_by(col)
                              .agg(pl.count().alias("count"))
                              .sort("count", descending=True))

            col_info["values"] = {}
            for row in value_counts.iter_rows(named=False):
                value, count = row
                col_info["values"][str(value)] = count
                print(f"    {str(value):40} {count:6,}")

        # Show range for numerical columns
        elif dtype in ["Float32", "Float64", "Int32", "Int64", "UInt32", "UInt64"]:
            stats = df.select(col).drop_nulls()
            if stats.shape[0] > 0:
                col_info["range"] = {
                    "min": float(stats[col].min()),
                    "max": float(stats[col].max()),
                    "mean": float(stats[col].mean())
                }
                print(f"  Range:")
                print(f"    Min:  {col_info['range']['min']:.6f}")
                print(f"    Max:  {col_info['range']['max']:.6f}")
                print(f"    Mean: {col_info['range']['mean']:.6f}")

        results["columns"][col] = col_info

    return results


def main():
    """Analyze all parquet files."""
    datasets = [
        {
            "path": Path("/home/dohyun/interface/data/master/feature_analysis.parquet"),
            "name": "SAE Feature Analysis",
            "output": "feature_analysis_results.json"
        },
        {
            "path": Path("/home/dohyun/interface/data/master/umap_projections.parquet"),
            "name": "UMAP Projections",
            "output": "umap_projections_results.json"
        }
    ]

    for dataset in datasets:
        if not dataset["path"].exists():
            print(f"\n⚠ Skipping {dataset['name']}: File not found at {dataset['path']}\n")
            continue

        # Analyze the dataset
        results = analyze_parquet(dataset["path"], dataset["name"])

        # Save results to JSON
        output_file = OUTPUT_DIR / dataset["output"]
        with open(output_file, 'w') as f:
            json.dump(results, f, indent=2)

        print("\n" + "=" * 80)
        print("ANALYSIS COMPLETE")
        print("=" * 80)
        print(f"Results saved to: {output_file}")
        print("=" * 80 + "\n")

    print("=" * 80)
    print("ALL ANALYSES COMPLETE")
    print("=" * 80 + "\n")


if __name__ == "__main__":
    main()
