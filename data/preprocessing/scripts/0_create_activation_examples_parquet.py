#!/usr/bin/env python3
"""
Preprocessing Script: Create Activation Examples Parquet

This script processes SAE feature activation examples from raw JSONL and JSON files
into a structured Parquet format for efficient querying and visualization.

Input Files:
- activations.jsonl: JSONL file with activation records (544,188 lines)
  Format: {"index": "877", "dataSetPromptId": 0, "sparseValues": [[90, 105.077]]}
- prompts.json: JSON array of tokenized prompts (24,571 prompts)
  Format: [["token1", "token2", ...], ...]

Output:
- activation_examples.parquet: Structured parquet file with nested activation data
  Schema: feature_id, sae_id, prompt_id, prompt_tokens, prompt_length,
          activation_pairs (nested), num_activations, max_activation, mean_activation
- activation_examples.parquet.metadata.json: Processing metadata and statistics

Features:
- Nested schema with one row per (feature_id, prompt_id) combination
- Preserves token list structure for token-level analysis
- Pre-computes activation statistics for efficient filtering
- Validates against master feature parquet
- Comprehensive error handling and progress logging

Usage:
    python 9_create_activation_examples_parquet.py [--config CONFIG_PATH]

Example:
    python 9_create_activation_examples_parquet.py
    python 9_create_activation_examples_parquet.py --config config/custom_config.json
"""

import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, Any
from datetime import datetime
import argparse
import polars as pl

# Enable string cache for categorical operations
pl.enable_string_cache()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def find_project_root() -> Path:
    """Find project root by looking for 'interface' directory."""
    project_root = Path.cwd()
    while project_root.name != "interface" and project_root.parent != project_root:
        project_root = project_root.parent

    if project_root.name == "interface":
        return project_root
    else:
        raise RuntimeError("Could not find interface project root")


def load_config(config_path: Optional[str] = None) -> Dict:
    """Load configuration from file or use defaults."""
    default_config = {
        "activations_input_path": "data/raw/activation_examples/activations.jsonl",
        "prompts_input_path": "data/raw/activation_examples/prompts.json",
        "output_path": "data/master/activation_examples.parquet",
        "master_parquet_path": "data/master/feature_analysis.parquet",
        "sae_id": "google--gemma-scope-9b-pt-res--layer_30--width_16k--average_l0_120",
        "log_missing_features": True,
        "batch_log_interval": 50000
    }

    if config_path and Path(config_path).exists():
        logger.info(f"Loading config from {config_path}")
        with open(config_path, 'r') as f:
            file_config = json.load(f)
        default_config.update(file_config)
    else:
        logger.info("Using default configuration")

    return default_config


class ActivationExamplesProcessor:
    """Process activation examples from JSONL and JSON into Parquet format."""

    def __init__(self, config: Dict):
        """Initialize processor with configuration.

        Args:
            config: Configuration dictionary with input/output paths
        """
        self.config = config
        self.project_root = find_project_root()

        # Resolve paths
        self.activations_path = self._resolve_path(config["activations_input_path"])
        self.prompts_path = self._resolve_path(config["prompts_input_path"])
        self.output_path = self._resolve_path(config["output_path"])
        self.master_parquet_path = self._resolve_path(config["master_parquet_path"])

        # Configuration
        self.sae_id = config["sae_id"]
        self.log_missing_features = config.get("log_missing_features", True)
        self.batch_log_interval = config.get("batch_log_interval", 50000)

        # Statistics tracking
        self.stats = {
            "total_lines_processed": 0,
            "error_count": 0,
            "unique_features": set(),
            "unique_prompts": set(),
            "empty_activations": 0,
            "total_activation_pairs": 0,
            "missing_features": set()
        }

        # Load prompts into memory
        self.prompts = self._load_prompts()

        # Load master features for validation
        self.master_features = self._load_master_features()

    def _resolve_path(self, path_str: str) -> Path:
        """Resolve path relative to project root if not absolute."""
        path = Path(path_str)
        if not path.is_absolute():
            return self.project_root / path
        return path

    def _load_prompts(self) -> List[List[str]]:
        """Load prompts.json into memory."""
        logger.info(f"Loading prompts from {self.prompts_path}")

        if not self.prompts_path.exists():
            raise FileNotFoundError(f"Prompts file not found: {self.prompts_path}")

        with open(self.prompts_path, 'r') as f:
            prompts = json.load(f)

        if not isinstance(prompts, list):
            raise ValueError(f"Expected prompts.json to be a list, got {type(prompts)}")

        logger.info(f"Loaded {len(prompts)} prompts")
        return prompts

    def _load_master_features(self) -> set:
        """Load master feature IDs for validation."""
        if not self.log_missing_features:
            return set()

        if not self.master_parquet_path.exists():
            logger.warning(f"Master parquet not found: {self.master_parquet_path}")
            logger.warning("Skipping feature validation")
            return set()

        logger.info(f"Loading master features from {self.master_parquet_path}")

        try:
            master_df = pl.read_parquet(self.master_parquet_path)
            master_features = set(master_df['feature_id'].unique().to_list())
            logger.info(f"Loaded {len(master_features)} features from master parquet")
            return master_features
        except Exception as e:
            logger.error(f"Error loading master parquet: {e}")
            logger.warning("Proceeding without feature validation")
            return set()

    def _process_activation_line(self, line: str, line_num: int) -> Optional[Dict[str, Any]]:
        """Process a single line from activations.jsonl.

        Args:
            line: JSON line to process
            line_num: Line number for logging

        Returns:
            Dictionary with processed data or None on error
        """
        try:
            data = json.loads(line)

            # Extract and convert feature_id from string to int
            feature_id = int(data['index'])
            prompt_id = data['dataSetPromptId']
            sparse_values = data['sparseValues']

            # Track statistics
            self.stats["unique_features"].add(feature_id)
            self.stats["unique_prompts"].add(prompt_id)

            # Validate prompt_id
            if prompt_id >= len(self.prompts):
                logger.error(f"Line {line_num}: Invalid prompt_id {prompt_id} (max: {len(self.prompts)-1})")
                return None

            # Get prompt tokens
            prompt_tokens = self.prompts[prompt_id]
            prompt_length = len(prompt_tokens)

            # Process sparse values (activation pairs)
            activation_pairs = []
            if sparse_values:
                for token_pos, activation_val in sparse_values:
                    activation_pairs.append({
                        "token_position": token_pos,
                        "activation_value": activation_val
                    })
                self.stats["total_activation_pairs"] += len(activation_pairs)
            else:
                self.stats["empty_activations"] += 1

            # Compute activation statistics
            num_activations = len(activation_pairs)
            max_activation = None
            mean_activation = None

            if activation_pairs:
                activation_values = [pair["activation_value"] for pair in activation_pairs]
                max_activation = max(activation_values)
                mean_activation = sum(activation_values) / len(activation_values)

            # Check if feature exists in master parquet
            if self.log_missing_features and self.master_features:
                if feature_id not in self.master_features:
                    self.stats["missing_features"].add(feature_id)

            return {
                "feature_id": feature_id,
                "sae_id": self.sae_id,
                "prompt_id": prompt_id,
                "prompt_tokens": prompt_tokens,
                "prompt_length": prompt_length,
                "activation_pairs": activation_pairs,
                "num_activations": num_activations,
                "max_activation": max_activation,
                "mean_activation": mean_activation
            }

        except json.JSONDecodeError as e:
            logger.error(f"Line {line_num}: JSON decode error: {e}")
            self.stats["error_count"] += 1
            return None
        except (KeyError, ValueError, TypeError) as e:
            logger.error(f"Line {line_num}: Data processing error: {e}")
            self.stats["error_count"] += 1
            return None

    def process_data(self) -> pl.DataFrame:
        """Process activations.jsonl and create DataFrame.

        Returns:
            Polars DataFrame with processed activation data
        """
        logger.info(f"Processing activations from {self.activations_path}")

        if not self.activations_path.exists():
            raise FileNotFoundError(f"Activations file not found: {self.activations_path}")

        rows = []

        with open(self.activations_path, 'r') as f:
            for line_num, line in enumerate(f, 1):
                # Process line
                row = self._process_activation_line(line.strip(), line_num)
                if row:
                    rows.append(row)

                # Update statistics
                self.stats["total_lines_processed"] = line_num

                # Progress logging
                if line_num % self.batch_log_interval == 0:
                    logger.info(
                        f"Processed {line_num:,} lines | "
                        f"Valid: {len(rows):,} | "
                        f"Errors: {self.stats['error_count']:,} | "
                        f"Features: {len(self.stats['unique_features']):,}"
                    )

        logger.info(f"Processing complete:")
        logger.info(f"  Total lines: {self.stats['total_lines_processed']:,}")
        logger.info(f"  Valid records: {len(rows):,}")
        logger.info(f"  Errors: {self.stats['error_count']:,}")
        logger.info(f"  Unique features: {len(self.stats['unique_features']):,}")
        logger.info(f"  Unique prompts: {len(self.stats['unique_prompts']):,}")
        logger.info(f"  Empty activations: {self.stats['empty_activations']:,}")
        logger.info(f"  Total activation pairs: {self.stats['total_activation_pairs']:,}")

        if self.log_missing_features and self.stats["missing_features"]:
            logger.warning(
                f"Found {len(self.stats['missing_features'])} features not in master parquet"
            )
            logger.info(f"Missing features: {sorted(list(self.stats['missing_features']))[:20]}...")

        if not rows:
            logger.warning("No valid records found, creating empty DataFrame")
            return self._create_empty_dataframe()

        return self._create_dataframe(rows)

    def _create_dataframe(self, rows: List[Dict]) -> pl.DataFrame:
        """Create Polars DataFrame with proper schema.

        Args:
            rows: List of processed row dictionaries

        Returns:
            Polars DataFrame with typed columns
        """
        logger.info("Creating DataFrame with proper schema")

        # Create initial DataFrame
        df = pl.DataFrame(rows)

        # Apply proper data types
        df = df.with_columns([
            pl.col("feature_id").cast(pl.UInt32),
            pl.col("sae_id").cast(pl.Categorical),
            pl.col("prompt_id").cast(pl.UInt32),
            pl.col("prompt_length").cast(pl.UInt16),
            pl.col("num_activations").cast(pl.UInt16),
            pl.col("max_activation").cast(pl.Float32),
            pl.col("mean_activation").cast(pl.Float32)
        ])

        logger.info(f"Created DataFrame with {len(df)} rows and {len(df.columns)} columns")
        logger.info(f"Schema: {df.schema}")

        return df

    def _create_empty_dataframe(self) -> pl.DataFrame:
        """Create empty DataFrame with correct schema.

        Returns:
            Empty Polars DataFrame with proper schema
        """
        logger.info("Creating empty DataFrame with schema")

        schema = {
            "feature_id": pl.UInt32,
            "sae_id": pl.Categorical,
            "prompt_id": pl.UInt32,
            "prompt_tokens": pl.List(pl.Utf8),
            "prompt_length": pl.UInt16,
            "activation_pairs": pl.List(pl.Struct([
                pl.Field("token_position", pl.UInt16),
                pl.Field("activation_value", pl.Float32)
            ])),
            "num_activations": pl.UInt16,
            "max_activation": pl.Float32,
            "mean_activation": pl.Float32
        }

        return pl.DataFrame(schema=schema)

    def save_parquet(self, df: pl.DataFrame) -> None:
        """Save DataFrame as parquet with metadata.

        Args:
            df: DataFrame to save
        """
        # Ensure output directory exists
        self.output_path.parent.mkdir(parents=True, exist_ok=True)

        logger.info(f"Saving parquet to {self.output_path}")
        df.write_parquet(self.output_path)

        # Calculate additional statistics
        if len(df) > 0:
            activation_stats = {
                "total_activations": int(df['num_activations'].sum()),
                "mean_activations_per_prompt": float(df['num_activations'].mean()),
                "max_activations_per_prompt": int(df['num_activations'].max()),
                "prompts_with_activations": int((df['num_activations'] > 0).sum()),
                "prompts_without_activations": int((df['num_activations'] == 0).sum()),
                "mean_prompt_length": float(df['prompt_length'].mean()),
                "max_prompt_length": int(df['prompt_length'].max()),
                "min_prompt_length": int(df['prompt_length'].min())
            }

            if df['max_activation'].is_not_null().any():
                activation_stats.update({
                    "max_activation_value": float(df['max_activation'].max()),
                    "mean_activation_value": float(df['mean_activation'].mean())
                })
        else:
            activation_stats = {}

        # Save metadata
        metadata = {
            "created_at": datetime.now().isoformat(),
            "script_version": "1.0",
            "sae_id": self.sae_id,
            "total_rows": len(df),
            "unique_features": len(self.stats["unique_features"]),
            "unique_prompts": len(self.stats["unique_prompts"]),
            "schema": {col: str(df[col].dtype) for col in df.columns},
            "processing_stats": {
                "total_lines_processed": self.stats["total_lines_processed"],
                "valid_records": len(df),
                "error_count": self.stats["error_count"],
                "empty_activations": self.stats["empty_activations"],
                "total_activation_pairs": self.stats["total_activation_pairs"],
                "features_not_in_master": len(self.stats["missing_features"])
            },
            "activation_stats": activation_stats,
            "config_used": self.config
        }

        metadata_path = self.output_path.with_suffix('.parquet.metadata.json')
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)

        logger.info(f"Saved metadata to {metadata_path}")
        logger.info(f"Successfully created parquet with {len(df):,} rows")


def main():
    """Main execution function."""
    parser = argparse.ArgumentParser(
        description='Process activation examples into parquet format'
    )
    parser.add_argument(
        '--config',
        type=str,
        default='data/preprocessing/config/activation_examples_config.json',
        help='Path to configuration file'
    )

    args = parser.parse_args()

    # Load configuration
    config = load_config(args.config)

    # Initialize processor
    processor = ActivationExamplesProcessor(config)

    # Process data
    logger.info("=" * 80)
    logger.info("Starting Activation Examples Processing")
    logger.info("=" * 80)

    df = processor.process_data()

    # Save parquet
    processor.save_parquet(df)

    logger.info("=" * 80)
    logger.info("Processing Complete!")
    logger.info("=" * 80)


if __name__ == "__main__":
    main()
