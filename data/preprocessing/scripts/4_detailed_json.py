#!/usr/bin/env python3
"""
Generate detailed JSON files for each latent by consolidating all available data
(embeddings, scores, semantic similarities) for a specific SAE ID.
"""

import os
import json
import argparse
import glob
import numpy as np
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


def load_semantic_similarities_data(similarities_dir: Path, sae_id: str) -> Dict[str, Dict]:
    """Load all semantic similarity files that match the given SAE ID."""
    similarities_data = {}

    # Find all similarity directories
    if not similarities_dir.exists():
        print(f"Semantic similarities directory not found: {similarities_dir}")
        return similarities_data

    for comparison_dir in similarities_dir.iterdir():
        if not comparison_dir.is_dir():
            continue

        similarities_file = comparison_dir / "semantic_similarities.json"
        if not similarities_file.exists():
            continue

        try:
            with open(similarities_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # Check if this similarity file matches our SAE ID
            # Support both 2-way and 3-way comparisons
            metadata = data.get("metadata", {})
            file_sae_id_1 = metadata.get("sae_id_1", "")
            file_sae_id_2 = metadata.get("sae_id_2", "")
            file_sae_id_3 = metadata.get("sae_id_3", "")

            # Match if all SAE IDs present match our target SAE ID
            sae_ids = [file_sae_id_1, file_sae_id_2, file_sae_id_3]
            sae_ids = [sid for sid in sae_ids if sid]  # Remove empty strings

            if sae_ids and all(sid == sae_id for sid in sae_ids):
                similarities_data[comparison_dir.name] = data
                print(f"Loaded semantic similarities from: {comparison_dir.name}")

        except (json.JSONDecodeError, FileNotFoundError) as e:
            print(f"Error loading similarities from {similarities_file}: {e}")

    return similarities_data


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


def build_semantic_similarities_for_latent(
    latent_id: str,
    similarities_data: Dict[str, Dict],
    explanation_mapping: Dict[str, Dict[str, str]]
) -> List[Dict]:
    """Build semantic similarity pairs for a specific latent."""
    similarity_pairs = []

    for comparison_name, data in similarities_data.items():
        # Check for both old format (semantic_similarities) and new format (pairwise_similarities)
        pairwise_similarities = data.get("pairwise_similarities", {})
        old_format_similarities = data.get("semantic_similarities", {})

        # Handle new 3-way pairwise format
        if pairwise_similarities:
            for pair_name, pair_data in pairwise_similarities.items():
                # Extract similarities for this specific latent
                pair_similarities = pair_data.get("similarities", {})
                if latent_id not in pair_similarities:
                    continue

                similarity_info = pair_similarities[latent_id]
                similarities_dict = similarity_info.get("similarities", {})

                # Get data sources for this pair
                source_1 = pair_data.get("data_source_1", "")
                source_2 = pair_data.get("data_source_2", "")

                # Get explanation IDs
                exp_id_1 = explanation_mapping.get(source_1, {}).get(latent_id)
                exp_id_2 = explanation_mapping.get(source_2, {}).get(latent_id)

                if exp_id_1 and exp_id_2:
                    pair_info = {
                        "pair": [exp_id_1, exp_id_2],
                        "cosine_similarity": similarities_dict.get("cosine"),
                        "euclidean_similarity": similarities_dict.get("euclidean")
                    }
                    similarity_pairs.append(pair_info)

        # Handle old 2-way format for backward compatibility
        elif old_format_similarities:
            if latent_id not in old_format_similarities:
                continue

            similarity_info = old_format_similarities[latent_id]
            similarities_dict = similarity_info.get("similarities", {})

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
                    "cosine_similarity": similarities_dict.get("cosine"),
                    "euclidean_similarity": similarities_dict.get("euclidean")
                }
                similarity_pairs.append(pair_info)

    return similarity_pairs


def build_scores_for_latent(latent_id: str, scores_data: Dict[str, Dict]) -> List[Dict]:
    """Build scores array for a specific latent."""
    scores = []

    for data_source, data in scores_data.items():
        latent_scores = data.get("latent_scores", {})
        if latent_id not in latent_scores:
            continue

        score_info = latent_scores[latent_id]
        metadata = data.get("metadata", {})

        score_entry = {
            "data_source": data_source,
            "llm_scorer": metadata.get("llm_scorer", "unknown"),
            "score_fuzz": score_info.get("fuzz", {}).get("average_score"),
            "score_detection": score_info.get("detection", {}).get("average_score"),
            "score_simulation": score_info.get("simulation", {}).get("average_score"),
            "score_embedding": score_info.get("embedding", {}).get("average_score")  # May not exist
        }
        scores.append(score_entry)

    return scores


def propagate_embedding_scores(scores: List[Dict]) -> None:
    """
    Propagate embedding scores across all scorers for the same explainer.

    Embedding scores are calculated from explanation text (tied to explainer),
    so all scorers evaluating the same explanation should share the same score.

    Data source format: "{explainer}_e-{scorer}_s"
    Example: "llama_e-llama_s", "llama_e-openai_s" -> both should have same embedding score

    Modifies the scores list in-place.
    """
    # Group scores by explainer prefix
    explainer_groups = defaultdict(list)

    for score in scores:
        data_source = score.get("data_source", "")
        # Extract explainer prefix (everything before the last hyphen + hyphen)
        # e.g., "llama_e-llama_s" -> "llama_e-"
        if "-" in data_source:
            explainer_prefix = data_source.rsplit("-", 1)[0] + "-"
            explainer_groups[explainer_prefix].append(score)

    # For each explainer group, find and propagate the embedding score
    for explainer_prefix, group_scores in explainer_groups.items():
        # Find the non-null embedding score in this group
        embedding_score = None
        for score in group_scores:
            if score.get("score_embedding") is not None:
                embedding_score = score["score_embedding"]
                break

        # If we found an embedding score, propagate it to all scores in this group
        if embedding_score is not None:
            for score in group_scores:
                score["score_embedding"] = embedding_score


def calculate_global_statistics(
    scores_data: Dict[str, Dict],
    embeddings_data: Dict[str, Dict]
) -> Dict[str, Dict[str, float]]:
    """
    Calculate global statistics (mean, std) for each metric across all features.

    Returns:
        Dict with structure: {"embedding": {"mean": X, "std": Y}, "fuzz": {...}, "detection": {...}}
    """

    # Collect all scores grouped by feature and explainer
    # Structure: {latent_id: {explainer: {"embedding": X, "fuzz": [scores], "detection": [scores]}}}
    feature_explainer_scores = defaultdict(lambda: defaultdict(lambda: {
        "embedding": None,
        "fuzz": [],
        "detection": []
    }))

    # Extract explainer from data_source name
    def get_explainer_from_data_source(data_source: str) -> str:
        # Format: "{explainer}_e-{scorer}_s" -> extract "{explainer}_e"
        if "_e-" in data_source:
            return data_source.split("_e-")[0] + "_e"
        return data_source

    # Get explainer full name from embeddings data
    explainer_names = {}  # {explainer_prefix: full_llm_name}
    for data_source, data in embeddings_data.items():
        explainer_prefix = get_explainer_from_data_source(data_source)
        config = data.get("metadata", {}).get("config_used", {})
        llm_explainer = config.get("llm_explainer", "unknown")
        explainer_names[explainer_prefix] = llm_explainer

    # Iterate through all scores data
    for data_source, data in scores_data.items():
        explainer_prefix = get_explainer_from_data_source(data_source)
        latent_scores = data.get("latent_scores", {})

        for latent_id, score_info in latent_scores.items():
            # Add fuzz score
            fuzz_score = score_info.get("fuzz", {}).get("average_score")
            if fuzz_score is not None:
                feature_explainer_scores[latent_id][explainer_prefix]["fuzz"].append(fuzz_score)

            # Add detection score
            detection_score = score_info.get("detection", {}).get("average_score")
            if detection_score is not None:
                feature_explainer_scores[latent_id][explainer_prefix]["detection"].append(detection_score)

            # Add embedding score (only set once per explainer)
            embedding_score = score_info.get("embedding", {}).get("average_score")
            if embedding_score is not None and feature_explainer_scores[latent_id][explainer_prefix]["embedding"] is None:
                feature_explainer_scores[latent_id][explainer_prefix]["embedding"] = embedding_score

    # Now collect all values for global statistics
    all_embeddings = []
    all_fuzz_avgs = []
    all_detection_avgs = []

    for latent_id, explainers in feature_explainer_scores.items():
        for explainer_prefix, scores in explainers.items():
            # Embedding score (single value per explainer)
            if scores["embedding"] is not None:
                all_embeddings.append(scores["embedding"])

            # Average fuzz scores across scorers
            if scores["fuzz"]:
                avg_fuzz = np.mean(scores["fuzz"])
                all_fuzz_avgs.append(avg_fuzz)

            # Average detection scores across scorers
            if scores["detection"]:
                avg_detection = np.mean(scores["detection"])
                all_detection_avgs.append(avg_detection)

    # Calculate global statistics
    global_stats = {}

    if all_embeddings:
        global_stats["embedding"] = {
            "mean": float(np.mean(all_embeddings)),
            "std": float(np.std(all_embeddings, ddof=1))
        }

    if all_fuzz_avgs:
        global_stats["fuzz"] = {
            "mean": float(np.mean(all_fuzz_avgs)),
            "std": float(np.std(all_fuzz_avgs, ddof=1))
        }

    if all_detection_avgs:
        global_stats["detection"] = {
            "mean": float(np.mean(all_detection_avgs)),
            "std": float(np.std(all_detection_avgs, ddof=1))
        }

    print(f"\nGlobal Statistics:")
    for metric, stats in global_stats.items():
        print(f"  {metric}: mean={stats['mean']:.4f}, std={stats['std']:.4f}")

    return global_stats


def calculate_normalized_scores(
    scores: List[Dict],
    embeddings_data: Dict[str, Dict],
    global_stats: Dict[str, Dict[str, float]]
) -> List[Dict]:
    """
    Calculate z-scores for each metric per explainer.

    Args:
        scores: List of score dicts from build_scores_for_latent()
        embeddings_data: Embeddings data to get llm_explainer names
        global_stats: Global statistics from calculate_global_statistics()

    Returns:
        List of dicts with z-scores per explainer:
        [
            {
                "llm_explainer": "...",
                "z_score_embedding": 0.5,
                "z_score_fuzz": 0.3,
                "z_score_detection": 0.4
            },
            ...
        ]
    """
    # Extract explainer from data_source name
    def get_explainer_from_data_source(data_source: str) -> str:
        if "_e-" in data_source:
            return data_source.split("_e-")[0] + "_e"
        return data_source

    # Get explainer full names from embeddings data
    explainer_names = {}
    for data_source, data in embeddings_data.items():
        explainer_prefix = get_explainer_from_data_source(data_source)
        config = data.get("metadata", {}).get("config_used", {})
        llm_explainer = config.get("llm_explainer", "unknown")
        explainer_names[explainer_prefix] = llm_explainer

    # Group scores by explainer
    explainer_scores = defaultdict(lambda: {
        "embedding": None,
        "fuzz": [],
        "detection": []
    })

    for score in scores:
        data_source = score.get("data_source", "")
        explainer_prefix = get_explainer_from_data_source(data_source)

        # Collect embedding score
        if score.get("score_embedding") is not None:
            explainer_scores[explainer_prefix]["embedding"] = score["score_embedding"]

        # Collect fuzz scores
        if score.get("score_fuzz") is not None:
            explainer_scores[explainer_prefix]["fuzz"].append(score["score_fuzz"])

        # Collect detection scores
        if score.get("score_detection") is not None:
            explainer_scores[explainer_prefix]["detection"].append(score["score_detection"])

    # Calculate z-scores for each explainer
    normalized_scores = []

    for explainer_prefix, scores_dict in explainer_scores.items():
        llm_explainer = explainer_names.get(explainer_prefix, "unknown")

        norm_score = {
            "llm_explainer": llm_explainer,
            "z_score_embedding": None,
            "z_score_fuzz": None,
            "z_score_detection": None
        }

        # Z-score for embedding
        if scores_dict["embedding"] is not None and "embedding" in global_stats:
            stats = global_stats["embedding"]
            if stats["std"] > 0:
                norm_score["z_score_embedding"] = (scores_dict["embedding"] - stats["mean"]) / stats["std"]

        # Z-score for fuzz (average across scorers first)
        if scores_dict["fuzz"] and "fuzz" in global_stats:
            avg_fuzz = np.mean(scores_dict["fuzz"])
            stats = global_stats["fuzz"]
            if stats["std"] > 0:
                norm_score["z_score_fuzz"] = (avg_fuzz - stats["mean"]) / stats["std"]

        # Z-score for detection (average across scorers first)
        if scores_dict["detection"] and "detection" in global_stats:
            avg_detection = np.mean(scores_dict["detection"])
            stats = global_stats["detection"]
            if stats["std"] > 0:
                norm_score["z_score_detection"] = (avg_detection - stats["mean"]) / stats["std"]

        normalized_scores.append(norm_score)

    return normalized_scores


def calculate_overall_scores(normalized_scores: List[Dict]) -> List[Dict]:
    """
    Calculate overall score per explainer as average of z-scores.

    Args:
        normalized_scores: List of dicts from calculate_normalized_scores()

    Returns:
        List of dicts with overall scores per explainer:
        [
            {
                "llm_explainer": "...",
                "overall_score": 0.4
            },
            ...
        ]
    """
    overall_scores = []

    for norm_score in normalized_scores:
        z_scores = []

        # Collect non-null z-scores
        if norm_score["z_score_embedding"] is not None:
            z_scores.append(norm_score["z_score_embedding"])
        if norm_score["z_score_fuzz"] is not None:
            z_scores.append(norm_score["z_score_fuzz"])
        if norm_score["z_score_detection"] is not None:
            z_scores.append(norm_score["z_score_detection"])

        # Calculate average
        overall_score = None
        if len(z_scores) >= 2:  # Require at least 2 metrics
            overall_score = float(np.mean(z_scores))

        overall_scores.append({
            "llm_explainer": norm_score["llm_explainer"],
            "overall_score": overall_score
        })

    return overall_scores


def consolidate_latent_data(
    latent_id: str,
    sae_id: str,
    embeddings_data: Dict[str, Dict],
    scores_data: Dict[str, Dict],
    similarities_data: Dict[str, Dict],
    explanation_mapping: Dict[str, Dict[str, str]],
    global_stats: Dict[str, Dict[str, float]]
) -> Dict:
    """Consolidate all data for a single latent into detailed JSON format."""

    explanations = build_explanations_for_latent(latent_id, embeddings_data, explanation_mapping)
    semantic_similarities = build_semantic_similarities_for_latent(latent_id, similarities_data, explanation_mapping)
    scores = build_scores_for_latent(latent_id, scores_data)

    # Propagate embedding scores across all scorers for the same explainer
    propagate_embedding_scores(scores)

    # Calculate normalized z-scores per metric per explainer
    normalized_scores = calculate_normalized_scores(scores, embeddings_data, global_stats)

    # Calculate overall scores per explainer
    overall_scores = calculate_overall_scores(normalized_scores)

    detailed_json = {
        "feature_id": int(latent_id),
        "sae_id": sae_id,
        "explanations": explanations,
        "semantic_similarity_pairs": semantic_similarities,
        "scores": scores,
        "normalized_scores": normalized_scores,
        "overall_scores": overall_scores,
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
    similarities_dir = project_root / "data" / "semantic_similarities"

    # Create output directory
    sanitized_sae_id = sanitize_sae_id_for_path(sae_id)
    output_dir = project_root / "data" / "detailed_json" / sanitized_sae_id

    print(f"Output directory: {output_dir}")

    # Load all data
    print("\nLoading data...")
    embeddings_data = load_embeddings_data(embeddings_dir, sae_id)
    scores_data = load_scores_data(scores_dir, sae_id)
    similarities_data = load_semantic_similarities_data(similarities_dir, sae_id)

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
    print(f"Data sources - Embeddings: {len(embeddings_data)}, Scores: {len(scores_data)}, Similarities: {len(similarities_data)}")

    # Calculate global statistics for z-score normalization
    print("\nCalculating global statistics for normalization...")
    global_stats = calculate_global_statistics(scores_data, embeddings_data)

    # Process each latent
    successful_consolidations = 0

    for latent_id in sorted(all_latent_ids, key=int):
        try:
            latent_data = consolidate_latent_data(
                latent_id, sae_id, embeddings_data, scores_data,
                similarities_data, explanation_mapping, global_stats
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
        "data_sources_similarities": list(similarities_data.keys())
    }

    save_consolidation_config(config, sae_id, output_dir, stats)

    print(f"\nConsolidation completed!")
    print(f"Successfully processed: {successful_consolidations}/{len(all_latent_ids)} latents")
    print(f"Detailed JSON files saved to: {output_dir}")
    print(f"Config and stats saved to: {output_dir / 'config.json'}")


if __name__ == "__main__":
    main()