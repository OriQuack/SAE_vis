#!/usr/bin/env python3
"""
Step 5: Pre-compute Activation Example Embeddings

This step pre-computes embeddings for quantile-sampled activation examples to
optimize downstream similarity analysis. It extracts token windows around max
activated positions and generates embeddings using sentence-transformers.

Input:
- activation_examples.parquet: Structured parquet with activation data

Output:
- activation_embeddings.parquet: Pre-computed embeddings per feature

Features:
- Quantile-based sampling (4 quantiles, k examples each)
- Configurable token window size (default: 32)
- Activation-weighted pooling mode
- Batch processing for efficiency
- Uses shared core utilities for token processing and sampling
"""

import logging
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np
import polars as pl
from tqdm import tqdm

# Enable string cache for categorical operations
pl.enable_string_cache()

# Add parent directory to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.base import BaseProcessor, load_yaml_config
from core.logging import setup_logging
from core.tokens import join_tokens_to_text
from core.sampling import select_top_k_per_quantile_tuples
from core.embeddings import get_projection_modules, apply_projection_layers

# Lazy imports for heavy dependencies
sentence_transformers = None

logger = logging.getLogger(__name__)


def lazy_import_dependencies():
    """Lazy import heavy dependencies."""
    global sentence_transformers

    if sentence_transformers is None:
        logger.info("Importing sentence-transformers...")
        import sentence_transformers as st
        sentence_transformers = st


class ActivationEmbeddingProcessor(BaseProcessor):
    """Pre-compute embeddings for activation examples."""

    @property
    def step_name(self) -> str:
        return "Step 5: Activation Embeddings"

    @property
    def version(self) -> str:
        return "2.0"

    def _init_paths(self) -> None:
        """Initialize paths from configuration."""
        super()._init_paths()

        # Get paths from global config
        global_config = self.config.get("global", {})
        paths = global_config.get("paths", {})

        # Use resolved paths from global config
        intermediate_dir = paths.get("intermediate", "data/intermediate")

        # Input paths
        self.activation_path = self._resolve_path(
            f"{intermediate_dir}/activation_examples.parquet"
        )

        # Output path
        self.output_path = self._resolve_path(
            f"{intermediate_dir}/activation_embeddings.parquet"
        )

        # Processing parameters from step config
        params = self.config.get("parameters", {})

        # Embedding model settings from global config (truly global)
        processing = global_config.get("processing", {})
        embedding = processing.get("embedding", {})

        self.proc_params = {
            # Step-specific parameters
            "num_quantiles": params.get("num_quantiles", 4),
            "examples_per_quantile": params.get("examples_per_quantile", 4),
            "target_examples_per_feature": params.get("target_examples_per_feature", 16),
            "token_window_size": params.get("embedding_window_size", 32),
            "pooling_mode": params.get("pooling_mode", "weighted"),
            "pooling_temperature": params.get("pooling_temperature", 40.0),
            "sentence_transformer_model": params.get(
                "sentence_transformer_model",
                embedding.get("model", "google/embeddinggemma-300m")
            ),
            # Global embedding settings
            "device": embedding.get("device", "cuda"),
            "batch_size": embedding.get("batch_size", 32),
        }

        # Statistics tracking
        self.stats = {
            "features_processed": 0,
            "features_with_no_activations": 0,
            "total_examples_embedded": 0,
            "total_embeddings_generated": 0,
            "alignment_exact_match": 0,
            "alignment_special_tokens_added": 0,
            "alignment_tokens_truncated": 0,
            "alignment_total_examples": 0,
            "max_token_diff": 0
        }

        # Model holder
        self.sentence_model = None
        self.activation_df = None

    def _load_models(self):
        """Load sentence-transformers model."""
        lazy_import_dependencies()

        if self.sentence_model is None:
            model_name = self.proc_params["sentence_transformer_model"]
            logger.info(f"Loading sentence-transformers model: {model_name}")
            self.sentence_model = sentence_transformers.SentenceTransformer(model_name)

            try:
                import torch
                device = self.proc_params.get("device", "cuda")
                if device == "cuda" and not torch.cuda.is_available():
                    logger.warning("CUDA not available, using CPU")
                    device = "cpu"
                self.sentence_model = self.sentence_model.to(device)
                logger.info(f"Model loaded on device: {device}")
            except Exception as e:
                logger.warning(f"Could not set device: {e}")

            # Get EmbeddingGemma projection modules for applying after weighted pooling
            self.dense1, self.dense2, self.normalize = get_projection_modules(self.sentence_model)

    def _load_data(self) -> None:
        """Load activation examples data."""
        logger.info(f"Loading activation examples from {self.activation_path}")
        if not self.activation_path.exists():
            raise FileNotFoundError(f"Activation examples not found: {self.activation_path}")
        self.activation_df = pl.read_parquet(self.activation_path)
        logger.info(f"Loaded {len(self.activation_df):,} activation examples")

    def _select_quantile_examples(
        self, feature_df: pl.DataFrame
    ) -> List[Tuple[int, float, List[str], int, List[Dict]]]:
        """Select examples using rank-based sampling for even distribution.

        Args:
            feature_df: DataFrame with activation examples for a single feature

        Returns:
            List of tuples: (prompt_id, max_activation, prompt_tokens, max_token_pos, activation_pairs)
        """
        # Filter out rows with no activations
        feature_df = feature_df.filter(pl.col("num_activations") > 0)

        if len(feature_df) == 0:
            return []

        # Sort by activation descending and get tuples
        sorted_df = feature_df.sort("max_activation", descending=True).select([
            "prompt_id",
            "max_activation",
            "prompt_tokens",
            "activation_pairs"
        ])

        # Convert to list of tuples for sampling
        examples = []
        for row in sorted_df.to_dicts():
            activation_pairs = row["activation_pairs"]
            if activation_pairs:
                max_pair = max(activation_pairs, key=lambda x: x["activation_value"])
                max_token_pos = max_pair["token_position"]
            else:
                max_token_pos = 0

            examples.append((
                row["prompt_id"],
                row["max_activation"] if row["max_activation"] is not None else 0.0,
                row["prompt_tokens"],
                max_token_pos,
                activation_pairs or []
            ))

        # Use core sampling utility
        target_per_quantile = self.proc_params["examples_per_quantile"]
        num_quantiles = self.proc_params["num_quantiles"]
        total_target = target_per_quantile * num_quantiles

        if len(examples) <= total_target:
            return examples

        # Use quantile sampling from core
        return select_top_k_per_quantile_tuples(
            examples, target_per_quantile, num_quantiles, value_index=1
        )

    def _reconstruct_text(self, tokens: List[str]) -> str:
        """Reconstruct natural text from subword tokens.

        Args:
            tokens: List of token strings with '▁' marking word boundaries

        Returns:
            Natural readable text with proper spacing
        """
        return join_tokens_to_text(tokens)

    def _compute_char_spans(self, tokens: List[str]) -> List[Tuple[int, int]]:
        """Compute character spans for each token in reconstructed text.

        Args:
            tokens: List of token strings with '▁' marking word boundaries

        Returns:
            List of (start_char, end_char) tuples for each token
        """
        spans = []
        current_pos = 0

        for i, token in enumerate(tokens):
            if token == '▁':
                if current_pos > 0:
                    start = current_pos
                    end = current_pos + 1
                    current_pos += 1
                else:
                    start = 0
                    end = 0
                spans.append((start, end))
            elif token.startswith('▁'):
                if current_pos > 0:
                    current_pos += 1

                stripped = token.lstrip('▁')
                num_leading = len(token) - len(stripped)
                extra_spaces = num_leading - 1

                start = current_pos
                token_len = extra_spaces + len(stripped)
                end = current_pos + token_len
                spans.append((start, end))
                current_pos = end
            else:
                start = current_pos
                end = current_pos + len(token)
                spans.append((start, end))
                current_pos = end

        return spans

    def _compute_char_spans_for_embedding(
        self, tokens: List[str], text: str
    ) -> List[Tuple[int, int]]:
        """Compute character spans for embedding model tokens."""
        spans = []
        current_pos = 0
        text_len = len(text)

        for token in tokens:
            if token.startswith('<0x') and token.endswith('>'):
                if current_pos < text_len:
                    spans.append((current_pos, current_pos + 1))
                    current_pos += 1
                else:
                    spans.append((current_pos, current_pos))
            elif token == '\n' or token == '\r':
                if current_pos < text_len:
                    spans.append((current_pos, current_pos + 1))
                    current_pos += 1
                else:
                    spans.append((current_pos, current_pos))
            elif token == '▁':
                if current_pos > 0 and current_pos < text_len:
                    spans.append((current_pos, current_pos + 1))
                    current_pos += 1
                else:
                    spans.append((current_pos, current_pos))
            elif token.startswith('▁'):
                if current_pos > 0 and current_pos < text_len and text[current_pos] == ' ':
                    current_pos += 1
                stripped = token.lstrip('▁')
                num_leading = len(token) - len(stripped)
                extra_spaces = num_leading - 1
                start = current_pos
                token_len = extra_spaces + len(stripped)
                end = min(current_pos + token_len, text_len)
                spans.append((start, end))
                current_pos = end
            else:
                start = current_pos
                end = min(current_pos + len(token), text_len)
                spans.append((start, end))
                current_pos = end

        return spans

    def _map_activations_to_embedding_tokens(
        self,
        gemma_tokens: List[str],
        activation_pairs: List[Dict],
        embedding_text: str,
        window_start: int,
        window_end: int,
        num_embedding_tokens: int
    ) -> np.ndarray:
        """Map Gemma 9B activation values to embedding model token positions.

        Args:
            gemma_tokens: Original Gemma 9B tokens
            activation_pairs: List of {token_position, activation_value}
            embedding_text: Reconstructed text
            window_start: Start position of the token window
            window_end: End position of the token window
            num_embedding_tokens: Actual number of tokens in embedding output

        Returns:
            Array of activation weights for each embedding token
        """
        window_tokens = gemma_tokens[window_start:window_end]
        gemma_char_spans = self._compute_char_spans(window_tokens)

        window_activations = np.zeros(len(window_tokens))
        for pair in activation_pairs:
            abs_pos = pair["token_position"]
            rel_pos = abs_pos - window_start
            if 0 <= rel_pos < len(window_tokens):
                window_activations[rel_pos] = pair["activation_value"]

        embedding_tokens = self.sentence_model.tokenizer.tokenize(embedding_text)
        emb_char_spans = self._compute_char_spans_for_embedding(embedding_tokens, embedding_text)

        content_activations = np.zeros(len(embedding_tokens))
        for emb_idx, (emb_start, emb_end) in enumerate(emb_char_spans):
            max_activation = 0.0
            for gemma_idx, (g_start, g_end) in enumerate(gemma_char_spans):
                overlap_start = max(emb_start, g_start)
                overlap_end = min(g_end, emb_end)
                if overlap_start < overlap_end:
                    max_activation = max(max_activation, window_activations[gemma_idx])
            content_activations[emb_idx] = max_activation

        num_special_tokens = num_embedding_tokens - len(embedding_tokens)

        self.stats["alignment_total_examples"] += 1
        self.stats["max_token_diff"] = max(self.stats["max_token_diff"], abs(num_special_tokens))

        if num_special_tokens > 0:
            self.stats["alignment_special_tokens_added"] += 1
            num_prefix = min(1, num_special_tokens)
            full_activations = np.zeros(num_embedding_tokens)
            full_activations[num_prefix:num_prefix + len(content_activations)] = content_activations
            return full_activations
        elif num_special_tokens < 0:
            self.stats["alignment_tokens_truncated"] += 1
            return content_activations[:num_embedding_tokens]
        else:
            self.stats["alignment_exact_match"] += 1
            return content_activations


    def _weighted_pooling(
        self,
        token_embeddings: np.ndarray,
        activation_weights: np.ndarray,
        temperature: float = 10.0
    ) -> np.ndarray:
        """Apply softmax-weighted pooling with L2 normalization.

        Args:
            token_embeddings: Shape (num_tokens, embedding_dim)
            activation_weights: Shape (num_tokens,)
            temperature: Softmax temperature

        Returns:
            L2-normalized embedding vector
        """
        if np.sum(activation_weights) == 0:
            weighted_embedding = np.mean(token_embeddings, axis=0)
        else:
            scaled = activation_weights / temperature
            scaled = scaled - np.max(scaled)
            weights = np.exp(scaled)
            weights = weights / np.sum(weights)
            weighted_embedding = np.sum(token_embeddings * weights[:, np.newaxis], axis=0)

        # Apply EmbeddingGemma's projection layers (Dense + Normalize)
        # This transforms embeddings into the semantic similarity space
        projected = apply_projection_layers(
            weighted_embedding, self.sentence_model,
            self.dense1, self.dense2, self.normalize
        )
        return projected.astype(np.float32)

    def _process_feature(self, feature_id: int, feature_df: pl.DataFrame) -> Dict[str, Any]:
        """Process a single feature to compute embeddings.

        Args:
            feature_id: Feature ID
            feature_df: DataFrame with activation examples for this feature

        Returns:
            Dictionary with feature_id, prompt_ids, and embeddings
        """
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
        pooling_mode = self.proc_params.get("pooling_mode", "mean")
        temperature = self.proc_params.get("pooling_temperature", 10.0)

        # Pre-compute all window data
        example_data = []
        for prompt_id, _, tokens, max_pos, activation_pairs in examples:
            half_window = window_size // 2
            window_start = max(0, max_pos - half_window)
            window_end = min(len(tokens), max_pos + half_window)
            window_tokens = tokens[window_start:window_end]
            window_text = self._reconstruct_text(window_tokens)

            if window_text.strip():
                example_data.append({
                    "prompt_id": int(prompt_id),
                    "tokens": tokens,
                    "window_text": window_text,
                    "window_start": window_start,
                    "window_end": window_end,
                    "activation_pairs": activation_pairs
                })

        if not example_data:
            return {
                "feature_id": feature_id,
                "sae_id": self.sae_id,
                "prompt_ids": [],
                "embeddings": []
            }

        prompt_ids = [d["prompt_id"] for d in example_data]
        window_texts = [d["window_text"] for d in example_data]

        if pooling_mode == "weighted":
            all_token_embeddings = self.sentence_model.encode(
                window_texts,
                output_value="token_embeddings",
                convert_to_tensor=True,
                show_progress_bar=False
            )

            embeddings_list = []
            for i, data in enumerate(example_data):
                token_emb = all_token_embeddings[i]
                if hasattr(token_emb, 'cpu'):
                    token_emb = token_emb.cpu().numpy()
                else:
                    token_emb = np.array(token_emb)

                activation_weights = self._map_activations_to_embedding_tokens(
                    gemma_tokens=data["tokens"],
                    activation_pairs=data["activation_pairs"],
                    embedding_text=data["window_text"],
                    window_start=data["window_start"],
                    window_end=data["window_end"],
                    num_embedding_tokens=len(token_emb)
                )

                embedding = self._weighted_pooling(token_emb, activation_weights, temperature)
                embeddings_list.append(embedding.tolist())
                self.stats["total_embeddings_generated"] += 1
        else:
            embeddings = self.sentence_model.encode(
                window_texts,
                convert_to_tensor=False,
                show_progress_bar=False
            )
            embeddings_list = [emb.astype(np.float32).tolist() for emb in embeddings]
            self.stats["total_embeddings_generated"] += len(embeddings_list)

        return {
            "feature_id": feature_id,
            "sae_id": self.sae_id,
            "prompt_ids": prompt_ids,
            "embeddings": embeddings_list
        }

    def process(self) -> pl.DataFrame:
        """Execute the main processing logic.

        Returns:
            Processed DataFrame
        """
        self._load_data()
        self._load_models()

        unique_features = sorted(self.activation_df["feature_id"].unique().to_list())

        if self.feature_limit is not None:
            unique_features = unique_features[:self.feature_limit]
            logger.info(f"Processing limited to {self.feature_limit} features")

        logger.info(f"Processing {len(unique_features):,} features")

        results = []
        for feature_id in tqdm(unique_features, desc="Computing embeddings"):
            feature_df = self.activation_df.filter(pl.col("feature_id") == feature_id)
            result = self._process_feature(feature_id, feature_df)
            results.append(result)
            self.stats["features_processed"] += 1

        logger.info(f"Processed {self.stats['features_processed']:,} features")

        return self._create_dataframe(results)

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

        df = df.with_columns([
            pl.col("feature_id").cast(pl.UInt32),
            pl.col("sae_id").cast(pl.Categorical),
            pl.col("prompt_ids").cast(pl.List(pl.UInt32)),
            pl.col("embeddings").cast(pl.List(pl.List(pl.Float32)))
        ])

        logger.info(f"Created DataFrame with {len(df)} rows and {len(df.columns)} columns")
        return df

    def _create_empty_dataframe(self) -> pl.DataFrame:
        """Create empty DataFrame with correct schema."""
        schema = {
            "feature_id": pl.UInt32,
            "sae_id": pl.Categorical,
            "prompt_ids": pl.List(pl.UInt32),
            "embeddings": pl.List(pl.List(pl.Float32))
        }
        return pl.DataFrame(schema=schema)


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Pre-compute activation embeddings")
    parser.add_argument("--config", type=str, help="Path to configuration file")
    parser.add_argument("--limit", type=int, help="Limit number of features (for testing)")

    args = parser.parse_args()

    setup_logging()

    if args.config:
        full_config = load_yaml_config(args.config)
        # Extract step-specific config if present
        config = full_config.get("steps", {}).get("step_05_activation_embeddings", {})
        if not config:
            # Fallback: treat entire config as step config (legacy format)
            config = full_config
        config["sae_id"] = full_config.get("global", {}).get("sae_id_sanitized", "")
        config["global"] = full_config.get("global", {})
    else:
        config_path = Path(__file__).parent.parent / "config.yaml"
        if config_path.exists():
            full_config = load_yaml_config(config_path)
            config = full_config.get("steps", {}).get("step_05_activation_embeddings", {})
            config["sae_id"] = full_config.get("global", {}).get("sae_id_sanitized", "")
            config["global"] = full_config.get("global", {})
        else:
            config = {}

    processor = ActivationEmbeddingProcessor(config, feature_limit=args.limit)
    processor.run()


if __name__ == "__main__":
    main()
