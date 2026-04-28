#!/usr/bin/env python3
"""
Step 1: Create Activation Examples Parquet

This step converts raw activation data from JSONL format into a structured
parquet file for efficient downstream processing.

Input:
- activations.jsonl: Raw activation data
- prompts.json: Prompt token data

Output:
- activation_examples.parquet: Structured parquet with activation data

Features:
- Extracts activation values and token positions
- Handles multiple data sources (LLM explainers)
- Memory-efficient batch processing
- Validates data integrity
"""

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

import polars as pl
from tqdm import tqdm

# Enable string cache for categorical operations
pl.enable_string_cache()

# Add parent directory to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.base import BaseProcessor, load_yaml_config
from core.logging import setup_logging

logger = logging.getLogger(__name__)


class ActivationExamplesProcessor(BaseProcessor):
    """Create activation examples parquet from raw JSONL data."""

    @property
    def step_name(self) -> str:
        return "Step 1: Activation Examples"

    @property
    def version(self) -> str:
        return "2.0"

    def _init_paths(self) -> None:
        """Initialize paths from configuration."""
        super()._init_paths()

        # Input paths
        inputs = self.config.get("inputs", {})
        global_config = self.config.get("global", {})
        intermediate_path = global_config.get("paths", {}).get("intermediate", "data/intermediate")

        self.activations_path = self._resolve_path(
            inputs.get("activations", f"{intermediate_path}/activation_examples/activations.jsonl")
        )
        self.prompts_path = self._resolve_path(
            inputs.get("prompts", f"{intermediate_path}/activation_examples/prompts.json")
        )

        # Output path
        outputs = self.config.get("outputs", {})
        self.output_path = self._resolve_path(
            outputs.get("main", "data/intermediate/activation_examples.parquet")
        )

        # Processing parameters
        params = self.config.get("parameters", {})
        self.proc_params = {
            "log_missing_features": params.get("log_missing_features", True),
            "batch_log_interval": params.get("batch_log_interval", 50000),
        }

        # Statistics tracking
        self.stats = {
            "features_processed": 0,
            "total_activations": 0,
            "prompts_loaded": 0,
            "missing_prompts": 0,
            "invalid_activations": 0
        }

        # Data holders
        self.prompts_data = {}

    def _load_prompts(self) -> None:
        """Load prompts data."""
        logger.info(f"Loading prompts from {self.prompts_path}")
        if not self.prompts_path.exists():
            raise FileNotFoundError(f"Prompts file not found: {self.prompts_path}")

        with open(self.prompts_path, 'r', encoding='utf-8') as f:
            self.prompts_data = json.load(f)

        self.stats["prompts_loaded"] = len(self.prompts_data)
        logger.info(f"Loaded {len(self.prompts_data):,} prompts")

    def _parse_activation_line(self, line: str) -> Optional[Dict[str, Any]]:
        """Parse a single activation line from JSONL.

        Args:
            line: JSON line string

        Returns:
            Parsed activation dict or None if invalid
        """
        try:
            data = json.loads(line.strip())
            return data
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse activation line: {e}")
            self.stats["invalid_activations"] += 1
            return None

    def _process_activation(self, activation_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Process a single activation entry.

        Args:
            activation_data: Raw activation data dict

        Returns:
            Processed row dict or None if invalid
        """
        # Support both formats:
        # Old: feature_id, prompt_id, activations
        # New: index, dataSetPromptId, sparseValues
        feature_id = activation_data.get("feature_id") or activation_data.get("index")
        prompt_id = activation_data.get("prompt_id") or activation_data.get("dataSetPromptId")
        activations = activation_data.get("activations") or activation_data.get("sparseValues", [])

        if feature_id is None or prompt_id is None:
            self.stats["invalid_activations"] += 1
            return None

        # Get prompt tokens (prompts_data is a list indexed by prompt_id)
        prompt_id_int = int(prompt_id)
        if prompt_id_int < 0 or prompt_id_int >= len(self.prompts_data):
            self.stats["missing_prompts"] += 1
            return None

        prompt_tokens = self.prompts_data[prompt_id_int]

        # Build activation pairs
        activation_pairs = []
        max_activation = 0.0
        max_token_pos = 0

        for act in activations:
            if isinstance(act, dict):
                token_pos = act.get("token_position", 0)
                act_value = act.get("activation_value", 0.0)
            elif isinstance(act, (list, tuple)) and len(act) >= 2:
                token_pos = act[0]
                act_value = act[1]
            else:
                continue

            activation_pairs.append({
                "token_position": int(token_pos),
                "activation_value": float(act_value)
            })

            if act_value > max_activation:
                max_activation = act_value
                max_token_pos = token_pos

        return {
            "feature_id": int(feature_id),
            "sae_id": self.sae_id,
            "prompt_id": int(prompt_id),
            "prompt_tokens": prompt_tokens,
            "max_activation": max_activation,
            "max_token_position": max_token_pos,
            "num_activations": len(activation_pairs),
            "activation_pairs": activation_pairs
        }

    def process(self) -> pl.DataFrame:
        """Execute the main processing logic.

        Returns:
            Processed DataFrame
        """
        self._load_prompts()

        if not self.activations_path.exists():
            raise FileNotFoundError(f"Activations file not found: {self.activations_path}")

        logger.info(f"Processing activations from {self.activations_path}")

        # Count total lines for progress bar
        total_lines = 0
        with open(self.activations_path, 'r', encoding='utf-8') as f:
            for _ in f:
                total_lines += 1
        logger.info(f"Total activation lines: {total_lines:,}")

        # Process in streaming fashion
        rows = []
        batch_log_interval = self.proc_params["batch_log_interval"]
        features_seen = set()

        with open(self.activations_path, 'r', encoding='utf-8') as f:
            for i, line in enumerate(tqdm(f, total=total_lines, desc="Processing activations")):
                if self.feature_limit is not None:
                    # Check if we've processed enough unique features
                    if len(features_seen) >= self.feature_limit:
                        # Only process existing features
                        data = self._parse_activation_line(line)
                        if data and data.get("feature_id") in features_seen:
                            row = self._process_activation(data)
                            if row:
                                rows.append(row)
                        continue

                data = self._parse_activation_line(line)
                if data is None:
                    continue

                row = self._process_activation(data)
                if row:
                    rows.append(row)
                    features_seen.add(row["feature_id"])
                    self.stats["total_activations"] += 1

                if i > 0 and i % batch_log_interval == 0:
                    logger.info(f"Processed {i:,} lines, {len(features_seen):,} features, {len(rows):,} rows")

        self.stats["features_processed"] = len(features_seen)
        logger.info(f"Processed {len(rows):,} activation rows for {len(features_seen):,} features")

        return self._create_dataframe(rows)

    def _create_dataframe(self, rows: List[Dict]) -> pl.DataFrame:
        """Create Polars DataFrame with proper schema.

        Args:
            rows: List of result dictionaries

        Returns:
            Polars DataFrame with typed columns
        """
        logger.info("Creating DataFrame with proper schema")

        if not rows:
            logger.warning("No results to convert to DataFrame")
            return self._create_empty_dataframe()

        df = pl.DataFrame(rows)

        # Cast types
        df = df.with_columns([
            pl.col("feature_id").cast(pl.UInt32),
            pl.col("sae_id").cast(pl.Categorical),
            pl.col("prompt_id").cast(pl.UInt32),
            pl.col("max_activation").cast(pl.Float32),
            pl.col("max_token_position").cast(pl.UInt16),
            pl.col("num_activations").cast(pl.UInt16),
        ])

        logger.info(f"Created DataFrame with {len(df)} rows and {len(df.columns)} columns")
        return df

    def _create_empty_dataframe(self) -> pl.DataFrame:
        """Create empty DataFrame with correct schema."""
        schema = {
            "feature_id": pl.UInt32,
            "sae_id": pl.Categorical,
            "prompt_id": pl.UInt32,
            "prompt_tokens": pl.List(pl.Utf8),
            "max_activation": pl.Float32,
            "max_token_position": pl.UInt16,
            "num_activations": pl.UInt16,
            "activation_pairs": pl.List(pl.Struct([
                pl.Field("token_position", pl.UInt16),
                pl.Field("activation_value", pl.Float32)
            ]))
        }
        return pl.DataFrame(schema=schema)


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Create activation examples parquet")
    parser.add_argument("--config", type=str, help="Path to configuration file")
    parser.add_argument("--limit", type=int, help="Limit number of features (for testing)")

    args = parser.parse_args()

    setup_logging()

    if args.config:
        full_config = load_yaml_config(args.config)
        # Extract step-specific config if present
        config = full_config.get("steps", {}).get("step_01_activations", {})
        if not config:
            # Fallback: treat entire config as step config (legacy format)
            config = full_config
        config["sae_id"] = full_config.get("global", {}).get("sae_id_sanitized", "")
        config["global"] = full_config.get("global", {})
    else:
        config_path = Path(__file__).parent.parent / "config.yaml"
        if config_path.exists():
            full_config = load_yaml_config(config_path)
            config = full_config.get("steps", {}).get("step_01_activations", {})
            config["sae_id"] = full_config.get("global", {}).get("sae_id_sanitized", "")
            config["global"] = full_config.get("global", {})
        else:
            config = {}

    processor = ActivationExamplesProcessor(config, feature_limit=args.limit)
    processor.run()


if __name__ == "__main__":
    main()
