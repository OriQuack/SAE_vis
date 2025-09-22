#!/usr/bin/env python3
"""
Compute feature similarities for SAE decoder weights using configurable parameters.
"""

import torch
import numpy as np
import json
import os
import argparse
import torch.nn as nn
from pathlib import Path
from typing import Dict, Tuple, Optional
from huggingface_hub import hf_hub_download


class JumpReluSae(nn.Module):
    def __init__(self, d_model, d_sae):
        super().__init__()
        self.W_enc = nn.Parameter(torch.zeros(d_model, d_sae))
        self.W_dec = nn.Parameter(torch.zeros(d_sae, d_model))
        self.threshold = nn.Parameter(torch.zeros(d_sae))
        self.b_enc = nn.Parameter(torch.zeros(d_sae))
        self.b_dec = nn.Parameter(torch.zeros(d_model))

    def encode(self, input_acts):
        pre_acts = input_acts @ self.W_enc + self.b_enc
        mask = pre_acts > self.threshold
        acts = mask * torch.nn.functional.relu(pre_acts)
        return acts

    def decode(self, acts):
        return acts @ self.W_dec + self.b_dec

    def forward(self, acts):
        acts = self.encode(acts)
        recon = self.decode(acts)
        return recon

    @classmethod
    def from_pretrained(cls, model_name_or_path, position, device):
        path_to_params = hf_hub_download(
            repo_id=model_name_or_path,
            filename=f"{position}/params.npz",
            force_download=False,
        )
        params = np.load(path_to_params)
        pt_params = {k: torch.from_numpy(v) for k, v in params.items()}
        model = cls(params["W_enc"].shape[0], params["W_enc"].shape[1])
        model.load_state_dict(pt_params)
        model = model.to(device)
        return model


def load_config(config_path: str) -> Dict:
    """Load configuration from JSON file."""
    with open(config_path, 'r') as f:
        return json.load(f)


def get_device(config_device: str) -> str:
    """Get appropriate device based on config and availability."""
    if config_device == "auto":
        return "cuda" if torch.cuda.is_available() else "cpu"
    return config_device


def apply_feature_range_filter(
    decoder_weights: torch.Tensor,
    feature_range: Dict[str, int]
) -> Tuple[torch.Tensor, range]:
    """
    Apply feature range filtering to decoder weights.

    Args:
        decoder_weights: Full decoder weight tensor
        feature_range: Dict with 'start' and 'end' keys

    Returns:
        Filtered decoder weights and the range object used for indexing
    """
    start = feature_range.get("start", 0)
    end = feature_range.get("end", decoder_weights.shape[0])

    # Ensure range is valid
    start = max(0, start)
    end = min(decoder_weights.shape[0], end)

    if start >= end:
        raise ValueError(f"Invalid feature range: start={start}, end={end}")

    feature_indices = range(start, end)
    filtered_weights = decoder_weights[start:end]

    print(f"Applied feature range filter: {start}-{end} ({len(feature_indices)} features)")

    return filtered_weights, feature_indices


def compute_feature_similarities(config: Dict) -> Dict:
    """
    Main function to compute feature similarities based on configuration.

    Args:
        config: Configuration dictionary

    Returns:
        Dictionary with similarity results and metadata
    """
    # Extract configuration parameters
    model_name_or_path = config["model_name_or_path"]
    position = config["position"]
    feature_range = config["feature_range"]
    use_float16 = config.get("use_float16", True)
    memory_warning_threshold = config.get("memory_warning_threshold_gb", 2.0)

    # Setup device
    device = get_device(config.get("device", "auto"))
    print(f"Using device: {device}")

    # 1. Load SAE model and extract decoder weights
    print(f"Loading SAE from {model_name_or_path} at {position} on {device}...")
    sae = JumpReluSae.from_pretrained(model_name_or_path, position, device)
    decoder_weights = sae.W_dec.detach()
    print(f"Decoder weights extracted. Shape: {decoder_weights.shape}")

    # 2. Apply feature range filtering
    decoder_weights, feature_indices = apply_feature_range_filter(decoder_weights, feature_range)
    print(f"Filtered decoder weights shape: {decoder_weights.shape}")

    # 3. Convert to float16 for memory efficiency if requested
    if use_float16:
        print("Converting to float16 for memory efficiency...")
        decoder_weights = decoder_weights.half()
        print("Memory usage reduced by ~50% with float16")

    # 4. Normalize embedding with L2
    print("Normalizing decoder weights with L2 norm...")
    normalized_weights = torch.nn.functional.normalize(decoder_weights, p=2, dim=1)
    print(f"Normalized weights shape: {normalized_weights.shape}")

    # Clear original decoder_weights to free memory
    del decoder_weights
    if device == "cuda":
        torch.cuda.empty_cache()

    # 5. Compute all pairwise cosine similarity
    print("Computing pairwise cosine similarity...")

    # Check matrix size and warn if large
    n_features = normalized_weights.shape[0]
    matrix_size_gb = (n_features * n_features * 2) / (1024**3)  # float16 = 2 bytes
    print(f"Estimated similarity matrix size: {matrix_size_gb:.2f} GB")

    if matrix_size_gb > memory_warning_threshold:
        print(f"Warning: Large matrix detected ({matrix_size_gb:.2f} GB > {memory_warning_threshold:.2f} GB threshold)")
        print("Consider using a smaller feature range for very large matrices.")

    # Since the vectors are normalized, the dot product is the cosine similarity
    cosine_similarity_matrix = normalized_weights @ normalized_weights.T
    print(f"Cosine similarity matrix shape: {cosine_similarity_matrix.shape}")

    # 6. Find maximum cosine similarity for each feature
    print("Computing maximum cosine similarity for each feature...")

    # Set diagonal to a very negative value to exclude self-similarity (which is 1.0)
    cosine_similarity_matrix.fill_diagonal_(float("-inf"))

    # Find maximum cosine similarity for each feature
    max_indices = torch.argmax(cosine_similarity_matrix, dim=1)
    nearest_similarities = cosine_similarity_matrix[
        torch.arange(cosine_similarity_matrix.shape[0]), max_indices
    ]
    print(f"Nearest similarities shape: {nearest_similarities.shape}")

    # Map indices back to original feature IDs (accounting for feature range filtering)
    source_feature_ids = list(feature_indices)
    closest_feature_ids = [feature_indices[idx] for idx in max_indices.cpu().numpy()]

    print(f"Source feature IDs range: {min(source_feature_ids)} to {max(source_feature_ids)}")
    print(f"Closest feature IDs range: {min(closest_feature_ids)} to {max(closest_feature_ids)}")

    # Convert to CPU and numpy for JSON serialization
    nearest_similarities_np = nearest_similarities.cpu().numpy()

    # Clear normalized_weights to free memory before saving
    del normalized_weights, cosine_similarity_matrix
    if device == "cuda":
        torch.cuda.empty_cache()

    # 7. Prepare results
    print("Preparing results...")

    # Create detailed feature mapping
    feature_mappings = []
    for i, source_feature_id in enumerate(source_feature_ids):
        feature_mappings.append({
            "source_feature_id": int(source_feature_id),
            "closest_feature_id": int(closest_feature_ids[i]),
            "cosine_similarity": float(nearest_similarities_np[i]),
        })

    # Calculate statistics
    statistics = {
        "min_magnitude": float(np.abs(nearest_similarities_np).min()),
        "max_magnitude": float(np.abs(nearest_similarities_np).max()),
        "mean_magnitude": float(np.abs(nearest_similarities_np).mean()),
        "min_value": float(nearest_similarities_np.min()),
        "max_value": float(nearest_similarities_np.max()),
        "mean_value": float(nearest_similarities_np.mean()),
    }

    results = {
        "n_features": int(n_features),
        "feature_range": {
            "start": int(min(source_feature_ids)),
            "end": int(max(source_feature_ids) + 1),
            "total_features": len(source_feature_ids)
        },
        "description": "Maximum cosine similarity for each SAE feature",
        "model_info": {
            "model_name_or_path": model_name_or_path,
            "position": position
        },
        "feature_mappings": feature_mappings,
        "statistics": statistics,
        "config_used": config
    }

    print(f"Min similarity: {statistics['min_value']:.6f}")
    print(f"Max similarity: {statistics['max_value']:.6f}")
    print(f"Mean similarity: {statistics['mean_value']:.6f}")
    print(f"Value range: [{statistics['min_value']:.6f}, {statistics['max_value']:.6f}]")

    return results


def save_feature_similarities(
    results: Dict,
    output_dir: str,
    json_filename: str,
    config: Dict
) -> None:
    """Save feature similarity results to JSON file and copy config."""
    os.makedirs(output_dir, exist_ok=True)

    # Save JSON results
    json_output_file = os.path.join(output_dir, json_filename)
    with open(json_output_file, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"Saved results to: {json_output_file}")

    # Save config file in the same directory
    config_file = os.path.join(output_dir, "config.json")
    with open(config_file, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)
    print(f"Config saved to: {config_file}")


def main():
    """Main function to compute feature similarities."""
    parser = argparse.ArgumentParser(description="Compute SAE feature similarities")
    parser.add_argument(
        "--config",
        default="../config/feature_similarity_config.json",
        help="Path to configuration file (default: ../config/feature_similarity_config.json)"
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

    # Setup output directory
    sae_id = config["sae_id"]
    output_dir = project_root / "data" / "feature_similarity" / sae_id

    print(f"Output directory: {output_dir}")

    try:
        # Compute feature similarities
        print("Starting feature similarity computation...")
        results = compute_feature_similarities(config)

        # Save results
        save_feature_similarities(
            results,
            str(output_dir),
            config["output_filename"],
            config
        )

        print(f"\nCompleted successfully!")
        print(f"Processed {results['feature_range']['total_features']} features")
        print(f"Results saved to: {output_dir}")

    except Exception as e:
        print(f"Error: {e}")
        raise


if __name__ == "__main__":
    main()