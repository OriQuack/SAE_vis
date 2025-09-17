#!/usr/bin/env python3
"""
Process latent scores from multiple scoring methods and generate summaries.
"""

import os
import json
import glob
import argparse
import statistics
import math
from pathlib import Path
from typing import List, Dict, Optional, Tuple


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


def extract_latent_id(filename: str) -> str:
    """Extract latent ID from filename (e.g., layers.30_latent123.txt -> 123)."""
    basename = os.path.basename(filename)
    start = basename.find("latent") + 6
    end = basename.find(".txt")
    return basename[start:end]


def load_score_file(filepath: str) -> Optional[Dict]:
    """Load score data from JSON-formatted text file."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read().strip()
            return json.loads(content)
    except (json.JSONDecodeError, FileNotFoundError) as e:
        print(f"Error loading {filepath}: {e}")
        return None


def process_latent_scores(score_data: Dict, method: str) -> Tuple[Optional[float], int, int, Optional[float]]:
    """
    Process scores for a single latent based on scoring method.

    Returns:
        - average_score: Average of valid scores (or accuracy for binary methods)
        - total_examples: Total number of examples
        - failure_count: Number of failed examples
        - variance: Variance of valid scores (None for binary methods)
    """
    if not score_data:
        return None, 0, 0, None

    if method == 'simulation':
        # Simulation method has ev_correlation_score for each example
        return process_simulation_scores(score_data)
    else:
        # Fuzz and detection methods have binary correct field
        return process_binary_scores(score_data)


def process_simulation_scores(score_data: Dict) -> Tuple[Optional[float], int, int, Optional[float]]:
    """Process simulation scores that have ev_correlation_score values."""
    if not isinstance(score_data, list):
        return None, 0, 0, None

    valid_scores = []
    failure_count = 0

    for item in score_data:
        if isinstance(item, dict) and 'ev_correlation_score' in item:
            score = item['ev_correlation_score']
            if score is not None:
                try:
                    score_float = float(score)
                    if not math.isnan(score_float) and math.isfinite(score_float):
                        valid_scores.append(score_float)
                    else:
                        failure_count += 1
                except (ValueError, TypeError):
                    failure_count += 1
            else:
                failure_count += 1
        else:
            failure_count += 1

    total_examples = len(score_data)

    if not valid_scores:
        return None, total_examples, failure_count, None

    average_score = statistics.mean(valid_scores)
    variance = statistics.variance(valid_scores) if len(valid_scores) > 1 else 0.0

    return average_score, total_examples, failure_count, variance


def process_binary_scores(score_data: Dict) -> Tuple[Optional[float], int, int, Optional[float]]:
    """Process binary scores (fuzz/detection) that have correct field."""
    if not isinstance(score_data, list):
        return None, 0, 0, None

    correct_count = 0
    failure_count = 0

    for item in score_data:
        if isinstance(item, dict) and 'correct' in item:
            correct_value = item['correct']
            if isinstance(correct_value, bool):
                if correct_value:
                    correct_count += 1
            else:
                failure_count += 1
        else:
            failure_count += 1

    total_examples = len(score_data)

    if total_examples == 0:
        return None, 0, 0, None

    # For binary methods, average_score is accuracy (proportion correct)
    accuracy = correct_count / (total_examples - failure_count) if (total_examples - failure_count) > 0 else None

    # Variance doesn't make sense for binary outcomes
    return accuracy, total_examples, failure_count, None


def get_score_files(scores_dir: str, method: str) -> List[str]:
    """Get all score files for a specific scoring method."""
    method_dir = os.path.join(scores_dir, method)
    if not os.path.exists(method_dir):
        return []

    pattern = os.path.join(method_dir, "layers.30_latent*.txt")
    files = glob.glob(pattern)
    return sorted(files)


def save_processed_scores(processed_data: Dict, output_dir: str, filename: str, config: Dict, sae_id: str) -> None:
    """Save processed scores data to JSON file and copy config."""
    os.makedirs(output_dir, exist_ok=True)

    # Save processed scores
    output_file = os.path.join(output_dir, filename)
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(processed_data, f, indent=2, ensure_ascii=False)

    # Save config file with sae_id in the same directory
    config_with_sae_id = config.copy()
    config_with_sae_id["sae_id"] = sae_id
    config_file = os.path.join(output_dir, "config.json")
    with open(config_file, "w", encoding="utf-8") as f:
        json.dump(config_with_sae_id, f, indent=2, ensure_ascii=False)

    print(f"Processed scores saved to: {output_file}")
    print(f"Config saved to: {config_file}")


def main():
    """Main function to process scores for all latents and scoring methods."""
    parser = argparse.ArgumentParser(description="Process latent scores from multiple scoring methods")
    parser.add_argument(
        "--config",
        default="../config/score_config.json",
        help="Path to configuration file (default: ../config/score_config.json)"
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
    data_source = config["data_source"]
    data_source_dir = project_root / "data" / "raw" / data_source
    scores_dir = data_source_dir / "scores"
    output_dir = project_root / "data" / "scores" / data_source

    print(f"Input directory: {scores_dir}")
    print(f"Output directory: {output_dir}")

    # Load run config and extract sae_id
    run_config = load_run_config(data_source_dir)
    sae_id = extract_sae_id(run_config)
    print(f"Extracted SAE ID: {sae_id}")

    # Validate input directory exists
    if not scores_dir.exists():
        print(f"Error: Scores directory does not exist: {scores_dir}")
        return

    # Process scores for each method
    processed_data = {
        "metadata": {
            "data_source": data_source,
            "scoring_methods": config["scoring_methods"],
            "sae_id": sae_id,
            "config_used": config,
        },
        "latent_scores": {}
    }

    all_latent_ids = set()

    # Collect all latent IDs across all methods
    for method in config["scoring_methods"]:
        score_files = get_score_files(str(scores_dir), method)
        for filepath in score_files:
            latent_id = extract_latent_id(filepath)
            all_latent_ids.add(latent_id)

    print(f"Found {len(all_latent_ids)} unique latents across all methods")

    # Process each latent for each method
    for latent_id in sorted(all_latent_ids):
        processed_data["latent_scores"][latent_id] = {}

        for method in config["scoring_methods"]:
            method_dir = scores_dir / method
            score_file = method_dir / f"layers.30_latent{latent_id}.txt"

            if score_file.exists():
                score_data = load_score_file(str(score_file))
                avg_score, total_examples, failure_count, variance = process_latent_scores(score_data, method)

                processed_data["latent_scores"][latent_id][method] = {
                    "average_score": avg_score,
                    "total_examples": total_examples,
                    "failure_count": failure_count,
                    "success_count": total_examples - failure_count,
                    "variance": variance
                }

                avg_str = f"{avg_score:.4f}" if avg_score is not None else "N/A"
                print(f"Latent {latent_id} - {method}: avg={avg_str}, "
                      f"examples={total_examples}, failures={failure_count}")
            else:
                processed_data["latent_scores"][latent_id][method] = {
                    "average_score": None,
                    "total_examples": 0,
                    "failure_count": 0,
                    "success_count": 0,
                    "variance": None
                }
                print(f"Latent {latent_id} - {method}: file not found")

    # Save results
    save_processed_scores(processed_data, str(output_dir), config["output_filename"], config, sae_id)

    # Print summary statistics
    total_latents = len(all_latent_ids)
    print(f"\nProcessing completed:")
    print(f"Total latents processed: {total_latents}")
    print(f"Scoring methods: {', '.join(config['scoring_methods'])}")


if __name__ == "__main__":
    main()