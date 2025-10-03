#!/usr/bin/env python3
"""
Generate 2D UMAP embeddings for SAE feature decoder vectors.

This script loads SAE decoder weights from HuggingFace and applies UMAP
dimensionality reduction to create 2D visualizations of feature relationships.
"""

import torch
import numpy as np
import json
import os
import argparse
import torch.nn as nn
from pathlib import Path
from typing import Dict, Optional
from huggingface_hub import hf_hub_download
import umap


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
) -> tuple[torch.Tensor, range]:
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


def generate_umap_embeddings(config: Dict) -> Dict:
    """
    Generate 2D UMAP embeddings from SAE decoder weights.

    Args:
        config: Configuration dictionary

    Returns:
        Dictionary with UMAP embeddings and metadata
    """
    # Extract configuration parameters
    model_name_or_path = config["model_name_or_path"]
    position = config["position"]
    feature_range = config["feature_range"]
    umap_params = config["umap_parameters"]

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

    # 3. Convert to numpy for UMAP
    decoder_weights_np = decoder_weights.cpu().numpy()
    print(f"Converted to numpy. Shape: {decoder_weights_np.shape}")

    # Clear GPU memory if using CUDA
    del decoder_weights, sae
    if device == "cuda":
        torch.cuda.empty_cache()

    # 4. Apply UMAP dimensionality reduction
    print("Applying UMAP dimensionality reduction...")
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

    embeddings_2d = reducer.fit_transform(decoder_weights_np)
    print(f"UMAP embeddings generated. Shape: {embeddings_2d.shape}")

    # 5. Prepare results
    print("Preparing results...")

    # Create feature-level data
    feature_data = []
    for i, feature_id in enumerate(feature_indices):
        feature_data.append({
            "feature_id": int(feature_id),
            "umap_x": float(embeddings_2d[i, 0]),
            "umap_y": float(embeddings_2d[i, 1])
        })

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

    results = {
        "metadata": {
            "description": "2D UMAP embeddings for SAE feature decoder vectors",
            "n_features": len(feature_indices),
            "feature_range": {
                "start": int(min(feature_indices)),
                "end": int(max(feature_indices) + 1),
                "total_features": len(feature_indices)
            },
            "model_info": {
                "model_name_or_path": model_name_or_path,
                "position": position
            },
            "umap_parameters": umap_params,
            "statistics": statistics
        },
        "feature_embeddings": feature_data,
        "config_used": config
    }

    print(f"X range: [{statistics['x_min']:.4f}, {statistics['x_max']:.4f}]")
    print(f"Y range: [{statistics['y_min']:.4f}, {statistics['y_max']:.4f}]")

    return results


def save_umap_results(
    results: Dict,
    output_dir: str,
    json_filename: str,
    config: Dict
) -> None:
    """Save UMAP results to JSON file and copy config."""
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
    """Main function to generate UMAP embeddings."""
    parser = argparse.ArgumentParser(description="Generate 2D UMAP embeddings for SAE features")
    parser.add_argument(
        "--config",
        default="../config/umap_config.json",
        help="Path to configuration file (default: ../config/umap_config.json)"
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
    output_dir = project_root / "data" / "umap" / sae_id

    print(f"Output directory: {output_dir}")

    try:
        # Generate UMAP embeddings
        print("Starting UMAP generation...")
        results = generate_umap_embeddings(config)

        # Save results
        save_umap_results(
            results,
            str(output_dir),
            config["output_filename"],
            config
        )

        print(f"\nCompleted successfully!")
        print(f"Processed {results['metadata']['feature_range']['total_features']} features")
        print(f"Results saved to: {output_dir}")

    except Exception as e:
        print(f"Error: {e}")
        raise


if __name__ == "__main__":
    main()
