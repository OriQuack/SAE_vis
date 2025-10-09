#!/usr/bin/env python3
"""
Calculate pairwise semantic similarities between embedded explanations from three data sources.
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


def get_actual_model_name(data_source: str, model_name_mapping: Dict) -> str:
    """
    Extract actual model name from data source using the mapping.

    Args:
        data_source: Data source name like "llama_e-llama_s"
        model_name_mapping: Mapping from prefix to actual model name

    Returns:
        Actual model name or the prefix if not found in mapping
    """
    # Extract the explainer prefix (e.g., "llama_e" from "llama_e-llama_s")
    explainer_prefix = data_source.split("-")[0] if "-" in data_source else data_source

    # Look up the actual model name
    return model_name_mapping.get(explainer_prefix, explainer_prefix)


def load_embeddings(embeddings_path: str) -> Optional[Dict]:
    """Load embeddings from JSON file."""
    try:
        with open(embeddings_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"Error loading embeddings from {embeddings_path}: {e}")
        return None


def calculate_cosine_similarity(embedding1: List[float], embedding2: List[float]) -> float:
    """Calculate cosine similarity between two embeddings."""
    # Calculate dot product
    dot_product = sum(a * b for a, b in zip(embedding1, embedding2))

    # Calculate magnitudes
    magnitude1 = math.sqrt(sum(a * a for a in embedding1))
    magnitude2 = math.sqrt(sum(b * b for b in embedding2))

    # Avoid division by zero
    if magnitude1 == 0 or magnitude2 == 0:
        return 0.0  # Minimum similarity for zero vectors

    # Calculate cosine similarity
    cosine_similarity = dot_product / (magnitude1 * magnitude2)

    # Clamp to [-1, 1] to handle floating point errors
    cosine_similarity = max(-1.0, min(1.0, cosine_similarity))

    # Return cosine similarity (higher is more similar)
    return cosine_similarity


def calculate_euclidean_distance(embedding1: List[float], embedding2: List[float]) -> float:
    """Calculate euclidean distance between two embeddings."""
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(embedding1, embedding2)))


def calculate_semantic_similarities(
    embeddings1: Dict,
    embeddings2: Dict,
    similarity_metrics: List[str],
    source_name_1: str = "source_1",
    source_name_2: str = "source_2"
) -> Dict:
    """
    Calculate semantic similarities between embeddings from two sources.

    Returns a dictionary with latent IDs as keys and similarity metrics as values.
    """
    similarities_data = {}

    # Get common latent IDs between both sources
    latent_ids_1 = set(embeddings1.get("embeddings", {}).keys())
    latent_ids_2 = set(embeddings2.get("embeddings", {}).keys())
    common_latent_ids = latent_ids_1.intersection(latent_ids_2)

    print(f"Found {len(common_latent_ids)} common latents between {source_name_1} and {source_name_2}")

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

        similarities = {}

        for metric in similarity_metrics:
            try:
                if metric == "cosine":
                    similarity = calculate_cosine_similarity(embedding_1, embedding_2)
                elif metric == "euclidean":
                    # Note: Euclidean is still a distance metric (lower is better)
                    # Kept for compatibility but similarity metrics should use cosine
                    similarity = calculate_euclidean_distance(embedding_1, embedding_2)
                else:
                    print(f"Unknown similarity metric: {metric}")
                    continue

                similarities[metric] = similarity

            except Exception as e:
                print(f"Error calculating {metric} similarity for latent {latent_id}: {e}")
                similarities[metric] = None

        similarities_data[latent_id] = {
            "similarities": similarities,
            "explanation_1": embedding_data_1.get("explanation"),
            "explanation_2": embedding_data_2.get("explanation"),
            "embedding_dim_1": embedding_data_1.get("embedding_dim"),
            "embedding_dim_2": embedding_data_2.get("embedding_dim")
        }

        if int(latent_id) % 100 == 0:  # Progress update every 100 latents
            print(f"Processed latent {latent_id}")

    return similarities_data


def calculate_all_pairwise_similarities(
    embeddings_list: List[Dict],
    data_source_names: List[str],
    similarity_metrics: List[str]
) -> Dict:
    """
    Calculate pairwise semantic similarities between all combinations of three embedding sources.

    Args:
        embeddings_list: List of three embedding dictionaries
        data_source_names: List of three data source names
        similarity_metrics: List of similarity metrics to calculate

    Returns:
        Dictionary with pairwise comparisons (1_vs_2, 1_vs_3, 2_vs_3)
    """
    if len(embeddings_list) != 3 or len(data_source_names) != 3:
        raise ValueError("Expected exactly 3 embedding sources and 3 data source names")

    pairwise_results = {}

    # Define the three pairs to compare
    pairs = [
        (0, 1, "1_vs_2"),  # embeddings_list[0] vs embeddings_list[1]
        (0, 2, "1_vs_3"),  # embeddings_list[0] vs embeddings_list[2]
        (1, 2, "2_vs_3")   # embeddings_list[1] vs embeddings_list[2]
    ]

    for idx1, idx2, pair_name in pairs:
        print(f"\nCalculating similarities for pair: {data_source_names[idx1]} vs {data_source_names[idx2]}")
        similarities = calculate_semantic_similarities(
            embeddings_list[idx1],
            embeddings_list[idx2],
            similarity_metrics,
            source_name_1=data_source_names[idx1],
            source_name_2=data_source_names[idx2]
        )
        pairwise_results[pair_name] = {
            "data_source_1": data_source_names[idx1],
            "data_source_2": data_source_names[idx2],
            "similarities": similarities
        }

    return pairwise_results


def save_semantic_similarities(
    pairwise_results: Dict,
    output_dir: str,
    filename: str,
    config: Dict,
    sae_ids: List[str],
    data_source_names: List[str],
    model_names: List[str]
) -> None:
    """Save pairwise semantic similarities data to JSON file and copy config."""
    os.makedirs(output_dir, exist_ok=True)

    # Save similarities
    output_file = os.path.join(output_dir, filename)
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(pairwise_results, f, indent=2, ensure_ascii=False)

    # Save config file with sae_ids and model names in the same directory
    config_with_sae_ids = config.copy()
    config_with_sae_ids["sae_id_1"] = sae_ids[0]
    config_with_sae_ids["sae_id_2"] = sae_ids[1]
    config_with_sae_ids["sae_id_3"] = sae_ids[2]
    config_with_sae_ids["data_source_1"] = data_source_names[0]
    config_with_sae_ids["data_source_2"] = data_source_names[1]
    config_with_sae_ids["data_source_3"] = data_source_names[2]
    config_with_sae_ids["llm_explainer_1"] = model_names[0]
    config_with_sae_ids["llm_explainer_2"] = model_names[1]
    config_with_sae_ids["llm_explainer_3"] = model_names[2]
    config_file = os.path.join(output_dir, "config.json")
    with open(config_file, "w", encoding="utf-8") as f:
        json.dump(config_with_sae_ids, f, indent=2, ensure_ascii=False)

    print(f"Pairwise semantic similarities saved to: {output_file}")
    print(f"Config saved to: {config_file}")


def main():
    """Main function to calculate pairwise semantic similarities between three embedding sources."""
    parser = argparse.ArgumentParser(description="Calculate pairwise semantic similarities between embeddings from three sources")
    parser.add_argument(
        "--config",
        default="../config/semantic_similarity_config.json",
        help="Path to configuration file (default: ../config/semantic_similarity_config.json)"
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
    data_source_3 = config["data_source_3"]
    embedding_filename = config["embedding_filename"]

    data_source_names = [data_source_1, data_source_2, data_source_3]

    # Set up paths for all three sources
    data_source_dirs = [
        project_root / "data" / "raw" / data_source_1,
        project_root / "data" / "raw" / data_source_2,
        project_root / "data" / "raw" / data_source_3
    ]

    embeddings_paths = [
        project_root / "data" / "embeddings" / data_source_1 / embedding_filename,
        project_root / "data" / "embeddings" / data_source_2 / embedding_filename,
        project_root / "data" / "embeddings" / data_source_3 / embedding_filename
    ]

    output_dir = project_root / "data" / "semantic_similarities" / f"{data_source_1}_vs_{data_source_2}_vs_{data_source_3}"

    # Load run configs and extract sae_ids
    sae_ids = []
    for i, data_source_dir in enumerate(data_source_dirs):
        run_config = load_run_config(data_source_dir)
        sae_id = extract_sae_id(run_config)
        sae_ids.append(sae_id)
        print(f"SAE ID {i+1}: {sae_id}")

    # Extract actual model names from data sources using mapping
    model_name_mapping = config.get("model_name_mapping", {})
    model_names = [
        get_actual_model_name(data_source_names[0], model_name_mapping),
        get_actual_model_name(data_source_names[1], model_name_mapping),
        get_actual_model_name(data_source_names[2], model_name_mapping)
    ]
    for i, model_name in enumerate(model_names):
        print(f"LLM Explainer {i+1}: {model_name}")

    # Print paths
    for i, path in enumerate(embeddings_paths):
        print(f"Embeddings source {i+1}: {path}")
    print(f"Output directory: {output_dir}")

    # Validate input files exist
    for i, path in enumerate(embeddings_paths):
        if not path.exists():
            print(f"Error: Embeddings file {i+1} does not exist: {path}")
            return

    # Load embeddings
    print("\nLoading embeddings...")
    embeddings_list = []
    for i, path in enumerate(embeddings_paths):
        embeddings = load_embeddings(str(path))
        if embeddings is None:
            print(f"Error: Failed to load embeddings from source {i+1}")
            return
        embeddings_list.append(embeddings)
        print(f"Loaded {len(embeddings.get('embeddings', {}))} embeddings from source {i+1} ({data_source_names[i]})")

    # Calculate pairwise semantic similarities
    print("\nCalculating pairwise semantic similarities...")
    pairwise_results = calculate_all_pairwise_similarities(
        embeddings_list,
        data_source_names,
        config["similarity_metrics"]
    )

    # Prepare final output data
    final_data = {
        "metadata": {
            "data_source_1": data_source_1,
            "data_source_2": data_source_2,
            "data_source_3": data_source_3,
            "llm_explainer_1": model_names[0],
            "llm_explainer_2": model_names[1],
            "llm_explainer_3": model_names[2],
            "sae_id_1": sae_ids[0],
            "sae_id_2": sae_ids[1],
            "sae_id_3": sae_ids[2],
            "similarity_metrics": config["similarity_metrics"],
            "embedding_model_1": embeddings_list[0].get("metadata", {}).get("model"),
            "embedding_model_2": embeddings_list[1].get("metadata", {}).get("model"),
            "embedding_model_3": embeddings_list[2].get("metadata", {}).get("model"),
            "config_used": config
        },
        "pairwise_similarities": pairwise_results
    }

    # Save results
    save_semantic_similarities(final_data, str(output_dir), config["output_filename"], config, sae_ids, data_source_names, model_names)

    # Print summary statistics for each pair
    print("\n=== Summary Statistics ===")
    for pair_name, pair_data in pairwise_results.items():
        similarities_data = pair_data["similarities"]
        print(f"\n{pair_name}: {pair_data['data_source_1']} vs {pair_data['data_source_2']}")
        print(f"Total latents compared: {len(similarities_data)}")

        for metric in config["similarity_metrics"]:
            values = [d["similarities"].get(metric) for d in similarities_data.values() if d["similarities"].get(metric) is not None]
            if values:
                mean_val = sum(values) / len(values)
                variance = sum((x - mean_val) ** 2 for x in values) / len(values)
                std_val = math.sqrt(variance)
                print(f"  {metric.capitalize()} similarity - Mean: {mean_val:.4f}, Std: {std_val:.4f}")


if __name__ == "__main__":
    main()