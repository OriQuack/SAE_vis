#!/usr/bin/env python3
"""
Step 15: Shuffle Verification of SAE Feature Activations

Measures how much local syntax (word order within a window) and broader context
(tokens outside the window) contribute to each SAE feature's activation.

For each of 8 displayed activation examples per feature:
- Inner shuffle: permute word groups within a span, keep activated word fixed
- Outer random: replace tokens outside the span with random vocabulary tokens
- Measure activation change at the same position

Input:
- activation_display.parquet: Displayed examples (8 per feature from step_10)
- activation_examples.parquet: Raw tokens + activation values

Output:
- shuffle_verification.parquet: Per-feature inner/outer ratios at window sizes [3, 11]
"""

import logging
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple

import polars as pl
import torch
from tqdm import tqdm
from transformers import AutoModel, AutoTokenizer

# Enable string cache for categorical operations
pl.enable_string_cache()

# Add parent directory to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.base import BaseProcessor, load_yaml_config
from core.logging import setup_logging
from core.sae import collect_activations, load_sae_and_hookpoint
from core.shuffle import (
    build_word_groups,
    compute_word_aligned_span,
    create_inner_shuffle,
    create_outer_random,
    find_activated_word_group,
)

logger = logging.getLogger(__name__)


@dataclass
class ModifiedSequence:
    """A single modified token sequence ready for forward pass."""
    token_ids: List[int]
    feature_id: int
    position: int             # Model-space position (with BOS offset)
    original_activation: float
    window_size: int          # 3 or 11
    mod_type: str             # "inner" or "outer"
    example_idx: int          # 0-7
    prompt_id: int
    result_activation: float = 0.0


class ShuffleVerificationProcessor(BaseProcessor):
    """Measure syntax vs context contribution via shuffle verification."""

    @property
    def step_name(self) -> str:
        return "Step 15: Shuffle Verification"

    @property
    def version(self) -> str:
        return "1.0"

    def _init_paths(self) -> None:
        """Initialize paths from configuration."""
        super()._init_paths()

        global_config = self.config.get("global", {})
        paths = global_config.get("paths", {})
        intermediate_dir = paths.get("intermediate", "data/intermediate")
        output_dir = paths.get("output", "data/output")

        # Input paths
        self.display_path = self._resolve_path(f"{output_dir}/activation_display.parquet")
        self.examples_path = self._resolve_path(f"{intermediate_dir}/activation_examples.parquet")

        # Output path
        self.output_path = self._resolve_path(f"{output_dir}/shuffle_verification.parquet")

        # Parameters
        params = self.config.get("parameters", {})
        self.model_name = params.get("model_name", "google/gemma-2-9b")
        self.sae_id_full = params.get(
            "sae_id",
            self.config.get("global", {}).get(
                "sae_id", "google/gemma-scope-9b-pt-res/layer_30/width_16k/average_l0_120"
            ),
        )
        self.window_sizes = params.get("window_sizes", [3, 11])
        self.batch_size = params.get("batch_size", 128)
        self.seed = params.get("seed", 42)

        # Statistics
        self.stats = {
            "features_processed": 0,
            "examples_processed": 0,
            "modifications_generated": 0,
            "forward_passes": 0,
            "features_skipped": 0,
        }

    def _load_model_and_sae(self) -> None:
        """Load the transformer model, SAE, and tokenizer."""
        logger.info(f"Loading model: {self.model_name}")
        if torch.cuda.is_bf16_supported():
            dtype = torch.bfloat16
        else:
            dtype = torch.float16

        self.model = AutoModel.from_pretrained(
            self.model_name,
            device_map={"": "cuda"},
            dtype=dtype,
        )
        self.model.eval()

        logger.info(f"Loading SAE: {self.sae_id_full}")
        self.sae, self.hookpoint = load_sae_and_hookpoint(
            self.sae_id_full, device="cuda", dtype=dtype
        )
        self.sae.eval()

        logger.info(f"Loading tokenizer: {self.model_name}")
        self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)

        logger.info(
            f"Model loaded. Hookpoint: {self.hookpoint}, "
            f"SAE features: {self.sae.num_features}, "
            f"Vocab size: {self.tokenizer.vocab_size}"
        )

    def _get_display_examples(self) -> Dict[int, List[Dict]]:
        """Get the 8 displayed examples per feature from activation_display + activation_examples.

        Returns:
            Dict mapping feature_id to list of example dicts with:
            - prompt_id, prompt_tokens (original), max_activation, max_token_position
        """
        logger.info(f"Loading display data from {self.display_path}")
        display_df = pl.read_parquet(self.display_path)

        logger.info(f"Loading activation examples from {self.examples_path}")
        examples_df = pl.read_parquet(self.examples_path)

        # Build lookup: (feature_id, prompt_id) -> example row
        examples_lookup: Dict[Tuple[int, int], Dict] = {}
        for row in examples_df.to_dicts():
            key = (row["feature_id"], row["prompt_id"])
            examples_lookup[key] = row

        # Extract displayed (feature_id, prompt_id) pairs from quantile_examples
        result: Dict[int, List[Dict]] = {}
        skipped = 0

        for row in display_df.to_dicts():
            feature_id = row["feature_id"]
            quantile_examples = row.get("quantile_examples", [])

            if not quantile_examples:
                continue

            examples = []
            for qe in quantile_examples:
                prompt_id = qe["prompt_id"]
                key = (feature_id, prompt_id)
                ex_row = examples_lookup.get(key)

                if ex_row is None:
                    skipped += 1
                    continue

                examples.append({
                    "prompt_id": prompt_id,
                    "prompt_tokens": ex_row.get("prompt_tokens", []),
                    "max_activation": ex_row.get("max_activation", 0.0),
                    "max_token_position": ex_row.get("max_token_position", 0),
                    "activation_pairs": ex_row.get("activation_pairs", []),
                })

            if examples:
                result[feature_id] = examples

        logger.info(
            f"Loaded {sum(len(v) for v in result.values()):,} examples "
            f"across {len(result):,} features (skipped {skipped:,} missing)"
        )
        return result

    def _prepare_modifications(
        self, feature_examples: Dict[int, List[Dict]]
    ) -> List[ModifiedSequence]:
        """Generate all modified sequences for forward passes.

        Args:
            feature_examples: Dict mapping feature_id to example list

        Returns:
            Flat list of ModifiedSequence ready for batched inference
        """
        modifications = []
        base_rng = random.Random(self.seed)
        bos_id = self.tokenizer.bos_token_id

        for feature_id, examples in feature_examples.items():
            for ex_idx, ex in enumerate(examples):
                prompt_tokens = ex["prompt_tokens"]
                if not prompt_tokens:
                    continue

                # Convert tokens to IDs
                token_ids = self.tokenizer.convert_tokens_to_ids(prompt_tokens)

                # Prepend BOS
                if bos_id is not None:
                    token_ids = [bos_id] + token_ids
                    # Position in model-space (shifted by 1 for BOS)
                    model_pos = ex["max_token_position"] + 1
                else:
                    model_pos = ex["max_token_position"]

                orig_activation = ex["max_activation"] or 0.0

                # Build word groups (on original tokens, no BOS)
                word_groups = build_word_groups(prompt_tokens)
                activated_group_idx = find_activated_word_group(
                    word_groups, ex["max_token_position"]
                )

                if activated_group_idx < 0:
                    continue

                for window_size in self.window_sizes:
                    # Compute word-aligned span (in prompt-token space, no BOS)
                    span_start, span_end = compute_word_aligned_span(
                        word_groups,
                        ex["max_token_position"],
                        window_size,
                        len(prompt_tokens),
                    )

                    # Deterministic seed per (feature, example, window)
                    seed = base_rng.randint(0, 2**31 - 1)

                    # Inner shuffle
                    inner_rng = random.Random(seed)
                    # Work in prompt-token space (no BOS), then prepend BOS
                    inner_ids = create_inner_shuffle(
                        token_ids[1:] if bos_id is not None else token_ids,
                        span_start,
                        span_end,
                        word_groups,
                        activated_group_idx,
                        inner_rng,
                    )
                    if bos_id is not None:
                        inner_ids = [bos_id] + inner_ids

                    modifications.append(ModifiedSequence(
                        token_ids=inner_ids,
                        feature_id=feature_id,
                        position=model_pos,
                        original_activation=orig_activation,
                        window_size=window_size,
                        mod_type="inner",
                        example_idx=ex_idx,
                        prompt_id=ex["prompt_id"],
                    ))

                    # Outer random (work in model-space with BOS)
                    outer_rng = random.Random(seed + 1)
                    # Shift span to model-space
                    model_span_start = span_start + (1 if bos_id is not None else 0)
                    model_span_end = span_end + (1 if bos_id is not None else 0)
                    outer_ids = create_outer_random(
                        token_ids,
                        model_span_start,
                        model_span_end,
                        self.tokenizer.vocab_size,
                        outer_rng,
                    )

                    modifications.append(ModifiedSequence(
                        token_ids=outer_ids,
                        feature_id=feature_id,
                        position=model_pos,
                        original_activation=orig_activation,
                        window_size=window_size,
                        mod_type="outer",
                        example_idx=ex_idx,
                        prompt_id=ex["prompt_id"],
                    ))

        self.stats["modifications_generated"] = len(modifications)
        logger.info(f"Generated {len(modifications):,} modified sequences")
        return modifications

    def _run_batched_forward_passes(self, modifications: List[ModifiedSequence]) -> None:
        """Run batched forward passes and fill result_activation for each modification.

        Args:
            modifications: List of ModifiedSequence (mutated in place)
        """
        total = len(modifications)
        num_batches = (total + self.batch_size - 1) // self.batch_size
        logger.info(
            f"Running {total:,} forward passes in {num_batches:,} batches "
            f"(batch_size={self.batch_size})"
        )

        pad_id = self.tokenizer.pad_token_id
        if pad_id is None:
            pad_id = 0

        for batch_start in tqdm(range(0, total, self.batch_size), desc="Forward passes"):
            batch = modifications[batch_start : batch_start + self.batch_size]
            batch_len = len(batch)

            # Find max sequence length in this batch
            max_len = max(len(mod.token_ids) for mod in batch)

            # Pad sequences and create attention mask
            input_ids = torch.full(
                (batch_len, max_len), pad_id, dtype=torch.long, device="cuda"
            )
            attention_mask = torch.zeros(
                (batch_len, max_len), dtype=torch.long, device="cuda"
            )

            for i, mod in enumerate(batch):
                seq_len = len(mod.token_ids)
                input_ids[i, :seq_len] = torch.tensor(mod.token_ids, dtype=torch.long)
                attention_mask[i, :seq_len] = 1

            # Forward pass
            with torch.no_grad():
                with collect_activations(self.model, [self.hookpoint]) as activations:
                    self.model(input_ids=input_ids, attention_mask=attention_mask)

                    raw_act = activations[self.hookpoint]
                    # raw_act: (batch, seq_len, d_model)

                    # Encode through SAE
                    orig_shape = raw_act.shape
                    flat_act = raw_act.reshape(-1, orig_shape[-1])
                    sae_act = self.sae.encode(flat_act)
                    sae_act = sae_act.reshape(orig_shape[0], orig_shape[1], -1)
                    # sae_act: (batch, seq_len, num_features)

                    # Extract activations
                    for i, mod in enumerate(batch):
                        mod.result_activation = sae_act[
                            i, mod.position, mod.feature_id
                        ].item()

            self.stats["forward_passes"] += batch_len

    def _compute_results(
        self, modifications: List[ModifiedSequence]
    ) -> pl.DataFrame:
        """Compute ratios and aggregate into per-feature DataFrame.

        Args:
            modifications: List of ModifiedSequence with result_activation filled

        Returns:
            DataFrame with one row per feature
        """
        # Group by feature
        feature_data: Dict[int, Dict] = {}

        for mod in modifications:
            fid = mod.feature_id
            if fid not in feature_data:
                feature_data[fid] = {"examples": {}}

            ex_key = mod.example_idx
            if ex_key not in feature_data[fid]["examples"]:
                feature_data[fid]["examples"][ex_key] = {
                    "prompt_id": mod.prompt_id,
                    "original_activation": mod.original_activation,
                    "max_token_position": mod.position,
                }

            # Compute ratio
            orig = mod.original_activation
            if abs(orig) < 1e-6:
                ratio = 0.0
            else:
                ratio = (orig - mod.result_activation) / orig

            key = f"window_{mod.window_size}_{mod.mod_type}_ratio"
            feature_data[fid]["examples"][ex_key][key] = ratio

        # Build rows
        rows = []
        for feature_id, data in sorted(feature_data.items()):
            examples = data["examples"]

            per_example = []
            ratios = {
                f"window_{w}_{t}": []
                for w in self.window_sizes
                for t in ["inner", "outer"]
            }

            for ex_idx in sorted(examples.keys()):
                ex = examples[ex_idx]
                per_example.append({
                    "example_idx": ex_idx,
                    "prompt_id": ex["prompt_id"],
                    "original_activation": ex["original_activation"],
                    "max_token_position": ex["max_token_position"],
                    **{
                        f"window_{w}_{t}_ratio": ex.get(f"window_{w}_{t}_ratio", 0.0)
                        for w in self.window_sizes
                        for t in ["inner", "outer"]
                    },
                })

                for w in self.window_sizes:
                    for t in ["inner", "outer"]:
                        key = f"window_{w}_{t}"
                        val = ex.get(f"{key}_ratio", 0.0)
                        ratios[key].append(val)

            # Aggregated means
            row = {
                "feature_id": feature_id,
                "sae_id": self.sae_id,
                "per_example": per_example,
            }
            for key, vals in ratios.items():
                row[f"{key}_mean_ratio"] = (
                    sum(vals) / len(vals) if vals else 0.0
                )

            rows.append(row)
            self.stats["features_processed"] += 1

        logger.info(f"Computed results for {len(rows):,} features")

        # Create DataFrame
        df = pl.DataFrame(rows)
        if len(df) > 0:
            df = df.with_columns([
                pl.col("feature_id").cast(pl.UInt32),
                pl.col("sae_id").cast(pl.Categorical),
            ])
        return df

    def process(self) -> pl.DataFrame:
        """Execute the shuffle verification pipeline."""
        # Load model and SAE
        self._load_model_and_sae()

        # Get displayed examples
        feature_examples = self._get_display_examples()

        # Apply feature limit
        if self.feature_limit is not None:
            limited = dict(list(feature_examples.items())[:self.feature_limit])
            feature_examples = limited
            logger.info(f"Limited to {self.feature_limit} features")

        self.stats["examples_processed"] = sum(
            len(v) for v in feature_examples.values()
        )

        # Prepare modifications
        modifications = self._prepare_modifications(feature_examples)

        # Run forward passes
        self._run_batched_forward_passes(modifications)

        # Compute results
        return self._compute_results(modifications)


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Shuffle verification of SAE feature activations"
    )
    parser.add_argument("--config", type=str, help="Path to configuration file")
    parser.add_argument(
        "--limit", type=int, help="Limit number of features (for testing)"
    )

    args = parser.parse_args()

    # Setup logging
    setup_logging()

    # Load config
    if args.config:
        full_config = load_yaml_config(args.config)
        config = full_config.get("steps", {}).get("step_15_shuffle_verification", {})
        if not config:
            config = full_config
        config["sae_id"] = full_config.get("global", {}).get("sae_id_sanitized", "")
        config["global"] = full_config.get("global", {})
    else:
        config_path = Path(__file__).parent.parent / "config.yaml"
        if config_path.exists():
            full_config = load_yaml_config(config_path)
            config = (
                full_config.get("steps", {}).get("step_15_shuffle_verification", {})
            )
            config["sae_id"] = full_config.get("global", {}).get(
                "sae_id_sanitized", ""
            )
            config["global"] = full_config.get("global", {})
        else:
            config = {}

    # Run processor
    processor = ShuffleVerificationProcessor(config, feature_limit=args.limit)
    processor.run()


if __name__ == "__main__":
    main()
