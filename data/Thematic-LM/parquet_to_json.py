#!/usr/bin/env python3
"""Convert thematic_codes.parquet to JSON format."""

import json
from pathlib import Path

import polars as pl


def convert_parquet_to_json(
    parquet_path: str = "../master/thematic_codes.parquet",
    output_path: str = "../master/thematic_codes.json"
):
    """Convert parquet to JSON.

    Args:
        parquet_path: Path to input parquet file
        output_path: Path to output JSON file
    """
    script_dir = Path(__file__).parent
    parquet_path = script_dir / parquet_path
    output_path = script_dir / output_path

    if not parquet_path.exists():
        print(f"Error: {parquet_path} not found")
        return

    # Read parquet
    df = pl.read_parquet(parquet_path)
    print(f"Loaded {len(df)} rows from {parquet_path}")

    # Convert to list of dicts
    results = []
    for row in df.iter_rows(named=True):
        result = {
            "feature_id": row["feature_id"],
            "llm_explainer": row["llm_explainer"],
            "explanation_text": row["explanation_text"],
            "codes": json.loads(row["codes"]),
            "coding_metadata": json.loads(row["coding_metadata"]),
        }
        results.append(result)

    # Save as JSON
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"Saved {len(results)} results to {output_path}")


if __name__ == "__main__":
    convert_parquet_to_json()
