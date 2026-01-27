#!/usr/bin/env python3
"""
Step 11: Process Inter-feature Activation Similarity for Display

This step processes the raw inter-feature activation similarity data
created in Step 9 and prepares it for frontend display.

Input:
- interfeature_activation_similarity_raw.parquet: Raw similarity data

Output:
- interfeature_similarity.parquet: Processed display-ready data

Features:
- Pre-computed pattern_type classification (Semantic/Lexical/Both/None)
- Pre-computed best n-grams (longest above Jaccard threshold)
- Pre-computed n-gram positions for highlighting
- Aggregation of metrics for display
- Filtering to keep only relevant similarity pairs

Pre-computation eliminates 255s cold start caused by runtime computation.
"""

import logging
from pathlib import Path
from typing import Dict, List, Optional

import polars as pl

# Enable string cache for categorical operations
pl.enable_string_cache()

# Add parent directory to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.base import BaseProcessor, load_yaml_config
from core.logging import setup_logging
from core.ngrams import select_best_ngram

logger = logging.getLogger(__name__)


class InterfeatureDisplayProcessor(BaseProcessor):
    """Process inter-feature similarity data for frontend display."""

    # Default thresholds for pattern type classification (inter-feature)
    DEFAULT_SEMANTIC_THRESHOLD = 0.6
    DEFAULT_LEXICAL_THRESHOLD = 0.3
    DEFAULT_NGRAM_JACCARD_THRESHOLD = 0.3

    @property
    def step_name(self) -> str:
        return "Step 11: Interfeature Display"

    @property
    def version(self) -> str:
        return "4.0"  # Version bump: unified best n-gram selection (word over char)

    def _compute_pattern_type_row(
        self,
        semantic_sim: Optional[float],
        char_jaccard: Optional[float],
        word_jaccard: Optional[float]
    ) -> str:
        """Compute pattern type for a single row."""
        has_semantic = (semantic_sim or 0) >= self.SEMANTIC_THRESHOLD
        has_lexical = max(char_jaccard or 0, word_jaccard or 0) >= self.LEXICAL_THRESHOLD

        if has_semantic and has_lexical:
            return "Both"
        elif has_semantic:
            return "Semantic"
        elif has_lexical:
            return "Lexical"
        return "None"

    def _precompute_derived_fields(self, df: pl.DataFrame) -> pl.DataFrame:
        """
        Pre-compute pattern_type and best n-gram fields for all rows.

        OPTIMIZED: Uses vectorized Polars operations for pattern_type,
        and only processes rows with potential valid n-grams for the rest.

        Adds columns:
        - pattern_type: Categorical ("Semantic", "Lexical", "Both", "None")
        - best_ngram_type: Categorical ('word' | 'char' | null) - unified selection
        - best_ngram_text: Utf8 - unified n-gram text (word preferred over char)
        - best_ngram_main_positions: List - positions in main feature
        - best_ngram_similar_positions: List - positions in similar feature
        """
        logger.info("Pre-computing derived fields (pattern_type, best n-grams)...")

        # Check required columns exist
        required_cols = ["semantic_similarity", "char_ngram_max_jaccard", "word_ngram_max_jaccard"]
        missing = [c for c in required_cols if c not in df.columns]
        if missing:
            logger.warning(f"Missing required columns for pattern_type: {missing}")
            return df.with_columns([
                pl.lit("None").alias("pattern_type"),
                pl.lit(None).cast(pl.Utf8).alias("best_ngram_type"),
                pl.lit(None).cast(pl.Utf8).alias("best_ngram_text"),
                pl.lit(None).alias("best_ngram_main_positions"),
                pl.lit(None).alias("best_ngram_similar_positions"),
            ])

        total_rows = len(df)
        logger.info(f"Processing {total_rows:,} rows...")

        # ============================================================
        # OPTIMIZATION 1: Vectorized pattern_type computation
        # ============================================================
        logger.info("Computing pattern_type (vectorized)...")

        has_semantic = pl.col("semantic_similarity").fill_null(0) >= self.SEMANTIC_THRESHOLD
        max_lexical = pl.max_horizontal(
            pl.col("char_ngram_max_jaccard").fill_null(0),
            pl.col("word_ngram_max_jaccard").fill_null(0)
        )
        has_lexical = max_lexical >= self.LEXICAL_THRESHOLD

        result_df = df.with_columns([
            pl.when(has_semantic & has_lexical).then(pl.lit("Both"))
              .when(has_semantic).then(pl.lit("Semantic"))
              .when(has_lexical).then(pl.lit("Lexical"))
              .otherwise(pl.lit("None"))
              .alias("pattern_type")
        ])

        # Log pattern type distribution
        pattern_counts = result_df.group_by("pattern_type").agg(pl.count().alias("count"))
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
                pl.lit(None).alias("best_ngram_main_positions"),
                pl.lit(None).alias("best_ngram_similar_positions"),
            ])

        # Pre-filter: Only rows where max Jaccard >= threshold might have valid n-grams
        threshold = self.NGRAM_JACCARD_THRESHOLD
        might_have_ngram = (
            (pl.col("char_ngram_max_jaccard").fill_null(0) >= threshold) |
            (pl.col("word_ngram_max_jaccard").fill_null(0) >= threshold)
        )

        # Add row index for later join (use with_row_count for older Polars versions)
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
                pl.lit(None).alias("best_ngram_main_positions"),
                pl.lit(None).alias("best_ngram_similar_positions"),
            ])

        # Process only candidate rows
        candidate_rows = candidate_df.to_dicts()

        best_ngram_types = []
        best_ngram_texts = []
        best_ngram_main_positions = []
        best_ngram_similar_positions = []
        row_indices = []

        for i, row in enumerate(candidate_rows):
            if i % 50000 == 0 and i > 0:
                logger.info(f"Processing candidate {i:,}/{candidate_count:,} ({100*i/candidate_count:.1f}%)")

            word_per_k = row.get("word_ngram_per_k_jaccard")
            top_word_per_k = row.get("top_word_ngrams_per_k")
            char_per_k = row.get("char_ngram_per_k_jaccard")
            top_char_per_k = row.get("top_char_ngrams_per_k")

            best = select_best_ngram(
                word_per_k_jaccard=word_per_k,
                word_ngrams=top_word_per_k,
                char_per_k_jaccard=char_per_k,
                char_ngrams=top_char_per_k,
                threshold=threshold
            )

            if best["type"] is not None:
                row_indices.append(row["_row_idx"])
                best_ngram_types.append(best["type"])
                best_ngram_texts.append(best["text"])
                best_ngram_main_positions.append(best["main_positions"])
                best_ngram_similar_positions.append(best["similar_positions"])

        logger.info(f"Found {len(row_indices):,} rows with valid n-grams")

        # Create DataFrame with n-gram results
        if row_indices:
            ngram_df = pl.DataFrame({
                "_row_idx": row_indices,
                "best_ngram_type": best_ngram_types,
                "best_ngram_text": best_ngram_texts,
                "best_ngram_main_positions": best_ngram_main_positions,
                "best_ngram_similar_positions": best_ngram_similar_positions,
            }).with_columns(pl.col("_row_idx").cast(pl.UInt32))  # Match type from with_row_count

            # Join back to main DataFrame
            result_df = result_df.join(ngram_df, on="_row_idx", how="left")
        else:
            result_df = result_df.with_columns([
                pl.lit(None).cast(pl.Utf8).alias("best_ngram_type"),
                pl.lit(None).cast(pl.Utf8).alias("best_ngram_text"),
                pl.lit(None).alias("best_ngram_main_positions"),
                pl.lit(None).alias("best_ngram_similar_positions"),
            ])

        # Drop temporary index and cast types
        result_df = result_df.drop("_row_idx").with_columns([
            pl.col("pattern_type").cast(pl.Categorical),
            pl.col("best_ngram_type").cast(pl.Categorical),
        ])

        # Log n-gram type distribution
        ngram_counts = result_df.group_by("best_ngram_type").agg(pl.count().alias("count"))
        logger.info(f"best_ngram_type distribution:\n{ngram_counts}")

        return result_df

    def _init_paths(self) -> None:
        """Initialize paths from configuration."""
        super()._init_paths()

        # Get paths from global config
        global_config = self.config.get("global", {})
        paths = global_config.get("paths", {})
        intermediate_dir = paths.get("intermediate", "data/intermediate")
        output_dir = paths.get("output", "data/output")

        # Input path
        self.raw_similarity_path = self._resolve_path(f"{intermediate_dir}/interfeature_similarity.parquet")

        # Output path
        self.output_path = self._resolve_path(f"{output_dir}/interfeature_similarity.parquet")

        # Load pattern_type thresholds from config (with defaults)
        parameters = self.config.get("parameters", {})
        thresholds = parameters.get("pattern_type_thresholds", {})
        self.SEMANTIC_THRESHOLD = thresholds.get("semantic", self.DEFAULT_SEMANTIC_THRESHOLD)
        self.LEXICAL_THRESHOLD = thresholds.get("lexical", self.DEFAULT_LEXICAL_THRESHOLD)
        self.NGRAM_JACCARD_THRESHOLD = thresholds.get("ngram_jaccard", self.DEFAULT_NGRAM_JACCARD_THRESHOLD)

        logger.info(f"Pattern type thresholds: semantic={self.SEMANTIC_THRESHOLD}, lexical={self.LEXICAL_THRESHOLD}, ngram_jaccard={self.NGRAM_JACCARD_THRESHOLD}")

        # Statistics tracking
        self.stats = {
            "rows_processed": 0,
            "rows_output": 0
        }

        # Data holders
        self.raw_df = None

    def _load_data(self) -> None:
        """Load raw similarity data and flatten nested structure."""
        logger.info(f"Loading raw similarity data from {self.raw_similarity_path}")
        if not self.raw_similarity_path.exists():
            raise FileNotFoundError(f"Raw similarity file not found: {self.raw_similarity_path}")

        raw_df = pl.read_parquet(self.raw_similarity_path)
        logger.info(f"Loaded {len(raw_df):,} raw similarity rows")

        # Check if this is the nested format (from step 9) or legacy flat format
        if "all_pairs" in raw_df.columns:
            # Nested format: explode and flatten
            logger.info("Converting nested format to flat format")

            # Explode all_pairs column
            if len(raw_df) == 0 or raw_df["all_pairs"].list.len().sum() == 0:
                logger.warning("No pairs to process")
                self.raw_df = pl.DataFrame()
                return

            exploded = raw_df.explode("all_pairs")

            # Unnest the struct fields
            self.raw_df = exploded.select([
                pl.col("feature_id").alias("main_feature_id"),
                pl.col("sae_id"),
                pl.col("all_pairs").struct.field("similar_feature_id"),
                pl.col("all_pairs").struct.field("decoder_similarity").alias("decoder_similarity_score"),
                pl.col("all_pairs").struct.field("similarity_source").alias("source_type"),
                pl.col("all_pairs").struct.field("semantic_similarity"),
                # per-k-max Jaccard
                pl.col("all_pairs").struct.field("char_ngram_max_jaccard"),
                pl.col("all_pairs").struct.field("word_ngram_max_jaccard"),
                # overall top n-grams
                pl.col("all_pairs").struct.field("max_char_ngram"),
                pl.col("all_pairs").struct.field("max_word_ngram"),
                # per-k Jaccard values (for longest n-gram selection)
                pl.col("all_pairs").struct.field("char_ngram_per_k_jaccard"),
                pl.col("all_pairs").struct.field("word_ngram_per_k_jaccard"),
                # per-k top n-grams
                pl.col("all_pairs").struct.field("top_char_ngrams_per_k"),
                pl.col("all_pairs").struct.field("top_word_ngrams_per_k"),
                # Position data for highlighting
                pl.col("all_pairs").struct.field("main_char_ngram_positions"),
                pl.col("all_pairs").struct.field("similar_char_ngram_positions"),
                pl.col("all_pairs").struct.field("main_word_ngram_positions"),
                pl.col("all_pairs").struct.field("similar_word_ngram_positions"),
            ])
            logger.info(f"Flattened to {len(self.raw_df):,} pair rows")
        else:
            # Legacy flat format
            self.raw_df = raw_df

    def process(self) -> pl.DataFrame:
        """Execute the main processing logic.

        Returns:
            Processed DataFrame
        """
        self._load_data()

        if len(self.raw_df) == 0:
            logger.warning("No data to process")
            return self._create_empty_dataframe()

        self.stats["rows_processed"] = len(self.raw_df)

        # Apply feature limit if specified
        if self.feature_limit is not None:
            unique_features = self.raw_df["main_feature_id"].unique().sort()[:self.feature_limit]
            self.raw_df = self.raw_df.filter(pl.col("main_feature_id").is_in(unique_features))
            logger.info(f"Limited to {self.feature_limit} features ({len(self.raw_df)} rows)")

        # Check for required columns
        required_columns = [
            "main_feature_id", "similar_feature_id", "source_type",
            "decoder_similarity_score"
        ]
        missing = [c for c in required_columns if c not in self.raw_df.columns]
        if missing:
            logger.warning(f"Missing required columns: {missing}")
            # Try to proceed with available columns
            pass

        # Check what similarity columns we have (Step 9 now outputs consistent names)
        cols = self.raw_df.columns
        similarity_columns = {
            "char_ngram_max_jaccard": "char_ngram_max_jaccard" in cols,
            "word_ngram_max_jaccard": "word_ngram_max_jaccard" in cols,
            "semantic_similarity": "semantic_similarity" in cols
        }

        logger.info(f"Available similarity columns: {similarity_columns}")

        # Pre-compute pattern_type and best n-gram fields
        # This eliminates the 255s cold start caused by runtime computation
        result_df = self._precompute_derived_fields(self.raw_df)

        # Select output columns (including pre-computed pattern_type and best n-grams)
        output_columns = [
            "main_feature_id",
            "similar_feature_id",
            "source_type",
            "decoder_similarity_score"
        ]

        # Add optional columns if they exist
        optional_columns = [
            "char_ngram_max_jaccard",
            "word_ngram_max_jaccard",
            "semantic_similarity",
            # Pre-computed derived fields (eliminates runtime computation)
            "pattern_type",
            # Unified best n-gram fields (word preferred over char)
            "best_ngram_type",
            "best_ngram_text",
            "best_ngram_main_positions",
            "best_ngram_similar_positions",
            # N-gram text (raw max values - kept for fallback)
            "max_char_ngram",
            "max_word_ngram",
        ]

        for col in optional_columns:
            if col in result_df.columns:
                output_columns.append(col)

        # Filter to only existing columns
        output_columns = [c for c in output_columns if c in result_df.columns]
        result_df = result_df.select(output_columns)

        # Cast types
        if "main_feature_id" in result_df.columns:
            result_df = result_df.with_columns([
                pl.col("main_feature_id").cast(pl.UInt32)
            ])
        if "similar_feature_id" in result_df.columns:
            result_df = result_df.with_columns([
                pl.col("similar_feature_id").cast(pl.UInt32)
            ])
        if "source_type" in result_df.columns:
            result_df = result_df.with_columns([
                pl.col("source_type").cast(pl.Categorical)
            ])

        # Cast float columns
        float_columns = [
            "decoder_similarity_score",
            "char_ngram_max_jaccard",
            "word_ngram_max_jaccard",
            "semantic_similarity",
        ]
        for col in float_columns:
            if col in result_df.columns:
                result_df = result_df.with_columns([
                    pl.col(col).cast(pl.Float32)
                ])

        self.stats["rows_output"] = len(result_df)

        logger.info(f"Output {len(result_df):,} rows")

        return result_df

    def _create_empty_dataframe(self) -> pl.DataFrame:
        """Create empty DataFrame with correct schema."""
        schema = {
            "main_feature_id": pl.UInt32,
            "similar_feature_id": pl.UInt32,
            "source_type": pl.Categorical,
            "decoder_similarity_score": pl.Float32,
            "char_ngram_max_jaccard": pl.Float32,
            "word_ngram_max_jaccard": pl.Float32,
            "semantic_similarity": pl.Float32,
            # Pre-computed derived fields
            "pattern_type": pl.Categorical,
            # Unified best n-gram fields (word preferred over char)
            "best_ngram_type": pl.Categorical,
            "best_ngram_text": pl.Utf8,
            "best_ngram_main_positions": pl.List(pl.Struct({})),
            "best_ngram_similar_positions": pl.List(pl.Struct({})),
            # N-gram text (raw max values - kept for fallback)
            "max_char_ngram": pl.Utf8,
            "max_word_ngram": pl.Utf8,
        }
        return pl.DataFrame(schema=schema)


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Process interfeature similarity for display")
    parser.add_argument("--config", type=str, help="Path to configuration file")
    parser.add_argument("--limit", type=int, help="Limit number of features (for testing)")

    args = parser.parse_args()

    setup_logging()

    if args.config:
        full_config = load_yaml_config(args.config)
        # Extract step-specific config if present
        config = full_config.get("steps", {}).get("step_11_interfeature_display", {})
        if not config:
            # Fallback: treat entire config as step config (legacy format)
            config = full_config
        config["sae_id"] = full_config.get("global", {}).get("sae_id_sanitized", "")
        config["global"] = full_config.get("global", {})
    else:
        config_path = Path(__file__).parent.parent / "config.yaml"
        if config_path.exists():
            full_config = load_yaml_config(config_path)
            config = full_config.get("steps", {}).get("step_11_interfeature_display", {})
            config["sae_id"] = full_config.get("global", {}).get("sae_id_sanitized", "")
            config["global"] = full_config.get("global", {})
        else:
            config = {}

    processor = InterfeatureDisplayProcessor(config, feature_limit=args.limit)
    processor.run()


if __name__ == "__main__":
    main()
