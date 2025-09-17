#!/usr/bin/env python3
"""
Calculate semantic distances between embedded explanations from two data sources.
"""

import os
import json
import argparse
import math
from pathlib import Path
from typing import List, Dict, Optional


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


def load_embeddings(embeddings_path: str) -> Optional[Dict]:
    """Load embeddings from JSON file."""
    try:
        with open(embeddings_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"Error loading embeddings from {embeddings_path}: {e}")
        return None


def calculate_cosine_distance(embedding1: List[float], embedding2: List[float]) -> float:
    """Calculate cosine distance between two embeddings."""
    # Calculate dot product
    dot_product = sum(a * b for a, b in zip(embedding1, embedding2))

    # Calculate magnitudes
    magnitude1 = math.sqrt(sum(a * a for a in embedding1))
    magnitude2 = math.sqrt(sum(b * b for b in embedding2))

    # Avoid division by zero
    if magnitude1 == 0 or magnitude2 == 0:
        return 1.0  # Maximum distance for zero vectors

    # Calculate cosine similarity
    cosine_similarity = dot_product / (magnitude1 * magnitude2)

    # Clamp to [-1, 1] to handle floating point errors
    cosine_similarity = max(-1.0, min(1.0, cosine_similarity))

    # Return cosine distance (1 - cosine similarity)
    return 1.0 - cosine_similarity


def calculate_euclidean_distance(embedding1: List[float], embedding2: List[float]) -> float:
    """Calculate euclidean distance between two embeddings."""
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(embedding1, embedding2)))


def calculate_semantic_distances(
    embeddings1: Dict,
    embeddings2: Dict,
    distance_metrics: List[str]
) -> Dict:
    """
    Calculate semantic distances between embeddings from two sources.

    Returns a dictionary with latent IDs as keys and distance metrics as values.
    """
    distances_data = {}

    # Get common latent IDs between both sources
    latent_ids_1 = set(embeddings1.get("embeddings", {}).keys())
    latent_ids_2 = set(embeddings2.get("embeddings", {}).keys())
    common_latent_ids = latent_ids_1.intersection(latent_ids_2)

    print(f"Found {len(common_latent_ids)} common latents between sources")

    for latent_id in sorted(common_latent_ids, key=int):
        embedding_data_1 = embeddings1["embeddings"][latent_id]
        embedding_data_2 = embeddings2["embeddings"][latent_id]

        embedding_1 = embedding_data_1.get("embedding")
        embedding_2 = embedding_data_2.get("embedding")

        if embedding_1 is None or embedding_2 is None:
            print(f"Missing embedding for latent {latent_id}")
            continue

        if len(embedding_1) != len(embedding_2):
            print(f"Embedding dimension mismatch for latent {latent_id}: {len(embedding_1)} vs {len(embedding_2)}")
            continue

        distances = {}

        for metric in distance_metrics:
            try:
                if metric == "cosine":
                    distance = calculate_cosine_distance(embedding_1, embedding_2)
                elif metric == "euclidean":
                    distance = calculate_euclidean_distance(embedding_1, embedding_2)
                else:
                    print(f"Unknown distance metric: {metric}")
                    continue

                distances[metric] = distance

            except Exception as e:
                print(f"Error calculating {metric} distance for latent {latent_id}: {e}")
                distances[metric] = None

        distances_data[latent_id] = {
            "distances": distances,
            "explanation_1": embedding_data_1.get("explanation"),
            "explanation_2": embedding_data_2.get("explanation"),
            "embedding_dim_1": embedding_data_1.get("embedding_dim"),
            "embedding_dim_2": embedding_data_2.get("embedding_dim")
        }

        if int(latent_id) % 100 == 0:  # Progress update every 100 latents
            print(f"Processed latent {latent_id}")

    return distances_data


def save_semantic_distances(distances_data: Dict, output_dir: str, filename: str, config: Dict, sae_id_1: str, sae_id_2: str) -> None:
    """Save semantic distances data to JSON file and copy config."""
    os.makedirs(output_dir, exist_ok=True)

    # Save distances
    output_file = os.path.join(output_dir, filename)
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(distances_data, f, indent=2, ensure_ascii=False)

    # Save config file with sae_ids in the same directory
    config_with_sae_ids = config.copy()
    config_with_sae_ids["sae_id_1"] = sae_id_1
    config_with_sae_ids["sae_id_2"] = sae_id_2
    config_file = os.path.join(output_dir, "config.json")
    with open(config_file, "w", encoding="utf-8") as f:
        json.dump(config_with_sae_ids, f, indent=2, ensure_ascii=False)

    print(f"Semantic distances saved to: {output_file}")
    print(f"Config saved to: {config_file}")


def main():
    """Main function to calculate semantic distances between embeddings."""
    parser = argparse.ArgumentParser(description="Calculate semantic distances between embeddings from two sources")
    parser.add_argument(
        "--config",
        default="../config/semantic_distance_config.json",
        help="Path to configuration file (default: ../config/semantic_distance_config.json)"
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

    # Setup paths relative to project root
    data_source_1 = config["data_source_1"]
    data_source_2 = config["data_source_2"]
    embedding_filename = config["embedding_filename"]

    data_source_dir_1 = project_root / "data" / "raw" / data_source_1
    data_source_dir_2 = project_root / "data" / "raw" / data_source_2

    embeddings_path_1 = project_root / "data" / "embeddings" / data_source_1 / embedding_filename
    embeddings_path_2 = project_root / "data" / "embeddings" / data_source_2 / embedding_filename

    output_dir = project_root / "data" / "semantic_distances" / f"{data_source_1}_vs_{data_source_2}"

    # Load run configs and extract sae_ids
    run_config_1 = load_run_config(data_source_dir_1)
    run_config_2 = load_run_config(data_source_dir_2)
    sae_id_1 = extract_sae_id(run_config_1)
    sae_id_2 = extract_sae_id(run_config_2)

    print(f"Embeddings source 1: {embeddings_path_1}")
    print(f"Embeddings source 2: {embeddings_path_2}")
    print(f"Output directory: {output_dir}")
    print(f"SAE ID 1: {sae_id_1}")
    print(f"SAE ID 2: {sae_id_2}")

    # Validate input files exist
    if not embeddings_path_1.exists():
        print(f"Error: Embeddings file 1 does not exist: {embeddings_path_1}")
        return

    if not embeddings_path_2.exists():
        print(f"Error: Embeddings file 2 does not exist: {embeddings_path_2}")
        return

    # Load embeddings
    print("Loading embeddings...")
    embeddings_1 = load_embeddings(str(embeddings_path_1))
    embeddings_2 = load_embeddings(str(embeddings_path_2))

    if embeddings_1 is None or embeddings_2 is None:
        print("Error: Failed to load embeddings")
        return

    print(f"Loaded {len(embeddings_1.get('embeddings', {}))} embeddings from source 1")
    print(f"Loaded {len(embeddings_2.get('embeddings', {}))} embeddings from source 2")

    # Calculate semantic distances
    print("Calculating semantic distances...")
    distances_data = calculate_semantic_distances(
        embeddings_1,
        embeddings_2,
        config["distance_metrics"]
    )

    # Prepare final output data
    final_data = {
        "metadata": {
            "data_source_1": data_source_1,
            "data_source_2": data_source_2,
            "sae_id_1": sae_id_1,
            "sae_id_2": sae_id_2,
            "distance_metrics": config["distance_metrics"],
            "total_latents": len(distances_data),
            "embedding_model_1": embeddings_1.get("metadata", {}).get("model"),
            "embedding_model_2": embeddings_2.get("metadata", {}).get("model"),
            "config_used": config
        },
        "semantic_distances": distances_data
    }

    # Save results
    save_semantic_distances(final_data, str(output_dir), config["output_filename"], config, sae_id_1, sae_id_2)

    print(f"\nCompleted: {len(distances_data)} semantic distance calculations")

    # Print summary statistics
    if distances_data:
        for metric in config["distance_metrics"]:
            values = [d["distances"].get(metric) for d in distances_data.values() if d["distances"].get(metric) is not None]
            if values:
                mean_val = sum(values) / len(values)
                variance = sum((x - mean_val) ** 2 for x in values) / len(values)
                std_val = math.sqrt(variance)
                print(f"{metric.capitalize()} distance - Mean: {mean_val:.4f}, Std: {std_val:.4f}")


if __name__ == "__main__":
    main()