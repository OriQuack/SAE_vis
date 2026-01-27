#!/usr/bin/env python3
"""
Step 10: Create Optimized Activation Display Data

This step creates a pre-processed, optimized parquet file for fast activation
example display in the frontend. It combines data from activation_examples and
activation_example_similarity, pre-processes tokens, and organizes into a
feature-level structure.

Input:
- activation_examples.parquet: Raw activation data
- activation_example_similarity.parquet: Similarity metrics

Output:
- activation_display.parquet: Optimized display data (~67MB)

Features:
- Pre-organized quantile examples (2 per quantile, 8 total per feature)
- Pre-processed tokens (leading underscores removed, joined into text)
- Raw similarity metrics (pattern_type computed at runtime by backend)
- Feature-level data structure for fast loading (~20ms vs ~5 seconds)
"""

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
from core.ngrams import select_best_ngram


logger = logging.getLogger(__name__)


class ActivationDisplayProcessor(BaseProcessor):
    """Process activation data into optimized display format."""

    # Default thresholds for pattern type classification (intra-feature)
    DEFAULT_SEMANTIC_THRESHOLD = 0.6
    DEFAULT_LEXICAL_THRESHOLD = 0.3
    DEFAULT_NGRAM_JACCARD_THRESHOLD = 0.3

    @property
    def step_name(self) -> str:
        return "Step 10: Activation Display"

    @property
    def version(self) -> str:
        return "4.0"  # Version bump: pre-compute best n-gram selection

    def _init_paths(self) -> None:
        """Initialize paths from configuration."""
        super()._init_paths()

        # Get paths from global config
        global_config = self.config.get("global", {})
        paths = global_config.get("paths", {})
        intermediate_dir = paths.get("intermediate", "data/intermediate")
        output_dir = paths.get("output", "data/output")

        # Input paths
        self.examples_path = self._resolve_path(f"{intermediate_dir}/activation_examples.parquet")
        self.similarity_path = self._resolve_path(f"{intermediate_dir}/activation_example_similarity.parquet")

        # Output path
        self.output_path = self._resolve_path(f"{output_dir}/activation_display.parquet")

        # Load pattern_type thresholds from config (with defaults)
        parameters = self.config.get("parameters", {})
        thresholds = parameters.get("pattern_type_thresholds", {})
        self.semantic_threshold = thresholds.get("semantic", self.DEFAULT_SEMANTIC_THRESHOLD)
        self.lexical_threshold = thresholds.get("lexical", self.DEFAULT_LEXICAL_THRESHOLD)
        self.ngram_jaccard_threshold = thresholds.get("ngram_jaccard", self.DEFAULT_NGRAM_JACCARD_THRESHOLD)

        logger.info(f"Pattern type thresholds: semantic={self.semantic_threshold}, lexical={self.lexical_threshold}, ngram_jaccard={self.ngram_jaccard_threshold}")

        # Initialize statistics
        self.stats = {
            "features_processed": 0,
            "features_with_no_data": 0,
            "features_with_limited_examples": 0,
            "total_examples_processed": 0
        }

    def _compute_pattern_type(
        self,
        semantic_sim: Optional[float],
        char_jaccard: Optional[float],
        word_jaccard: Optional[float]
    ) -> str:
        """Compute pattern type from raw similarity values.

        Args:
            semantic_sim: Semantic embedding similarity
            char_jaccard: Character n-gram Jaccard similarity
            word_jaccard: Word n-gram Jaccard similarity

        Returns:
            Pattern type: "Semantic", "Lexical", "Both", or "None"
        """
        has_semantic = (semantic_sim or 0) >= self.semantic_threshold
        has_lexical = max(char_jaccard or 0, word_jaccard or 0) >= self.lexical_threshold

        if has_semantic and has_lexical:
            return "Both"
        elif has_semantic:
            return "Semantic"
        elif has_lexical:
            return "Lexical"
        return "None"

    def _load_data(self) -> None:
        """Load activation examples and similarity data."""
        logger.info(f"Loading activation examples from {self.examples_path}")
        if not self.examples_path.exists():
            raise FileNotFoundError(f"Activation examples not found: {self.examples_path}")
        self.examples_df = pl.read_parquet(self.examples_path)
        logger.info(f"Loaded {len(self.examples_df):,} activation examples")

        logger.info(f"Loading similarity metrics from {self.similarity_path}")
        if not self.similarity_path.exists():
            raise FileNotFoundError(f"Similarity data not found: {self.similarity_path}")
        self.similarity_df = pl.read_parquet(self.similarity_path)
        logger.info(f"Loaded similarity data for {len(self.similarity_df):,} features")

    def _process_tokens_array(self, tokens: List[str]) -> List[str]:
        """Process token list, removing SentencePiece markers.

        Args:
            tokens: List of token strings (may have '▁' SentencePiece prefix)

        Returns:
            List of processed tokens
        """
        if not tokens:
            return []
        return [t.lstrip('▁').strip() for t in tokens]

    def _extract_char_ngram_positions(self, ngram_data: Optional[Dict], prompt_id: int) -> List[Dict]:
        """Extract positions where a character n-gram appears for a specific prompt."""
        if not ngram_data:
            return []

        occurrences = ngram_data.get("occurrences", [])
        if not occurrences:
            return []

        positions = []
        for occ in occurrences:
            if occ.get("prompt_id") == prompt_id:
                positions.append({
                    "token_position": int(occ["token_position"]),
                    "char_offset": int(occ.get("char_offset", 0))
                })

        return positions

    def _extract_word_ngram_positions(self, ngram_data: Optional[Dict], prompt_id: int) -> List[int]:
        """Extract positions where a word n-gram appears for a specific prompt."""
        if not ngram_data:
            return []

        occurrences = ngram_data.get("occurrences", [])
        if not occurrences:
            return []

        positions = []
        for occ in occurrences:
            if occ.get("prompt_id") == prompt_id:
                if "start_position" in occ:
                    positions.append(int(occ["start_position"]))

        return sorted(set(positions))

    def _extract_unified_ngram_positions(
        self, best_ngram: Dict, prompt_id: int
    ) -> List[Dict]:
        """Extract unified positions for the selected best n-gram.

        Args:
            best_ngram: Result from select_best_ngram() with type, text, occurrences
            prompt_id: Prompt ID to filter positions for

        Returns:
            List of position dicts with token_position and char_offset
        """
        ngram_type = best_ngram.get("type")
        occurrences = best_ngram.get("occurrences", [])

        if not ngram_type or not occurrences:
            return []

        positions = []
        for occ in occurrences:
            if occ.get("prompt_id") != prompt_id:
                continue

            if ngram_type == "word":
                # Word n-grams: char_offset is None (highlight entire token)
                start_pos = occ.get("start_position")
                if start_pos is not None:
                    positions.append({
                        "token_position": int(start_pos),
                        "char_offset": None  # Entire token
                    })
            else:  # char
                # Char n-grams: include char_offset for substring highlighting
                positions.append({
                    "token_position": int(occ.get("token_position", 0)),
                    "char_offset": int(occ.get("char_offset", 0))
                })

        return positions

    def _process_feature(self, feature_id: int) -> Optional[Dict[str, Any]]:
        """Process a single feature to create optimized display data.

        Args:
            feature_id: Feature ID to process

        Returns:
            Dictionary with processed data or None if invalid
        """
        # Get similarity data for this feature
        feature_sim = self.similarity_df.filter(pl.col("feature_id") == feature_id)

        if len(feature_sim) == 0:
            self.stats["features_with_no_data"] += 1
            return {
                "feature_id": feature_id,
                "sae_id": self.sae_id,
                "semantic_similarity": None,
                "semantic_similarity_std": None,
                "char_ngram_max_jaccard": 0.0,
                "word_ngram_max_jaccard": 0.0,
                "top_char_ngram_text": None,
                "top_word_ngram_text": None,
                "quantile_examples": [],
                # Pre-computed pattern_type
                "pattern_type": "None",
                # Pre-computed best n-gram (unified display format)
                "best_ngram_type": None,
                "best_ngram_text": None,
                "best_ngram_size": 0,
            }

        sim_row = feature_sim.to_dicts()[0]

        # Extract metadata (support both new and legacy column names)
        prompt_ids = sim_row.get("prompt_ids") or sim_row.get("prompt_ids_for_display", [])
        semantic_sim = sim_row.get("avg_pairwise_semantic_similarity")
        semantic_sim_std = sim_row.get("std_pairwise_semantic_similarity")

        # Extract per-k-max Jaccard values
        char_ngram_jaccard = sim_row.get("char_ngram_max_jaccard") or 0.0
        word_ngram_jaccard = sim_row.get("word_ngram_max_jaccard") or 0.0

        # Extract top n-grams (overall)
        top_char_ngram = sim_row.get("top_char_ngram")
        top_word_ngram = sim_row.get("top_word_ngram")

        # NEW: Extract per-k Jaccard values (for longest n-gram selection)
        char_per_k_jaccard = sim_row.get("char_ngram_per_k_jaccard") or {}
        word_per_k_jaccard = sim_row.get("word_ngram_per_k_jaccard") or {}

        # NEW: Extract per-k top n-grams
        top_char_ngrams = sim_row.get("top_char_ngrams") or []
        top_word_ngrams = sim_row.get("top_word_ngrams") or []

        if not prompt_ids or len(prompt_ids) == 0:
            self.stats["features_with_no_data"] += 1
            # Compute pattern_type even for empty features
            pattern_type = self._compute_pattern_type(semantic_sim, char_ngram_jaccard, word_ngram_jaccard)
            # Select best n-gram even for empty features
            best_ngram = select_best_ngram(
                word_per_k_jaccard, top_word_ngrams,
                char_per_k_jaccard, top_char_ngrams,
                self.ngram_jaccard_threshold
            )
            return {
                "feature_id": feature_id,
                "sae_id": self.sae_id,
                "semantic_similarity": float(semantic_sim) if semantic_sim is not None else None,
                "semantic_similarity_std": float(semantic_sim_std) if semantic_sim_std is not None else None,
                "char_ngram_max_jaccard": float(char_ngram_jaccard),
                "word_ngram_max_jaccard": float(word_ngram_jaccard),
                "top_char_ngram_text": None,
                "top_word_ngram_text": None,
                "quantile_examples": [],
                # Pre-computed pattern_type
                "pattern_type": pattern_type,
                # Pre-computed best n-gram (unified display format)
                "best_ngram_type": best_ngram["type"],
                "best_ngram_text": best_ngram["text"],
                "best_ngram_size": best_ngram["size"],
            }

        # Fetch activation examples for these prompt IDs
        feature_examples = self.examples_df.filter(
            (pl.col("feature_id") == feature_id) &
            (pl.col("prompt_id").is_in(prompt_ids))
        )

        if len(feature_examples) == 0:
            self.stats["features_with_no_data"] += 1
            return None

        # Pre-compute best n-gram selection (word preferred over char)
        best_ngram = select_best_ngram(
            word_per_k_jaccard, top_word_ngrams,
            char_per_k_jaccard, top_char_ngrams,
            self.ngram_jaccard_threshold
        )

        # Build example data list with unified ngram_positions
        example_data_list = []
        for row_dict in feature_examples.to_dicts():
            raw_tokens = row_dict.get("prompt_tokens", [])
            prompt_tokens = self._process_tokens_array(raw_tokens)

            activation_pairs = row_dict.get("activation_pairs", [])
            max_activation = row_dict.get("max_activation")
            max_pos = 0

            if activation_pairs and len(activation_pairs) > 0:
                max_pair = max(activation_pairs, key=lambda p: p["activation_value"])
                max_pos = max_pair["token_position"]

            # Use unified ngram_positions from selected best n-gram
            ngram_positions = self._extract_unified_ngram_positions(best_ngram, row_dict["prompt_id"])

            example_data_list.append({
                "prompt_id": row_dict["prompt_id"],
                "prompt_tokens": prompt_tokens,
                "activation_pairs": activation_pairs,
                "max_activation": float(max_activation) if max_activation is not None else 0.0,
                "max_activation_position": int(max_pos),
                "ngram_positions": ngram_positions  # Unified positions from best n-gram
            })

        # Sort by max_activation descending for rank-based quantile assignment
        sorted_examples = sorted(example_data_list, key=lambda x: x['max_activation'], reverse=True)

        # Assign quantile index by rank
        num_quantiles = 4
        num_examples = len(sorted_examples)
        quantile_examples = []

        for idx, example in enumerate(sorted_examples):
            if num_examples <= num_quantiles:
                quantile_idx = idx
            else:
                group_size = num_examples // num_quantiles
                quantile_idx = min(idx // group_size, num_quantiles - 1)

            quantile_examples.append({
                "quantile_index": quantile_idx,
                **example
            })

        self.stats["total_examples_processed"] += len(quantile_examples)

        # Extract n-gram text (for backward compatibility)
        char_ngram_text = top_char_ngram.get("ngram") if top_char_ngram else None
        word_ngram_text = top_word_ngram.get("ngram") if top_word_ngram else None

        # Pre-compute pattern_type
        pattern_type = self._compute_pattern_type(semantic_sim, char_ngram_jaccard, word_ngram_jaccard)

        return {
            "feature_id": feature_id,
            "sae_id": self.sae_id,
            "semantic_similarity": float(semantic_sim) if semantic_sim is not None else None,
            "semantic_similarity_std": float(semantic_sim_std) if semantic_sim_std is not None else None,
            # Max Jaccard values
            "char_ngram_max_jaccard": float(char_ngram_jaccard),
            "word_ngram_max_jaccard": float(word_ngram_jaccard),
            # Overall top n-gram text (for backward compatibility)
            "top_char_ngram_text": char_ngram_text,
            "top_word_ngram_text": word_ngram_text,
            "quantile_examples": quantile_examples,
            # Pre-computed pattern_type
            "pattern_type": pattern_type,
            # Pre-computed best n-gram (unified display format)
            "best_ngram_type": best_ngram["type"],
            "best_ngram_text": best_ngram["text"],
            "best_ngram_size": best_ngram["size"],
        }

    def process(self) -> pl.DataFrame:
        """Execute the main processing logic.

        Returns:
            Processed DataFrame
        """
        # Load data
        self._load_data()

        # Get all feature IDs
        features_path = self._resolve_path("data/output/features.parquet")
        if features_path.exists():
            features_df = pl.read_parquet(features_path)
            all_feature_ids = set(features_df["feature_id"].unique().to_list())
            logger.info(f"Found {len(all_feature_ids):,} features in features.parquet")
        else:
            all_feature_ids = set()

        # Merge with similarity_df features
        similarity_features = set(self.similarity_df["feature_id"].unique().to_list())
        unique_features = sorted(all_feature_ids | similarity_features)

        # Apply feature limit
        if self.feature_limit is not None:
            unique_features = unique_features[:self.feature_limit]
            logger.info(f"Processing limited to {self.feature_limit} features")

        logger.info(f"Processing {len(unique_features):,} features")

        # Process features
        results = []
        for feature_id in tqdm(unique_features, desc="Processing features"):
            result = self._process_feature(feature_id)
            if result is not None:
                results.append(result)
                self.stats["features_processed"] += 1

        logger.info(f"Processed {self.stats['features_processed']:,} features")

        return self._create_dataframe(results)

    def _create_dataframe(self, rows: List[Dict]) -> pl.DataFrame:
        """Create DataFrame with proper schema.

        Args:
            rows: List of result dictionaries

        Returns:
            Polars DataFrame
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
            pl.col("semantic_similarity").cast(pl.Float32),
            pl.col("semantic_similarity_std").cast(pl.Float32),
            pl.col("char_ngram_max_jaccard").cast(pl.Float32),
            pl.col("word_ngram_max_jaccard").cast(pl.Float32),
            pl.col("pattern_type").cast(pl.Categorical),
            # Best n-gram columns
            pl.col("best_ngram_type").cast(pl.Categorical),
            pl.col("best_ngram_size").cast(pl.UInt8),
        ])

        logger.info(f"Created DataFrame with {len(df)} rows and {len(df.columns)} columns")
        return df


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Create optimized activation display data")
    parser.add_argument("--config", type=str, help="Path to configuration file")
    parser.add_argument("--limit", type=int, help="Limit number of features (for testing)")

    args = parser.parse_args()

    # Setup logging
    setup_logging()

    # Load config
    if args.config:
        full_config = load_yaml_config(args.config)
        # Extract step-specific config if present
        config = full_config.get("steps", {}).get("step_10_activation_display", {})
        if not config:
            # Fallback: treat entire config as step config (legacy format)
            config = full_config
        config["sae_id"] = full_config.get("global", {}).get("sae_id_sanitized", "")
        config["global"] = full_config.get("global", {})
    else:
        # Use defaults from main config
        config_path = Path(__file__).parent.parent / "config.yaml"
        if config_path.exists():
            full_config = load_yaml_config(config_path)
            config = full_config.get("steps", {}).get("step_10_activation_display", {})
            config["sae_id"] = full_config.get("global", {}).get("sae_id_sanitized", "")
            config["global"] = full_config.get("global", {})
        else:
            config = {}

    # Run processor
    processor = ActivationDisplayProcessor(config, feature_limit=args.limit)
    processor.run()


if __name__ == "__main__":
    main()
