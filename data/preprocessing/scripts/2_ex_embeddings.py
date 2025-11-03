#!/usr/bin/env python3
"""
Generate embeddings for SAE feature explanations using sentence-transformers models.
Outputs consolidated parquet file with embeddings from multiple data sources.
"""

import os
import json
import glob
import argparse
from pathlib import Path
from typing import List, Dict, Any
from datetime import datetime
import numpy as np
import polars as pl
from tqdm import tqdm
from sentence_transformers import SentenceTransformer


def load_config(config_path: str) -> Dict:
    """Load configuration from JSON file."""
    with open(config_path, 'r') as f:
        return json.load(f)


def load_run_config(data_source_dir: Path) -> Dict:
    """Load run configuration to extract sae_id."""
    run_config_path = data_source_dir / "run_config.json"
    if not run_config_path.exists():
        return {}

    with open(run_config_path, 'r') as f:
        return json.load(f)


def extract_sae_id(run_config: Dict) -> str:
    """Extract SAE ID from run configuration."""
    sparse_model = run_config.get("sparse_model", "")
    hookpoints = run_config.get("hookpoints", [])

    if sparse_model and hookpoints:
        # Take the first hookpoint if multiple exist
        hookpoint = hookpoints[0] if isinstance(hookpoints, list) else hookpoints
        return f"{sparse_model}/{hookpoint}"
    return ""


def get_llm_explainer_name(data_source: str, mapping: Dict) -> str:
    """Get full LLM explainer name from data source and mapping.

    Args:
        data_source: Data source directory name (e.g., "llama_e-llama_s")
        mapping: Dictionary mapping explainer prefixes to full names

    Returns:
        Full LLM explainer name (e.g., "hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4")
    """
    # Extract explainer prefix (e.g., "llama_e" from "llama_e-llama_s")
    prefix = data_source.split('_e-')[0] + '_e'
    return mapping.get(prefix, prefix)


def get_explanation_files(explanations_dir: str, file_pattern: str) -> List[str]:
    """Get all explanation text files from the directory."""
    pattern = os.path.join(explanations_dir, file_pattern)
    files = glob.glob(pattern)
    return sorted(files)


def extract_latent_id(filename: str) -> str:
    """Extract latent ID from filename (e.g., layers.30_latent123.txt -> 123)."""
    basename = os.path.basename(filename)
    # Extract number between 'latent' and '.txt'
    start = basename.find("latent") + 6
    end = basename.find(".txt")
    return basename[start:end]


def read_explanation(filepath: str) -> str:
    """Read explanation text from file."""
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read().strip()
        # Remove quotes if present
        if content.startswith('"') and content.endswith('"'):
            content = content[1:-1]
        return content


def generate_embedding(text: str, st_model: SentenceTransformer) -> List[float]:
    """Generate embedding for text using sentence-transformers model.

    Args:
        text: Input text to embed
        st_model: Loaded SentenceTransformer model

    Returns:
        Embedding as Float32 list
    """
    embedding = st_model.encode(text, convert_to_numpy=True)
    # Convert to float32 to save space
    return embedding.astype(np.float32).tolist()


def create_parquet(rows: List[Dict]) -> pl.DataFrame:
    """Create Polars DataFrame from embedding rows with proper schema.

    Args:
        rows: List of dicts with keys: feature_id, sae_id, data_source, llm_explainer, explanation_text, embedding

    Returns:
        Polars DataFrame with typed columns
    """
    if not rows:
        # Return empty DataFrame with correct schema
        schema = {
            "feature_id": pl.UInt32,
            "sae_id": pl.Categorical,
            "data_source": pl.Categorical,
            "llm_explainer": pl.Categorical,
            "explanation_text": pl.Utf8,
            "embedding": pl.List(pl.Float32)
        }
        return pl.DataFrame(schema=schema)

    # Create DataFrame from rows
    df = pl.DataFrame(rows)

    # Cast to proper types (embeddings need explicit Float32 casting)
    df = df.with_columns([
        pl.col("feature_id").cast(pl.UInt32),
        pl.col("sae_id").cast(pl.Categorical),
        pl.col("data_source").cast(pl.Categorical),
        pl.col("llm_explainer").cast(pl.Categorical),
        pl.col("explanation_text").cast(pl.Utf8),
        pl.col("embedding").cast(pl.List(pl.Float32))
    ])

    return df


def save_parquet(df: pl.DataFrame, output_path: Path, config: Dict, stats: Dict) -> None:
    """Save DataFrame as parquet with metadata.

    Args:
        df: DataFrame to save
        output_path: Path to output parquet file
        config: Configuration dictionary
        stats: Processing statistics
    """
    # Ensure output directory exists
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"\nSaving parquet to {output_path}")
    df.write_parquet(output_path)

    # Calculate statistics
    result_stats = {
        "total_rows": len(df),
        "unique_features": df["feature_id"].n_unique(),
        "unique_data_sources": df["data_source"].n_unique(),
        "unique_explainers": df["llm_explainer"].n_unique(),
    }

    if len(df) > 0:
        result_stats["embedding_dimension"] = len(df["embedding"][0])

    # Save metadata
    metadata = {
        "created_at": datetime.now().isoformat(),
        "script_version": "2.0",
        "total_rows": len(df),
        "schema": {col: str(df[col].dtype) for col in df.columns},
        "processing_stats": stats,
        "result_stats": result_stats,
        "config_used": config
    }

    metadata_path = output_path.with_suffix('.parquet.metadata.json')
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)

    print(f"Saved metadata to {metadata_path}")
    print(f"Successfully created parquet with {len(df):,} rows")


def main():
    """Main function to generate embeddings for all explanation files from multiple data sources."""
    parser = argparse.ArgumentParser(description="Generate embeddings for SAE feature explanations")
    parser.add_argument(
        "--config",
        default="../config/2_ex_embeddings_config.json",
        help="Path to configuration file"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit number of files to process per data source (for testing)"
    )
    args = parser.parse_args()

    # Get script directory and project root
    script_dir = Path(__file__).parent
    project_root = script_dir.parent.parent.parent  # Go up to interface root

    # Load configuration
    config_path = script_dir / args.config
    if not config_path.exists():
        print(f"Config file not found: {config_path}")
        return

    config = load_config(config_path)
    print(f"Loaded config from: {config_path}")
    print(f"Data sources: {config['data_sources']}")

    # Setup output path
    output_path = project_root / config["output_path"]
    print(f"Output path: {output_path}")

    # Load sentence-transformers model
    model_params = config.get("model_parameters", {})
    model_name = model_params.get("embedding_model", "all-MiniLM-L6-v2")
    device = model_params.get("device", "cuda")

    print(f"\nLoading sentence-transformers model: {model_name}")
    try:
        st_model = SentenceTransformer(model_name, device=device)
        print(f"Model loaded successfully on device: {device}")
    except Exception as e:
        print(f"Error loading model: {e}")
        return

    # Get LLM explainer mapping
    llm_explainer_mapping = config.get("llm_explainer_mapping", {})

    # Statistics tracking
    stats = {
        "total_features_processed": 0,
        "total_embeddings_generated": 0,
        "failed_embeddings": 0,
        "data_sources_processed": 0,
        "per_source_stats": {}
    }

    # Collect all rows for parquet
    all_rows = []

    # Process each data source
    print("\n" + "=" * 80)
    print("Processing Data Sources")
    print("=" * 80)

    for data_source in config["data_sources"]:
        print(f"\n--- Processing: {data_source} ---")

        # Setup paths
        data_source_dir = project_root / "data" / "raw" / data_source
        explanations_dir = data_source_dir / "explanations"

        # Validate directory exists
        if not explanations_dir.exists():
            print(f"Warning: Explanations directory does not exist: {explanations_dir}")
            print(f"Skipping {data_source}")
            continue

        # Load run config and extract sae_id
        run_config = load_run_config(data_source_dir)
        sae_id = extract_sae_id(run_config)
        print(f"SAE ID: {sae_id}")

        # Get full LLM explainer name
        llm_explainer = get_llm_explainer_name(data_source, llm_explainer_mapping)
        print(f"LLM Explainer: {llm_explainer}")

        # Get explanation files
        file_pattern = config.get("processing_parameters", {}).get("file_pattern", "*.txt")
        explanation_files = get_explanation_files(str(explanations_dir), file_pattern)
        print(f"Found {len(explanation_files)} explanation files")

        if not explanation_files:
            print(f"No explanation files found in {explanations_dir}")
            continue

        # Apply limit if specified
        if args.limit is not None:
            explanation_files = explanation_files[:args.limit]
            print(f"Limited to {len(explanation_files)} files for testing")

        # Track stats for this source
        source_stats = {
            "total_files": len(explanation_files),
            "successful": 0,
            "failed": 0
        }

        # Process each file
        for filepath in tqdm(explanation_files, desc=f"Processing {data_source}"):
            latent_id = extract_latent_id(filepath)
            explanation = read_explanation(filepath)

            # Generate embedding
            try:
                embedding = generate_embedding(explanation, st_model)

                # Add row for parquet
                all_rows.append({
                    "feature_id": int(latent_id),
                    "sae_id": sae_id,
                    "data_source": data_source,
                    "llm_explainer": llm_explainer,
                    "explanation_text": explanation,
                    "embedding": embedding
                })
                source_stats["successful"] += 1
                stats["total_embeddings_generated"] += 1
            except Exception as e:
                print(f"Error generating embedding for latent {latent_id}: {e}")
                source_stats["failed"] += 1
                stats["failed_embeddings"] += 1

        stats["per_source_stats"][data_source] = source_stats
        stats["data_sources_processed"] += 1
        stats["total_features_processed"] += source_stats["successful"]

        print(f"Completed {data_source}: {source_stats['successful']}/{source_stats['total_files']} successful")

    # Create and save parquet
    print("\n" + "=" * 80)
    print("Creating Parquet File")
    print("=" * 80)

    if all_rows:
        df = create_parquet(all_rows)
        save_parquet(df, output_path, config, stats)
    else:
        print("No embeddings generated, skipping parquet creation")
        return

    # Print final statistics
    print("\n" + "=" * 80)
    print("Processing Complete!")
    print("=" * 80)
    print(f"Total data sources processed: {stats['data_sources_processed']}")
    print(f"Total features processed: {stats['total_features_processed']}")
    print(f"Total embeddings generated: {stats['total_embeddings_generated']}")
    print(f"Failed embeddings: {stats['failed_embeddings']}")
    print("\nPer-source statistics:")
    for source, source_stats in stats["per_source_stats"].items():
        print(f"  {source}: {source_stats['successful']}/{source_stats['total_files']} successful")


if __name__ == "__main__":
    main()
