#!/usr/bin/env python3
"""
Preprocessing Script: Calculate Inter-Feature Activation Similarity Metrics (V4.0)

This script analyzes activation examples of decoder-similar features to compute
similarity metrics between their activation patterns using dual n-gram architecture
with position tracking for frontend visualization.

For each feature, it:
1. Selects top 4 decoder-similar features
2. Samples activation examples (max 2 per quantile = 8 examples per feature)
3. Computes cross-feature semantic and lexical similarities
4. Tracks n-gram positions for visualization highlighting
5. Classifies patterns as Semantic and/or Lexical (no "Both" category)
6. Outputs only feature pairs above threshold

Input:
- features.parquet: Feature data with decoder_similarity field
- activation_examples.parquet: Structured parquet with activation data
- activation_embeddings.parquet: Pre-computed embeddings

Output:
- interfeature_activation_similarity.parquet: Inter-feature similarity metrics with positions
- interfeature_activation_similarity.parquet.metadata.json: Processing metadata

Features (V4.0):
- Dual n-gram architecture: character-level (morphology) + word-level (semantics)
- N-gram position tracking: precise char_offset and token positions for highlighting
- Pattern classification: Semantic and/or Lexical (removed "Both" category)
  * Pairs meeting both conditions are added to both semantic_pairs and lexical_pairs
- Character n-grams: per-token extraction with char_offset for character-level highlighting
- Word n-grams: reconstructed from subwords with start_position for word-level highlighting
- Position data: stored per prompt_id for efficient frontend joining with activation_display.parquet
- Only saves pairs above threshold (filtered by pattern type)

Changes from V3.0:
- Removed both_pairs list (pairs now added to both lists if conditions met)
- Added position tracking fields: main_char_ngram_positions, similar_char_ngram_positions,
  main_word_ngram_positions, similar_word_ngram_positions
- Frontend joins with activation_display.parquet for full example data

Usage:
    python 6_interfeature_similarity.py [--config CONFIG_PATH] [--limit N]

Example:
    python 6_interfeature_similarity.py
    python 6_interfeature_similarity.py --limit 10  # Test on 10 features
"""

import json
import logging
import argparse
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime
from collections import defaultdict
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
        "features_path": "data/master/features.parquet",
        "activation_examples_path": "data/master/activation_examples.parquet",
        "activation_embeddings_path": "data/master/activation_embeddings.parquet",
        "output_path": "data/master/interfeature_activation_similarity.parquet",
        "sae_id": "google--gemma-scope-9b-pt-res--layer_30--width_16k--average_l0_120",
        "processing_parameters": {
            "top_n_decoder_similar": 4,
            "num_quantiles": 4,
            "samples_per_quantile": 2,
            "embedding_window_size": 32,
            "char_ngram_window_size": 3,
            "word_ngram_window_size": 11,
            "char_ngram_sizes": [2, 3, 4, 5],
            "word_ngram_sizes": [1, 2, 3],
            "semantic_threshold": 0.3,
            "char_jaccard_threshold": 0.3,
            "word_jaccard_threshold": 0.3
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


class InterFeatureSimilarityProcessor:
    """Process activation examples to compute inter-feature similarity metrics."""

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
        self.features_path = self._resolve_path(config["features_path"])
        self.activation_path = self._resolve_path(config["activation_examples_path"])
        self.embeddings_path = self._resolve_path(config["activation_embeddings_path"])
        self.output_path = self._resolve_path(config["output_path"])

        # Configuration
        self.sae_id = config["sae_id"]
        self.proc_params = config["processing_parameters"]

        # Statistics tracking
        self.stats = {
            "features_processed": 0,
            "total_pairs_compared": 0,
            "semantic_pairs": 0,
            "lexical_pairs": 0,
            "no_pattern_pairs": 0,
            "features_with_insufficient_decoder_similar": 0,
            "features_with_no_activations": 0
        }

        # Load data
        self.features_df = None
        self.activation_df = None
        self.embeddings_df = None

    def _resolve_path(self, path_str: str) -> Path:
        """Resolve path relative to project root if not absolute."""
        path = Path(path_str)
        if not path.is_absolute():
            return self.project_root / path
        return path

    def _load_data(self):
        """Load all required data files."""
        if self.features_df is None:
            logger.info(f"Loading features from {self.features_path}")
            if not self.features_path.exists():
                raise FileNotFoundError(f"Features file not found: {self.features_path}")
            self.features_df = pl.read_parquet(self.features_path)
            logger.info(f"Loaded {len(self.features_df):,} feature rows")

        if self.activation_df is None:
            logger.info(f"Loading activation examples from {self.activation_path}")
            if not self.activation_path.exists():
                raise FileNotFoundError(f"Activation examples not found: {self.activation_path}")
            self.activation_df = pl.read_parquet(self.activation_path)
            logger.info(f"Loaded {len(self.activation_df):,} activation examples")

        if self.embeddings_df is None:
            logger.info(f"Loading pre-computed embeddings from {self.embeddings_path}")
            if not self.embeddings_path.exists():
                raise FileNotFoundError(
                    f"Pre-computed embeddings not found: {self.embeddings_path}\n"
                    f"Please run: python 4_act_embeddings.py"
                )
            self.embeddings_df = pl.read_parquet(self.embeddings_path)
            logger.info(f"Loaded embeddings for {len(self.embeddings_df):,} features")

    def _get_top_decoder_similar_features(self, feature_row: Dict) -> List[Tuple[int, float]]:
        """Extract top N decoder-similar features.

        Args:
            feature_row: Row from features.parquet with decoder_similarity field

        Returns:
            List of (feature_id, cosine_similarity) tuples
        """
        decoder_sim = feature_row.get("decoder_similarity", [])
        if not decoder_sim:
            return []

        # Take top N features
        top_n = self.proc_params["top_n_decoder_similar"]
        return [(item["feature_id"], item["cosine_similarity"])
                for item in decoder_sim[:top_n]]

    def _select_top_quantile_examples(self, feature_df: pl.DataFrame) -> List[Tuple[int, float, List[str], int]]:
        """Select max 2 examples per quantile based on max_activation.

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
        num_quantiles = self.proc_params["num_quantiles"]
        samples_per_quantile = self.proc_params["samples_per_quantile"]

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
            q_values = [
                feature_df.select(
                    pl.col("max_activation").quantile(q, interpolation="linear")
                ).item()
                for q in quantiles
            ]

            # Assign quantile groups and select top N from each
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

            # Select top N examples from each quantile
            selected = []
            for condition in conditions:
                quantile_df = feature_df.filter(condition).sort("max_activation", descending=True)
                top_n = quantile_df.head(samples_per_quantile).select([
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
            token: Token string potentially with '▁' prefix

        Returns:
            Normalized token
        """
        return token.lstrip('▁')

    def _extract_token_char_ngrams(self, tokens: List[str], ngram_sizes: List[int]) -> Dict[str, List[Tuple[int, str]]]:
        """Extract character n-grams from individual tokens (per-token, not concatenated).

        Args:
            tokens: List of token strings
            ngram_sizes: List of n-gram sizes to extract

        Returns:
            Dict mapping n-gram to list of (token_index, original_token)
        """
        ngram_map = defaultdict(list)

        for token_idx, token in enumerate(tokens):
            # Normalize token (strip '▁' prefix)
            token_normalized = self._normalize_token(token).lower()

            # Extract character n-grams within this token
            for ngram_size in ngram_sizes:
                if len(token_normalized) >= ngram_size:
                    for i in range(len(token_normalized) - ngram_size + 1):
                        ngram = token_normalized[i:i+ngram_size]
                        ngram_map[ngram].append((token_idx, token))

        return dict(ngram_map)

    def _reconstruct_words_with_positions(self, tokens: List[str]) -> List[Tuple[str, int]]:
        """Reconstruct full words from subword tokens with starting token positions.

        Args:
            tokens: List of subword token strings

        Returns:
            List of (word, start_token_position) tuples
        """
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

        if current_word:
            words_with_positions.append((current_word, word_start_pos))

        return words_with_positions

    def _extract_word_ngrams(self, tokens: List[str], ngram_sizes: List[int]) -> Dict[str, List[int]]:
        """Extract word-level n-grams by reconstructing full words from subwords.

        Args:
            tokens: List of subword token strings
            ngram_sizes: List of n-gram sizes to extract

        Returns:
            Dict mapping word n-gram to list of start token positions
        """
        words_with_positions = self._reconstruct_words_with_positions(tokens)
        word_ngram_map = defaultdict(list)

        for ngram_size in ngram_sizes:
            if len(words_with_positions) >= ngram_size:
                for i in range(len(words_with_positions) - ngram_size + 1):
                    # Create word n-gram (space-separated, lowercase)
                    word_ngram = " ".join([w[0] for w in words_with_positions[i:i+ngram_size]])
                    start_token_pos = words_with_positions[i][1]
                    word_ngram_map[word_ngram].append(start_token_pos)

        return dict(word_ngram_map)

    def _find_char_ngram_positions_in_examples(
        self,
        examples: List[Tuple],
        char_ngram: str,
        window_size: int
    ) -> List[Dict]:
        """Find all positions where a character n-gram appears in the example set.

        Similar to activation_display.py approach but for inter-feature comparison.

        Args:
            examples: List of (prompt_id, max_activation, prompt_tokens, max_token_pos)
            char_ngram: The character n-gram to find (e.g., "ing")
            window_size: Token window size around max activation

        Returns:
            List of dicts with structure:
            [
                {
                    'prompt_id': int,
                    'positions': [{'token_position': int, 'char_offset': int}, ...]
                },
                ...
            ]
        """
        if not char_ngram:
            return []

        result = []
        char_ngram_sizes = self.proc_params["char_ngram_sizes"]

        for prompt_id, _, tokens, max_pos in examples:
            window_tokens = self._extract_token_window(tokens, max_pos, window_size)

            # Convert window-relative positions to absolute token positions
            window_offset = max(0, max_pos - window_size // 2)

            # Find char n-gram in this window
            positions = []
            for token_idx, token in enumerate(window_tokens):
                token_normalized = self._normalize_token(token).lower()

                # Search for char_ngram within this token
                for char_offset in range(len(token_normalized) - len(char_ngram) + 1):
                    if token_normalized[char_offset:char_offset + len(char_ngram)] == char_ngram:
                        positions.append({
                            'token_position': int(window_offset + token_idx),
                            'char_offset': int(char_offset)
                        })

            if positions:
                result.append({
                    'prompt_id': int(prompt_id),
                    'positions': positions
                })

        return result

    def _find_word_ngram_positions_in_examples(
        self,
        examples: List[Tuple],
        word_ngram: str,
        window_size: int
    ) -> List[Dict]:
        """Find all positions where a word n-gram appears in the example set.

        Similar to activation_display.py approach but for inter-feature comparison.

        Args:
            examples: List of (prompt_id, max_activation, prompt_tokens, max_token_pos)
            word_ngram: The word n-gram to find (e.g., "machine learning")
            window_size: Token window size around max activation

        Returns:
            List of dicts with structure:
            [
                {
                    'prompt_id': int,
                    'positions': [start_token_position, ...]
                },
                ...
            ]
        """
        if not word_ngram:
            return []

        result = []
        word_ngram_sizes = self.proc_params["word_ngram_sizes"]

        for prompt_id, _, tokens, max_pos in examples:
            window_tokens = self._extract_token_window(tokens, max_pos, window_size)

            # Extract word n-grams from this window
            word_ngram_map = self._extract_word_ngrams(window_tokens, word_ngram_sizes)

            # Find positions where this specific word n-gram appears
            positions = word_ngram_map.get(word_ngram, [])

            if positions:
                # Convert window-relative positions to absolute token positions
                window_offset = max(0, max_pos - window_size // 2)
                result.append({
                    'prompt_id': int(prompt_id),
                    'positions': [int(window_offset + p) for p in positions]
                })

        return result

    def _classify_pattern_type(self, semantic_sim: Optional[float],
                              char_jaccard: Optional[float],
                              word_jaccard: Optional[float]) -> List[str]:
        """Classify pattern type based on similarity thresholds.

        Modified in V4.0: Returns list of pattern types instead of single "Both" category.
        If both conditions met, returns ["Semantic", "Lexical"] so pair is added to both lists.

        Args:
            semantic_sim: Semantic similarity value
            char_jaccard: Character-level Jaccard similarity
            word_jaccard: Word-level Jaccard similarity

        Returns:
            List of pattern types: ["Semantic"], ["Lexical"], ["Semantic", "Lexical"], or []
        """
        semantic_threshold = self.proc_params["semantic_threshold"]
        char_threshold = self.proc_params["char_jaccard_threshold"]
        word_threshold = self.proc_params["word_jaccard_threshold"]

        has_semantic = semantic_sim is not None and semantic_sim > semantic_threshold
        has_lexical = ((char_jaccard is not None and char_jaccard > char_threshold) or
                      (word_jaccard is not None and word_jaccard > word_threshold))

        pattern_types = []
        if has_semantic:
            pattern_types.append("Semantic")
        if has_lexical:
            pattern_types.append("Lexical")

        return pattern_types

    def _compute_cross_feature_semantic_similarity(
        self,
        main_feature_id: int,
        main_examples: List[Tuple],
        selected_feature_id: int,
        selected_examples: List[Tuple]
    ) -> Optional[float]:
        """Compute pairwise semantic similarity between main and selected feature examples.

        Args:
            main_feature_id: Main feature ID
            main_examples: List of (prompt_id, max_activation, prompt_tokens, max_token_pos)
            selected_feature_id: Selected feature ID
            selected_examples: List of (prompt_id, max_activation, prompt_tokens, max_token_pos)

        Returns:
            Average pairwise similarity or None if insufficient data
        """
        if len(main_examples) < 1 or len(selected_examples) < 1:
            return None

        # Get embeddings for main feature
        main_prompt_ids = [ex[0] for ex in main_examples]
        main_embeddings_row = self.embeddings_df.filter(pl.col("feature_id") == main_feature_id)

        if len(main_embeddings_row) == 0:
            logger.warning(f"No embeddings found for main feature {main_feature_id}")
            return None

        main_stored_prompt_ids = main_embeddings_row["prompt_ids"][0]
        main_stored_embeddings = main_embeddings_row["embeddings"][0]
        main_embedding_map = {pid: emb for pid, emb in zip(main_stored_prompt_ids, main_stored_embeddings)}

        # Get embeddings for selected feature
        selected_prompt_ids = [ex[0] for ex in selected_examples]
        selected_embeddings_row = self.embeddings_df.filter(pl.col("feature_id") == selected_feature_id)

        if len(selected_embeddings_row) == 0:
            logger.warning(f"No embeddings found for selected feature {selected_feature_id}")
            return None

        selected_stored_prompt_ids = selected_embeddings_row["prompt_ids"][0]
        selected_stored_embeddings = selected_embeddings_row["embeddings"][0]
        selected_embedding_map = {pid: emb for pid, emb in zip(selected_stored_prompt_ids, selected_stored_embeddings)}

        # Collect embeddings for selected prompts
        main_embs = []
        for prompt_id in main_prompt_ids:
            if prompt_id in main_embedding_map:
                main_embs.append(main_embedding_map[prompt_id])
            else:
                logger.warning(f"Prompt {prompt_id} not found in embeddings for feature {main_feature_id}")

        selected_embs = []
        for prompt_id in selected_prompt_ids:
            if prompt_id in selected_embedding_map:
                selected_embs.append(selected_embedding_map[prompt_id])
            else:
                logger.warning(f"Prompt {prompt_id} not found in embeddings for feature {selected_feature_id}")

        if len(main_embs) < 1 or len(selected_embs) < 1:
            return None

        # Convert to numpy arrays
        main_embs = np.array(main_embs)
        selected_embs = np.array(selected_embs)

        # Compute pairwise cosine similarities (all pairs between main and selected)
        from sklearn.metrics.pairwise import cosine_similarity
        sim_matrix = cosine_similarity(main_embs, selected_embs)

        # Average all pairwise similarities
        return float(np.mean(sim_matrix))

    def _compute_dual_jaccard_similarity(
        self,
        main_calc_examples: List[Tuple],
        main_display_examples: List[Tuple],
        selected_calc_examples: List[Tuple],
        selected_display_examples: List[Tuple]
    ) -> Tuple[Optional[float], Optional[float], Optional[str], Optional[str], List[Dict], List[Dict], List[Dict], List[Dict]]:
        """Compute character and word Jaccard similarities for most frequent n-grams with position tracking.

        Uses two-phase approach: all examples for frequency counting/Jaccard,
        subset for position tracking.

        Args:
            main_calc_examples: All main feature examples for calculation (e.g., 16)
            main_display_examples: Subset for position tracking (e.g., top 8)
            selected_calc_examples: All selected feature examples for calculation (e.g., 16)
            selected_display_examples: Subset for position tracking (e.g., top 8)

        Returns:
            Tuple of (char_jaccard, word_jaccard, max_char_ngram, max_word_ngram,
                     main_char_positions, similar_char_positions,
                     main_word_positions, similar_word_positions)
        """
        if len(main_calc_examples) < 1 or len(selected_calc_examples) < 1:
            return None, None, None, None, [], [], [], []

        from collections import Counter

        char_window_size = self.proc_params["char_ngram_window_size"]
        word_window_size = self.proc_params["word_ngram_window_size"]
        char_ngram_sizes = self.proc_params["char_ngram_sizes"]
        word_ngram_sizes = self.proc_params["word_ngram_sizes"]

        # Phase 1: Extract character n-grams from ALL calc examples for frequency counting
        all_char_ngrams = []
        main_char_ngram_sets = []
        selected_char_ngram_sets = []

        for _, _, tokens, max_pos in main_calc_examples:
            window_tokens = self._extract_token_window(tokens, max_pos, char_window_size)
            char_ngram_map = self._extract_token_char_ngrams(window_tokens, char_ngram_sizes)
            ngram_set = set(char_ngram_map.keys())
            main_char_ngram_sets.append(ngram_set)
            all_char_ngrams.extend(list(ngram_set))

        for _, _, tokens, max_pos in selected_calc_examples:
            window_tokens = self._extract_token_window(tokens, max_pos, char_window_size)
            char_ngram_map = self._extract_token_char_ngrams(window_tokens, char_ngram_sizes)
            ngram_set = set(char_ngram_map.keys())
            selected_char_ngram_sets.append(ngram_set)
            all_char_ngrams.extend(list(ngram_set))

        # Find most frequent char n-gram
        max_char_ngram = None
        char_jaccard = None
        if all_char_ngrams:
            char_counter = Counter(all_char_ngrams)
            # Tie-breaker: if counts equal, prefer longer n-gram (more specific)
            max_count = char_counter.most_common(1)[0][1]
            tied_ngrams = [(ng, cnt) for ng, cnt in char_counter.items() if cnt == max_count]
            max_char_ngram = max(tied_ngrams, key=lambda x: (x[1], len(x[0])))[0]

            # Compute binary Jaccard for this specific n-gram
            main_has_ngram = sum(1 for s in main_char_ngram_sets if max_char_ngram in s)
            selected_has_ngram = sum(1 for s in selected_char_ngram_sets if max_char_ngram in s)

            # Binary Jaccard: |A ∩ B| / |A ∪ B| where A and B are sets of examples containing the n-gram
            total_has_ngram = main_has_ngram + selected_has_ngram
            unique_examples = len(main_calc_examples) + len(selected_calc_examples)

            if total_has_ngram > 0:
                # Union = all unique examples that have the n-gram
                # Intersection = examples in both groups that have it (but they're different examples)
                # For cross-feature: we use a simpler approach
                # Jaccard = min(main_count, selected_count) / max(main_count, selected_count) if both > 0
                if main_has_ngram > 0 and selected_has_ngram > 0:
                    char_jaccard = float(min(main_has_ngram, selected_has_ngram) /
                                        max(main_has_ngram, selected_has_ngram))
                else:
                    char_jaccard = 0.0

        # Phase 1: Extract word n-grams from ALL calc examples for frequency counting
        all_word_ngrams = []
        main_word_ngram_sets = []
        selected_word_ngram_sets = []

        for _, _, tokens, max_pos in main_calc_examples:
            window_tokens = self._extract_token_window(tokens, max_pos, word_window_size)
            word_ngram_map = self._extract_word_ngrams(window_tokens, word_ngram_sizes)
            ngram_set = set(word_ngram_map.keys())
            main_word_ngram_sets.append(ngram_set)
            all_word_ngrams.extend(list(ngram_set))

        for _, _, tokens, max_pos in selected_calc_examples:
            window_tokens = self._extract_token_window(tokens, max_pos, word_window_size)
            word_ngram_map = self._extract_word_ngrams(window_tokens, word_ngram_sizes)
            ngram_set = set(word_ngram_map.keys())
            selected_word_ngram_sets.append(ngram_set)
            all_word_ngrams.extend(list(ngram_set))

        # Find most frequent word n-gram
        max_word_ngram = None
        word_jaccard = None
        if all_word_ngrams:
            word_counter = Counter(all_word_ngrams)
            # Tie-breaker: if counts equal, prefer longer phrase (more words = more specific)
            max_count = word_counter.most_common(1)[0][1]
            tied_ngrams = [(ng, cnt) for ng, cnt in word_counter.items() if cnt == max_count]
            max_word_ngram = max(tied_ngrams, key=lambda x: (x[1], len(x[0].split())))[0]

            # Compute binary Jaccard for this specific n-gram
            main_has_ngram = sum(1 for s in main_word_ngram_sets if max_word_ngram in s)
            selected_has_ngram = sum(1 for s in selected_word_ngram_sets if max_word_ngram in s)

            if main_has_ngram > 0 and selected_has_ngram > 0:
                word_jaccard = float(min(main_has_ngram, selected_has_ngram) /
                                    max(main_has_ngram, selected_has_ngram))
            elif main_has_ngram > 0 or selected_has_ngram > 0:
                word_jaccard = 0.0

        # Phase 2: Extract position data for the max n-grams using DISPLAY examples only
        main_char_positions = self._find_char_ngram_positions_in_examples(
            main_display_examples, max_char_ngram, char_window_size
        ) if max_char_ngram else []

        similar_char_positions = self._find_char_ngram_positions_in_examples(
            selected_display_examples, max_char_ngram, char_window_size
        ) if max_char_ngram else []

        main_word_positions = self._find_word_ngram_positions_in_examples(
            main_display_examples, max_word_ngram, word_window_size
        ) if max_word_ngram else []

        similar_word_positions = self._find_word_ngram_positions_in_examples(
            selected_display_examples, max_word_ngram, word_window_size
        ) if max_word_ngram else []

        return (char_jaccard, word_jaccard, max_char_ngram, max_word_ngram,
                main_char_positions, similar_char_positions,
                main_word_positions, similar_word_positions)


    def process_feature(self, feature_id: int) -> Dict[str, Any]:
        """Process a single feature to compute inter-feature similarity metrics with pattern classification.

        Args:
            feature_id: Feature ID

        Returns:
            Dictionary with computed metrics grouped by pattern type
        """
        # Get feature row with decoder_similarity
        feature_row = self.features_df.filter(pl.col("feature_id") == feature_id).to_dicts()
        if not feature_row:
            logger.warning(f"Feature {feature_id} not found in features.parquet")
            return {
                "feature_id": feature_id,
                "sae_id": self.sae_id,
                "semantic_pairs": [],
                "lexical_pairs": []
            }

        feature_row = feature_row[0]

        # Get top decoder-similar features
        decoder_similar = self._get_top_decoder_similar_features(feature_row)

        if len(decoder_similar) < self.proc_params["top_n_decoder_similar"]:
            self.stats["features_with_insufficient_decoder_similar"] += 1

        # Get activation examples for main feature - Phase 1: Load ALL examples (16 total: 4 per quantile)
        main_feature_df = self.activation_df.filter(pl.col("feature_id") == feature_id)
        main_all_examples = self._select_top_quantile_examples(main_feature_df)

        if len(main_all_examples) == 0:
            self.stats["features_with_no_activations"] += 1
            return {
                "feature_id": feature_id,
                "sae_id": self.sae_id,
                "semantic_pairs": [],
                "lexical_pairs": []
            }

        # Phase 2: Select top examples for position tracking (8 total: 2 per quantile)
        position_samples_per_quantile = self.proc_params.get("position_samples_per_quantile", 2)
        main_display_examples = self._select_top_k_per_quantile(main_all_examples, k=position_samples_per_quantile)

        # Prompt IDs for calculations (all) and display (subset)
        main_calc_prompt_ids = [ex[0] for ex in main_all_examples]
        main_display_prompt_ids = [ex[0] for ex in main_display_examples]

        # Collect pairs by pattern type
        semantic_pairs = []
        lexical_pairs = []

        # Process each decoder-similar feature
        for selected_feature_id, decoder_sim in decoder_similar:
            # Phase 1: Get ALL activation examples for selected feature (16 total: 4 per quantile)
            selected_feature_df = self.activation_df.filter(pl.col("feature_id") == selected_feature_id)
            selected_all_examples = self._select_top_quantile_examples(selected_feature_df)

            if len(selected_all_examples) == 0:
                continue

            # Phase 2: Select top examples for position tracking (8 total: 2 per quantile)
            selected_display_examples = self._select_top_k_per_quantile(selected_all_examples, k=position_samples_per_quantile)

            # Prompt IDs for calculations (all) and display (subset)
            selected_calc_prompt_ids = [ex[0] for ex in selected_all_examples]
            selected_display_prompt_ids = [ex[0] for ex in selected_display_examples]

            # Compute semantic similarity using ALL examples (16 x 16 = 256 pairs for robust statistics)
            semantic_sim = self._compute_cross_feature_semantic_similarity(
                feature_id, main_all_examples,
                selected_feature_id, selected_all_examples
            )

            # Compute dual Jaccard similarity with two-phase approach
            # - Use ALL examples (16 each) for frequency counting and Jaccard calculation
            # - Use DISPLAY examples (8 each) for position tracking
            (char_jaccard, word_jaccard, max_char_ngram, max_word_ngram,
             main_char_pos, similar_char_pos, main_word_pos, similar_word_pos
            ) = self._compute_dual_jaccard_similarity(
                main_all_examples, main_display_examples,
                selected_all_examples, selected_display_examples
            )

            # Classify pattern type (returns list)
            pattern_types = self._classify_pattern_type(semantic_sim, char_jaccard, word_jaccard)

            self.stats["total_pairs_compared"] += 1

            # Only save pairs above threshold
            if not pattern_types:  # Empty list means no pattern
                self.stats["no_pattern_pairs"] += 1
                continue

            # Create pair dict with explicit type casting and position data
            pair_dict = {
                "similar_feature_id": int(selected_feature_id),  # Will cast to UInt32 later
                "decoder_similarity": float(decoder_sim) if decoder_sim is not None else None,
                "pattern_type": "",  # Will be set per list
                "semantic_similarity": float(semantic_sim) if semantic_sim is not None else None,
                "char_jaccard": float(char_jaccard) if char_jaccard is not None else None,
                "word_jaccard": float(word_jaccard) if word_jaccard is not None else None,
                # Store calculation prompt IDs (all 16) for metrics calculation reference
                "main_prompt_ids": [int(pid) for pid in main_calc_prompt_ids],
                "similar_prompt_ids": [int(pid) for pid in selected_calc_prompt_ids],
                # Number of comparisons based on all examples used for calculation
                "num_comparisons": int(len(main_all_examples) * len(selected_all_examples)),
                "max_char_ngram": max_char_ngram,
                "max_char_ngram_size": int(len(max_char_ngram)) if max_char_ngram else None,
                "max_word_ngram": max_word_ngram,
                "max_word_ngram_size": int(len(max_word_ngram.split())) if max_word_ngram else None,
                # Position data (from display examples only - 8 examples)
                "main_char_ngram_positions": main_char_pos,
                "similar_char_ngram_positions": similar_char_pos,
                "main_word_ngram_positions": main_word_pos,
                "similar_word_ngram_positions": similar_word_pos
            }

            # Add to appropriate list(s)
            for ptype in pattern_types:
                pair_copy = pair_dict.copy()
                pair_copy["pattern_type"] = ptype

                if ptype == "Semantic":
                    semantic_pairs.append(pair_copy)
                    self.stats["semantic_pairs"] += 1
                elif ptype == "Lexical":
                    lexical_pairs.append(pair_copy)
                    self.stats["lexical_pairs"] += 1

        return {
            "feature_id": feature_id,
            "sae_id": self.sae_id,
            "semantic_pairs": semantic_pairs,
            "lexical_pairs": lexical_pairs
        }

    def process_all_features(self) -> pl.DataFrame:
        """Process all features and create DataFrame.

        Returns:
            Polars DataFrame with inter-feature similarity metrics
        """
        # Load data
        self._load_data()

        # Get unique features from features.parquet
        unique_features = sorted(self.features_df["feature_id"].unique().to_list())

        # Apply feature limit for testing
        if self.feature_limit is not None:
            unique_features = unique_features[:self.feature_limit]
            logger.info(f"Processing limited to {self.feature_limit} features")

        logger.info(f"Processing {len(unique_features):,} features")

        # Process features
        results = []
        for feature_id in tqdm(unique_features, desc="Processing features"):
            result = self.process_feature(feature_id)
            results.append(result)
            self.stats["features_processed"] += 1

        logger.info(f"Processed {self.stats['features_processed']:,} features")

        return self._create_dataframe(results)

    def _create_dataframe(self, rows: List[Dict]) -> pl.DataFrame:
        """Create Polars DataFrame with proper schema and native types (V3.0).

        Args:
            rows: List of result dictionaries

        Returns:
            Polars DataFrame with typed columns
        """
        logger.info("Creating DataFrame with V3.0 schema")

        if not rows:
            logger.warning("No results to convert to DataFrame")
            return self._create_empty_dataframe()

        # Create DataFrame from rows - Polars will infer types
        df = pl.DataFrame(rows)

        # Get the target schema
        target_schema = self._get_target_schema()

        # Cast each nested list field properly
        df = df.with_columns([
            pl.col("feature_id").cast(pl.UInt32),
            pl.col("sae_id").cast(pl.Categorical),
            # Cast each pair list to the correct struct schema
            pl.col("semantic_pairs").cast(target_schema["semantic_pairs"]),
            pl.col("lexical_pairs").cast(target_schema["lexical_pairs"])
        ])

        logger.info(f"Created DataFrame with {len(df)} rows and {len(df.columns)} columns")
        return df

    def _get_target_schema(self) -> Dict:
        """Get the target schema with proper types.

        Returns:
            Dictionary of column name to Polars dtype
        """
        # Define pair struct schema with proper types (V4.0 with positions)
        # Position structures
        char_position_struct = pl.Struct([
            pl.Field("token_position", pl.UInt16),
            pl.Field("char_offset", pl.UInt8)
        ])

        char_ngram_positions_struct = pl.Struct([
            pl.Field("prompt_id", pl.UInt32),
            pl.Field("positions", pl.List(char_position_struct))
        ])

        word_ngram_positions_struct = pl.Struct([
            pl.Field("prompt_id", pl.UInt32),
            pl.Field("positions", pl.List(pl.UInt16))
        ])

        pair_struct = pl.Struct([
            pl.Field("similar_feature_id", pl.UInt32),
            pl.Field("decoder_similarity", pl.Float32),
            pl.Field("pattern_type", pl.Utf8),
            pl.Field("semantic_similarity", pl.Float32),
            pl.Field("char_jaccard", pl.Float32),
            pl.Field("word_jaccard", pl.Float32),
            pl.Field("main_prompt_ids", pl.List(pl.UInt32)),
            pl.Field("similar_prompt_ids", pl.List(pl.UInt32)),
            pl.Field("num_comparisons", pl.UInt32),
            pl.Field("max_char_ngram", pl.Utf8),
            pl.Field("max_char_ngram_size", pl.UInt8),
            pl.Field("max_word_ngram", pl.Utf8),
            pl.Field("max_word_ngram_size", pl.UInt8),
            # NEW: Position data (V4.0)
            pl.Field("main_char_ngram_positions", pl.List(char_ngram_positions_struct)),
            pl.Field("similar_char_ngram_positions", pl.List(char_ngram_positions_struct)),
            pl.Field("main_word_ngram_positions", pl.List(word_ngram_positions_struct)),
            pl.Field("similar_word_ngram_positions", pl.List(word_ngram_positions_struct))
        ])

        return {
            "feature_id": pl.UInt32,
            "sae_id": pl.Categorical,
            "semantic_pairs": pl.List(pair_struct),
            "lexical_pairs": pl.List(pair_struct)
        }

    def _create_empty_dataframe(self) -> pl.DataFrame:
        """Create empty DataFrame with correct schema (V3.0 - pattern-based).

        Returns:
            Empty Polars DataFrame with proper schema
        """
        logger.info("Creating empty DataFrame with V3.0 schema")

        # Use the same schema builder for consistency
        schema = self._get_target_schema()
        return pl.DataFrame(schema=schema)

    def save_parquet(self, df: pl.DataFrame) -> None:
        """Save DataFrame as parquet with metadata (V3.0).

        Args:
            df: DataFrame to save
        """
        # Ensure output directory exists
        self.output_path.parent.mkdir(parents=True, exist_ok=True)

        logger.info(f"Saving parquet to {self.output_path}")
        df.write_parquet(self.output_path)

        # Calculate statistics
        if len(df) > 0:
            # Count features with pairs by pattern type
            features_with_semantic = int((df["semantic_pairs"].list.len() > 0).sum())
            features_with_lexical = int((df["lexical_pairs"].list.len() > 0).sum())
            features_with_any = int(((df["semantic_pairs"].list.len() > 0) |
                                     (df["lexical_pairs"].list.len() > 0)).sum())

            # Count total pairs
            total_semantic = int(df["semantic_pairs"].list.len().sum())
            total_lexical = int(df["lexical_pairs"].list.len().sum())
            total_all_pairs = total_semantic + total_lexical

            result_stats = {
                "features_with_any_pairs": features_with_any,
                "features_with_semantic_pairs": features_with_semantic,
                "features_with_lexical_pairs": features_with_lexical,
                "total_semantic_pairs": total_semantic,
                "total_lexical_pairs": total_lexical,
                "total_all_pairs": total_all_pairs,
                "mean_pairs_per_feature": float(total_all_pairs / len(df)) if len(df) > 0 else 0
            }
        else:
            result_stats = {}

        # Save metadata
        metadata = {
            "created_at": datetime.now().isoformat(),
            "script_version": "4.0",
            "architecture": "dual_ngram_with_position_tracking",
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
        description='Calculate inter-feature activation similarity metrics'
    )
    parser.add_argument(
        '--config',
        type=str,
        default='data/preprocessing/config/6_interfeature_similarity.json',
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
    processor = InterFeatureSimilarityProcessor(config, feature_limit=args.limit)

    # Process data
    logger.info("=" * 80)
    logger.info("Starting Inter-Feature Activation Similarity Processing")
    logger.info("=" * 80)

    df = processor.process_all_features()

    # Save parquet
    processor.save_parquet(df)

    logger.info("=" * 80)
    logger.info("Processing Complete!")
    logger.info(f"Statistics:")
    logger.info(f"  Features processed: {processor.stats['features_processed']:,}")
    logger.info(f"  Total pairs compared: {processor.stats['total_pairs_compared']:,}")
    logger.info(f"  Semantic pairs: {processor.stats['semantic_pairs']:,}")
    logger.info(f"  Lexical pairs: {processor.stats['lexical_pairs']:,}")
    logger.info(f"  No pattern pairs (excluded): {processor.stats['no_pattern_pairs']:,}")
    logger.info(f"  Features with insufficient decoder similar: {processor.stats['features_with_insufficient_decoder_similar']:,}")
    logger.info(f"  Features with no activations: {processor.stats['features_with_no_activations']:,}")
    logger.info("=" * 80)


if __name__ == "__main__":
    main()
