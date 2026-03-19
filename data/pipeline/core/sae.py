"""
Self-contained SAE loading and forward hook utilities.

Reimplements the minimal subset needed from delphi/GemmaScope:
- JumpReluSae: Sparse autoencoder with jump ReLU activation
- collect_activations: Context manager for hooking model forward passes
- load_sae_and_hookpoint: Parse SAE ID, download weights, return (sae, hookpoint)
"""

import logging
import re
from contextlib import contextmanager
from typing import Any, Dict, List, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from huggingface_hub import hf_hub_download

logger = logging.getLogger(__name__)


class JumpReluSae(nn.Module):
    """GemmaScope Jump ReLU Sparse Autoencoder.

    Reference: https://colab.research.google.com/drive/17dQFYUYnuKnP6OwQPH9v_GSYUW5aj-Rp
    """

    def __init__(self, d_model: int, d_sae: int):
        super().__init__()
        self.W_enc = nn.Parameter(torch.zeros(d_model, d_sae))
        self.W_dec = nn.Parameter(torch.zeros(d_sae, d_model))
        self.threshold = nn.Parameter(torch.zeros(d_sae))
        self.b_enc = nn.Parameter(torch.zeros(d_sae))
        self.b_dec = nn.Parameter(torch.zeros(d_model))

    @property
    def num_features(self) -> int:
        return self.W_enc.shape[1]

    def encode(self, input_acts: torch.Tensor) -> torch.Tensor:
        """Encode activations through the SAE.

        Args:
            input_acts: (batch, d_model) or (batch, seq_len, d_model)

        Returns:
            Dense feature activations with same leading dims + d_sae last dim
        """
        pre_acts = input_acts @ self.W_enc + self.b_enc
        mask = pre_acts > self.threshold
        return mask * F.relu(pre_acts)

    @classmethod
    def from_pretrained(
        cls,
        repo_id: str,
        position: str,
        device: str = "cuda",
        dtype: torch.dtype = torch.bfloat16,
    ) -> "JumpReluSae":
        """Load SAE weights from HuggingFace.

        Args:
            repo_id: HuggingFace repo (e.g. "google/gemma-scope-9b-pt-res")
            position: Path within repo (e.g. "layer_30/width_16k/average_l0_120")
            device: Target device
            dtype: Target dtype

        Returns:
            Loaded JumpReluSae model
        """
        logger.info(f"Downloading SAE weights: {repo_id}/{position}/params.npz")
        path_to_params = hf_hub_download(
            repo_id=repo_id,
            filename=f"{position}/params.npz",
            force_download=False,
        )
        params = np.load(path_to_params)
        pt_params = {k: torch.from_numpy(v) for k, v in params.items()}

        d_model, d_sae = params["W_enc"].shape
        logger.info(f"SAE dimensions: d_model={d_model}, d_sae={d_sae}")

        model = cls(d_model, d_sae)
        model.load_state_dict(pt_params)
        model = model.to(device=device, dtype=dtype)
        return model


@contextmanager
def collect_activations(model: nn.Module, hookpoints: List[str]):
    """Context manager that hooks model forward pass and collects activations.

    Args:
        model: The transformer model to hook
        hookpoints: List of module names to collect activations from

    Yields:
        Dictionary mapping hookpoint names to their activation tensors
    """
    activations: Dict[str, torch.Tensor] = {}
    handles = []

    def create_hook(hookpoint: str):
        def hook_fn(_module: nn.Module, _input: Any, output: Any) -> None:
            if isinstance(output, tuple):
                activations[hookpoint] = output[0]
            else:
                activations[hookpoint] = output
        return hook_fn

    for name, module in model.named_modules():
        if name in hookpoints:
            handle = module.register_forward_hook(create_hook(name))
            handles.append(handle)
            logger.debug(f"Registered hook at: {name}")

    if len(handles) != len(hookpoints):
        registered = {name for name, _ in model.named_modules() if name in hookpoints}
        missing = set(hookpoints) - registered
        if missing:
            logger.warning(f"Could not find hookpoints: {missing}")

    try:
        yield activations
    finally:
        for handle in handles:
            handle.remove()


def load_sae_and_hookpoint(
    sae_id: str,
    device: str = "cuda",
    dtype: torch.dtype = torch.bfloat16,
) -> Tuple["JumpReluSae", str]:
    """Parse SAE ID, load weights, and determine the model hookpoint.

    Args:
        sae_id: Full SAE identifier
            e.g. "google/gemma-scope-9b-pt-res/layer_30/width_16k/average_l0_120"
        device: Target device
        dtype: Target dtype

    Returns:
        (sae, hookpoint) where hookpoint is the model module name to hook
    """
    # Parse SAE ID: "org/repo/layer_N/width_X/average_l0_Y"
    # Split into repo_id and position
    parts = sae_id.split("/")

    # repo_id is first two parts (org/repo), position is the rest
    repo_id = "/".join(parts[:2])
    position = "/".join(parts[2:])

    # Extract layer number from position for hookpoint
    layer_match = re.search(r"layer_(\d+)", position)
    if not layer_match:
        raise ValueError(f"Cannot extract layer number from SAE ID: {sae_id}")
    layer_num = int(layer_match.group(1))

    # Determine hookpoint type from repo name
    # Note: named_modules() uses "layers.N" not "model.layers.N"
    if "-res" in repo_id or "pt-res" in repo_id:
        hookpoint = f"layers.{layer_num}"
    elif "-mlp" in repo_id:
        hookpoint = f"layers.{layer_num}.post_feedforward_layernorm"
    else:
        hookpoint = f"layers.{layer_num}"
        logger.warning(f"Unknown SAE type in {repo_id}, defaulting to residual hookpoint")

    logger.info(f"SAE repo: {repo_id}, position: {position}, hookpoint: {hookpoint}")

    sae = JumpReluSae.from_pretrained(repo_id, position, device, dtype)
    return sae, hookpoint
