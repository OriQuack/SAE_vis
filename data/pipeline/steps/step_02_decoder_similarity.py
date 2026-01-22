#!/usr/bin/env python3
"""
Step 2: Compute Decoder Weight Similarities

This step computes cosine similarities between SAE decoder weight vectors
to identify features with similar decoder patterns.

Input:
- SAE model from HuggingFace Hub

Output:
- decoder_similarity_matrix.npz: Contains full similarity matrix + top-k indices/values

Features:
- Downloads SAE model from HuggingFace
- Computes pairwise cosine similarity efficiently
- Stores full matrix and top-10 neighbors
- GPU-accelerated when available
"""

import logging
from pathlib import Path
from typing import Optional

import numpy as np

# Add parent directory to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.base import BaseProcessor, load_yaml_config
from core.logging import setup_logging

# Lazy imports for heavy dependencies
torch = None
nn = None
hf_hub_download = None

logger = logging.getLogger(__name__)


def lazy_import_torch():
    """Lazy import PyTorch dependencies."""
    global torch, nn, hf_hub_download

    if torch is None:
        logger.info("Importing PyTorch...")
        import torch as _torch
        import torch.nn as _nn
        torch = _torch
        nn = _nn

        logger.info("Importing huggingface_hub...")
        from huggingface_hub import hf_hub_download as _hf
        hf_hub_download = _hf


class JumpReluSae(object):
    """Minimal SAE class for loading decoder weights."""

    def __init__(self, d_model: int, d_sae: int):
        self.W_enc = None
        self.W_dec = None
        self.threshold = None
        self.b_enc = None
        self.b_dec = None

    @classmethod
    def from_pretrained(cls, model_name_or_path: str, position: str, device: str):
        """Load pre-trained SAE from HuggingFace Hub."""
        lazy_import_torch()

        path_to_params = hf_hub_download(
            repo_id=model_name_or_path,
            filename=f"{position}/params.npz",
            force_download=False,
        )
        params = np.load(path_to_params)

        model = cls(params["W_enc"].shape[0], params["W_enc"].shape[1])
        model.W_dec = torch.from_numpy(params["W_dec"]).to(device)

        return model


class DecoderSimilarityProcessor(BaseProcessor):
    """Compute decoder weight similarities for SAE features."""

    @property
    def step_name(self) -> str:
        return "Step 2: Decoder Similarity"

    @property
    def version(self) -> str:
        return "2.0"

    def _init_paths(self) -> None:
        """Initialize paths from configuration."""
        super()._init_paths()

        global_config = self.config.get("global", {})
        paths = global_config.get("paths", {})
        processing = global_config.get("processing", {})

        # Input configuration
        inputs = self.config.get("inputs", {})
        self.model_name = inputs.get("model", "google/gemma-scope-9b-pt-res")
        self.position = inputs.get("position", "layer_30/width_16k/average_l0_120")

        # Output path (single NPZ file with all data)
        intermediate_dir = paths.get("intermediate", "data/intermediate")

        self.output_path = self._resolve_path(
            f"{intermediate_dir}/decoder_similarity_matrix.npz"
        )

        # Processing parameters
        params = self.config.get("parameters", {})
        feature_range = processing.get("feature_range", {})

        self.proc_params = {
            "device": params.get("device", "auto"),
            "use_float16": params.get("use_float16", False),
            "memory_warning_threshold_gb": params.get("memory_warning_threshold_gb", 2.0),
            "feature_range_start": feature_range.get("start", 0),
            "feature_range_end": feature_range.get("end", processing.get("num_features", 16384)),
            "top_k": 10,
        }

        # Statistics tracking
        self.stats = {
            "n_features": 0,
            "matrix_size_gb": 0.0,
            "top_1_mean_similarity": 0.0,
            "top_1_max_similarity": 0.0
        }

    def _get_device(self) -> str:
        """Get appropriate device based on config and availability."""
        lazy_import_torch()

        device = self.proc_params["device"]
        if device == "auto":
            return "cuda" if torch.cuda.is_available() else "cpu"
        return device

    def process(self) -> None:
        """Execute the main processing logic."""
        lazy_import_torch()

        device = self._get_device()
        logger.info(f"Using device: {device}")

        # Load SAE model
        logger.info(f"Loading SAE from {self.model_name} at {self.position}")
        sae = JumpReluSae.from_pretrained(self.model_name, self.position, device)
        decoder_weights = sae.W_dec.detach()
        logger.info(f"Decoder weights shape: {decoder_weights.shape}")

        # Apply feature range filter if needed
        start = self.proc_params["feature_range_start"]
        end = min(self.proc_params["feature_range_end"], decoder_weights.shape[0])

        if self.feature_limit is not None:
            end = min(self.feature_limit, end)

        decoder_weights = decoder_weights[start:end]
        feature_indices = range(start, end)
        logger.info(f"Processing features {start} to {end} ({len(feature_indices)} features)")

        # Convert to float16 if requested
        if self.proc_params["use_float16"]:
            logger.info("Converting to float16 for memory efficiency")
            decoder_weights = decoder_weights.half()

        # Normalize weights (L2 norm)
        logger.info("Normalizing decoder weights")
        normalized_weights = torch.nn.functional.normalize(decoder_weights, p=2, dim=1)

        # Check matrix size
        n_features = normalized_weights.shape[0]
        matrix_size_gb = (n_features * n_features * 4) / (1024**3)
        self.stats["n_features"] = n_features
        self.stats["matrix_size_gb"] = matrix_size_gb
        logger.info(f"Estimated similarity matrix size: {matrix_size_gb:.2f} GB")

        if matrix_size_gb > self.proc_params["memory_warning_threshold_gb"]:
            logger.warning(f"Large matrix detected ({matrix_size_gb:.2f} GB)")

        # Compute cosine similarity (dot product of normalized vectors)
        logger.info("Computing pairwise cosine similarity")
        similarity_matrix = normalized_weights @ normalized_weights.T

        # Convert to numpy before modifying
        similarity_np = similarity_matrix.cpu().numpy()

        # Find top-k similarities (set diagonal to -inf temporarily)
        similarity_matrix.fill_diagonal_(float("-inf"))
        top_k = self.proc_params["top_k"]
        logger.info(f"Finding top-{top_k} similar features")
        top_k_values, top_k_indices = torch.topk(similarity_matrix, k=top_k, dim=1)

        # Calculate statistics
        top_k_values_np = top_k_values.cpu().numpy()
        top_k_indices_np = top_k_indices.cpu().numpy()
        top_1_values = top_k_values_np[:, 0]
        self.stats["top_1_mean_similarity"] = float(top_1_values.mean())
        self.stats["top_1_max_similarity"] = float(top_1_values.max())

        logger.info(f"Top-1 mean similarity: {self.stats['top_1_mean_similarity']:.4f}")
        logger.info(f"Top-1 max similarity: {self.stats['top_1_max_similarity']:.4f}")

        # Save all data to single NPZ file
        logger.info(f"Saving similarity data to {self.output_path}")
        self.output_path.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(
            self.output_path,
            cosine_similarity=similarity_np,  # Full matrix (diagonal = 1.0)
            top_k_indices=top_k_indices_np,   # [n_features, top_k] indices
            top_k_values=top_k_values_np,     # [n_features, top_k] similarities
            feature_ids=np.array(list(feature_indices), dtype=np.int32)
        )
        logger.info(f"Saved {self.output_path.name} ({self.output_path.stat().st_size / 1024 / 1024:.1f} MB)")

        return None

    def run(self) -> None:
        """Override run to handle non-DataFrame output."""
        logger.info(f"Starting {self.step_name} v{self.version}")
        self.process()
        logger.info(f"Completed {self.step_name}")
        logger.info(f"Statistics: {self.stats}")


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Compute decoder weight similarities")
    parser.add_argument("--config", type=str, help="Path to configuration file")
    parser.add_argument("--limit", type=int, help="Limit number of features (for testing)")

    args = parser.parse_args()

    setup_logging()

    if args.config:
        full_config = load_yaml_config(args.config)
        # Extract step-specific config if present
        config = full_config.get("steps", {}).get("step_02_decoder_similarity", {})
        if not config:
            # Fallback: treat entire config as step config (legacy format)
            config = full_config
        config["sae_id"] = full_config.get("global", {}).get("sae_id_sanitized", "")
        config["global"] = full_config.get("global", {})
    else:
        config_path = Path(__file__).parent.parent / "config.yaml"
        if config_path.exists():
            full_config = load_yaml_config(config_path)
            config = full_config.get("steps", {}).get("step_02_decoder_similarity", {})
            config["sae_id"] = full_config.get("global", {}).get("sae_id_sanitized", "")
            config["global"] = full_config.get("global", {})
        else:
            config = {}

    processor = DecoderSimilarityProcessor(config, feature_limit=args.limit)
    processor.run()


if __name__ == "__main__":
    main()
