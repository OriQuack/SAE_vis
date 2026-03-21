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
- activation_display.parquet: Optimized display data (~128MB)

Features:
- Pre-organized quantile examples (2 per quantile, 8 total per feature)
- Pre-processed tokens (leading underscores removed, joined into text)
- Pre-computed pattern_type (vectorized Polars expressions)
- Pre-computed best n-gram selection (batch processing candidates only)
- Feature-level data structure for fast loading (~20ms vs ~5 seconds)

Optimizations (v5.0):
- Vectorized pattern_type: O(N) in Polars vs O(N) with Python overhead
- Batch n-gram selection: Only process candidates (~30% of rows) vs all rows
- Pre-join similarity data: Eliminates N filter operations per feature
- Pattern type distribution logging for diagnostics
"""

import logging
from collections import defaultdict
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
        return "5.0"  # Version bump: vectorized pattern_type + batch n-gram selection

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

        # Highlight scoring config (S1 n-gram params now in step_08)
        highlight = parameters.get("highlight_scoring", {})
        self.hl = {
            "enabled": highlight.get("enabled", True),
            "min_examples": highlight.get("min_example_count", 3),  # for C2 discriminative tokens
            "span_model": highlight.get("span_model", "all-MiniLM-L6-v2"),
            "span_sizes": highlight.get("span_sizes", [11]),
            "span_gate_threshold": highlight.get("span_gate_threshold", 0.20),
            "span_sim_threshold": highlight.get("span_sim_threshold", 0.25),
            "top_span_sets": highlight.get("top_span_sets", 2),
        }
        self.highlights_output_path = self._resolve_path(f"{output_dir}/activation_highlights.parquet")

        # Initialize statistics
        self.stats = {
            "features_processed": 0,
            "features_with_no_data": 0,
            "features_with_limited_examples": 0,
            "total_examples_processed": 0
        }

    def _precompute_derived_fields(self, df: pl.DataFrame) -> pl.DataFrame:
        """
        Pre-compute pattern_type and best n-gram fields for all similarity rows.

        OPTIMIZED: Uses vectorized Polars operations for pattern_type,
        and only processes rows with potential valid n-grams for the rest.

        Args:
            df: similarity_df with all features

        Returns:
            DataFrame with added columns:
            - pattern_type: Categorical ("Semantic", "Lexical", "Both", "None")
            - best_ngram_type: Categorical ('word' | 'char' | null)
            - best_ngram_text: Utf8 - unified n-gram text
            - best_ngram_size: UInt8 - n-gram size (k value)
        """
        logger.info("Pre-computing derived fields (pattern_type, best n-grams)...")

        # Check required columns exist
        required_cols = ["avg_pairwise_semantic_similarity", "char_ngram_max_jaccard", "word_ngram_max_jaccard"]
        missing = [c for c in required_cols if c not in df.columns]
        if missing:
            logger.warning(f"Missing required columns for pattern_type: {missing}")
            return df.with_columns([
                pl.lit("None").alias("pattern_type"),
                pl.lit(None).cast(pl.Utf8).alias("best_ngram_type"),
                pl.lit(None).cast(pl.Utf8).alias("best_ngram_text"),
                pl.lit(0).cast(pl.UInt8).alias("best_ngram_size"),
            ])

        total_rows = len(df)
        logger.info(f"Processing {total_rows:,} features for derived fields...")

        # ============================================================
        # OPTIMIZATION 1: Vectorized pattern_type computation
        # ============================================================
        logger.info("Computing pattern_type (vectorized)...")

        has_semantic = pl.col("avg_pairwise_semantic_similarity").fill_null(0) >= self.semantic_threshold
        max_lexical = pl.max_horizontal(
            pl.col("char_ngram_max_jaccard").fill_null(0),
            pl.col("word_ngram_max_jaccard").fill_null(0)
        )
        has_lexical = max_lexical >= self.lexical_threshold

        result_df = df.with_columns([
            pl.when(has_semantic & has_lexical).then(pl.lit("Both"))
              .when(has_semantic).then(pl.lit("Semantic"))
              .when(has_lexical).then(pl.lit("Lexical"))
              .otherwise(pl.lit("None"))
              .alias("pattern_type")
        ])

        # Log pattern type distribution
        pattern_counts = result_df.group_by("pattern_type").agg(pl.count().alias("count")).sort("pattern_type")
        logger.info(f"Pattern type distribution:\n{pattern_counts}")

        # ============================================================
        # OPTIMIZATION 2: Only process rows that might have valid n-grams
        # ============================================================
        has_per_k = "word_ngram_per_k_jaccard" in df.columns or "char_ngram_per_k_jaccard" in df.columns

        if not has_per_k:
            logger.info("No per-k data available, skipping n-gram selection")
            return result_df.with_columns([
                pl.lit(None).cast(pl.Utf8).alias("best_ngram_type"),
                pl.lit(None).cast(pl.Utf8).alias("best_ngram_text"),
                pl.lit(0).cast(pl.UInt8).alias("best_ngram_size"),
            ])

        # Pre-filter: Only rows where max Jaccard >= lexical_threshold might have valid n-grams
        # Two-tier logic:
        #   - Tier 1 (lexical_threshold): Gate - does this feature have a lexical pattern worth highlighting?
        #   - Tier 2 (ngram_jaccard_threshold): Selection - pick the longest n-gram above this (lower) threshold
        might_have_ngram = (
            (pl.col("char_ngram_max_jaccard").fill_null(0) >= self.lexical_threshold) |
            (pl.col("word_ngram_max_jaccard").fill_null(0) >= self.lexical_threshold)
        )

        # Add row index for later join
        result_df = result_df.with_row_count("_row_idx")

        # Filter to candidate rows only
        candidate_df = result_df.filter(might_have_ngram)
        candidate_count = len(candidate_df)
        logger.info(f"Processing {candidate_count:,} candidate rows for n-gram selection (out of {total_rows:,})")

        if candidate_count == 0:
            logger.info("No candidate rows, all n-gram fields will be null")
            return result_df.drop("_row_idx").with_columns([
                pl.lit(None).cast(pl.Utf8).alias("best_ngram_type"),
                pl.lit(None).cast(pl.Utf8).alias("best_ngram_text"),
                pl.lit(0).cast(pl.UInt8).alias("best_ngram_size"),
            ])

        # Process only candidate rows
        candidate_rows = candidate_df.to_dicts()

        best_ngram_types = []
        best_ngram_texts = []
        best_ngram_sizes = []
        row_indices = []

        for i, row in enumerate(candidate_rows):
            if i % 5000 == 0 and i > 0:
                logger.info(f"Processing candidate {i:,}/{candidate_count:,} ({100*i/candidate_count:.1f}%)")

            word_per_k = row.get("word_ngram_per_k_jaccard") or {}
            top_word_per_k = row.get("top_word_ngrams") or []
            char_per_k = row.get("char_ngram_per_k_jaccard") or {}
            top_char_per_k = row.get("top_char_ngrams") or []

            best = select_best_ngram(
                word_per_k_jaccard=word_per_k,
                word_ngrams=top_word_per_k,
                char_per_k_jaccard=char_per_k,
                char_ngrams=top_char_per_k,
                threshold=self.ngram_jaccard_threshold  # Tier 2: select longest n-gram above this threshold
            )

            if best["type"] is not None:
                row_indices.append(row["_row_idx"])
                best_ngram_types.append(best["type"])
                best_ngram_texts.append(best["text"])
                best_ngram_sizes.append(best["size"])

        logger.info(f"Found {len(row_indices):,} rows with valid n-grams")

        # Create DataFrame with n-gram results
        if row_indices:
            ngram_df = pl.DataFrame({
                "_row_idx": row_indices,
                "best_ngram_type": best_ngram_types,
                "best_ngram_text": best_ngram_texts,
                "best_ngram_size": best_ngram_sizes,
            }).with_columns(pl.col("_row_idx").cast(pl.UInt32))  # Match type from with_row_count

            # Join back to main DataFrame
            result_df = result_df.join(ngram_df, on="_row_idx", how="left")
        else:
            result_df = result_df.with_columns([
                pl.lit(None).cast(pl.Utf8).alias("best_ngram_type"),
                pl.lit(None).cast(pl.Utf8).alias("best_ngram_text"),
                pl.lit(0).cast(pl.UInt8).alias("best_ngram_size"),
            ])

        # Drop temporary index and ensure null handling for size
        result_df = result_df.drop("_row_idx").with_columns([
            pl.col("best_ngram_size").fill_null(0).cast(pl.UInt8),
        ])

        # Log n-gram type distribution
        ngram_counts = result_df.group_by("best_ngram_type").agg(pl.count().alias("count")).sort("best_ngram_type")
        logger.info(f"best_ngram_type distribution:\n{ngram_counts}")

        return result_df

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
        """Process token list, replacing SentencePiece markers with spaces to preserve word boundaries.

        Args:
            tokens: List of token strings (may have '▁' SentencePiece prefix)

        Returns:
            List of processed tokens with leading spaces for word-start tokens
        """
        if not tokens:
            return []
        result = []
        for t in tokens:
            if t.startswith('▁'):
                stripped = t.lstrip('▁')
                if stripped:
                    result.append(' ' + stripped)   # '▁the' → ' the'
                else:
                    result.append(' ' * len(t))     # '▁' → ' '  (space token)
            else:
                result.append(t)                    # 'eavor' → 'eavor' (sub-word)
        return result

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

    def _process_feature_with_precomputed(
        self, feature_id: int, precomputed_lookup: Dict[int, Dict]
    ) -> Optional[Dict[str, Any]]:
        """Process a single feature using pre-computed derived fields.

        Args:
            feature_id: Feature ID to process
            precomputed_lookup: Dict mapping feature_id to precomputed row data

        Returns:
            Dictionary with processed data or None if invalid
        """
        # Get precomputed data for this feature
        sim_row = precomputed_lookup.get(feature_id)

        if sim_row is None:
            self.stats["features_with_no_data"] += 1
            return {
                "feature_id": feature_id,
                "sae_id": self.sae_id,
                "semantic_similarity": None,
                "semantic_similarity_std": None,
                "char_ngram_max_jaccard": 0.0,
                "word_ngram_max_jaccard": 0.0,
                "char_ngram_max_jaccard_std": 0.0,
                "word_ngram_max_jaccard_std": 0.0,
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

        # Extract metadata (support both new and legacy column names)
        prompt_ids = sim_row.get("prompt_ids") or sim_row.get("prompt_ids_for_display", [])
        semantic_sim = sim_row.get("avg_pairwise_semantic_similarity")
        semantic_sim_std = sim_row.get("std_pairwise_semantic_similarity")

        # Extract per-k-max Jaccard values
        char_ngram_jaccard = sim_row.get("char_ngram_max_jaccard") or 0.0
        word_ngram_jaccard = sim_row.get("word_ngram_max_jaccard") or 0.0
        char_ngram_jaccard_std = sim_row.get("char_ngram_max_jaccard_std") or 0.0
        word_ngram_jaccard_std = sim_row.get("word_ngram_max_jaccard_std") or 0.0

        # Extract top n-grams (overall) for backward compatibility
        top_char_ngram = sim_row.get("top_char_ngram")
        top_word_ngram = sim_row.get("top_word_ngram")

        # Use pre-computed derived fields
        pattern_type = sim_row.get("pattern_type", "None")
        best_ngram_type = sim_row.get("best_ngram_type")
        best_ngram_text = sim_row.get("best_ngram_text")
        best_ngram_size = sim_row.get("best_ngram_size", 0)

        # For n-gram position extraction, we still need the full n-gram data
        top_char_ngrams = sim_row.get("top_char_ngrams") or []
        top_word_ngrams = sim_row.get("top_word_ngrams") or []
        char_per_k_jaccard = sim_row.get("char_ngram_per_k_jaccard") or {}
        word_per_k_jaccard = sim_row.get("word_ngram_per_k_jaccard") or {}

        if not prompt_ids or len(prompt_ids) == 0:
            self.stats["features_with_no_data"] += 1
            return {
                "feature_id": feature_id,
                "sae_id": self.sae_id,
                "semantic_similarity": float(semantic_sim) if semantic_sim is not None else None,
                "semantic_similarity_std": float(semantic_sim_std) if semantic_sim_std is not None else None,
                "char_ngram_max_jaccard": float(char_ngram_jaccard),
                "word_ngram_max_jaccard": float(word_ngram_jaccard),
                "char_ngram_max_jaccard_std": float(char_ngram_jaccard_std),
                "word_ngram_max_jaccard_std": float(word_ngram_jaccard_std),
                "top_char_ngram_text": None,
                "top_word_ngram_text": None,
                "quantile_examples": [],
                # Pre-computed pattern_type
                "pattern_type": pattern_type,
                # Pre-computed best n-gram (unified display format)
                "best_ngram_type": best_ngram_type,
                "best_ngram_text": best_ngram_text,
                "best_ngram_size": best_ngram_size,
            }

        # Fetch activation examples for these prompt IDs
        feature_examples = self.examples_df.filter(
            (pl.col("feature_id") == feature_id) &
            (pl.col("prompt_id").is_in(prompt_ids))
        )

        if len(feature_examples) == 0:
            self.stats["features_with_no_data"] += 1
            return None

        # Get best n-gram data for position extraction (need full occurrences)
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

            # Adjust char_offset for tokens that gained a leading space from ▁ → ' '
            for pos in ngram_positions:
                if pos.get("char_offset") is not None:
                    token_idx = pos["token_position"]
                    if token_idx < len(raw_tokens) and raw_tokens[token_idx].startswith('▁'):
                        pos["char_offset"] += 1  # Account for prepended space

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

        return {
            "feature_id": feature_id,
            "sae_id": self.sae_id,
            "semantic_similarity": float(semantic_sim) if semantic_sim is not None else None,
            "semantic_similarity_std": float(semantic_sim_std) if semantic_sim_std is not None else None,
            # Max Jaccard values
            "char_ngram_max_jaccard": float(char_ngram_jaccard),
            "word_ngram_max_jaccard": float(word_ngram_jaccard),
            # Max Jaccard std values
            "char_ngram_max_jaccard_std": float(char_ngram_jaccard_std),
            "word_ngram_max_jaccard_std": float(word_ngram_jaccard_std),
            # Overall top n-gram text (for backward compatibility)
            "top_char_ngram_text": char_ngram_text,
            "top_word_ngram_text": word_ngram_text,
            "quantile_examples": quantile_examples,
            # Pre-computed pattern_type
            "pattern_type": pattern_type,
            # Pre-computed best n-gram (unified display format)
            "best_ngram_type": best_ngram_type,
            "best_ngram_text": best_ngram_text,
            "best_ngram_size": best_ngram_size,
        }

    def _compute_highlights(
        self,
        unique_features: list,
        similarity_lookup: Dict[int, dict],
        display_prompt_ids: Dict[int, set],
    ) -> None:
        """Compute per-token highlight component scores and write to separate parquet.

        Only processes the display examples (~8 per feature) rather than all
        activation examples, since highlights are only shown for displayed examples.

        Args:
            unique_features: List of feature IDs to process
            similarity_lookup: Pre-computed similarity data per feature
            display_prompt_ids: {feature_id: set of prompt_ids} for display examples
        """
        import gc
        import pickle
        from core.highlight import (
            compute_discriminative_scores,
        )
        from core.span_embeddings import (
            load_sentence_encoder,
            extract_spans,
            batch_encode_spans,
            find_top_span_sets,
            compute_discriminative_tokens,
            build_global_token_idf,
            compute_token_idf_scores,
        )
        from core.structural_parse import (
            build_char_to_token_map,
            get_activated_char_range,
            extract_dependency_relations,
            extract_ast_relations,
            compute_common_structural_relations,
            load_spacy_model,
            load_tree_sitter_parsers,
        )

        logger.info("=" * 60)
        logger.info("Computing highlight component scores")
        logger.info("=" * 60)

        # ============================================================
        # Checkpoint helpers
        # ============================================================
        intermediate_dir = self._resolve_path("data/intermediate")

        def save_checkpoint(name, data):
            path = intermediate_dir / name
            with open(path, "wb") as f:
                pickle.dump(data, f)
            logger.info(f"Saved checkpoint: {path}")

        def load_checkpoint(name):
            path = intermediate_dir / name
            if path.exists():
                with open(path, "rb") as f:
                    data = pickle.load(f)
                logger.info(f"Loaded checkpoint: {path} (skipping computation)")
                return data
            return None

        # Check which stages need computation
        has_s2_cache = (intermediate_dir / "highlight_s2_relations.pkl").exists()
        has_span_sets_cache = (intermediate_dir / "highlight_span_sets.pkl").exists()
        need_s2 = not has_s2_cache
        need_encoding = not has_span_sets_cache

        # ============================================================
        # Pass 1: Global IDF (vectorized Polars, uses ALL examples)
        # ============================================================
        logger.info("Building global token IDF...")
        global_idf_lookup = build_global_token_idf(self.examples_df)
        logger.info(f"Global IDF: {len(global_idf_lookup):,} unique tokens")

        # ============================================================
        # Load models (only if needed)
        # ============================================================
        if need_s2:
            logger.info("Loading spaCy model...")
            spacy_nlp = load_spacy_model()
            logger.info("Loading tree-sitter parsers...")
            ts_parsers = load_tree_sitter_parsers()
        else:
            logger.info("Skipping spaCy/tree-sitter model loading (cached)")

        if need_encoding:
            logger.info("Loading sentence encoder...")
            span_model = load_sentence_encoder(self.hl["span_model"])
        else:
            logger.info("Skipping sentence encoder loading (all embeddings cached)")

        # ============================================================
        # Pass 2: Single merged loop — build ALL data structures
        # (activation index + parse jobs + span texts)
        # ============================================================
        logger.info("Building activation index + parse data (display examples only)...")
        # Build set of (feature_id, prompt_id) pairs for display examples
        display_pairs = set()
        for fid, pids in display_prompt_ids.items():
            for pid in pids:
                display_pairs.add((fid, pid))
        logger.info(f"Display examples: {len(display_pairs):,} across {len(display_prompt_ids):,} features")

        # Build a filter DataFrame for efficient semi-join
        filter_rows = [{"feature_id": fid, "prompt_id": pid} for fid, pid in display_pairs]
        filter_df = pl.DataFrame(filter_rows).with_columns([
            pl.col("feature_id").cast(pl.UInt32),
            pl.col("prompt_id").cast(pl.UInt32),
        ])

        filtered_examples = self.examples_df.filter(
            pl.col("feature_id").is_in(unique_features)
        ).join(filter_df, on=["feature_id", "prompt_id"], how="semi")
        logger.info(f"Filtered to {len(filtered_examples):,} display examples for {len(unique_features):,} features")

        feature_examples: Dict[int, list] = {}
        parse_jobs = []      # (fid, prompt_id, tokens, max_pos, char_to_token)
        parse_texts = []     # detokenized text for spaCy

        for row in tqdm(filtered_examples.to_dicts(), desc="Building index", total=len(filtered_examples)):
            fid = row["feature_id"]
            if fid not in feature_examples:
                feature_examples[fid] = []

            activation_pairs = row.get("activation_pairs", [])
            max_activation = row.get("max_activation", 0.0)
            tokens = row.get("prompt_tokens", [])
            max_pos = 0
            if activation_pairs:
                max_pair = max(activation_pairs, key=lambda p: p["activation_value"])
                max_pos = max_pair["token_position"]

            prompt_id = row["prompt_id"]

            # Activation index
            feature_examples[fid].append((
                prompt_id,
                max_activation if max_activation is not None else 0.0,
                tokens,
                max_pos,
            ))

            # Parse job (text + char_to_token mapping)
            text, c2t = build_char_to_token_map(tokens)
            parse_texts.append(text)
            parse_jobs.append((fid, prompt_id, tokens, max_pos, c2t))

        features_to_process = [f for f in unique_features if f in feature_examples]
        logger.info(f"Highlight scoring for {len(features_to_process):,} features, "
                     f"{len(parse_texts):,} examples")

        # ============================================================
        # S2: Tree-sitter first (to identify code), then spaCy on non-code only
        # ============================================================
        cached_s2 = load_checkpoint("highlight_s2_relations.pkl")
        if cached_s2:
            common_dep_by_feature, common_ast_by_feature = cached_s2
        else:
            # Step 1: Run tree-sitter AST on all examples
            logger.info("Running tree-sitter AST parsing...")
            ast_relations_by_feature: Dict[int, list] = defaultdict(list)
            prompt_ids_by_feature: Dict[int, list] = defaultdict(list)
            is_code: List[bool] = []  # parallel to parse_jobs: True if tree-sitter found structure

            for idx, (fid, prompt_id, tokens, max_pos, c2t) in enumerate(tqdm(parse_jobs, desc="S2 relation extraction")):
                char_start, char_end = get_activated_char_range(max_pos, c2t)
                ast_rels = extract_ast_relations(
                    parse_texts[idx], char_start, char_end, c2t, ts_parsers, prompt_id
                )
                ast_relations_by_feature[fid].append(ast_rels)
                prompt_ids_by_feature[fid].append(prompt_id)
                is_code.append(len(ast_rels) > 0)

            code_count = sum(is_code)
            logger.info(f"Tree-sitter: {code_count:,}/{len(parse_jobs):,} examples identified as code")

            # Step 2: Run spaCy only on non-code examples
            nl_indices = [i for i, ic in enumerate(is_code) if not ic]
            nl_texts = [parse_texts[i] for i in nl_indices]
            logger.info(f"Running spaCy on {len(nl_texts):,} non-code examples...")
            spacy_docs = list(tqdm(
                spacy_nlp.pipe(nl_texts, batch_size=256),
                total=len(nl_texts), desc="spaCy parsing"
            ))

            dep_relations_by_feature: Dict[int, list] = defaultdict(list)
            # Initialize with empty lists for all examples (code examples get [])
            for fid in features_to_process:
                dep_relations_by_feature[fid] = [[] for _ in feature_examples[fid]]

            for doc_idx, orig_idx in enumerate(tqdm(nl_indices, desc="spaCy dep extraction")):
                fid, prompt_id, tokens, max_pos, c2t = parse_jobs[orig_idx]
                char_start, _ = get_activated_char_range(max_pos, c2t)
                dep_rels = extract_dependency_relations(spacy_docs[doc_idx], char_start, c2t, prompt_id)
                # Find example index within this feature
                ex_idx = prompt_ids_by_feature[fid].index(prompt_id)
                dep_relations_by_feature[fid][ex_idx] = dep_rels

            logger.info(f"spaCy parsed {len(nl_texts):,} texts (skipped {code_count:,} code examples)")

            # Free spaCy docs — no longer needed after dep extraction
            del spacy_docs, nl_texts
            gc.collect()
            logger.info("Freed spaCy docs")

            # Compute common structural relations per feature
            common_dep_by_feature: Dict[int, list] = {}
            common_ast_by_feature: Dict[int, list] = {}
            for fid in features_to_process:
                common_dep_by_feature[fid] = compute_common_structural_relations(
                    dep_relations_by_feature[fid], prompt_ids_by_feature[fid]
                )
                common_ast_by_feature[fid] = compute_common_structural_relations(
                    ast_relations_by_feature[fid], prompt_ids_by_feature[fid]
                )

            dep_features_with_patterns = sum(1 for v in common_dep_by_feature.values() if v)
            ast_features_with_patterns = sum(1 for v in common_ast_by_feature.values() if v)
            logger.info(f"S2 dep parse: {dep_features_with_patterns:,} features with common relations")
            logger.info(f"S2 AST parse: {ast_features_with_patterns:,} features with common relations")

            save_checkpoint("highlight_s2_relations.pkl", (common_dep_by_feature, common_ast_by_feature))

        # ============================================================
        # Context span sets: tree-search span matching
        # ============================================================
        import numpy as np

        span_sim_threshold = self.hl.get("span_sim_threshold", 0.25)
        top_span_sets_k = self.hl.get("top_span_sets", 2)

        # Gate: use step_08's avg_pairwise_semantic_similarity
        gate_threshold = self.hl["span_gate_threshold"]
        semantic_sims = {}
        for row in self.similarity_df.select(["feature_id", "avg_pairwise_semantic_similarity"]).to_dicts():
            fid = row["feature_id"]
            if fid in feature_examples:
                semantic_sims[fid] = row["avg_pairwise_semantic_similarity"] or 0.0

        qualifying_features = {
            fid for fid, sim in semantic_sims.items()
            if sim > gate_threshold
        }
        logger.info(f"Step_08 semantic_sim > {gate_threshold}: "
                     f"{len(qualifying_features):,}/{len(features_to_process):,} features qualify for context spans")

        # Compute span sets per feature (cached)
        span_sets_by_feature: Dict[int, list] = {}  # fid -> list of span set dicts

        cached_span_sets = load_checkpoint("highlight_span_sets.pkl")
        if cached_span_sets:
            span_sets_by_feature = cached_span_sets
        elif qualifying_features:
            SPAN_CHUNK_SIZE = 1000
            feature_list = sorted(qualifying_features)

            for span_size in self.hl["span_sizes"]:
                n_chunks = (len(feature_list) + SPAN_CHUNK_SIZE - 1) // SPAN_CHUNK_SIZE
                logger.info(f"Computing span_{span_size} sets for "
                            f"{len(feature_list):,} features in {n_chunks} chunks...")

                for chunk_start in range(0, len(feature_list), SPAN_CHUNK_SIZE):
                    chunk_fids = feature_list[chunk_start:chunk_start + SPAN_CHUNK_SIZE]
                    chunk_num = chunk_start // SPAN_CHUNK_SIZE + 1
                    logger.info(f"  Chunk {chunk_num}/{n_chunks}: "
                                f"features {chunk_start + 1}-{chunk_start + len(chunk_fids)}/{len(feature_list)}")

                    # Extract spans and collect texts for batch encoding
                    all_texts = []
                    text_index = []  # (fid, ex_idx, span_idx)
                    spans_by_feature: Dict[int, List[List[Dict]]] = {}

                    for fid in chunk_fids:
                        examples = feature_examples[fid]
                        spans_by_feature[fid] = []
                        for ex_idx, (_, _, tokens, max_pos) in enumerate(examples):
                            spans = extract_spans(tokens, max_pos, span_size)
                            spans_by_feature[fid].append(spans)
                            for sp_idx, span in enumerate(spans):
                                all_texts.append(span["text"])
                                text_index.append((fid, ex_idx, sp_idx))

                    logger.info(f"  Encoding {len(all_texts):,} span_{span_size} texts...")
                    all_embs = batch_encode_spans(span_model, all_texts)

                    # Distribute embeddings back to per-feature per-example
                    embs_by_feature: Dict[int, List[list]] = {}
                    for fid in chunk_fids:
                        n_ex = len(feature_examples[fid])
                        embs_by_feature[fid] = [[] for _ in range(n_ex)]

                    for i, (fid, ex_idx, sp_idx) in enumerate(text_index):
                        embs_by_feature[fid][ex_idx].append(all_embs[i])

                    # Find span sets per feature
                    for fid in chunk_fids:
                        examples = feature_examples[fid]
                        embs_by_ex = [np.array(e) if e else np.array([]).reshape(0, all_embs.shape[1])
                                      for e in embs_by_feature[fid]]
                        prompt_ids_list = [ex[0] for ex in examples]
                        max_pos_list = [ex[3] for ex in examples]

                        top_sets = find_top_span_sets(
                            embs_by_ex,
                            spans_by_feature[fid],
                            prompt_ids_list,
                            max_pos_list,
                            span_size=span_size,
                            sim_threshold=span_sim_threshold,
                            top_k=top_span_sets_k,
                        )
                        if top_sets:
                            if fid not in span_sets_by_feature:
                                span_sets_by_feature[fid] = []
                            span_sets_by_feature[fid].extend(top_sets)

                    del all_embs, embs_by_feature, all_texts, text_index
                    gc.collect()

                logger.info(f"Completed span_{span_size} set finding")

            save_checkpoint("highlight_span_sets.pkl", span_sets_by_feature)

        features_with_spans = sum(1 for v in span_sets_by_feature.values() if v)
        logger.info(f"Found context span sets for {features_with_spans:,} features")

        # ============================================================
        # Per-feature: compute all component scores
        # ============================================================
        logger.info("Computing per-feature highlight component scores...")
        highlight_rows = []
        ngram_sets_by_feature: Dict[int, list] = {}
        dep_sets_by_feature: Dict[int, list] = {}
        ast_sets_by_feature: Dict[int, list] = {}

        for fid in tqdm(features_to_process, desc="Highlight scoring"):
            examples = feature_examples[fid]
            num_examples = len(examples)
            if num_examples == 0:
                continue

            # S1: read common n-grams + per-k Jaccard from step_08 output
            sim_row = similarity_lookup.get(fid, {})
            common_char = sim_row.get("common_char_ngrams") or []
            common_word = sim_row.get("common_word_ngrams") or []
            char_per_k_jaccard = sim_row.get("char_ngram_per_k_jaccard") or {}
            word_per_k_jaccard = sim_row.get("word_ngram_per_k_jaccard") or {}

            # Build syntax_ngram_sets for this feature (feature-level, like context_span_sets)
            # Parse per-k Jaccard values
            def _parse_per_k_jaccard(per_k: dict) -> Dict[int, float]:
                result: Dict[int, float] = {}
                for key, value in (per_k or {}).items():
                    if isinstance(key, str) and key.startswith("k"):
                        try:
                            k = int(key[1:])
                            if value is not None:
                                result[k] = float(value)
                        except (ValueError, TypeError):
                            pass
                    elif isinstance(key, int) and value is not None:
                        result[key] = float(value)
                return result

            char_jaccard_by_k = _parse_per_k_jaccard(char_per_k_jaccard)
            word_jaccard_by_k = _parse_per_k_jaccard(word_per_k_jaccard)

            fid_ngram_sets = []
            set_idx = 0
            for ng in common_word:
                k = ng.get("ngram_size", 1)
                jaccard = word_jaccard_by_k.get(k, 0.0)
                if jaccard <= 0:
                    continue
                flat_pos = ng.get("positions", [])
                spans = []
                for p in flat_pos:
                    spans.append({"prompt_id": p[0], "start": p[1], "end": p[1] + k})
                fid_ngram_sets.append({
                    "ngram": ng.get("ngram", ""),
                    "type": "word",
                    "ngram_size": k,
                    "jaccard": round(jaccard, 4),
                    "set_index": set_idx,
                    "spans": spans,
                })
                set_idx += 1
            for ng in common_char:
                k = ng.get("ngram_size", 1)
                jaccard = char_jaccard_by_k.get(k, 0.0)
                if jaccard <= 0:
                    continue
                flat_pos = ng.get("positions", [])
                spans = []
                for p in flat_pos:
                    spans.append({"prompt_id": p[0], "start": p[1], "end": p[1] + 1})
                fid_ngram_sets.append({
                    "ngram": ng.get("ngram", ""),
                    "type": "char",
                    "ngram_size": k,
                    "jaccard": round(jaccard, 4),
                    "set_index": set_idx,
                    "spans": spans,
                })
                set_idx += 1
            ngram_sets_by_feature[fid] = fid_ngram_sets

            # S2: build dep/ast relation sets (feature-level, like ngram sets)
            fid_dep_sets = []
            for set_idx, rel in enumerate(common_dep_by_feature.get(fid, [])):
                spans = []
                for pid, positions in rel.get("partner_positions_by_prompt", {}).items():
                    for pos in positions:
                        spans.append({"prompt_id": pid, "start": pos, "end": pos + 1})
                fid_dep_sets.append({
                    "relation": rel["relation"],
                    "direction": rel["direction"],
                    "rate": round(rel["rate"], 4),
                    "set_index": set_idx,
                    "spans": spans,
                })
            dep_sets_by_feature[fid] = fid_dep_sets

            fid_ast_sets = []
            for set_idx, rel in enumerate(common_ast_by_feature.get(fid, [])):
                spans = []
                for pid, positions in rel.get("partner_positions_by_prompt", {}).items():
                    for pos in positions:
                        spans.append({"prompt_id": pid, "start": pos, "end": pos + 1})
                fid_ast_sets.append({
                    "relation": rel["relation"],
                    "direction": rel.get("direction", ""),
                    "rate": round(rel["rate"], 4),
                    "set_index": set_idx,
                    "spans": spans,
                })
            ast_sets_by_feature[fid] = fid_ast_sets

            # C2: discriminative tokens
            disc_tokens = compute_discriminative_tokens(
                examples,
                window_size=32,
                min_example_count=self.hl["min_examples"],
            )

            for ex_idx, (prompt_id, _, tokens, max_pos) in enumerate(examples):
                # C2 discriminative + IDF (only dense arrays remaining)
                c_disc = compute_discriminative_scores(tokens, disc_tokens)
                c_idf = compute_token_idf_scores(tokens, global_idf_lookup)

                highlight_rows.append({
                    "feature_id": fid,
                    "prompt_id": prompt_id,
                    "c_discriminative": c_disc,
                    "c_token_idf": c_idf,
                })

        # Create and save highlights DataFrame
        logger.info(f"Creating highlights DataFrame with {len(highlight_rows):,} rows...")
        if highlight_rows:
            highlights_df = pl.DataFrame(highlight_rows)
            highlights_df = highlights_df.with_columns([
                pl.col("feature_id").cast(pl.UInt32),
            ])

            # Add feature-level columns (join on feature_id)
            feature_level_rows = []
            for fid in highlights_df["feature_id"].unique().to_list():
                feature_level_rows.append({
                    "feature_id": fid,
                    "context_span_sets": span_sets_by_feature.get(fid, []),
                    "syntax_ngram_sets": ngram_sets_by_feature.get(fid, []),
                    "syntax_dep_sets": dep_sets_by_feature.get(fid, []),
                    "syntax_ast_sets": ast_sets_by_feature.get(fid, []),
                })
            feature_level_df = pl.DataFrame(feature_level_rows).with_columns(
                pl.col("feature_id").cast(pl.UInt32),
            )
            highlights_df = highlights_df.join(feature_level_df, on="feature_id", how="left")

            highlights_df.write_parquet(self.highlights_output_path)
            logger.info(f"Saved highlights to {self.highlights_output_path} "
                        f"({len(highlights_df):,} rows, {len(highlights_df.columns)} columns)")
        else:
            logger.warning("No highlight rows to save")

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

        # ============================================================
        # OPTIMIZATION: Pre-compute pattern_type and best n-gram for all features
        # ============================================================
        # Filter similarity_df to only features we're processing
        filtered_sim_df = self.similarity_df.filter(
            pl.col("feature_id").is_in(unique_features)
        )
        logger.info(f"Filtered similarity_df to {len(filtered_sim_df):,} rows for {len(unique_features):,} features")

        # Pre-compute derived fields (vectorized pattern_type + batch n-gram selection)
        precomputed_df = self._precompute_derived_fields(filtered_sim_df)

        # Create lookup dict for fast access (feature_id -> precomputed row)
        precomputed_lookup = {}
        for row in precomputed_df.to_dicts():
            precomputed_lookup[row["feature_id"]] = row

        # ============================================================
        # Process quantile examples per feature
        # ============================================================
        results = []
        for feature_id in tqdm(unique_features, desc="Processing features"):
            result = self._process_feature_with_precomputed(feature_id, precomputed_lookup)
            if result is not None:
                results.append(result)
                self.stats["features_processed"] += 1

        logger.info(f"Processed {self.stats['features_processed']:,} features")

        # Collect display prompt_ids (only the ~8 quantile examples per feature)
        display_prompt_ids: Dict[int, set] = {}
        for r in results:
            fid = r["feature_id"]
            pids = {ex["prompt_id"] for ex in r.get("quantile_examples", [])}
            if pids:
                display_prompt_ids[fid] = pids

        # Compute highlight component scores (separate output file)
        if self.hl["enabled"]:
            self._compute_highlights(unique_features, precomputed_lookup, display_prompt_ids)

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
            pl.col("char_ngram_max_jaccard_std").cast(pl.Float32),
            pl.col("word_ngram_max_jaccard_std").cast(pl.Float32),
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
