#!/usr/bin/env python3
"""Export assembled explanations to raw format (one file per feature).

Converts assembled_explanations.parquet to individual text files matching
the raw explanation format used by other explainers.

Input:
- data/master/assembled_explanations.parquet

Output:
- data/raw/assembled explanation/explanations/layers.30_latent{feature_id}.txt

Each output file contains a single line with the explanation in quotes:
    "explanation text here"

Usage:
    python export_assembled_explanations.py
    python export_assembled_explanations.py --output-dir "data/raw/custom_name/explanations"
"""

import argparse
import logging
from pathlib import Path

import polars as pl

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def find_project_root() -> Path:
    """Find project root by looking for 'interface' directory."""
    project_root = Path.cwd()
    while project_root.name != "interface" and project_root.parent != project_root:
        project_root = project_root.parent

    if project_root.name == "interface":
        return project_root
    else:
        raise RuntimeError("Could not find interface project root")


def main():
    parser = argparse.ArgumentParser(
        description='Export assembled explanations to raw format'
    )
    parser.add_argument(
        '--input',
        type=str,
        default='data/master/assembled_explanations.parquet',
        help='Path to input parquet file'
    )
    parser.add_argument(
        '--output-dir',
        type=str,
        default='data/raw/assembled explanation/explanations',
        help='Output directory for explanation files'
    )
    args = parser.parse_args()

    # Find project root and resolve paths
    project_root = find_project_root()
    input_path = project_root / args.input
    output_dir = project_root / args.output_dir

    # Load parquet
    logger.info(f"Loading assembled explanations from {input_path}")
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")

    df = pl.read_parquet(input_path)
    logger.info(f"Loaded {len(df)} explanations")

    # Create output directory
    output_dir.mkdir(parents=True, exist_ok=True)
    logger.info(f"Output directory: {output_dir}")

    # Export each explanation
    exported = 0
    for row in df.iter_rows(named=True):
        feature_id = row['feature_id']
        text = row['assembled_explanation_text']

        # Write file with quoted explanation
        output_file = output_dir / f"layers.30_latent{feature_id}.txt"
        output_file.write_text(f'"{text}"')
        exported += 1

    logger.info(f"Exported {exported} explanation files to {output_dir}")


if __name__ == "__main__":
    main()
