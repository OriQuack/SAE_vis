#!/usr/bin/env python3
"""
Step 8: Calculate Activation Example Similarity Metrics

This step analyzes activation examples to compute similarity metrics based on
quantile-sampled prompts for each SAE feature. It calculates two key metrics:
1. Pairwise semantic similarity across 32-token windows
2. Dual n-gram patterns:
   - Character n-grams in 3-token windows (morphology: suffixes, prefixes)
   - Word n-grams in 11-token windows (semantics: reconstructed words)

Input:
- activation_examples.parquet: Structured parquet with activation data
- activation_embeddings.parquet: Pre-computed embeddings

Output:
- activation_example_similarity.parquet: Similarity metrics per feature

Features:
- Quantile-based sampling (4 quantiles, 2 examples each)
- Dual window sizes for char (3 tokens) and word (11 tokens) n-grams
- Native Polars nested types for structured data
- Uses shared core utilities for token/n-gram processing
"""

import logging
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Tuple

import polars as pl
from tqdm import tqdm

# Enable string cache for categorical operations
pl.enable_string_cache()

# Add parent directory to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.base import BaseProcessor, load_yaml_config
from core.logging import setup_logging
from core.tokens import extract_token_window, calculate_window_offset
from core.ngrams import (
    extract_token_char_ngrams,
    extract_word_ngrams,
    compute_per_k_jaccard,
    find_top_ngram,
)
from core.embeddings import compute_intra_feature_semantic_similarity


logger = logging.getLogger(__name__)


class ActivationSimilarityProcessor(BaseProcessor):
    """Process activation examples to compute similarity metrics."""

    @property
    def step_name(self) -> str:
        return "Step 8: Activation Similarity"

    @property
    def version(self) -> str:
        return "2.0"

    def _init_paths(self) -> None:
        """Initialize paths from configuration."""
        super()._init_paths()

        # Get paths from global config
        global_config = self.config.get("global", {})
        paths = global_config.get("paths", {})
        intermediate_dir = paths.get("intermediate", "data/intermediate")

        # Input paths
        self.activation_path = self._resolve_path(
            f"{intermediate_dir}/activation_examples.parquet"
        )
        self.embeddings_path = self._resolve_path(
            f"{intermediate_dir}/activation_embeddings.parquet"
        )

        # Output path
        self.output_path = self._resolve_path(
            f"{intermediate_dir}/activation_example_similarity.parquet"
        )

        # Processing parameters from step config
        params = self.config.get("parameters", {})

        self.proc_params = {
            # Window sizes
            "token_window_size": params.get("embedding_window_size", 32),
            "char_ngram_window_size": params.get("char_ngram_window_size", 3),
            "word_ngram_window_size": params.get("word_ngram_window_size", 11),
            # N-gram settings
            "char_ngram_sizes": params.get("char_ngram_sizes", [2, 3, 4, 5]),
            "word_ngram_sizes": params.get("word_ngram_sizes", [1, 2, 3]),
        }

        # Statistics tracking
        self.stats = {
            "features_processed": 0,
            "features_with_no_activations": 0,
            "total_examples_analyzed": 0,
            "semantic_similarity_computed": 0,
            "ngram_analysis_computed": 0,
            "ngram_jaccard_computed": 0
        }

        # Data holders
        self.embeddings_df = None
        self.activation_df = None

        # Pre-built lookup indices for performance
        self._embedding_prompt_ids: Dict[int, List[int]] = {}
        self._activation_index: Dict[int, Dict[int, Dict]] = {}

    def _load_data(self) -> None:
        """Load activation examples and embeddings data."""
        logger.info(f"Loading activation examples from {self.activation_path}")
        if not self.activation_path.exists():
            raise FileNotFoundError(f"Activation examples not found: {self.activation_path}")
        self.activation_df = pl.read_parquet(self.activation_path)
        logger.info(f"Loaded {len(self.activation_df):,} activation examples")

        logger.info(f"Loading pre-computed embeddings from {self.embeddings_path}")
        if not self.embeddings_path.exists():
            raise FileNotFoundError(
                f"Pre-computed embeddings not found: {self.embeddings_path}\n"
                f"Please run step_05_activation_embeddings first."
            )
        self.embeddings_df = pl.read_parquet(self.embeddings_path)
        logger.info(f"Loaded embeddings for {len(self.embeddings_df):,} features")

        # Build lookup indices for fast O(1) access
        self._build_lookup_indices()

    def _build_lookup_indices(self) -> None:
        """Build pre-computed lookup indices for fast O(1) access."""
        logger.info("Building lookup indices for fast access...")
        assert self.embeddings_df is not None
        assert self.activation_df is not None

        for row in self.embeddings_df.iter_rows(named=True):
            feature_id = row["feature_id"]
            prompt_ids = row["prompt_ids"]
            if hasattr(prompt_ids, 'to_list'):
                prompt_ids = prompt_ids.to_list()
            self._embedding_prompt_ids[feature_id] = prompt_ids or []

        for row in self.activation_df.iter_rows(named=True):
            fid = row["feature_id"]
            pid = row["prompt_id"]
            if fid not in self._activation_index:
                self._activation_index[fid] = {}
            self._activation_index[fid][pid] = row

        logger.info(f"Built indices: {len(self._embedding_prompt_ids):,} embedding lookups, "
                   f"{len(self._activation_index):,} activation lookups")

    def _compute_ngram_analysis(
        self,
        examples: List[Tuple]
    ) -> Dict[str, Any]:
        """Compute dual-level n-gram analysis: character (per-token) and word-level.

        Counts n-gram frequencies and tracks positions for all examples.

        Args:
            examples: All examples for counting and position tracking

        Returns:
            Dict with char_ngrams, word_ngrams, top_char, top_word
        """
        if len(examples) == 0:
            return {"char_ngrams": [], "word_ngrams": [], "top_char": None, "top_word": None}

        char_window_size = self.proc_params["char_ngram_window_size"]
        word_window_size = self.proc_params["word_ngram_window_size"]
        char_ngram_sizes = self.proc_params["char_ngram_sizes"]
        word_ngram_sizes = self.proc_params["word_ngram_sizes"]

        # Count character n-grams and track positions in single pass
        char_ngram_counts = defaultdict(int)
        char_ngram_occurrences = defaultdict(list)
        for prompt_id, _, tokens, max_pos in examples:
            window_tokens = extract_token_window(tokens, max_pos, char_window_size)
            token_ngrams = extract_token_char_ngrams(window_tokens, char_ngram_sizes)
            window_offset = calculate_window_offset(max_pos, char_window_size)

            for ngram, token_list in token_ngrams.items():
                char_ngram_counts[ngram] += 1
                for token_idx, token_text, char_offset in token_list:
                    char_ngram_occurrences[ngram].append({
                        "prompt_id": prompt_id,
                        "token_position": window_offset + token_idx,
                        "token_text": token_text,
                        "char_offset": char_offset,
                        "ngram_size": len(ngram)
                    })

        # Find top character n-gram per size
        top_char_ngrams = []
        for size in char_ngram_sizes:
            size_ngrams = {ng: cnt for ng, cnt in char_ngram_counts.items() if len(ng) == size}
            if size_ngrams:
                top_ngram = find_top_ngram(size_ngrams)
                occurrences = char_ngram_occurrences.get(top_ngram, [])
                top_char_ngrams.append({
                    "ngram": top_ngram,
                    "ngram_size": size,
                    "count": size_ngrams[top_ngram],
                    "occurrences": occurrences[:20]
                })

        # Count word n-grams and track positions in single pass
        word_ngram_counts = defaultdict(int)
        word_ngram_occurrences = defaultdict(list)
        for prompt_id, _, tokens, max_pos in examples:
            window_tokens = extract_token_window(tokens, max_pos, word_window_size)
            word_ngrams = extract_word_ngrams(window_tokens, word_ngram_sizes)
            window_offset = calculate_window_offset(max_pos, word_window_size)

            for word_ngram, positions in word_ngrams.items():
                word_ngram_counts[word_ngram] += 1
                for pos in positions:
                    word_ngram_occurrences[word_ngram].append({
                        "prompt_id": prompt_id,
                        "start_position": window_offset + pos,
                        "ngram_size": len(word_ngram.split())
                    })

        # Find top word n-gram per size
        top_word_ngrams = []
        for size in word_ngram_sizes:
            size_ngrams = {ng: cnt for ng, cnt in word_ngram_counts.items()
                          if len(ng.split()) == size}
            if size_ngrams:
                top_ngram = find_top_ngram(size_ngrams)
                occurrences = word_ngram_occurrences.get(top_ngram, [])
                top_word_ngrams.append({
                    "ngram": top_ngram,
                    "ngram_size": size,
                    "count": size_ngrams[top_ngram],
                    "occurrences": occurrences[:20]
                })

        # Find OVERALL top char n-gram (across all sizes)
        overall_top_char = None
        if char_ngram_counts:
            top_char_ngram = find_top_ngram(char_ngram_counts)
            if top_char_ngram is not None:
                top_char_occurrences = char_ngram_occurrences.get(top_char_ngram, [])
                overall_top_char = {
                    "ngram": top_char_ngram,
                    "ngram_size": len(top_char_ngram),
                    "count": char_ngram_counts[top_char_ngram],
                    "occurrences": top_char_occurrences
                }

        # Find OVERALL top word n-gram (across all sizes)
        overall_top_word = None
        if word_ngram_counts:
            top_word_ngram = find_top_ngram(word_ngram_counts)
            if top_word_ngram is not None:
                top_word_occurrences = word_ngram_occurrences.get(top_word_ngram, [])
                overall_top_word = {
                    "ngram": top_word_ngram,
                    "ngram_size": len(top_word_ngram.split()),
                    "count": word_ngram_counts[top_word_ngram],
                    "occurrences": top_word_occurrences
                }

        return {
            "char_ngrams": top_char_ngrams,
            "word_ngrams": top_word_ngrams,
            "top_char": overall_top_char,
            "top_word": overall_top_word
        }

    def _process_feature(self, feature_id: int) -> Dict[str, Any]:
        """Process a single feature to compute all similarity metrics.

        Args:
            feature_id: Feature ID

        Returns:
            Dictionary with computed metrics
        """
        # Get prompt IDs from pre-built lookup index (O(1))
        stored_prompt_ids = self._embedding_prompt_ids.get(feature_id, [])

        if not stored_prompt_ids:
            logger.warning(f"No pre-computed embeddings found for feature {feature_id}")
            self.stats["features_with_no_activations"] += 1
            return self._create_empty_result(feature_id)

        # Fetch activation data from pre-built index (O(1) per lookup)
        activation_data = self._activation_index.get(feature_id, {})
        all_examples = []
        for prompt_id in stored_prompt_ids:
            row_dict = activation_data.get(prompt_id)
            if row_dict is None:
                continue

            activation_pairs = row_dict.get("activation_pairs", [])
            max_activation = row_dict.get("max_activation")

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
            return self._create_empty_result(feature_id)

        self.stats["total_examples_analyzed"] += len(all_examples)

        # Extract prompt IDs
        prompt_ids = [ex[0] for ex in all_examples]

        # Compute semantic similarity (embeddings_df asserted non-None above)
        semantic_sim_mean, semantic_sim_std = compute_intra_feature_semantic_similarity(
            self.embeddings_df, feature_id, prompt_ids  # type: ignore[arg-type]
        )
        if semantic_sim_mean is not None:
            self.stats["semantic_similarity_computed"] += 1

        # Compute per-k Jaccard similarity (avoids set cardinality explosion)
        char_window = self.proc_params["char_ngram_window_size"]
        word_window = self.proc_params["word_ngram_window_size"]
        char_ngram_sizes = self.proc_params["char_ngram_sizes"]
        word_ngram_sizes = self.proc_params["word_ngram_sizes"]

        # Compute per-k Jaccard for character n-grams (intra-feature)
        char_per_k, char_ngram_max_jaccard, char_ngram_max_jaccard_std = compute_per_k_jaccard(
            all_examples, all_examples,  # Same list = intra-feature comparison
            char_ngram_sizes, char_window, is_word=False
        )
        char_ngram_per_k_jaccard = {f"k{k}": v for k, v in char_per_k.items()}

        # Compute per-k Jaccard for word n-grams (intra-feature)
        word_per_k, word_ngram_max_jaccard, word_ngram_max_jaccard_std = compute_per_k_jaccard(
            all_examples, all_examples,  # Same list = intra-feature comparison
            word_ngram_sizes, word_window, is_word=True
        )
        word_ngram_per_k_jaccard = {f"k{k}": v for k, v in word_per_k.items()}

        if char_ngram_max_jaccard is not None or word_ngram_max_jaccard is not None:
            self.stats["ngram_jaccard_computed"] += 1

        # Compute n-gram analysis (for position tracking in frontend)
        ngram_results = self._compute_ngram_analysis(all_examples)
        top_char_ngrams = ngram_results.get("char_ngrams", [])
        top_word_ngrams = ngram_results.get("word_ngrams", [])
        overall_top_char = ngram_results.get("top_char")
        overall_top_word = ngram_results.get("top_word")

        if len(top_char_ngrams) > 0 or len(top_word_ngrams) > 0:
            self.stats["ngram_analysis_computed"] += 1

        return {
            "feature_id": feature_id,
            "sae_id": self.sae_id,
            "prompt_ids": prompt_ids,
            "avg_pairwise_semantic_similarity": semantic_sim_mean,
            "std_pairwise_semantic_similarity": semantic_sim_std,
            "top_char_ngrams": top_char_ngrams,
            "top_word_ngrams": top_word_ngrams,
            "top_char_ngram": overall_top_char,
            "top_word_ngram": overall_top_word,
            # per-k-max Jaccard (keep for SVM)
            "char_ngram_max_jaccard": char_ngram_max_jaccard,
            "word_ngram_max_jaccard": word_ngram_max_jaccard,
            # per-k-max Jaccard std (for SVM)
            "char_ngram_max_jaccard_std": char_ngram_max_jaccard_std,
            "word_ngram_max_jaccard_std": word_ngram_max_jaccard_std,
            # per-k Jaccard values (for longest n-gram selection)
            "char_ngram_per_k_jaccard": char_ngram_per_k_jaccard,
            "word_ngram_per_k_jaccard": word_ngram_per_k_jaccard,
        }

    def _create_empty_result(self, feature_id: int) -> Dict[str, Any]:
        """Create an empty result dictionary for features with no data."""
        return {
            "feature_id": feature_id,
            "sae_id": self.sae_id,
            "prompt_ids": [],
            "avg_pairwise_semantic_similarity": None,
            "std_pairwise_semantic_similarity": None,
            "top_char_ngrams": [],
            "top_word_ngrams": [],
            "top_char_ngram": None,
            "top_word_ngram": None,
            # per-k-max Jaccard (keep for SVM)
            "char_ngram_max_jaccard": None,
            "word_ngram_max_jaccard": None,
            # per-k-max Jaccard std (for SVM)
            "char_ngram_max_jaccard_std": None,
            "word_ngram_max_jaccard_std": None,
            # per-k Jaccard values (for longest n-gram selection)
            "char_ngram_per_k_jaccard": {},
            "word_ngram_per_k_jaccard": {},
        }

    def process(self) -> pl.DataFrame:
        """Execute the main processing logic.

        Returns:
            Processed DataFrame
        """
        # Load data
        self._load_data()

        # Get unique features
        assert self.activation_df is not None
        unique_features = sorted(self.activation_df["feature_id"].unique().to_list())

        # Apply feature limit
        if self.feature_limit is not None:
            unique_features = unique_features[:self.feature_limit]
            logger.info(f"Processing limited to {self.feature_limit} features")

        logger.info(f"Processing {len(unique_features):,} features")

        # Process features
        results = []
        for feature_id in tqdm(unique_features, desc="Processing features"):
            result = self._process_feature(feature_id)
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
            return pl.DataFrame()

        df = pl.DataFrame(rows)

        # Cast to proper types
        df = df.with_columns([
            pl.col("feature_id").cast(pl.UInt32),
            pl.col("sae_id").cast(pl.Categorical),
            pl.col("avg_pairwise_semantic_similarity").cast(pl.Float32),
            pl.col("std_pairwise_semantic_similarity").cast(pl.Float32),
        ])

        logger.info(f"Created DataFrame with {len(df)} rows and {len(df.columns)} columns")
        return df


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Calculate activation similarity metrics")
    parser.add_argument("--config", type=str, help="Path to configuration file")
    parser.add_argument("--limit", type=int, help="Limit number of features (for testing)")

    args = parser.parse_args()

    # Setup logging
    setup_logging()

    # Load config
    if args.config:
        full_config = load_yaml_config(args.config)
        # Extract step-specific config if present
        config = full_config.get("steps", {}).get("step_08_activation_similarity", {})
        if not config:
            # Fallback: treat entire config as step config (legacy format)
            config = full_config
        config["sae_id"] = full_config.get("global", {}).get("sae_id_sanitized", "")
        config["global"] = full_config.get("global", {})
    else:
        config_path = Path(__file__).parent.parent / "config.yaml"
        if config_path.exists():
            full_config = load_yaml_config(config_path)
            config = full_config.get("steps", {}).get("step_08_activation_similarity", {})
            config["sae_id"] = full_config.get("global", {}).get("sae_id_sanitized", "")
            config["global"] = full_config.get("global", {})
        else:
            config = {}

    # Run processor
    processor = ActivationSimilarityProcessor(config, feature_limit=args.limit)
    processor.run()


if __name__ == "__main__":
    main()
