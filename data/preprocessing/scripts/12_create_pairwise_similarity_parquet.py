#!/usr/bin/env python3
"""
Create Pairwise Semantic Similarity Parquet

Extracts pairwise semantic similarity data from detailed JSON files and creates
a normalized parquet file for efficient querying of LLM explainer comparisons.

Author: Data Processing Pipeline
Created: 2025-10-13
"""

import json
import argparse
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any
import polars as pl


def load_config(config_path: Path) -> Dict[str, Any]:
    """Load configuration from JSON file."""
    with open(config_path, 'r') as f:
        return json.load(f)


def find_project_root() -> Path:
    """Find the project root directory."""
    current = Path.cwd()
    while current != current.parent:
        if (current / 'data').exists() and (current / 'backend').exists():
            return current
        current = current.parent
    raise FileNotFoundError("Could not find project root (looking for data/ and backend/ directories)")


def get_explainer_name(explanation_id: str, explanations: List[Dict[str, Any]]) -> str:
    """Map explanation_id to llm_explainer name."""
    for exp in explanations:
        if exp['explanation_id'] == explanation_id:
            return exp['llm_explainer']
    raise ValueError(f"Explanation ID {explanation_id} not found")




def process_feature_json(json_path: Path, sae_id: str) -> List[Dict[str, Any]]:
    """
    Extract pairwise similarity data from a single feature JSON file.

    Returns:
        List of dictionaries, one per pairwise comparison
    """
    with open(json_path, 'r') as f:
        data = json.load(f)

    feature_id = data['feature_id']
    explanations = data['explanations']
    similarity_pairs = data.get('semantic_similarity_pairs', [])

    rows = []

    for pair_data in similarity_pairs:
        # Extract pair information
        exp_id_1, exp_id_2 = pair_data['pair']

        # Map explanation IDs to explainer names (use exact names from detailed JSON)
        explainer_1 = get_explainer_name(exp_id_1, explanations)
        explainer_2 = get_explainer_name(exp_id_2, explanations)

        # Ensure consistent ordering (alphabetical)
        if explainer_1 > explainer_2:
            explainer_1, explainer_2 = explainer_2, explainer_1

        # Create row
        row = {
            'feature_id': feature_id,
            'sae_id': sae_id,
            'explainer_1': explainer_1,
            'explainer_2': explainer_2,
            'cosine_similarity': pair_data.get('cosine_similarity'),
            'euclidean_similarity': pair_data.get('euclidean_similarity')
        }

        rows.append(row)

    return rows


def create_pairwise_parquet(config: Dict[str, Any], project_root: Path) -> Path:
    """
    Create pairwise similarity parquet from detailed JSON files.

    Returns:
        Path to created parquet file
    """
    # Resolve paths
    input_dir = project_root / config['input_directory']
    output_dir = project_root / config['output_directory']
    output_path = output_dir / config['output_filename']
    sae_id = config['sae_id']

    print(f"Input directory: {input_dir}")
    print(f"Output path: {output_path}")

    # Ensure output directory exists
    output_dir.mkdir(parents=True, exist_ok=True)

    # Process all JSON files
    all_rows = []
    json_files = sorted(input_dir.glob('feature_*.json'))

    print(f"\nProcessing {len(json_files)} feature files...")

    for i, json_path in enumerate(json_files, 1):
        if i % 100 == 0:
            print(f"  Processed {i}/{len(json_files)} files...")

        try:
            rows = process_feature_json(json_path, sae_id)
            all_rows.extend(rows)
        except Exception as e:
            print(f"  Warning: Failed to process {json_path.name}: {e}")
            continue

    print(f"Extracted {len(all_rows)} pairwise comparisons")

    # Create DataFrame
    df = pl.DataFrame(all_rows)

    # Apply schema with proper types
    df = df.with_columns([
        pl.col('feature_id').cast(pl.UInt32),
        pl.col('sae_id').cast(pl.Categorical),
        pl.col('explainer_1').cast(pl.Categorical),
        pl.col('explainer_2').cast(pl.Categorical),
        pl.col('cosine_similarity').cast(pl.Float32),
        pl.col('euclidean_similarity').cast(pl.Float32)
    ])

    # Sort for consistent ordering
    df = df.sort(['feature_id', 'explainer_1', 'explainer_2'])

    # Save parquet
    df.write_parquet(output_path)
    print(f"\n✓ Parquet file created: {output_path}")
    print(f"  Rows: {len(df)}")
    print(f"  Columns: {len(df.columns)}")

    return output_path


def create_metadata(config: Dict[str, Any], parquet_path: Path, project_root: Path) -> Path:
    """
    Create metadata JSON file for the parquet.

    Returns:
        Path to metadata file
    """
    # Load parquet to get statistics
    df = pl.read_parquet(parquet_path)

    # Calculate statistics
    unique_features = df['feature_id'].n_unique()
    unique_explainers = sorted(set(df['explainer_1'].unique().to_list() + df['explainer_2'].unique().to_list()))

    # Calculate pairwise statistics
    pairwise_stats = {}
    for exp1 in unique_explainers:
        for exp2 in unique_explainers:
            if exp1 < exp2:  # Only count each pair once
                pair_key = f"{exp1}_vs_{exp2}"
                pair_df = df.filter(
                    (pl.col('explainer_1') == exp1) & (pl.col('explainer_2') == exp2)
                )

                if len(pair_df) > 0:
                    cosine_stats = {
                        'count': len(pair_df),
                        'mean': float(pair_df['cosine_similarity'].mean()),
                        'min': float(pair_df['cosine_similarity'].min()),
                        'max': float(pair_df['cosine_similarity'].max()),
                        'std': float(pair_df['cosine_similarity'].std())
                    }
                    pairwise_stats[pair_key] = cosine_stats

    metadata = {
        'created_at': datetime.now().isoformat(),
        'parquet_file': str(parquet_path.relative_to(project_root)),
        'total_rows': len(df),
        'unique_features': unique_features,
        'unique_explainers': unique_explainers,
        'pairwise_statistics': pairwise_stats,
        'schema': {col: str(df[col].dtype) for col in df.columns},
        'config_used': config
    }

    # Save metadata
    metadata_path = parquet_path.with_suffix('.parquet.metadata.json')
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)

    print(f"✓ Metadata file created: {metadata_path}")

    return metadata_path


def main():
    """Main execution function."""
    parser = argparse.ArgumentParser(
        description='Create pairwise semantic similarity parquet from detailed JSON files'
    )
    parser.add_argument(
        '--config',
        type=Path,
        required=True,
        help='Path to configuration JSON file'
    )

    args = parser.parse_args()

    # Find project root
    try:
        project_root = find_project_root()
        print(f"Project root: {project_root}\n")
    except FileNotFoundError as e:
        print(f"Error: {e}")
        return 1

    # Load configuration
    config_path = args.config if args.config.is_absolute() else project_root / args.config
    print(f"Loading configuration from: {config_path}")
    config = load_config(config_path)

    # Create parquet
    parquet_path = create_pairwise_parquet(config, project_root)

    # Create metadata
    create_metadata(config, parquet_path, project_root)

    print("\n✓ Pairwise similarity parquet creation complete!")
    return 0


if __name__ == '__main__':
    exit(main())
