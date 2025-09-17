#!/usr/bin/env python3
"""
Generate detailed JSON files for each latent by consolidating all available data
(embeddings, scores, semantic distances) for a specific SAE ID.
"""

import os
import json
import argparse
import glob
from pathlib import Path
from typing import List, Dict, Optional, Set
from collections import defaultdict


def load_config(config_path: str) -> Dict:
    """Load configuration from JSON file."""
    with open(config_path, 'r') as f:
        return json.load(f)


def sanitize_sae_id_for_path(sae_id: str) -> str:
    """Convert SAE ID to filesystem-safe directory name."""
    return sae_id.replace("/", "--")


def load_embeddings_data(embeddings_dir: Path, sae_id: str) -> Dict[str, Dict]:
    """Load all embedding files that match the given SAE ID."""
    embeddings_data = {}

    # Find all embedding directories
    if not embeddings_dir.exists():
        print(f"Embeddings directory not found: {embeddings_dir}")
        return embeddings_data

    for data_source_dir in embeddings_dir.iterdir():
        if not data_source_dir.is_dir():
            continue

        embeddings_file = data_source_dir / "embeddings.json"
        if not embeddings_file.exists():
            continue

        try:
            with open(embeddings_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # Check if this embedding file matches our SAE ID
            file_sae_id = data.get("metadata", {}).get("sae_id", "")
            if file_sae_id == sae_id:
                embeddings_data[data_source_dir.name] = data
                print(f"Loaded embeddings from: {data_source_dir.name}")

        except (json.JSONDecodeError, FileNotFoundError) as e:
            print(f"Error loading embeddings from {embeddings_file}: {e}")

    return embeddings_data


def load_scores_data(scores_dir: Path, sae_id: str) -> Dict[str, Dict]:
    """Load all score files that match the given SAE ID."""
    scores_data = {}

    # Find all score directories
    if not scores_dir.exists():
        print(f"Scores directory not found: {scores_dir}")
        return scores_data

    for data_source_dir in scores_dir.iterdir():
        if not data_source_dir.is_dir():
            continue

        scores_file = data_source_dir / "scores.json"
        if not scores_file.exists():
            continue

        try:
            with open(scores_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # Check if this score file matches our SAE ID
            file_sae_id = data.get("metadata", {}).get("sae_id", "")
            if file_sae_id == sae_id:
                scores_data[data_source_dir.name] = data
                print(f"Loaded scores from: {data_source_dir.name}")

        except (json.JSONDecodeError, FileNotFoundError) as e:
            print(f"Error loading scores from {scores_file}: {e}")

    return scores_data


def load_semantic_distances_data(distances_dir: Path, sae_id: str) -> Dict[str, Dict]:
    """Load all semantic distance files that match the given SAE ID."""
    distances_data = {}

    # Find all distance directories
    if not distances_dir.exists():
        print(f"Semantic distances directory not found: {distances_dir}")
        return distances_data

    for comparison_dir in distances_dir.iterdir():
        if not comparison_dir.is_dir():
            continue

        distances_file = comparison_dir / "semantic_distances.json"
        if not distances_file.exists():
            continue

        try:
            with open(distances_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # Check if this distance file matches our SAE ID
            file_sae_id_1 = data.get("metadata", {}).get("sae_id_1", "")
            file_sae_id_2 = data.get("metadata", {}).get("sae_id_2", "")

            if file_sae_id_1 == sae_id and file_sae_id_2 == sae_id:
                distances_data[comparison_dir.name] = data
                print(f"Loaded semantic distances from: {comparison_dir.name}")

        except (json.JSONDecodeError, FileNotFoundError) as e:
            print(f"Error loading distances from {distances_file}: {e}")

    return distances_data


def generate_explanation_ids(embeddings_data: Dict[str, Dict]) -> Dict[str, Dict[str, str]]:
    """Generate unique explanation IDs for all explanations."""
    explanation_mapping = {}  # {data_source: {latent_id: explanation_id}}
    explanation_counter = 1

    # Sort data sources for consistent ID assignment
    for data_source in sorted(embeddings_data.keys()):
        explanation_mapping[data_source] = {}
        embeddings = embeddings_data[data_source].get("embeddings", {})

        # Sort latent IDs for consistent ordering
        for latent_id in sorted(embeddings.keys(), key=int):
            exp_id = f"exp_{explanation_counter:03d}"
            explanation_mapping[data_source][latent_id] = exp_id
            explanation_counter += 1

    return explanation_mapping


def build_explanations_for_latent(
    latent_id: str,
    embeddings_data: Dict[str, Dict],
    explanation_mapping: Dict[str, Dict[str, str]]
) -> List[Dict]:
    """Build explanations array for a specific latent."""
    explanations = []

    for data_source, data in embeddings_data.items():
        embeddings = data.get("embeddings", {})
        if latent_id not in embeddings:
            continue

        embedding_info = embeddings[latent_id]
        config = data.get("metadata", {}).get("config_used", {})

        explanation = {
            "explanation_id": explanation_mapping[data_source][latent_id],
            "text": embedding_info.get("explanation", ""),
            "explanation_method": config.get("explanation_method", "unknown"),
            "llm_explainer": config.get("llm_explainer", "unknown"),
            "data_source": data_source
        }
        explanations.append(explanation)

    return explanations


def build_semantic_distances_for_latent(
    latent_id: str,
    distances_data: Dict[str, Dict],
    explanation_mapping: Dict[str, Dict[str, str]]
) -> List[Dict]:
    """Build semantic distance pairs for a specific latent."""
    distance_pairs = []

    for comparison_name, data in distances_data.items():
        distances = data.get("semantic_distances", {})
        if latent_id not in distances:
            continue

        distance_info = distances[latent_id]
        distances_dict = distance_info.get("distances", {})

        # Get data sources from metadata
        metadata = data.get("metadata", {})
        source_1 = metadata.get("data_source_1", "")
        source_2 = metadata.get("data_source_2", "")

        # Get explanation IDs
        exp_id_1 = explanation_mapping.get(source_1, {}).get(latent_id)
        exp_id_2 = explanation_mapping.get(source_2, {}).get(latent_id)

        if exp_id_1 and exp_id_2:
            pair_info = {
                "pair": [exp_id_1, exp_id_2],
                "cosine_distance": distances_dict.get("cosine"),
                "euclidean_distance": distances_dict.get("euclidean")
            }
            distance_pairs.append(pair_info)

    return distance_pairs


def build_scores_for_latent(latent_id: str, scores_data: Dict[str, Dict]) -> List[Dict]:
    """Build scores array for a specific latent."""
    scores = []

    for data_source, data in scores_data.items():
        latent_scores = data.get("latent_scores", {})
        if latent_id not in latent_scores:
            continue

        score_info = latent_scores[latent_id]
        config = data.get("metadata", {}).get("config_used", {})

        score_entry = {
            "data_source": data_source,
            "llm_scorer": config.get("llm_scorer", "unknown"),
            "score_fuzz": score_info.get("fuzz", {}).get("average_score"),
            "score_detection": score_info.get("detection", {}).get("average_score"),
            "score_simulation": score_info.get("simulation", {}).get("average_score"),
            "score_embedding": score_info.get("embedding", {}).get("average_score")  # May not exist
        }
        scores.append(score_entry)

    return scores


def consolidate_latent_data(
    latent_id: str,
    sae_id: str,
    embeddings_data: Dict[str, Dict],
    scores_data: Dict[str, Dict],
    distances_data: Dict[str, Dict],
    explanation_mapping: Dict[str, Dict[str, str]]
) -> Dict:
    """Consolidate all data for a single latent into detailed JSON format."""

    explanations = build_explanations_for_latent(latent_id, embeddings_data, explanation_mapping)
    semantic_distances = build_semantic_distances_for_latent(latent_id, distances_data, explanation_mapping)
    scores = build_scores_for_latent(latent_id, scores_data)

    detailed_json = {
        "feature_id": int(latent_id),
        "sae_id": sae_id,
        "explanations": explanations,
        "semantic_distance_pairs": semantic_distances,
        "scores": scores,
        "activating_examples": "TODO: Not implemented yet"
    }

    return detailed_json


def save_detailed_json(latent_data: Dict, output_dir: Path, filename_pattern: str) -> None:
    """Save detailed JSON for a single latent."""
    os.makedirs(output_dir, exist_ok=True)

    feature_id = latent_data["feature_id"]
    filename = filename_pattern.format(latent_id=feature_id)
    output_file = output_dir / filename

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(latent_data, f, indent=2, ensure_ascii=False)


def save_consolidation_config(config: Dict, sae_id: str, output_dir: Path, stats: Dict) -> None:
    """Save configuration and statistics for the consolidation process."""
    config_with_stats = config.copy()
    config_with_stats["sae_id"] = sae_id
    config_with_stats["consolidation_stats"] = stats

    config_file = output_dir / "config.json"
    with open(config_file, "w", encoding="utf-8") as f:
        json.dump(config_with_stats, f, indent=2, ensure_ascii=False)


def main():
    """Main function to generate detailed JSON files for all latents."""
    parser = argparse.ArgumentParser(description="Generate detailed JSON files for each latent")
    parser.add_argument(
        "--config",
        default="../config/detailed_json_config.json",
        help="Path to configuration file (default: ../config/detailed_json_config.json)"
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

    sae_id = config["sae_id"]
    filename_pattern = config["output_filename_pattern"]

    print(f"Processing SAE ID: {sae_id}")

    # Setup paths
    embeddings_dir = project_root / "data" / "embeddings"
    scores_dir = project_root / "data" / "scores"
    distances_dir = project_root / "data" / "semantic_distances"

    # Create output directory
    sanitized_sae_id = sanitize_sae_id_for_path(sae_id)
    output_dir = project_root / "data" / "detailed_json" / sanitized_sae_id

    print(f"Output directory: {output_dir}")

    # Load all data
    print("\nLoading data...")
    embeddings_data = load_embeddings_data(embeddings_dir, sae_id)
    scores_data = load_scores_data(scores_dir, sae_id)
    distances_data = load_semantic_distances_data(distances_dir, sae_id)

    if not embeddings_data:
        print("No embedding data found for the specified SAE ID!")
        return

    # Generate explanation IDs
    explanation_mapping = generate_explanation_ids(embeddings_data)

    # Find all unique latent IDs across all data sources
    all_latent_ids = set()
    for data_source, data in embeddings_data.items():
        embeddings = data.get("embeddings", {})
        all_latent_ids.update(embeddings.keys())

    print(f"\nFound {len(all_latent_ids)} unique latents")
    print(f"Data sources - Embeddings: {len(embeddings_data)}, Scores: {len(scores_data)}, Distances: {len(distances_data)}")

    # Process each latent
    successful_consolidations = 0

    for latent_id in sorted(all_latent_ids, key=int):
        try:
            latent_data = consolidate_latent_data(
                latent_id, sae_id, embeddings_data, scores_data,
                distances_data, explanation_mapping
            )

            save_detailed_json(latent_data, output_dir, filename_pattern)
            successful_consolidations += 1

            # Progress update
            if int(latent_id) % 100 == 0:
                print(f"Processed latent {latent_id}")

        except Exception as e:
            print(f"Error processing latent {latent_id}: {e}")

    # Save configuration and stats
    stats = {
        "total_latents_found": len(all_latent_ids),
        "successful_consolidations": successful_consolidations,
        "data_sources_embeddings": list(embeddings_data.keys()),
        "data_sources_scores": list(scores_data.keys()),
        "data_sources_distances": list(distances_data.keys())
    }

    save_consolidation_config(config, sae_id, output_dir, stats)

    print(f"\nConsolidation completed!")
    print(f"Successfully processed: {successful_consolidations}/{len(all_latent_ids)} latents")
    print(f"Detailed JSON files saved to: {output_dir}")
    print(f"Config and stats saved to: {output_dir / 'config.json'}")


if __name__ == "__main__":
    main()