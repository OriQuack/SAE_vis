#!/usr/bin/env python3
"""
Simple Feature Data Analysis
Shows columns, keys, and counts only.
"""

import polars as pl
import json
from pathlib import Path
from datetime import datetime

DATA_PATH = Path("/home/dohyun/interface/data/master/feature_analysis.parquet")
OUTPUT_DIR = Path("/home/dohyun/interface/data/master")
TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M%S")


def main():
    """Analyze parquet file structure and content."""
    print("=" * 80)
    print("SAE FEATURE DATA ANALYSIS")
    print("=" * 80)

    # Load data
    print(f"\nLoading: {DATA_PATH}")
    df = pl.read_parquet(DATA_PATH)
    print(f"✓ Loaded {df.shape[0]:,} rows × {df.shape[1]} columns\n")

    # Initialize results dictionary
    results = {
        "timestamp": TIMESTAMP,
        "dataset_info": {
            "total_rows": df.shape[0],
            "total_columns": df.shape[1],
            "unique_features": df.select("feature_id").n_unique()
        },
        "columns": {}
    }

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

    # Save results to JSON
    output_file = OUTPUT_DIR / f"analysis_results.json"
    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2)

    print("\n" + "=" * 80)
    print("ANALYSIS COMPLETE")
    print("=" * 80)
    print(f"\nResults saved to: {output_file}")
    print("=" * 80 + "\n")


if __name__ == "__main__":
    main()
