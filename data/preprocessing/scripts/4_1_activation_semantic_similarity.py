#!/usr/bin/env python3
"""
Compute FULL pairwise activation semantic similarity matrix for SAE features.

This script computes the complete pairwise semantic similarity between ALL feature pairs
based on their activation context embeddings. The full matrix is saved as NPY (float16)
for efficient storage and access.

Algorithm:
1. Load activation_embeddings.parquet (16384 features, each with 16 x 768-dim embeddings)
2. Aggregate each feature's 16 embeddings to a single mean vector (768-dim)
3. Stack into matrix: 16384 x 768
4. L2 normalize embeddings
5. Compute full cosine similarity matrix: normalized @ normalized.T
6. Set diagonal to 0 (self-similarity not meaningful)
7. Save FULL matrix as NPY (float16)
8. Save metadata JSON with statistics

Memory estimate:
- Mean embedding matrix: ~50MB (16384 x 768 x 4 bytes)
- Similarity matrix (float16): ~536MB (16384 x 16384 x 2 bytes)
- Total peak RAM: ~600MB

Output:
- activation_semantic_similarities.npy: Full 16384x16384 matrix (float16, ~536MB)
- activation_semantic_similarities_metadata.json: Statistics and usage info

Usage:
    python 0_activation_semantic_similarity.py --config ../config/0_activation_semantic_similarity.json
"""

import torch
import numpy as np
import json
import os
import argparse
import polars as pl
from pathlib import Path
from typing import Dict, Tuple
from tqdm import tqdm


def load_config(config_path: str) -> Dict:
    """Load configuration from JSON file."""
    with open(config_path, 'r') as f:
        return json.load(f)


def get_device(config_device: str) -> str:
    """Get appropriate device based on config and availability."""
    if config_device == "auto":
        return "cuda" if torch.cuda.is_available() else "cpu"
    return config_device


def load_and_aggregate_embeddings(
    embeddings_path: Path,
    aggregation_method: str = "mean",
    embedding_dim: int = 768
) -> Tuple[np.ndarray, list, int]:
    """
    Load activation embeddings and aggregate to single vector per feature.

    Args:
        embeddings_path: Path to activation_embeddings.parquet
        aggregation_method: How to aggregate (currently only "mean" supported)
        embedding_dim: Expected embedding dimension (default 768)

    Returns:
        Tuple of (embeddings_matrix, feature_ids, empty_count)
        - embeddings_matrix: numpy array of shape (n_features, embedding_dim)
        - feature_ids: list of feature IDs in same order as matrix rows
        - empty_count: number of features with empty embeddings (filled with zeros)
    """
    print(f"Loading embeddings from {embeddings_path}")
    df = pl.read_parquet(embeddings_path)
    print(f"Loaded {len(df):,} features")

    # Sort by feature_id for consistent ordering
    df = df.sort("feature_id")

    # Extract feature IDs and embeddings
    feature_ids = df["feature_id"].to_list()
    embeddings_list = []
    empty_count = 0

    print(f"Aggregating embeddings using '{aggregation_method}' method...")
    for row in tqdm(df.iter_rows(named=True), total=len(df), desc="Aggregating"):
        # Each feature has list of embeddings (typically 16, each 768-dim)
        embs_raw = row["embeddings"]

        # Handle empty or None embeddings
        if embs_raw is None or len(embs_raw) == 0:
            # Use zero vector for features with no embeddings
            aggregated = np.zeros(embedding_dim, dtype=np.float32)
            empty_count += 1
        else:
            embs = np.array(embs_raw)  # Shape: (N, 768)

            if embs.size == 0:
                aggregated = np.zeros(embedding_dim, dtype=np.float32)
                empty_count += 1
            elif aggregation_method == "mean":
                aggregated = embs.mean(axis=0)  # Shape: (768,)
            else:
                raise ValueError(f"Unknown aggregation method: {aggregation_method}")

        embeddings_list.append(aggregated)

    # Stack into matrix
    embeddings_matrix = np.stack(embeddings_list)  # Shape: (n_features, 768)
    print(f"Aggregated embeddings shape: {embeddings_matrix.shape}")

    if empty_count > 0:
        print(f"Warning: {empty_count} features had empty embeddings (filled with zeros)")

    return embeddings_matrix, feature_ids, empty_count


def compute_full_similarity_matrix(config: Dict) -> Tuple[np.ndarray, list, Dict]:
    """
    Compute the full pairwise activation semantic similarity matrix.

    Args:
        config: Configuration dictionary

    Returns:
        Tuple of (similarity_matrix, feature_ids, metadata)
        - similarity_matrix: numpy array of shape (n_features, n_features) as float16
        - feature_ids: list of feature IDs in same order as matrix rows
        - metadata: dictionary with statistics and source info
    """
    # Extract configuration
    input_path = config["input_path"]
    aggregation_method = config.get("aggregation_method", "mean")
    use_float16 = config.get("use_float16", True)

    # Setup device
    device = get_device(config.get("device", "auto"))
    print(f"Using device: {device}")

    # Get project root
    script_dir = Path(__file__).parent
    project_root = script_dir.parent.parent.parent

    # Resolve input path
    embeddings_path = project_root / input_path
    if not embeddings_path.exists():
        raise FileNotFoundError(
            f"Embeddings file not found: {embeddings_path}\n"
            f"Please run: python 4_act_embeddings.py --config ../config/4_act_embeddings.json"
        )

    # 1. Load and aggregate embeddings
    embeddings_matrix, feature_ids, empty_count = load_and_aggregate_embeddings(
        embeddings_path, aggregation_method
    )
    n_features = len(feature_ids)
    embedding_dim = embeddings_matrix.shape[1]
    print(f"Loaded {n_features:,} features with {embedding_dim}-dim embeddings")
    if empty_count > 0:
        print(f"Note: {empty_count} features have zero embeddings (no activations)")

    # 2. Convert to torch tensor
    embeddings_tensor = torch.from_numpy(embeddings_matrix).to(device)

    # 3. Convert to float16 for memory efficiency if requested
    if use_float16:
        print("Converting to float16 for memory efficiency...")
        embeddings_tensor = embeddings_tensor.half()
        print("Memory usage reduced by ~50% with float16")

    # 4. Normalize with L2
    print("Normalizing embeddings with L2 norm...")
    normalized = torch.nn.functional.normalize(embeddings_tensor, p=2, dim=1)

    # Handle zero vectors (which become NaN after normalization)
    # Replace NaN with zeros - these will have 0 similarity with all other vectors
    nan_mask = torch.isnan(normalized).any(dim=1)
    if nan_mask.any():
        nan_count = nan_mask.sum().item()
        print(f"Replacing {nan_count} NaN rows (from zero vectors) with zeros")
        normalized[nan_mask] = 0.0

    print(f"Normalized embeddings shape: {normalized.shape}")

    # Clear original to free memory
    del embeddings_tensor, embeddings_matrix
    if device == "cuda":
        torch.cuda.empty_cache()

    # 5. Compute all pairwise cosine similarity
    print("Computing full pairwise cosine similarity matrix...")

    # Check matrix size
    matrix_size_mb = (n_features * n_features * 2) / (1024**2)  # float16 = 2 bytes
    print(f"Similarity matrix size: {matrix_size_mb:.1f} MB ({n_features} x {n_features})")

    # Since vectors are normalized, dot product = cosine similarity
    similarity_matrix = normalized @ normalized.T
    print(f"Cosine similarity matrix shape: {similarity_matrix.shape}")

    # 6. Set diagonal to 0 (self-similarity not meaningful)
    print("Setting diagonal to 0 (self-similarity excluded)...")
    similarity_matrix.fill_diagonal_(0.0)

    # 7. Convert to numpy float16
    print("Converting to numpy float16...")
    similarity_np = similarity_matrix.cpu().numpy()
    if similarity_np.dtype != np.float16:
        similarity_np = similarity_np.astype(np.float16)

    # 8. Calculate statistics (excluding diagonal zeros)
    print("Calculating statistics...")
    # Get upper triangle (excluding diagonal) for statistics
    upper_tri_indices = np.triu_indices(n_features, k=1)
    upper_tri_values = similarity_np[upper_tri_indices].astype(np.float32)  # float32 for accurate stats

    statistics = {
        "min_value": float(upper_tri_values.min()),
        "max_value": float(upper_tri_values.max()),
        "mean_value": float(upper_tri_values.mean()),
        "std_value": float(upper_tri_values.std()),
        "n_pairs": int(len(upper_tri_values))
    }

    print(f"\nSimilarity Statistics (excluding self-similarity):")
    print(f"  Min: {statistics['min_value']:.4f}")
    print(f"  Max: {statistics['max_value']:.4f}")
    print(f"  Mean: {statistics['mean_value']:.4f}")
    print(f"  Std: {statistics['std_value']:.4f}")
    print(f"  Total pairs: {statistics['n_pairs']:,}")

    # Clear GPU memory
    del normalized, similarity_matrix
    if device == "cuda":
        torch.cuda.empty_cache()

    # Prepare metadata
    metadata = {
        "n_features": n_features,
        "shape": [n_features, n_features],
        "dtype": "float16",
        "description": "Full pairwise activation semantic similarity matrix. "
                       "sim[i,j] = cosine similarity between aggregated activation embeddings of feature i and j. "
                       "Diagonal is set to 0 (self-similarity excluded).",
        "source_info": {
            "input_file": str(input_path),
            "aggregation_method": aggregation_method,
            "embedding_dim": embedding_dim,
            "embeddings_per_feature": 16,
            "features_with_empty_embeddings": empty_count
        },
        "feature_range": {
            "start": int(min(feature_ids)),
            "end": int(max(feature_ids)),
            "feature_ids_match_indices": True  # feature_ids[i] corresponds to row/col i
        },
        "statistics": statistics,
        "usage": "sim = np.load('activation_semantic_similarities.npy'); "
                 "sim[i,j] = similarity between feature i and j"
    }

    return similarity_np, feature_ids, metadata


def save_results(
    similarity_matrix: np.ndarray,
    metadata: Dict,
    output_dir: str,
    npy_filename: str,
    metadata_filename: str
) -> None:
    """Save the full similarity matrix and metadata."""
    os.makedirs(output_dir, exist_ok=True)

    # Save NPY matrix
    npy_path = os.path.join(output_dir, npy_filename)
    print(f"Saving similarity matrix to: {npy_path}")
    np.save(npy_path, similarity_matrix)
    file_size_mb = os.path.getsize(npy_path) / (1024**2)
    print(f"Saved NPY file: {file_size_mb:.1f} MB")

    # Save metadata JSON
    metadata_path = os.path.join(output_dir, metadata_filename)
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
    print(f"Saved metadata to: {metadata_path}")


def main():
    """Main function to compute full activation semantic similarity matrix."""
    parser = argparse.ArgumentParser(
        description="Compute FULL pairwise activation semantic similarity matrix for SAE features"
    )
    parser.add_argument(
        "--config",
        default="../config/0_activation_semantic_similarity.json",
        help="Path to configuration file"
    )
    args = parser.parse_args()

    # Get script directory and project root
    script_dir = Path(__file__).parent
    project_root = script_dir.parent.parent.parent

    # Load configuration
    config_path = script_dir / args.config
    if not config_path.exists():
        print(f"Config file not found: {config_path}")
        return

    config = load_config(config_path)
    print(f"Loaded config from: {config_path}")

    # Setup output directory
    sae_id = config["sae_id"]
    output_dir_template = config["output_dir"]
    output_dir = project_root / output_dir_template.format(sae_id=sae_id)

    print(f"Output directory: {output_dir}")

    try:
        # Compute full similarity matrix
        print("\nStarting FULL pairwise similarity computation...")
        similarity_matrix, _, metadata = compute_full_similarity_matrix(config)

        # Save results
        save_results(
            similarity_matrix,
            metadata,
            str(output_dir),
            config["output_filename"],
            config["metadata_filename"]
        )

        print(f"\nCompleted successfully!")
        print(f"Processed {metadata['n_features']:,} features")
        print(f"Matrix shape: {metadata['shape']}")
        print(f"Results saved to: {output_dir}")

    except Exception as e:
        print(f"Error: {e}")
        raise


if __name__ == "__main__":
    main()
