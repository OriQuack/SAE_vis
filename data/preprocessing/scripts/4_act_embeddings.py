#!/usr/bin/env python3
"""
Preprocessing Script: Pre-compute Activation Example Embeddings

This script pre-computes embeddings for quantile-sampled activation examples to
optimize downstream similarity analysis. It extracts token windows around max
activated positions and generates embeddings using sentence-transformers.

Input:
- activation_examples.parquet: Structured parquet with activation data

Output:
- activation_embeddings.parquet: Pre-computed embeddings per feature
- activation_embeddings.parquet.metadata.json: Processing metadata

Features:
- Quantile-based sampling (4 quantiles, 2 examples each)
- Configurable token window size (default: 32)
- Symmetric/asymmetric window extraction (adaptive)
- Batch processing for efficiency
- Native Polars nested types

Usage:
    python 8_act_embeddings.py [--config CONFIG_PATH] [--limit N]

Example:
    python 8_act_embeddings.py
    python 8_act_embeddings.py --limit 100  # Test on 100 features
"""

import json
import logging
import argparse
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime
import numpy as np
import polars as pl
from tqdm import tqdm

# Lazy imports for heavy dependencies
sentence_transformers = None

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
        "activation_examples_path": "data/master/activation_examples.parquet",
        "output_path": "data/master/activation_embeddings.parquet",
        "sae_id": "google--gemma-scope-9b-pt-res--layer_30--width_16k--average_l0_120",
        "processing_parameters": {
            "num_quantiles": 4,
            "examples_per_quantile": 2,
            "target_examples_per_feature": 8,
            "token_window_size": 32
        },
        "model_parameters": {
            "sentence_transformer_model": "all-MiniLM-L6-v2",
            "device": "cuda",
            "batch_size": 32
        }
    }

    if config_path and Path(config_path).exists():
        logger.info(f"Loading config from {config_path}")
        with open(config_path, 'r') as f:
            file_config = json.load(f)
        # Merge configs deeply
        for key in file_config:
            if isinstance(file_config[key], dict) and key in default_config:
                default_config[key].update(file_config[key])
            else:
                default_config[key] = file_config[key]
    else:
        logger.info("Using default configuration")

    return default_config


def lazy_import_dependencies():
    """Lazy import heavy dependencies."""
    global sentence_transformers

    if sentence_transformers is None:
        logger.info("Importing sentence-transformers...")
        import sentence_transformers as st
        sentence_transformers = st


class ActivationEmbeddingProcessor:
    """Pre-compute embeddings for activation examples."""

    def __init__(self, config: Dict, feature_limit: Optional[int] = None):
        """Initialize processor with configuration.

        Args:
            config: Configuration dictionary
            feature_limit: Optional limit on number of features to process
        """
        self.config = config
        self.feature_limit = feature_limit
        self.project_root = find_project_root()

        # Resolve paths
        self.activation_path = self._resolve_path(config["activation_examples_path"])
        self.output_path = self._resolve_path(config["output_path"])

        # Configuration
        self.sae_id = config["sae_id"]
        self.proc_params = config["processing_parameters"]
        self.model_params = config["model_parameters"]

        # Statistics tracking
        self.stats = {
            "features_processed": 0,
            "features_with_no_activations": 0,
            "total_examples_embedded": 0,
            "total_embeddings_generated": 0
        }

        # Load models
        lazy_import_dependencies()
        self.sentence_model = None

    def _resolve_path(self, path_str: str) -> Path:
        """Resolve path relative to project root if not absolute."""
        path = Path(path_str)
        if not path.is_absolute():
            return self.project_root / path
        return path

    def _load_models(self):
        """Load sentence-transformers model."""
        if self.sentence_model is None:
            logger.info(f"Loading sentence-transformers model: {self.model_params['sentence_transformer_model']}")
            self.sentence_model = sentence_transformers.SentenceTransformer(
                self.model_params['sentence_transformer_model']
            )
            # Move to specified device
            try:
                import torch
                device = self.model_params.get('device', 'cuda')
                if device == 'cuda' and not torch.cuda.is_available():
                    logger.warning("CUDA not available, using CPU")
                    device = 'cpu'
                self.sentence_model = self.sentence_model.to(device)
                logger.info(f"Model loaded on device: {device}")
            except Exception as e:
                logger.warning(f"Could not set device: {e}")

    def _select_quantile_examples(self, feature_df: pl.DataFrame) -> List[Tuple[int, float, List[str], int]]:
        """Select examples from quantiles based on max_activation.

        Args:
            feature_df: DataFrame with activation examples for a single feature

        Returns:
            List of tuples: (prompt_id, max_activation, prompt_tokens, max_token_pos)
        """
        # Filter out rows with no activations
        feature_df = feature_df.filter(pl.col("num_activations") > 0)

        if len(feature_df) == 0:
            return []

        num_examples = len(feature_df)
        target_per_quantile = self.proc_params["examples_per_quantile"]
        num_quantiles = self.proc_params["num_quantiles"]

        if num_examples < num_quantiles:
            # Not enough examples for quantiles, return all
            selected = feature_df.select([
                "prompt_id",
                "max_activation",
                "prompt_tokens",
                "activation_pairs"
            ]).to_dicts()
        else:
            # Calculate quantile boundaries
            quantiles = [i / num_quantiles for i in range(1, num_quantiles)]
            # Compute quantiles one at a time to avoid duplicate column names
            q_values = [
                feature_df.select(
                    pl.col("max_activation").quantile(q, interpolation="linear")
                ).item()
                for q in quantiles
            ]

            # Assign quantile groups
            conditions = []
            for i, q_val in enumerate(q_values):
                if i == 0:
                    conditions.append(pl.col("max_activation") <= q_val)
                else:
                    conditions.append(
                        (pl.col("max_activation") > q_values[i-1]) &
                        (pl.col("max_activation") <= q_val)
                    )
            # Last quantile
            conditions.append(pl.col("max_activation") > q_values[-1])

            # Select top examples from each quantile
            selected = []
            for i, condition in enumerate(conditions):
                quantile_df = feature_df.filter(condition).sort("max_activation", descending=True)
                top_n = quantile_df.head(target_per_quantile).select([
                    "prompt_id",
                    "max_activation",
                    "prompt_tokens",
                    "activation_pairs"
                ]).to_dicts()
                selected.extend(top_n)

        # Extract max token position from activation_pairs
        result = []
        for row in selected:
            activation_pairs = row["activation_pairs"]
            if activation_pairs:
                # Find position with max activation
                max_pair = max(activation_pairs, key=lambda x: x["activation_value"])
                max_token_pos = max_pair["token_position"]
            else:
                max_token_pos = 0

            result.append((
                row["prompt_id"],
                row["max_activation"],
                row["prompt_tokens"],
                max_token_pos
            ))

        return result

    def _extract_token_window(self, tokens: List[str], center_pos: int, window_size: int) -> List[str]:
        """Extract symmetric/asymmetric window around center position.

        Args:
            tokens: List of token strings
            center_pos: Center token position
            window_size: Total window size

        Returns:
            List of tokens in window (may be shorter if near edges)
        """
        half_window = window_size // 2
        start = max(0, center_pos - half_window)
        end = min(len(tokens), center_pos + half_window)
        return tokens[start:end]

    def _normalize_token(self, token: str) -> str:
        """Strip SentencePiece '▁' prefix from token.

        Args:
            token: Token string (may have '▁' prefix)

        Returns:
            Token without '▁' prefix
        """
        return token.lstrip('▁')

    def _reconstruct_text(self, tokens: List[str]) -> str:
        """Reconstruct natural text from subword tokens.

        Args:
            tokens: List of token strings with '▁' marking word boundaries

        Returns:
            Natural readable text with proper spacing
        """
        if not tokens:
            return ""

        words = []
        current_word = ""

        for token in tokens:
            if token.startswith('▁'):
                # New word boundary
                if current_word:
                    words.append(current_word)
                current_word = self._normalize_token(token)
            else:
                # Continuation of previous word
                current_word += token

        # Add last word
        if current_word:
            words.append(current_word)

        return " ".join(words)

    def process_feature(self, feature_id: int, feature_df: pl.DataFrame) -> Dict[str, Any]:
        """Process a single feature to compute embeddings for quantile examples.

        Args:
            feature_id: Feature ID
            feature_df: DataFrame with activation examples for this feature

        Returns:
            Dictionary with feature_id, prompt_ids, and embeddings
        """
        # Select examples from quantiles
        examples = self._select_quantile_examples(feature_df)

        if len(examples) == 0:
            self.stats["features_with_no_activations"] += 1
            return {
                "feature_id": feature_id,
                "sae_id": self.sae_id,
                "prompt_ids": [],
                "embeddings": []
            }

        self.stats["total_examples_embedded"] += len(examples)

        window_size = self.proc_params["token_window_size"]

        # Extract token windows and compute embeddings
        prompt_ids = []
        window_texts = []

        for prompt_id, _, tokens, max_pos in examples:
            window_tokens = self._extract_token_window(tokens, max_pos, window_size)
            # Reconstruct natural text from subword tokens
            window_text = self._reconstruct_text(window_tokens)

            prompt_ids.append(int(prompt_id))
            window_texts.append(window_text)

        # Batch encode all windows for this feature
        embeddings_list = []
        if window_texts:
            embeddings = self.sentence_model.encode(
                window_texts,
                convert_to_tensor=False,
                show_progress_bar=False
            )
            # Convert to float32 first, then to list of lists for Polars
            embeddings_list = [emb.astype(np.float32).tolist() for emb in embeddings]
            self.stats["total_embeddings_generated"] += len(embeddings_list)

        return {
            "feature_id": feature_id,
            "sae_id": self.sae_id,
            "prompt_ids": prompt_ids,
            "embeddings": embeddings_list
        }

    def process_all_features(self) -> pl.DataFrame:
        """Process all features and create DataFrame.

        Returns:
            Polars DataFrame with pre-computed embeddings
        """
        logger.info(f"Loading activation examples from {self.activation_path}")

        if not self.activation_path.exists():
            raise FileNotFoundError(f"Activation examples not found: {self.activation_path}")

        # Load activation data
        df = pl.read_parquet(self.activation_path)
        logger.info(f"Loaded {len(df):,} activation examples")

        # Load models
        self._load_models()

        # Get unique features
        unique_features = sorted(df["feature_id"].unique().to_list())

        # Apply feature limit for testing
        if self.feature_limit is not None:
            unique_features = unique_features[:self.feature_limit]
            logger.info(f"Processing limited to {self.feature_limit} features")

        logger.info(f"Processing {len(unique_features):,} features")

        # Process features
        results = []
        for feature_id in tqdm(unique_features, desc="Computing embeddings"):
            feature_df = df.filter(pl.col("feature_id") == feature_id)
            result = self.process_feature(feature_id, feature_df)
            results.append(result)
            self.stats["features_processed"] += 1

        logger.info(f"Processed {self.stats['features_processed']:,} features")

        return self._create_dataframe(results)

    def _create_dataframe(self, rows: List[Dict]) -> pl.DataFrame:
        """Create Polars DataFrame with proper schema and native types.

        Args:
            rows: List of result dictionaries

        Returns:
            Polars DataFrame with typed columns
        """
        logger.info("Creating DataFrame with proper schema")

        if not rows:
            logger.warning("No results to convert to DataFrame")
            return self._create_empty_dataframe()

        # Create DataFrame from rows
        df = pl.DataFrame(rows)

        # Cast to proper types with explicit list element types
        df = df.with_columns([
            pl.col("feature_id").cast(pl.UInt32),
            pl.col("sae_id").cast(pl.Categorical),
            pl.col("prompt_ids").cast(pl.List(pl.UInt32)),
            pl.col("embeddings").cast(pl.List(pl.List(pl.Float32)))
        ])

        logger.info(f"Created DataFrame with {len(df)} rows and {len(df.columns)} columns")
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
            "prompt_ids": pl.List(pl.UInt32),
            "embeddings": pl.List(pl.List(pl.Float32))
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

        # Calculate statistics
        if len(df) > 0:
            result_stats = {
                "features_with_embeddings": int((df["embeddings"].list.len() > 0).sum()),
                "mean_examples_per_feature": float(df["prompt_ids"].list.len().mean()),
                "embedding_dimension": len(df["embeddings"][0][0]) if len(df) > 0 and len(df["embeddings"][0]) > 0 else None
            }
        else:
            result_stats = {}

        # Save metadata
        metadata = {
            "created_at": datetime.now().isoformat(),
            "script_version": "1.0",
            "sae_id": self.sae_id,
            "total_rows": len(df),
            "schema": {col: str(df[col].dtype) for col in df.columns},
            "processing_stats": self.stats,
            "result_stats": result_stats,
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
        description='Pre-compute embeddings for activation examples'
    )
    parser.add_argument(
        '--config',
        type=str,
        default='data/preprocessing/config/8_activation_embeddings_config.json',
        help='Path to configuration file'
    )
    parser.add_argument(
        '--limit',
        type=int,
        default=None,
        help='Limit number of features to process (for testing)'
    )

    args = parser.parse_args()

    # Load configuration
    config = load_config(args.config)

    # Initialize processor
    processor = ActivationEmbeddingProcessor(config, feature_limit=args.limit)

    # Process data
    logger.info("=" * 80)
    logger.info("Starting Activation Example Embedding Pre-computation")
    logger.info("=" * 80)

    df = processor.process_all_features()

    # Save parquet
    processor.save_parquet(df)

    logger.info("=" * 80)
    logger.info("Processing Complete!")
    logger.info(f"Statistics:")
    logger.info(f"  Features processed: {processor.stats['features_processed']:,}")
    logger.info(f"  Total examples embedded: {processor.stats['total_examples_embedded']:,}")
    logger.info(f"  Total embeddings generated: {processor.stats['total_embeddings_generated']:,}")
    logger.info(f"  Features with no activations: {processor.stats['features_with_no_activations']:,}")
    logger.info("=" * 80)


if __name__ == "__main__":
    main()
