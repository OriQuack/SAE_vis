#!/usr/bin/env python3
"""
Pre-calculate LLM comparison consistency statistics.

This script calculates:
1. Explainer consistency: Mean cosine similarity between explanation embeddings
2. Scorer consistency: RV coefficient between scoring vectors
"""

import os
import json
import argparse
import numpy as np
from pathlib import Path
from typing import Dict, List, Tuple
from datetime import datetime
from collections import defaultdict


def load_config(config_path: str) -> Dict:
    """Load configuration from JSON file."""
    with open(config_path, 'r') as f:
        return json.load(f)


def sanitize_sae_id_for_path(sae_id: str) -> str:
    """Convert SAE ID to filesystem-safe directory name."""
    return sae_id.replace("/", "--")


def calculate_rv_coefficient(X: np.ndarray, Y: np.ndarray) -> float:
    """
    Calculate RV coefficient between two multivariate datasets.

    RV coefficient measures correlation between two matrices.
    Range: [0, 1] where 1 = perfect correlation, 0 = no correlation

    Args:
        X: First dataset (n_samples, n_features)
        Y: Second dataset (n_samples, n_features)

    Returns:
        RV coefficient value
    """
    # Find columns that have at least some valid data
    X_col_valid = ~np.all(np.isnan(X), axis=0)
    Y_col_valid = ~np.all(np.isnan(Y), axis=0)
    common_valid_cols = X_col_valid & Y_col_valid

    if not np.any(common_valid_cols):
        return 0.0  # No common valid columns

    # Use only columns that have some valid data in both
    X_filtered = X[:, common_valid_cols]
    Y_filtered = Y[:, common_valid_cols]

    # Remove rows where ANY value is NaN in the filtered columns
    valid_mask = ~(np.isnan(X_filtered).any(axis=1) | np.isnan(Y_filtered).any(axis=1))
    X_valid = X_filtered[valid_mask]
    Y_valid = Y_filtered[valid_mask]

    if len(X_valid) < 2:
        return 0.0  # Not enough valid data

    # Center the data
    X_centered = X_valid - np.nanmean(X_valid, axis=0)
    Y_centered = Y_valid - np.nanmean(Y_valid, axis=0)

    # Calculate cross-product matrices
    XX = X_centered @ X_centered.T
    YY = Y_centered @ Y_centered.T
    XY = X_centered @ Y_centered.T

    # Calculate RV coefficient
    numerator = np.trace(XY @ XY.T)
    denominator = np.sqrt(np.trace(XX @ XX.T) * np.trace(YY @ YY.T))

    if denominator == 0:
        return 0.0

    rv = numerator / denominator
    return float(np.clip(rv, 0.0, 1.0))  # Ensure in [0, 1] range


def calculate_explainer_consistency(semantic_distances_dir: Path, sae_id: str) -> Dict[str, float]:
    """
    Calculate explainer consistency from semantic distances.

    Returns dictionary with pairwise consistency scores (1 - cosine_distance).
    """
    print("\n=== Calculating Explainer Consistency ===")

    # Find semantic distances directory
    distances_files = list(semantic_distances_dir.glob("**/semantic_distances.json"))

    if not distances_files:
        raise FileNotFoundError(f"No semantic_distances.json found in {semantic_distances_dir}")

    # Load the semantic distances file
    distances_file = distances_files[0]  # Should be only one for this SAE
    print(f"Loading: {distances_file}")

    with open(distances_file, 'r') as f:
        data = json.load(f)

    # Verify SAE ID matches
    metadata = data.get("metadata", {})
    if metadata.get("sae_id_1") != sae_id:
        raise ValueError(f"SAE ID mismatch: expected {sae_id}, got {metadata.get('sae_id_1')}")

    # Extract pairwise distances
    pairwise_distances = data.get("pairwise_distances", {})

    consistency_scores = {}

    for pair_name, pair_data in pairwise_distances.items():
        source1 = pair_data.get("data_source_1", "")
        source2 = pair_data.get("data_source_2", "")
        distances = pair_data.get("distances", {})

        # Calculate mean cosine distance across all features
        cosine_distances = [
            d["distances"]["cosine"]
            for d in distances.values()
            if d.get("distances", {}).get("cosine") is not None
        ]

        if cosine_distances:
            mean_distance = sum(cosine_distances) / len(cosine_distances)
            consistency = 1.0 - mean_distance  # Convert distance to similarity

            # Create readable key
            source1_short = source1.split("_e-")[0]  # e.g., "llama"
            source2_short = source2.split("_e-")[0]  # e.g., "gwen"
            key = f"{source1_short}_vs_{source2_short}"

            consistency_scores[key] = round(consistency, 4)
            print(f"  {key}: {consistency:.4f} (from {len(cosine_distances)} features)")

    return consistency_scores


def load_scores_by_explainer_scorer(detailed_json_dir: Path, sae_id: str) -> Dict[str, Dict[str, np.ndarray]]:
    """
    Load all scores grouped by (explainer, scorer) combinations.

    Returns:
        {
            "explainer_name": {
                "scorer_name": np.array([[fuzz, detection, simulation, embedding], ...])
            }
        }
    """
    print("\n=== Loading Scores by Explainer-Scorer Combinations ===")

    # Find detailed JSON directory for this SAE
    sanitized_sae_id = sanitize_sae_id_for_path(sae_id)
    json_dir = detailed_json_dir / sanitized_sae_id

    if not json_dir.exists():
        raise FileNotFoundError(f"Detailed JSON directory not found: {json_dir}")

    # Load all feature JSON files
    json_files = sorted(json_dir.glob("feature_*.json"))
    print(f"Found {len(json_files)} feature files")

    # Data structure: explainer -> scorer -> list of score vectors
    scores_data = defaultdict(lambda: defaultdict(list))

    # Map data source to explainer name
    explainer_map = {
        "llama_e-llama_s": "llama",
        "llama_e-gwen_s": "llama",
        "llama_e-openai_s": "llama",
        "gwen_e-llama_s": "gwen",
        "gwen_e-gwen_s": "gwen",
        "gwen_e-openai_s": "gwen",
        "openai_e-llama_s": "openai",
        "openai_e-gwen_s": "openai",
        "openai_e-openai_s": "openai"
    }

    scorer_map = {
        "hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4": "llama",
        "Qwen/Qwen3-30B-A3B-Instruct-2507-FP8": "gwen",
        "openai/gpt-oss-20b": "openai"
    }

    for json_file in json_files:
        with open(json_file, 'r') as f:
            data = json.load(f)

        scores = data.get("scores", [])

        for score_entry in scores:
            data_source = score_entry.get("data_source", "")
            llm_scorer = score_entry.get("llm_scorer", "")

            explainer = explainer_map.get(data_source)
            scorer = scorer_map.get(llm_scorer)

            if not explainer or not scorer:
                continue

            # Extract score vector [fuzz, detection, simulation, embedding]
            score_vector = [
                score_entry.get("score_fuzz"),
                score_entry.get("score_detection"),
                score_entry.get("score_simulation"),
                score_entry.get("score_embedding")
            ]

            scores_data[explainer][scorer].append(score_vector)

    # Convert lists to numpy arrays
    result = {}
    for explainer, scorer_dict in scores_data.items():
        result[explainer] = {}
        for scorer, score_list in scorer_dict.items():
            result[explainer][scorer] = np.array(score_list, dtype=float)
            print(f"  {explainer} + {scorer}: {len(score_list)} features")

    return result


def calculate_scorer_consistency(scores_by_explainer_scorer: Dict[str, Dict[str, np.ndarray]]) -> Dict[str, Dict[str, float]]:
    """
    Calculate RV coefficient between scorer outputs for each explainer.

    Returns:
        {
            "explainer_name": {
                "scorer1_vs_scorer2": rv_coefficient
            }
        }
    """
    print("\n=== Calculating Scorer Consistency ===")

    consistency_scores = {}
    scorers = ["llama", "gwen", "openai"]

    for explainer, scorer_data in scores_by_explainer_scorer.items():
        consistency_scores[explainer] = {}

        # Calculate RV coefficient for all scorer pairs
        pairs = [
            ("llama", "gwen"),
            ("llama", "openai"),
            ("gwen", "openai")
        ]

        for scorer1, scorer2 in pairs:
            if scorer1 not in scorer_data or scorer2 not in scorer_data:
                print(f"  {explainer}: {scorer1} vs {scorer2} - Missing data, skipping")
                continue

            X = scorer_data[scorer1]
            Y = scorer_data[scorer2]

            # Ensure same number of samples
            min_samples = min(len(X), len(Y))
            X = X[:min_samples]
            Y = Y[:min_samples]

            rv = calculate_rv_coefficient(X, Y)
            key = f"{scorer1}_vs_{scorer2}"
            consistency_scores[explainer][key] = round(rv, 4)

            print(f"  {explainer}: {key} = {rv:.4f}")

    return consistency_scores


def save_llm_comparison_stats(
    output_dir: Path,
    output_filename: str,
    explainer_consistency: Dict[str, float],
    scorer_consistency: Dict[str, Dict[str, float]],
    config: Dict,
    sae_id: str
) -> None:
    """Save pre-calculated LLM comparison statistics to JSON file."""
    os.makedirs(output_dir, exist_ok=True)

    output_data = {
        "metadata": {
            "created_at": datetime.now().isoformat(),
            "sae_id": sae_id,
            "explainer_consistency_method": config.get("explainer_consistency_method", "cosine_similarity"),
            "scorer_consistency_method": config.get("scorer_consistency_method", "rv_coefficient"),
            "description": "Pre-calculated LLM comparison consistency statistics"
        },
        "explainer_consistency": explainer_consistency,
        "scorer_consistency": scorer_consistency
    }

    output_file = output_dir / output_filename
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)

    print(f"\n=== Results Saved ===")
    print(f"Output file: {output_file}")


def main():
    """Main function to calculate LLM comparison statistics."""
    parser = argparse.ArgumentParser(description="Calculate LLM comparison consistency statistics")
    parser.add_argument(
        "--config",
        default="../config/llm_comparison_config.json",
        help="Path to configuration file (default: ../config/llm_comparison_config.json)"
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
    print(f"Processing SAE ID: {sae_id}")

    # Setup paths
    semantic_distances_dir = project_root / config["semantic_distances_dir"]
    detailed_json_dir = project_root / config["detailed_json_dir"]
    output_dir = project_root / config["output_dir"]
    output_filename = config["output_filename"]

    # Calculate explainer consistency
    explainer_consistency = calculate_explainer_consistency(semantic_distances_dir, sae_id)

    # Load scores
    scores_by_explainer_scorer = load_scores_by_explainer_scorer(detailed_json_dir, sae_id)

    # Calculate scorer consistency
    scorer_consistency = calculate_scorer_consistency(scores_by_explainer_scorer)

    # Save results
    save_llm_comparison_stats(
        output_dir,
        output_filename,
        explainer_consistency,
        scorer_consistency,
        config,
        sae_id
    )

    print("\n=== Summary ===")
    print(f"Explainer consistency scores: {len(explainer_consistency)}")
    print(f"Scorer consistency scores: {sum(len(v) for v in scorer_consistency.values())}")
    print("\nLLM comparison statistics calculation complete!")


if __name__ == "__main__":
    main()
