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
- Raw similarity metrics (pattern_type computed at runtime by backend)
- Aggregation of metrics for display
- Filtering to keep only relevant similarity pairs
"""

import logging
from pathlib import Path

import polars as pl

# Enable string cache for categorical operations
pl.enable_string_cache()

# Add parent directory to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.base import BaseProcessor, load_yaml_config
from core.logging import setup_logging

logger = logging.getLogger(__name__)


class InterfeatureDisplayProcessor(BaseProcessor):
    """Process inter-feature similarity data for frontend display."""

    @property
    def step_name(self) -> str:
        return "Step 11: Interfeature Display"

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
        output_dir = paths.get("output", "data/output")

        # Input path
        self.raw_similarity_path = self._resolve_path(f"{intermediate_dir}/interfeature_similarity.parquet")

        # Output path
        self.output_path = self._resolve_path(f"{output_dir}/interfeature_similarity.parquet")

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
                # EXISTING: per-k-max Jaccard
                pl.col("all_pairs").struct.field("char_ngram_max_jaccard"),
                pl.col("all_pairs").struct.field("word_ngram_max_jaccard"),
                pl.col("all_pairs").struct.field("main_prompt_ids"),
                pl.col("all_pairs").struct.field("similar_prompt_ids"),
                pl.col("all_pairs").struct.field("num_comparisons"),
                # EXISTING: overall top n-grams
                pl.col("all_pairs").struct.field("max_char_ngram"),
                pl.col("all_pairs").struct.field("max_word_ngram"),
                # NEW: per-k Jaccard values (for longest n-gram selection)
                pl.col("all_pairs").struct.field("char_ngram_per_k_jaccard"),
                pl.col("all_pairs").struct.field("word_ngram_per_k_jaccard"),
                # NEW: per-k top n-grams
                pl.col("all_pairs").struct.field("top_char_ngrams_per_k"),
                pl.col("all_pairs").struct.field("top_word_ngrams_per_k"),
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

        # pattern_type is now computed at runtime by backend
        # (allows dynamic threshold adjustment without regenerating parquet)
        result_df = self.raw_df

        # Select output columns (pattern_type removed - computed at runtime)
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
            "char_ngram_mean_jaccard",
            "word_ngram_mean_jaccard",
            "semantic_similarity_std",
            # NEW: per-k fields
            "char_ngram_per_k_jaccard",
            "word_ngram_per_k_jaccard",
            "top_char_ngrams_per_k",
            "top_word_ngrams_per_k",
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
            "char_ngram_mean_jaccard",
            "word_ngram_mean_jaccard",
            "semantic_similarity_std"
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
