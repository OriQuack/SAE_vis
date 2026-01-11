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
            "total_embeddings_generated": 0,
            # Alignment statistics
            "alignment_exact_match": 0,
            "alignment_special_tokens_added": 0,
            "alignment_tokens_truncated": 0,
            "alignment_total_examples": 0,
            "max_token_diff": 0
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

    def _select_quantile_examples(self, feature_df: pl.DataFrame) -> List[Tuple[int, float, List[str], int, List[Dict]]]:
        """Select examples using rank-based sampling for even distribution.

        Uses rank-based (positional) sampling instead of value-based quantiles
        to handle degenerate distributions where activation values cluster.

        Args:
            feature_df: DataFrame with activation examples for a single feature

        Returns:
            List of tuples: (prompt_id, max_activation, prompt_tokens, max_token_pos, activation_pairs)
        """
        # Filter out rows with no activations
        feature_df = feature_df.filter(pl.col("num_activations") > 0)

        if len(feature_df) == 0:
            return []

        num_examples = len(feature_df)
        target_per_quantile = self.proc_params["examples_per_quantile"]
        num_quantiles = self.proc_params["num_quantiles"]
        total_target = target_per_quantile * num_quantiles

        # Sort by activation descending
        sorted_df = feature_df.sort("max_activation", descending=True).select([
            "prompt_id",
            "max_activation",
            "prompt_tokens",
            "activation_pairs"
        ])

        if num_examples <= total_target:
            # Return all if we have fewer than target
            selected = sorted_df.to_dicts()
        else:
            # Rank-based sampling: divide into equal-sized groups by position
            group_size = num_examples // num_quantiles
            selected = []

            for i in range(num_quantiles):
                start_idx = i * group_size
                # Last group gets any remainder
                end_idx = start_idx + group_size if i < num_quantiles - 1 else num_examples
                group = sorted_df.slice(start_idx, end_idx - start_idx)
                # Take top k from each group (already sorted by activation desc)
                top_k = group.head(target_per_quantile).to_dicts()
                selected.extend(top_k)

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
                max_token_pos,
                activation_pairs or []  # Include activation_pairs for weighted pooling
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

        Handles tokens like '▁▁▁▁' (indentation) by converting them to spaces.
        '▁' is U+2581 LOWER ONE EIGHTH BLOCK, used as word boundary marker.

        Args:
            token: Token string (may have '▁' prefix)

        Returns:
            Token with '▁' converted: leading ▁ removed, remaining ▁ become spaces
        """
        if not token:
            return token
        # Count leading ▁ characters
        stripped = token.lstrip('▁')
        num_leading = len(token) - len(stripped)
        if num_leading > 0:
            # First ▁ is word boundary (becomes space in join), rest become literal spaces
            # For '▁▁▁▁' -> we want 3 spaces (first is word boundary handled by join)
            extra_spaces = ' ' * (num_leading - 1) if num_leading > 1 else ''
            return extra_spaces + stripped
        return token

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

    def _compute_char_spans(self, tokens: List[str]) -> List[Tuple[int, int]]:
        """Compute character spans for each token in reconstructed text.

        Maps tokens to their (start_char, end_char) positions in the text
        that would be produced by _reconstruct_text.

        Args:
            tokens: List of token strings with '▁' marking word boundaries

        Returns:
            List of (start_char, end_char) tuples for each token
        """
        spans = []
        current_pos = 0

        for i, token in enumerate(tokens):
            if token == '▁':
                # Standalone space token - represents the space character itself
                if current_pos > 0:
                    start = current_pos
                    end = current_pos + 1
                    current_pos += 1
                else:
                    start = 0
                    end = 0
                spans.append((start, end))
            elif token.startswith('▁'):
                # Word boundary - add space before (except at start)
                if current_pos > 0:
                    current_pos += 1  # Account for space from join()

                # Handle multiple ▁ (e.g., '▁▁▁▁' for indentation)
                stripped = token.lstrip('▁')
                num_leading = len(token) - len(stripped)
                extra_spaces = num_leading - 1  # First ▁ is word boundary

                start = current_pos
                # Token content = extra_spaces + stripped text
                token_len = extra_spaces + len(stripped)
                end = current_pos + token_len
                spans.append((start, end))
                current_pos = end
            else:
                # Continuation token - no space
                start = current_pos
                end = current_pos + len(token)
                spans.append((start, end))
                current_pos = end

        return spans

    def _compute_char_spans_for_embedding(self, tokens: List[str], text: str) -> List[Tuple[int, int]]:
        """Compute character spans for embedding model tokens.

        Different from _compute_char_spans because embedding tokenizers may have
        special tokens like <0x0D> that represent characters differently.

        Args:
            tokens: List of tokens from embedding model tokenizer
            text: The original text that was tokenized

        Returns:
            List of (start_char, end_char) tuples for each token
        """
        spans = []
        current_pos = 0
        text_len = len(text)

        for token in tokens:
            # Handle special tokens that don't appear in text
            if token.startswith('<0x') and token.endswith('>'):
                # Hex-encoded special character (e.g., <0x0D> for \r)
                # These map to single characters in the text
                if current_pos < text_len:
                    spans.append((current_pos, current_pos + 1))
                    current_pos += 1
                else:
                    spans.append((current_pos, current_pos))
            elif token == '\n' or token == '\r':
                # Newline/carriage return
                if current_pos < text_len:
                    spans.append((current_pos, current_pos + 1))
                    current_pos += 1
                else:
                    spans.append((current_pos, current_pos))
            elif token == '▁':
                # Standalone space
                if current_pos > 0 and current_pos < text_len:
                    spans.append((current_pos, current_pos + 1))
                    current_pos += 1
                else:
                    spans.append((current_pos, current_pos))
            elif token.startswith('▁'):
                # Word with leading space
                if current_pos > 0 and current_pos < text_len and text[current_pos] == ' ':
                    current_pos += 1  # Skip the space
                stripped = token.lstrip('▁')
                num_leading = len(token) - len(stripped)
                extra_spaces = num_leading - 1
                start = current_pos
                token_len = extra_spaces + len(stripped)
                end = min(current_pos + token_len, text_len)
                spans.append((start, end))
                current_pos = end
            else:
                # Regular token
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
        """Map Gemma 9B activation values to EmbeddingGemma token positions.

        Uses character-level overlap to handle tokenizer differences between
        Gemma 9B (activation source) and EmbeddingGemma (embedding model).

        Args:
            gemma_tokens: Original Gemma 9B tokens (full prompt, with '▁' prefixes)
            activation_pairs: List of {token_position, activation_value}
            embedding_text: Reconstructed text passed to embedding model
            window_start: Start position of the token window in original prompt
            window_end: End position of the token window in original prompt
            num_embedding_tokens: Actual number of tokens in the embedding output
                                  (includes special tokens like BOS/EOS)

        Returns:
            Array of activation weights for each embedding token
        """
        # Step 1: Get window tokens and their character spans
        window_tokens = gemma_tokens[window_start:window_end]
        gemma_char_spans = self._compute_char_spans(window_tokens)

        # Step 2: Build activation values for window tokens (map absolute to relative positions)
        window_activations = np.zeros(len(window_tokens))
        for pair in activation_pairs:
            abs_pos = pair["token_position"]
            rel_pos = abs_pos - window_start
            if 0 <= rel_pos < len(window_tokens):
                window_activations[rel_pos] = pair["activation_value"]

        # Step 3: Get embedding model's tokenization and compute proper spans
        embedding_tokens = self.sentence_model.tokenizer.tokenize(embedding_text)
        emb_char_spans = self._compute_char_spans_for_embedding(embedding_tokens, embedding_text)

        # Step 4: Map activations via character overlap (for content tokens only)
        content_activations = np.zeros(len(embedding_tokens))
        for emb_idx, (emb_start, emb_end) in enumerate(emb_char_spans):
            max_activation = 0.0
            for gemma_idx, (g_start, g_end) in enumerate(gemma_char_spans):
                # Check for character overlap
                overlap_start = max(emb_start, g_start)
                overlap_end = min(g_end, emb_end)
                if overlap_start < overlap_end:
                    # Overlap exists - use max activation from overlapping tokens
                    max_activation = max(max_activation, window_activations[gemma_idx])
            content_activations[emb_idx] = max_activation

        # Step 5: Handle special tokens (BOS, EOS, etc.)
        # The embedding output may have more tokens than tokenize() returns
        # Typically: [BOS] + content_tokens + [EOS] or similar
        num_special_tokens = num_embedding_tokens - len(embedding_tokens)

        # Track alignment statistics
        self.stats["alignment_total_examples"] += 1
        self.stats["max_token_diff"] = max(self.stats["max_token_diff"], abs(num_special_tokens))

        # Log large discrepancies for debugging
        if abs(num_special_tokens) > 5:
            logger.debug(f"Large token diff: emb_tokens={num_embedding_tokens}, "
                        f"tokenize()={len(embedding_tokens)}, diff={num_special_tokens}")

        if num_special_tokens > 0:
            self.stats["alignment_special_tokens_added"] += 1
            # Assume special tokens are distributed as prefix and suffix
            # Common pattern: 1 BOS at start, possibly 1 EOS at end
            num_prefix = min(1, num_special_tokens)  # Usually 1 BOS token

            # Build full activation array with zeros for special tokens
            full_activations = np.zeros(num_embedding_tokens)
            full_activations[num_prefix:num_prefix + len(content_activations)] = content_activations
            return full_activations
        elif num_special_tokens < 0:
            self.stats["alignment_tokens_truncated"] += 1
            # Embedding has fewer tokens than tokenize() returned
            # This can happen due to tokenizer differences - truncate content_activations
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

        Formula: Σ(w_i * v_i) / Σ(w_i) where w_i = softmax(activation_i / temperature)

        Args:
            token_embeddings: Shape (num_tokens, embedding_dim)
            activation_weights: Shape (num_tokens,) - raw activation values
            temperature: Softmax temperature (higher = smoother weights)

        Returns:
            L2-normalized embedding vector of shape (embedding_dim,)
        """
        # Handle edge case: all zero activations -> fall back to mean pooling
        if np.sum(activation_weights) == 0:
            weighted_embedding = np.mean(token_embeddings, axis=0)
        else:
            # Apply softmax with temperature (numerically stable)
            scaled = activation_weights / temperature
            scaled = scaled - np.max(scaled)  # Prevent overflow
            weights = np.exp(scaled)
            weights = weights / np.sum(weights)

            # Weighted average
            weighted_embedding = np.sum(token_embeddings * weights[:, np.newaxis], axis=0)

        # L2 normalize
        norm = np.linalg.norm(weighted_embedding)
        if norm > 0:
            weighted_embedding = weighted_embedding / norm

        return weighted_embedding.astype(np.float32)

    def process_feature(self, feature_id: int, feature_df: pl.DataFrame) -> Dict[str, Any]:
        """Process a single feature to compute embeddings for quantile examples.

        Uses activation-weighted pooling when pooling_mode is 'weighted'.
        Falls back to mean pooling otherwise.

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
            # BATCH encode all texts at once to get token embeddings
            all_token_embeddings = self.sentence_model.encode(
                window_texts,
                output_value="token_embeddings",
                convert_to_tensor=True,
                show_progress_bar=False
            )

            # Apply individual weights to each example
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
            # Default mean pooling - batch encode
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

    # Print alignment statistics if weighted pooling was used
    if processor.stats.get("alignment_total_examples", 0) > 0:
        total = processor.stats["alignment_total_examples"]
        exact = processor.stats["alignment_exact_match"]
        special = processor.stats["alignment_special_tokens_added"]
        truncated = processor.stats["alignment_tokens_truncated"]
        max_diff = processor.stats["max_token_diff"]

        logger.info("-" * 40)
        logger.info("Token Alignment Statistics:")
        logger.info(f"  Total examples aligned: {total:,}")
        logger.info(f"  Exact token match: {exact:,} ({100*exact/total:.1f}%)")
        logger.info(f"  Special tokens added: {special:,} ({100*special/total:.1f}%)")
        logger.info(f"  Tokens truncated: {truncated:,} ({100*truncated/total:.1f}%)")
        logger.info(f"  Max token count difference: {max_diff}")

    logger.info("=" * 80)


if __name__ == "__main__":
    main()
