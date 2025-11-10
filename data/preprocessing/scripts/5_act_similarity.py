#!/usr/bin/env python3
"""
Preprocessing Script: Calculate Activation Example Similarity Metrics

This script analyzes activation examples to compute similarity metrics based on
quantile-sampled prompts for each SAE feature. It calculates two key metrics:
1. Pairwise semantic similarity across 32-token windows
2. Dual n-gram patterns:
   - Character n-grams in 3-token windows (morphology: suffixes, prefixes)
   - Word n-grams in 11-token windows (semantics: reconstructed words)

Input:
- activation_examples.parquet: Structured parquet with activation data

Output:
- activation_example_similarity.parquet: Similarity metrics per feature
- activation_example_similarity.parquet.metadata.json: Processing metadata

Features:
- Quantile-based sampling (4 quantiles, 2 examples each)
- Dual window sizes for char (3 tokens) and word (11 tokens) n-grams
- Native Polars nested types for structured data
- Batch processing for efficiency
- Comprehensive progress tracking

Usage:
    python 5_act_similarity.py [--config CONFIG_PATH] [--limit N]

Example:
    python 5_act_similarity.py
    python 5_act_similarity.py --limit 100  # Test on 100 features
"""

import json
import logging
import argparse
import re
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime
import numpy as np
import polars as pl
from tqdm import tqdm

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
        "activation_embeddings_path": "data/master/activation_embeddings.parquet",
        "output_path": "data/master/activation_example_similarity.parquet",
        "sae_id": "google--gemma-scope-9b-pt-res--layer_30--width_16k--average_l0_120",
        "processing_parameters": {
            "num_quantiles": 4,
            "examples_per_quantile": 2,
            "target_examples_per_feature": 8,
            "token_window_size": 32,
            "char_ngram_window_size": 3,
            "word_ngram_window_size": 11,
            "ngram_sizes": [2, 3, 4],
            "min_ngram_occurrences": 2
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


class ActivationSimilarityProcessor:
    """Process activation examples to compute similarity metrics."""

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
        self.embeddings_path = self._resolve_path(config["activation_embeddings_path"])
        self.output_path = self._resolve_path(config["output_path"])

        # Configuration
        self.sae_id = config["sae_id"]
        self.proc_params = config["processing_parameters"]

        # Statistics tracking
        self.stats = {
            "features_processed": 0,
            "features_with_no_activations": 0,
            "features_with_insufficient_examples": 0,
            "total_examples_analyzed": 0,
            "semantic_similarity_computed": 0,
            "ngram_analysis_computed": 0,
            "ngram_jaccard_computed": 0
        }

        # Load embeddings
        self.embeddings_df = None

    def _resolve_path(self, path_str: str) -> Path:
        """Resolve path relative to project root if not absolute."""
        path = Path(path_str)
        if not path.is_absolute():
            return self.project_root / path
        return path

    def _load_embeddings(self):
        """Load pre-computed embeddings."""
        if self.embeddings_df is None:
            logger.info(f"Loading pre-computed embeddings from {self.embeddings_path}")
            if not self.embeddings_path.exists():
                raise FileNotFoundError(
                    f"Pre-computed embeddings not found: {self.embeddings_path}\n"
                    f"Please run: python 4_act_embeddings.py"
                )
            self.embeddings_df = pl.read_parquet(self.embeddings_path)
            logger.info(f"Loaded embeddings for {len(self.embeddings_df):,} features")

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

    def _select_top_k_per_quantile(self, examples: List[Tuple], k: int) -> List[Tuple]:
        """Select top k examples per quantile by activation strength.

        Args:
            examples: List of (prompt_id, max_activation, prompt_tokens, max_token_pos)
            k: Number to select per quantile

        Returns:
            Top k*num_quantiles examples sorted by quantile and activation
        """
        if len(examples) == 0:
            return []

        # Calculate quantile boundaries
        activations = [ex[1] for ex in examples]
        num_quantiles = self.proc_params["num_quantiles"]
        quantiles = [i / num_quantiles for i in range(1, num_quantiles)]
        q_values = [float(np.quantile(activations, q)) for q in quantiles]

        # Assign examples to quantiles and select top k from each
        selected = []
        for q_idx in range(num_quantiles):
            # Filter examples for this quantile
            if q_idx == 0:
                q_examples = [ex for ex in examples if ex[1] <= q_values[0]]
            elif q_idx < num_quantiles - 1:
                q_examples = [ex for ex in examples if q_values[q_idx-1] < ex[1] <= q_values[q_idx]]
            else:
                q_examples = [ex for ex in examples if ex[1] > q_values[-1]]

            # Sort by activation (descending) and take top k
            q_examples.sort(key=lambda x: x[1], reverse=True)
            selected.extend(q_examples[:k])

        return selected

    def _extract_token_window(self, tokens: List[str], center_pos: int, window_size: int) -> List[str]:
        """Extract symmetric window around center position.

        Args:
            tokens: List of token strings
            center_pos: Center token position
            window_size: Total window size

        Returns:
            List of tokens in window (may be shorter if near edges)
        """
        half_window = window_size // 2
        start = max(0, center_pos - half_window)
        # For odd window sizes, add 1 to include the center token
        # e.g., window_size=1: [center], window_size=3: [center-1, center, center+1]
        end = min(len(tokens), center_pos + half_window + (window_size % 2))
        return tokens[start:end]

    def _normalize_token(self, token: str) -> str:
        """Strip SentencePiece '▁' prefix from token.

        Args:
            token: Token string (may have '▁' prefix)

        Returns:
            Token without '▁' prefix
        """
        return token.lstrip('▁')

    def _reconstruct_words(self, tokens: List[str]) -> List[str]:
        """Reconstruct full words by joining subword tokens.

        Args:
            tokens: List of token strings with '▁' marking word boundaries

        Returns:
            List of reconstructed words (tokens with '▁' start new words)
        """
        if not tokens:
            return []

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

        return words

    def _compute_pairwise_semantic_similarity(self, feature_id: int, examples: List[Tuple]) -> Optional[float]:
        """Compute average pairwise cosine similarity using pre-computed embeddings.

        Args:
            feature_id: Feature ID to look up embeddings
            examples: List of (prompt_id, max_activation, prompt_tokens, max_token_pos)

        Returns:
            Average pairwise similarity or None if <2 examples
        """
        if len(examples) < 2:
            return None

        # Get prompt IDs from examples
        prompt_ids = [ex[0] for ex in examples]

        # Look up pre-computed embeddings for this feature
        feature_embeddings = self.embeddings_df.filter(pl.col("feature_id") == feature_id)

        if len(feature_embeddings) == 0:
            logger.warning(f"No pre-computed embeddings found for feature {feature_id}")
            return None

        # Extract embeddings and prompt_ids lists
        stored_prompt_ids = feature_embeddings["prompt_ids"][0]
        stored_embeddings = feature_embeddings["embeddings"][0]

        # Create mapping from prompt_id to embedding
        embedding_map = {pid: emb for pid, emb in zip(stored_prompt_ids, stored_embeddings)}

        # Get embeddings for the selected examples
        embeddings = []
        for prompt_id in prompt_ids:
            if prompt_id in embedding_map:
                embeddings.append(embedding_map[prompt_id])
            else:
                logger.warning(f"Prompt {prompt_id} not found in pre-computed embeddings for feature {feature_id}")
                return None

        if len(embeddings) < 2:
            return None

        # Convert to numpy array
        embeddings = np.array(embeddings)

        # Compute pairwise cosine similarities
        from sklearn.metrics.pairwise import cosine_similarity
        sim_matrix = cosine_similarity(embeddings)

        # Extract upper triangle (excluding diagonal)
        n = len(embeddings)
        pairwise_sims = []
        for i in range(n):
            for j in range(i + 1, n):
                pairwise_sims.append(sim_matrix[i, j])

        if not pairwise_sims:
            return None

        return float(np.mean(pairwise_sims))

    def _extract_character_ngrams(self, text: str, n: int) -> List[str]:
        """Extract character n-grams from text.

        Args:
            text: Input text
            n: N-gram size

        Returns:
            List of n-grams
        """
        if len(text) < n:
            return []
        return [text[i:i+n] for i in range(len(text) - n + 1)]

    def _reconstruct_words_with_positions(self, tokens: List[str]) -> List[Tuple[str, int]]:
        """Reconstruct full words with their starting token positions.

        Args:
            tokens: List of token strings with '▁' marking word boundaries

        Returns:
            List of tuples (reconstructed_word, start_token_position)
        """
        if not tokens:
            return []

        words_with_positions = []
        current_word = ""
        word_start_pos = 0

        # Define punctuation including Unicode smart quotes
        # \u201c=" \u201d=" \u2018=' \u2019='
        punct_chars = '.,!?;:"\'\n\t()[]{}\u201c\u201d\u2018\u2019`'

        for i, token in enumerate(tokens):
            token_clean = token.lstrip('_▁').strip()

            if token.startswith('▁'):
                # New word boundary (space prefix)
                if current_word:
                    words_with_positions.append((current_word, word_start_pos))
                current_word = token_clean.lower()
                word_start_pos = i
            elif not token_clean or token_clean in punct_chars:
                # Punctuation or whitespace - save current word and skip
                if current_word:
                    words_with_positions.append((current_word, word_start_pos))
                    current_word = ""
            elif not current_word:
                # Starting a new word (e.g., "How" after punctuation)
                # Strip any leading punctuation from the word itself
                while token_clean and token_clean[0] in punct_chars:
                    token_clean = token_clean[1:]
                if token_clean:
                    current_word = token_clean.lower()
                    word_start_pos = i
            else:
                # Continuation of current word
                current_word += token_clean.lower()

        # Don't forget last word
        if current_word:
            words_with_positions.append((current_word, word_start_pos))

        return words_with_positions

    def _extract_token_char_ngrams(self, tokens: List[str], ngram_sizes: List[int]) -> Dict[str, List[Tuple[int, str, int]]]:
        """Extract character n-grams from individual tokens (not concatenated).

        Args:
            tokens: List of token strings
            ngram_sizes: List of n-gram sizes to extract

        Returns:
            Dict mapping n-gram → [(token_index, token_text, char_offset), ...]
            where char_offset is the starting position of the n-gram within the normalized token
        """
        from collections import defaultdict
        ngram_map = defaultdict(list)

        for token_idx, token in enumerate(tokens):
            # Normalize token (strip '▁' prefix)
            token_normalized = self._normalize_token(token).lower()

            # Skip very short tokens
            if len(token_normalized) < 2:
                continue

            # Extract character n-grams within this token
            for ngram_size in ngram_sizes:
                if len(token_normalized) >= ngram_size:
                    for i in range(len(token_normalized) - ngram_size + 1):
                        ngram = token_normalized[i:i+ngram_size]
                        # Store: (token_index, original_token_text, char_offset)
                        ngram_map[ngram].append((token_idx, token, i))

        return dict(ngram_map)

    def _extract_word_ngrams(self, tokens: List[str], ngram_sizes: List[int]) -> Dict[str, List[int]]:
        """Extract word-level n-grams by reconstructing full words from subword tokens.

        Args:
            tokens: List of token strings
            ngram_sizes: List of word n-gram sizes (1=unigram, 2=bigram, etc.)

        Returns:
            Dict mapping word_ngram → [start_token_positions]
        """
        from collections import defaultdict

        # Reconstruct words with their token positions
        words_with_positions = self._reconstruct_words_with_positions(tokens)

        if not words_with_positions:
            return {}

        word_ngram_map = defaultdict(list)

        # Extract word n-grams
        for ngram_size in ngram_sizes:
            if len(words_with_positions) >= ngram_size:
                for i in range(len(words_with_positions) - ngram_size + 1):
                    # Safety check for index bounds
                    if i >= len(words_with_positions) or i + ngram_size > len(words_with_positions):
                        continue

                    # Create word n-gram (space-separated, lowercase)
                    word_ngram = " ".join([w[0] for w in words_with_positions[i:i+ngram_size]])
                    # Use token position of first word in n-gram
                    start_token_pos = words_with_positions[i][1]
                    word_ngram_map[word_ngram].append(start_token_pos)

        return dict(word_ngram_map)

    def _compute_jaccard_ngram_similarity(self, examples: List[Tuple], ngram_size: int) -> Optional[float]:
        """Compute average pairwise Jaccard similarity for character n-grams (per-token).

        Args:
            examples: List of (prompt_id, max_activation, prompt_tokens, max_token_pos)
            ngram_size: Size of n-grams (2, 3, 4, or 5)

        Returns:
            Average Jaccard similarity or None if <2 examples
        """
        if len(examples) < 2:
            return None

        # Use character n-gram window size (default: 3)
        char_ngram_window = self.proc_params.get("char_ngram_window_size", self.proc_params.get("ngram_window_size", 5))

        # Extract character n-grams per token for each example
        example_ngrams = []
        for _, _, tokens, max_pos in examples:
            window_tokens = self._extract_token_window(tokens, max_pos, char_ngram_window)
            # Use per-token extraction with '▁' prefix stripping
            token_ngrams = self._extract_token_char_ngrams(window_tokens, [ngram_size])
            # Get unique n-grams of this size
            ngrams = set(ng for ng in token_ngrams.keys() if len(ng) == ngram_size)
            example_ngrams.append(ngrams)

        # Compute pairwise Jaccard similarities
        n = len(example_ngrams)
        pairwise_jaccards = []
        for i in range(n):
            for j in range(i + 1, n):
                set_a = example_ngrams[i]
                set_b = example_ngrams[j]

                if len(set_a) == 0 and len(set_b) == 0:
                    # Both empty, consider as perfect similarity
                    jaccard = 1.0
                elif len(set_a) == 0 or len(set_b) == 0:
                    # One empty, one not, zero similarity
                    jaccard = 0.0
                else:
                    intersection = len(set_a & set_b)
                    union = len(set_a | set_b)
                    jaccard = intersection / union if union > 0 else 0.0

                pairwise_jaccards.append(jaccard)

        if not pairwise_jaccards:
            return None

        return float(np.mean(pairwise_jaccards))

    def _compute_specific_ngram_jaccard(self, examples: List[Tuple], ngram_text: str, is_word: bool = False) -> Optional[float]:
        """Compute pairwise Jaccard similarity for ONE specific n-gram.

        Args:
            examples: List of (prompt_id, max_activation, prompt_tokens, max_token_pos)
            ngram_text: The specific n-gram to compute Jaccard for
            is_word: If True, treat as word n-gram; if False, treat as char n-gram

        Returns:
            Average pairwise Jaccard similarity or None if <2 examples
        """
        if len(examples) < 2:
            return None

        # Use appropriate window size based on n-gram type
        if is_word:
            ngram_window = self.proc_params.get("word_ngram_window_size", self.proc_params.get("ngram_window_size", 5))
        else:
            ngram_window = self.proc_params.get("char_ngram_window_size", self.proc_params.get("ngram_window_size", 5))

        # Extract whether each example contains this n-gram
        example_has_ngram = []

        for _, _, tokens, max_pos in examples:
            window_tokens = self._extract_token_window(tokens, max_pos, ngram_window)

            has_ngram = False
            if is_word:
                # Word n-gram: reconstruct words and check for phrase
                word_ngrams = self._extract_word_ngrams(window_tokens, [len(ngram_text.split())])
                has_ngram = ngram_text in word_ngrams
            else:
                # Char n-gram: extract from tokens
                token_ngrams = self._extract_token_char_ngrams(window_tokens, [len(ngram_text)])
                has_ngram = ngram_text in token_ngrams

            example_has_ngram.append(has_ngram)

        # Compute pairwise Jaccard (treating as binary: has or doesn't have)
        n = len(example_has_ngram)
        pairwise_jaccards = []

        for i in range(n):
            for j in range(i + 1, n):
                has_i = example_has_ngram[i]
                has_j = example_has_ngram[j]

                if has_i and has_j:
                    # Both have it: perfect match
                    jaccard = 1.0
                elif not has_i and not has_j:
                    # Both don't have it: no similarity
                    jaccard = 0.0
                else:
                    # One has, one doesn't: no similarity
                    jaccard = 0.0

                pairwise_jaccards.append(jaccard)

        if not pairwise_jaccards:
            return None

        return float(np.mean(pairwise_jaccards))

    def _compute_ngram_analysis(self, all_examples: List[Tuple], display_examples: List[Tuple]) -> Dict[str, List[Dict]]:
        """Compute dual-level n-gram analysis: character (per-token) and word-level.

        Uses all_examples for frequency counting and Jaccard calculation,
        but only tracks positions for display_examples to minimize storage.

        Args:
            all_examples: All examples for frequency counting (e.g., 12 examples)
            display_examples: Subset for position tracking (e.g., top 8 by activation)

        Returns:
            Dict with "char_ngrams" and "word_ngrams" lists
        """
        if len(all_examples) == 0:
            return {"char_ngrams": [], "word_ngrams": [], "top_char": None, "top_word": None}

        from collections import defaultdict

        # Use separate window sizes for char and word n-grams
        char_ngram_window = self.proc_params.get("char_ngram_window_size", self.proc_params.get("ngram_window_size", 5))
        word_ngram_window = self.proc_params.get("word_ngram_window_size", self.proc_params.get("ngram_window_size", 5))

        # Get n-gram sizes from config (with fallback to old param)
        char_ngram_sizes = self.proc_params.get("char_ngram_sizes", self.proc_params.get("ngram_sizes", [2, 3, 4]))
        word_ngram_sizes = self.proc_params.get("word_ngram_sizes", [1, 2, 3])

        # Phase 1: Count character n-grams across ALL examples (for frequency)
        char_ngram_counts = defaultdict(int)
        for prompt_id, _, tokens, max_pos in all_examples:
            window_tokens = self._extract_token_window(tokens, max_pos, char_ngram_window)
            token_ngrams = self._extract_token_char_ngrams(window_tokens, char_ngram_sizes)
            for ngram in token_ngrams.keys():
                char_ngram_counts[ngram] += len(token_ngrams[ngram])

        # Phase 2: Track positions ONLY for display examples
        char_ngram_occurrences = defaultdict(list)
        for prompt_id, _, tokens, max_pos in display_examples:
            window_tokens = self._extract_token_window(tokens, max_pos, char_ngram_window)
            token_ngrams = self._extract_token_char_ngrams(window_tokens, char_ngram_sizes)
            
            # Correctly calculate window offset, clamping at 0
            window_offset = max(0, max_pos - char_ngram_window // 2)

            for ngram, token_list in token_ngrams.items():
                for token_idx, token_text, char_offset in token_list:
                    char_ngram_occurrences[ngram].append({
                        "prompt_id": prompt_id,
                        "token_position": window_offset + token_idx,
                        "token_text": token_text,
                        "char_offset": char_offset,
                        "ngram_size": len(ngram)
                    })

        # Find top character n-gram per size using counts from ALL examples
        top_char_ngrams = []
        for size in char_ngram_sizes:
            size_ngrams = {ng: cnt for ng, cnt in char_ngram_counts.items() if len(ng) == size}
            if size_ngrams:
                # Tie-breaker: if counts equal, prefer alphabetically (all same size)
                top_ngram = max(size_ngrams.items(), key=lambda x: (x[1], x[0]))[0]
                # Get occurrences from display examples only
                occurrences = char_ngram_occurrences.get(top_ngram, [])
                top_char_ngrams.append({
                    "ngram": top_ngram,
                    "ngram_size": size,
                    "count": size_ngrams[top_ngram],  # Count from ALL examples
                    "occurrences": occurrences[:20]  # Positions from display examples only
                })

        # Phase 1: Count word n-grams across ALL examples (for frequency)
        word_ngram_counts = defaultdict(int)
        for prompt_id, _, tokens, max_pos in all_examples:
            window_tokens = self._extract_token_window(tokens, max_pos, word_ngram_window)
            word_ngrams = self._extract_word_ngrams(window_tokens, word_ngram_sizes)
            for word_ngram, positions in word_ngrams.items():
                word_ngram_counts[word_ngram] += len(positions)

        # Phase 2: Track positions ONLY for display examples
        word_ngram_occurrences = defaultdict(list)
        for prompt_id, _, tokens, max_pos in display_examples:
            window_tokens = self._extract_token_window(tokens, max_pos, word_ngram_window)
            word_ngrams = self._extract_word_ngrams(window_tokens, word_ngram_sizes)
            
            # Correctly calculate window offset, clamping at 0
            window_offset = max(0, max_pos - word_ngram_window // 2)

            for word_ngram, positions in word_ngrams.items():
                for pos in positions:
                    word_ngram_occurrences[word_ngram].append({
                        "prompt_id": prompt_id,
                        "start_position": window_offset + pos,
                        "ngram_size": len(word_ngram.split())
                    })

        # Find top word n-gram per size using counts from ALL examples
        top_word_ngrams = []
        for size in word_ngram_sizes:
            size_ngrams = {ng: cnt for ng, cnt in word_ngram_counts.items()
                          if len(ng.split()) == size}
            if size_ngrams:
                # Tie-breaker: if counts equal, sort alphabetically for determinism
                top_ngram = max(size_ngrams.items(), key=lambda x: (x[1], x[0]))[0]
                # Get occurrences from display examples only
                occurrences = word_ngram_occurrences.get(top_ngram, [])
                top_word_ngrams.append({
                    "ngram": top_ngram,
                    "ngram_size": size,
                    "count": size_ngrams[top_ngram],  # Count from ALL examples
                    "occurrences": occurrences[:20]  # Positions from display examples only
                })

        # Find OVERALL top char n-gram (across all sizes) using counts from ALL examples
        overall_top_char = None
        if char_ngram_counts:
            # Tie-breaker: if counts equal, prefer longer n-gram (more specific)
            top_char_ngram = max(
                char_ngram_counts.items(),
                key=lambda x: (x[1], len(x[0]))
            )[0]
            # Get occurrences from display examples only
            top_char_occurrences = char_ngram_occurrences.get(top_char_ngram, [])
            overall_top_char = {
                "ngram": top_char_ngram,
                "ngram_size": len(top_char_ngram),
                "count": char_ngram_counts[top_char_ngram],  # Count from ALL examples
                "occurrences": top_char_occurrences  # Positions from display examples only
            }

        # Find OVERALL top word n-gram (across all sizes) using counts from ALL examples
        overall_top_word = None
        if word_ngram_counts:
            # Tie-breaker: if counts equal, prefer longer phrase (more words = more specific)
            top_word_ngram = max(
                word_ngram_counts.items(),
                key=lambda x: (x[1], len(x[0].split()))
            )[0]
            # Get occurrences from display examples only
            top_word_occurrences = word_ngram_occurrences.get(top_word_ngram, [])
            overall_top_word = {
                "ngram": top_word_ngram,
                "ngram_size": len(top_word_ngram.split()),
                "count": word_ngram_counts[top_word_ngram],  # Count from ALL examples
                "occurrences": top_word_occurrences  # Positions from display examples only
            }

        return {
            "char_ngrams": top_char_ngrams,
            "word_ngrams": top_word_ngrams,
            "top_char": overall_top_char,
            "top_word": overall_top_word
        }

    def process_feature(self, feature_id: int, feature_df: pl.DataFrame) -> Dict[str, Any]:
        """Process a single feature to compute all similarity metrics.

        Uses two-phase approach: all examples (12) for robust calculations,
        top examples (8) for position tracking.

        Args:
            feature_id: Feature ID
            feature_df: DataFrame with activation examples for this feature

        Returns:
            Dictionary with computed metrics
        """
        num_total_activations = int(feature_df.filter(pl.col("num_activations") > 0).shape[0])

        # Phase 1: Load ALL examples from pre-computed embeddings (12 examples)
        feature_embeddings = self.embeddings_df.filter(pl.col("feature_id") == feature_id)

        if len(feature_embeddings) == 0:
            logger.warning(f"No pre-computed embeddings found for feature {feature_id}")
            self.stats["features_with_no_activations"] += 1
            return {
                "feature_id": feature_id,
                "sae_id": self.sae_id,
                "prompt_ids_for_calculation": [],
                "prompt_ids_for_display": [],
                "num_total_activations": num_total_activations,
                "avg_pairwise_semantic_similarity": None,
                "top_char_ngrams": [],
                "top_word_ngrams": [],
                "top_char_ngram": None,
                "top_word_ngram": None,
                "top_char_ngram_jaccard": None,
                "top_word_ngram_jaccard": None,
                "quantile_boundaries": [],
                "ngram_jaccard_similarity": [None, None, None, None]
            }

        all_prompt_ids = feature_embeddings["prompt_ids"][0]

        # Fetch activation data for all 12 examples
        all_examples = []
        for prompt_id in all_prompt_ids:
            example_row = feature_df.filter(pl.col("prompt_id") == prompt_id)
            if len(example_row) > 0:
                row_dict = example_row.to_dicts()[0]
                activation_pairs = row_dict.get("activation_pairs", [])
                max_activation = row_dict.get("max_activation")

                # Find max token position
                if activation_pairs and len(activation_pairs) > 0:
                    max_pair = max(activation_pairs, key=lambda p: p["activation_value"])
                    max_token_pos = max_pair["token_position"]
                else:
                    max_token_pos = 0

                all_examples.append((
                    prompt_id,
                    max_activation if max_activation is not None else 0.0,
                    row_dict.get("prompt_tokens", []),
                    max_token_pos
                ))

        if len(all_examples) == 0:
            self.stats["features_with_no_activations"] += 1
            return {
                "feature_id": feature_id,
                "sae_id": self.sae_id,
                "prompt_ids_for_calculation": [],
                "prompt_ids_for_display": [],
                "num_total_activations": num_total_activations,
                "avg_pairwise_semantic_similarity": None,
                "top_char_ngrams": [],
                "top_word_ngrams": [],
                "top_char_ngram": None,
                "top_word_ngram": None,
                "top_char_ngram_jaccard": None,
                "top_word_ngram_jaccard": None,
                "quantile_boundaries": [],
                "ngram_jaccard_similarity": [None, None, None, None]
            }

        if len(all_examples) < self.proc_params["target_examples_per_feature"]:
            self.stats["features_with_insufficient_examples"] += 1

        self.stats["total_examples_analyzed"] += len(all_examples)

        # Phase 2: Select top k per quantile for position tracking (8 examples)
        position_samples_per_quantile = self.proc_params.get("position_samples_per_quantile", 2)
        display_examples = self._select_top_k_per_quantile(all_examples, k=position_samples_per_quantile)

        # Extract prompt IDs for both sets
        calc_prompt_ids = [ex[0] for ex in all_examples]
        display_prompt_ids = [ex[0] for ex in display_examples]

        # Compute metrics using ALL examples for robust statistics
        semantic_sim = self._compute_pairwise_semantic_similarity(feature_id, all_examples)
        if semantic_sim is not None:
            self.stats["semantic_similarity_computed"] += 1

        # Compute Jaccard similarity for each n-gram size using ALL examples
        ngram_jaccard_list = [
            self._compute_jaccard_ngram_similarity(all_examples, 2),
            self._compute_jaccard_ngram_similarity(all_examples, 3),
            self._compute_jaccard_ngram_similarity(all_examples, 4),
            self._compute_jaccard_ngram_similarity(all_examples, 5)
        ]
        if any(j is not None for j in ngram_jaccard_list):
            self.stats["ngram_jaccard_computed"] += 1

        # Get dual-level n-grams: ALL for counting, display for positions
        ngram_results = self._compute_ngram_analysis(all_examples, display_examples)
        top_char_ngrams = ngram_results.get("char_ngrams", [])
        top_word_ngrams = ngram_results.get("word_ngrams", [])
        overall_top_char = ngram_results.get("top_char")
        overall_top_word = ngram_results.get("top_word")

        if len(top_char_ngrams) > 0 or len(top_word_ngrams) > 0:
            self.stats["ngram_analysis_computed"] += 1

        # Compute Jaccard for the OVERALL top n-grams using ALL examples
        top_char_ngram_jaccard = None
        if overall_top_char:
            top_char_ngram_jaccard = self._compute_specific_ngram_jaccard(
                all_examples,
                overall_top_char["ngram"],
                is_word=False
            )

        top_word_ngram_jaccard = None
        if overall_top_word:
            top_word_ngram_jaccard = self._compute_specific_ngram_jaccard(
                all_examples,
                overall_top_word["ngram"],
                is_word=True
            )

        # Calculate quantile boundaries from ALL examples
        activations = [ex[1] for ex in all_examples]
        if len(activations) >= self.proc_params["num_quantiles"]:
            num_q = self.proc_params["num_quantiles"]
            quantiles = [i / num_q for i in range(1, num_q)]
            q_boundaries = [float(np.quantile(activations, q)) for q in quantiles]
        else:
            q_boundaries = []

        return {
            "feature_id": feature_id,
            "sae_id": self.sae_id,
            "prompt_ids_for_calculation": calc_prompt_ids,  # All 12
            "prompt_ids_for_display": display_prompt_ids,   # Top 8
            "num_total_activations": num_total_activations,
            "avg_pairwise_semantic_similarity": semantic_sim,
            "top_char_ngrams": top_char_ngrams,
            "top_word_ngrams": top_word_ngrams,
            "top_char_ngram": overall_top_char,
            "top_word_ngram": overall_top_word,
            "top_char_ngram_jaccard": top_char_ngram_jaccard,
            "top_word_ngram_jaccard": top_word_ngram_jaccard,
            "quantile_boundaries": q_boundaries,
            "ngram_jaccard_similarity": ngram_jaccard_list
        }

    def process_all_features(self) -> pl.DataFrame:
        """Process all features and create DataFrame.

        Returns:
            Polars DataFrame with similarity metrics
        """
        logger.info(f"Loading activation examples from {self.activation_path}")

        if not self.activation_path.exists():
            raise FileNotFoundError(f"Activation examples not found: {self.activation_path}")

        # Load activation data
        df = pl.read_parquet(self.activation_path)
        logger.info(f"Loaded {len(df):,} activation examples")

        # Load embeddings
        self._load_embeddings()

        # Get unique features
        unique_features = sorted(df["feature_id"].unique().to_list())

        # Apply feature limit for testing
        if self.feature_limit is not None:
            unique_features = unique_features[:self.feature_limit]
            logger.info(f"Processing limited to {self.feature_limit} features")

        logger.info(f"Processing {len(unique_features):,} features")

        # Process features
        results = []
        for feature_id in tqdm(unique_features, desc="Processing features"):
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

        # Cast to proper types
        df = df.with_columns([
            pl.col("feature_id").cast(pl.UInt32),
            pl.col("sae_id").cast(pl.Categorical),
            pl.col("num_total_activations").cast(pl.UInt32),
            pl.col("avg_pairwise_semantic_similarity").cast(pl.Float32),
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
            "prompt_ids_for_calculation": pl.List(pl.UInt32),  # All 12 for calculations
            "prompt_ids_for_display": pl.List(pl.UInt32),      # Top 8 for positions
            "num_total_activations": pl.UInt32,
            "avg_pairwise_semantic_similarity": pl.Float32,

            # Character-level n-grams (per-token)
            "top_char_ngrams": pl.List(pl.Struct([
                pl.Field("ngram", pl.Utf8),
                pl.Field("ngram_size", pl.UInt8),
                pl.Field("count", pl.UInt16),
                pl.Field("occurrences", pl.List(pl.Struct([
                    pl.Field("prompt_id", pl.UInt32),
                    pl.Field("token_position", pl.UInt16),
                    pl.Field("token_text", pl.Utf8),
                    pl.Field("char_offset", pl.UInt8),
                    pl.Field("ngram_size", pl.UInt8)
                ])))
            ])),

            # Word-level n-grams
            "top_word_ngrams": pl.List(pl.Struct([
                pl.Field("ngram", pl.Utf8),
                pl.Field("ngram_size", pl.UInt8),
                pl.Field("count", pl.UInt16),
                pl.Field("occurrences", pl.List(pl.Struct([
                    pl.Field("prompt_id", pl.UInt32),
                    pl.Field("start_position", pl.UInt16),
                    pl.Field("ngram_size", pl.UInt8)
                ])))
            ])),

            # Overall top n-grams (most frequent across all sizes)
            "top_char_ngram": pl.Struct([
                pl.Field("ngram", pl.Utf8),
                pl.Field("ngram_size", pl.UInt8),
                pl.Field("count", pl.UInt16),
                pl.Field("occurrences", pl.List(pl.Struct([
                    pl.Field("prompt_id", pl.UInt32),
                    pl.Field("token_position", pl.UInt16),
                    pl.Field("token_text", pl.Utf8),
                    pl.Field("char_offset", pl.UInt8),
                    pl.Field("ngram_size", pl.UInt8)
                ])))
            ]),

            "top_word_ngram": pl.Struct([
                pl.Field("ngram", pl.Utf8),
                pl.Field("ngram_size", pl.UInt8),
                pl.Field("count", pl.UInt16),
                pl.Field("occurrences", pl.List(pl.Struct([
                    pl.Field("prompt_id", pl.UInt32),
                    pl.Field("start_position", pl.UInt16),
                    pl.Field("ngram_size", pl.UInt8)
                ])))
            ]),

            # Jaccard similarity for overall top n-grams
            "top_char_ngram_jaccard": pl.Float32,
            "top_word_ngram_jaccard": pl.Float32,

            "quantile_boundaries": pl.List(pl.Float32),
            "ngram_jaccard_similarity": pl.List(pl.Float32)
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
            # Calculate mean Jaccard similarity across all features and n-gram sizes
            # First, flatten the ngram_jaccard_similarity lists and filter out nulls
            all_jaccard_values = []
            for jaccard_list in df["ngram_jaccard_similarity"].to_list():
                if jaccard_list:
                    all_jaccard_values.extend([j for j in jaccard_list if j is not None])

            mean_jaccard = float(np.mean(all_jaccard_values)) if all_jaccard_values else None

            result_stats = {
                "features_with_similarity": int((~df["avg_pairwise_semantic_similarity"].is_null()).sum()),
                "mean_semantic_similarity": float(df["avg_pairwise_semantic_similarity"].mean()) if df["avg_pairwise_semantic_similarity"].is_not_null().any() else None,
                "mean_jaccard_similarity": mean_jaccard,
                "mean_examples_for_calculation": float(df["prompt_ids_for_calculation"].list.len().mean()),
                "mean_examples_for_display": float(df["prompt_ids_for_display"].list.len().mean())
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
        description='Calculate activation example similarity metrics'
    )
    parser.add_argument(
        '--config',
        type=str,
        default='data/preprocessing/config/9_activation_similarity_config.json',
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
    processor = ActivationSimilarityProcessor(config, feature_limit=args.limit)

    # Process data
    logger.info("=" * 80)
    logger.info("Starting Activation Example Similarity Processing")
    logger.info("=" * 80)

    df = processor.process_all_features()

    # Save parquet
    processor.save_parquet(df)

    logger.info("=" * 80)
    logger.info("Processing Complete!")
    logger.info(f"Statistics:")
    logger.info(f"  Features processed: {processor.stats['features_processed']:,}")
    logger.info(f"  Total examples analyzed: {processor.stats['total_examples_analyzed']:,}")
    logger.info(f"  Semantic similarity computed: {processor.stats['semantic_similarity_computed']:,}")
    logger.info(f"  N-gram analysis computed: {processor.stats['ngram_analysis_computed']:,}")
    logger.info(f"  N-gram Jaccard computed: {processor.stats['ngram_jaccard_computed']:,}")
    logger.info("=" * 80)


if __name__ == "__main__":
    main()
