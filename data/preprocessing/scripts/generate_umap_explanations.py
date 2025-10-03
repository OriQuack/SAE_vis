#!/usr/bin/env python3
"""
Generate 2D UMAP embeddings for explanation embeddings.

This script loads explanation embeddings from multiple sources and applies UMAP
dimensionality reduction to create 2D visualizations of explanation relationships.

Output format: Per-feature dictionary with explanation source coordinates
{
  "feature_0": {
    "llama_e-llama_s": {"x": 1.23, "y": 4.56},
    "gwen_e-llama_s": {"x": 2.34, "y": 5.67}
  }
}
"""

import json
import os
import argparse
import numpy as np
from pathlib import Path
from typing import Dict, List
import umap


def load_config(config_path: str) -> Dict:
    """Load configuration from JSON file."""
    with open(config_path, 'r') as f:
        return json.load(f)


def load_embedding_data(embedding_dir: str) -> Dict:
    """
    Load embedding data from embeddings.json file.

    Args:
        embedding_dir: Directory containing embeddings.json

    Returns:
        Dictionary with metadata and embeddings
    """
    embedding_file = os.path.join(embedding_dir, "embeddings.json")

    if not os.path.exists(embedding_file):
        raise FileNotFoundError(f"Embedding file not found: {embedding_file}")

    with open(embedding_file, 'r') as f:
        data = json.load(f)

    return data


def prepare_embedding_matrix(embedding_sources: List[Dict]) -> tuple:
    """
    Prepare embedding matrix from multiple sources.

    Args:
        embedding_sources: List of dictionaries with 'name', 'path', and 'data'

    Returns:
        Tuple of (embedding_matrix, source_map, feature_map)
        - embedding_matrix: numpy array of shape (n_samples, embedding_dim)
        - source_map: list mapping row index to (source_name, feature_id)
        - feature_map: dict mapping feature_id to list of (source_name, row_index)
    """
    all_embeddings = []
    source_map = []  # Maps row index to (source_name, feature_id)
    feature_map = {}  # Maps feature_id to list of (source_name, row_index)

    for source in embedding_sources:
        source_name = source['name']
        embeddings_dict = source['data']['embeddings']

        print(f"Processing {source_name}: {len(embeddings_dict)} embeddings")

        for feature_id_str, emb_data in embeddings_dict.items():
            feature_id = int(feature_id_str)
            embedding = np.array(emb_data['embedding'], dtype=np.float32)

            row_index = len(all_embeddings)
            all_embeddings.append(embedding)
            source_map.append((source_name, feature_id))

            if feature_id not in feature_map:
                feature_map[feature_id] = []
            feature_map[feature_id].append((source_name, row_index))

    embedding_matrix = np.vstack(all_embeddings)
    print(f"\nTotal embeddings: {embedding_matrix.shape[0]}")
    print(f"Embedding dimension: {embedding_matrix.shape[1]}")
    print(f"Unique features: {len(feature_map)}")

    return embedding_matrix, source_map, feature_map


def generate_umap_embeddings(
    embedding_matrix: np.ndarray,
    umap_params: Dict
) -> np.ndarray:
    """
    Apply UMAP dimensionality reduction to embeddings.

    Args:
        embedding_matrix: Input embeddings of shape (n_samples, embedding_dim)
        umap_params: UMAP configuration parameters

    Returns:
        2D UMAP embeddings of shape (n_samples, 2)
    """
    print("\nApplying UMAP dimensionality reduction...")
    print(f"UMAP parameters: n_neighbors={umap_params['n_neighbors']}, "
          f"min_dist={umap_params['min_dist']}, metric={umap_params['metric']}")

    reducer = umap.UMAP(
        n_neighbors=umap_params["n_neighbors"],
        min_dist=umap_params["min_dist"],
        n_components=2,
        metric=umap_params["metric"],
        random_state=umap_params.get("random_state", 42),
        verbose=True
    )

    embeddings_2d = reducer.fit_transform(embedding_matrix)
    print(f"UMAP embeddings generated. Shape: {embeddings_2d.shape}")

    return embeddings_2d


def format_results(
    embeddings_2d: np.ndarray,
    source_map: List[tuple],
    feature_map: Dict[int, List[tuple]],
    config: Dict
) -> Dict:
    """
    Format UMAP results into the desired output structure.

    Args:
        embeddings_2d: 2D UMAP coordinates of shape (n_samples, 2)
        source_map: Mapping from row index to (source_name, feature_id)
        feature_map: Mapping from feature_id to list of (source_name, row_index)
        config: Configuration used for generation

    Returns:
        Dictionary with formatted results per feature
    """
    print("\nFormatting results...")

    # Create per-feature dictionary
    feature_embeddings = {}

    for feature_id, source_rows in feature_map.items():
        feature_key = f"feature_{feature_id}"
        feature_embeddings[feature_key] = {}

        for source_name, row_index in source_rows:
            x, y = embeddings_2d[row_index]
            feature_embeddings[feature_key][source_name] = {
                "x": float(x),
                "y": float(y)
            }

    # Calculate statistics
    statistics = {
        "x_min": float(embeddings_2d[:, 0].min()),
        "x_max": float(embeddings_2d[:, 0].max()),
        "y_min": float(embeddings_2d[:, 1].min()),
        "y_max": float(embeddings_2d[:, 1].max()),
        "x_mean": float(embeddings_2d[:, 0].mean()),
        "y_mean": float(embeddings_2d[:, 1].mean()),
        "x_std": float(embeddings_2d[:, 0].std()),
        "y_std": float(embeddings_2d[:, 1].std())
    }

    # Get source names
    source_names = list(set(source_name for source_name, _ in source_map))

    results = {
        "metadata": {
            "description": "2D UMAP embeddings for explanation embeddings from multiple sources",
            "n_features": len(feature_map),
            "n_total_embeddings": len(source_map),
            "sources": source_names,
            "umap_parameters": config["umap_parameters"],
            "statistics": statistics
        },
        "feature_embeddings": feature_embeddings,
        "config_used": config
    }

    print(f"Formatted {len(feature_embeddings)} features")
    print(f"X range: [{statistics['x_min']:.4f}, {statistics['x_max']:.4f}]")
    print(f"Y range: [{statistics['y_min']:.4f}, {statistics['y_max']:.4f}]")

    return results


def save_results(
    results: Dict,
    output_dir: str,
    output_filename: str,
    config: Dict
) -> None:
    """Save UMAP results to JSON file and save config separately."""
    os.makedirs(output_dir, exist_ok=True)

    # Save results
    output_file = os.path.join(output_dir, output_filename)
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"\nSaved results to: {output_file}")

    # Save config file in the same directory
    config_file = os.path.join(output_dir, "config.json")
    with open(config_file, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)
    print(f"Config saved to: {config_file}")


def main():
    """Main function to generate UMAP embeddings for explanations."""
    parser = argparse.ArgumentParser(
        description="Generate 2D UMAP embeddings for explanation embeddings"
    )
    parser.add_argument(
        "--config",
        default="../config/umap_explanations_config.json",
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

    try:
        # Load embedding data from all sources
        print("\nLoading embedding data...")
        embedding_sources = []

        for source_config in config["embedding_sources"]:
            source_name = source_config["name"]
            source_path = project_root / source_config["path"]

            print(f"Loading {source_name} from {source_path}...")
            data = load_embedding_data(str(source_path))

            embedding_sources.append({
                "name": source_name,
                "path": str(source_path),
                "data": data
            })

        # Prepare embedding matrix
        embedding_matrix, source_map, feature_map = prepare_embedding_matrix(
            embedding_sources
        )

        # Generate UMAP embeddings
        embeddings_2d = generate_umap_embeddings(
            embedding_matrix,
            config["umap_parameters"]
        )

        # Format results
        results = format_results(
            embeddings_2d,
            source_map,
            feature_map,
            config
        )

        # Setup output directory
        output_dir = project_root / config["output_dir"]
        print(f"\nOutput directory: {output_dir}")

        # Save results
        save_results(
            results,
            str(output_dir),
            config["output_filename"],
            config
        )

        print("\nCompleted successfully!")
        print(f"Processed {results['metadata']['n_features']} features")
        print(f"Total embeddings: {results['metadata']['n_total_embeddings']}")
        print(f"Sources: {', '.join(results['metadata']['sources'])}")

    except Exception as e:
        print(f"Error: {e}")
        raise


if __name__ == "__main__":
    main()
