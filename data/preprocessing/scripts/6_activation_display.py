#!/usr/bin/env python3
"""
Preprocessing Script: Create Optimized Activation Display Data

This script creates a pre-processed, optimized parquet file for fast activation
example display in the frontend. It combines data from activation_examples and
activation_example_similarity, pre-processes tokens, and organizes into a
feature-level structure.

Input:
- activation_examples.parquet: Raw activation data (246MB)
- activation_example_similarity.parquet: Similarity metrics (2.2MB)

Output:
- activation_display.parquet: Optimized display data (~5-10MB, 824 rows)
- activation_display.parquet.metadata.json: Processing metadata

Features:
- Pre-organized quantile examples (2 per quantile, 8 total per feature)
- Pre-processed tokens (leading underscores removed, joined into text)
- Pattern type classification (Semantic/Lexical/Both/None) with separate thresholds
- Feature-level data (824 rows instead of 1M+)
- Fast loading (~20ms vs ~5 seconds)

Usage:
    python 6_activation_display.py [--config CONFIG_PATH] [--limit N]

Example:
    python 6_activation_display.py
    python 6_activation_display.py --limit 100  # Test on 100 features
"""

import json
import logging
import argparse
from pathlib import Path
from typing import Dict, List, Optional, Any
from datetime import datetime
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
        "activation_similarity_path": "data/master/activation_example_similarity.parquet",
        "output_path": "data/master/activation_display.parquet",
        "sae_id": "google--gemma-scope-9b-pt-res--layer_30--width_16k--average_l0_120",
        "processing_parameters": {
            "semantic_threshold": 0.3,
            "lexical_threshold": 0.3,
            "token_processing": {
                "remove_leading_underscore": True,
                "join_tokens": True
            }
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


class ActivationDisplayProcessor:
    """Process activation data into optimized display format."""

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
        self.examples_path = self._resolve_path(config["activation_examples_path"])
        self.similarity_path = self._resolve_path(config["activation_similarity_path"])
        self.output_path = self._resolve_path(config["output_path"])

        # Configuration
        self.sae_id = config["sae_id"]
        self.proc_params = config["processing_parameters"]

        # Statistics tracking
        self.stats = {
            "features_processed": 0,
            "features_with_no_data": 0,
            "features_with_invalid_boundaries": 0,
            "total_examples_processed": 0,
            "semantic_patterns": 0,
            "lexical_patterns": 0,
            "both_patterns": 0,
            "no_patterns": 0
        }

        # Data containers
        self.examples_df = None
        self.similarity_df = None

    def _resolve_path(self, path_str: str) -> Path:
        """Resolve path relative to project root if not absolute."""
        path = Path(path_str)
        if not path.is_absolute():
            return self.project_root / path
        return path

    def _load_data(self):
        """Load activation examples and similarity data."""
        if self.examples_df is None:
            logger.info(f"Loading activation examples from {self.examples_path}")
            if not self.examples_path.exists():
                raise FileNotFoundError(f"Activation examples not found: {self.examples_path}")
            self.examples_df = pl.read_parquet(self.examples_path)
            logger.info(f"Loaded {len(self.examples_df):,} activation examples")

        if self.similarity_df is None:
            logger.info(f"Loading similarity metrics from {self.similarity_path}")
            if not self.similarity_path.exists():
                raise FileNotFoundError(f"Similarity data not found: {self.similarity_path}")
            self.similarity_df = pl.read_parquet(self.similarity_path)
            logger.info(f"Loaded similarity data for {len(self.similarity_df):,} features")

    def _process_tokens_array(self, tokens: List[str]) -> List[str]:
        """Process token list, removing leading underscores but keeping as array.

        Args:
            tokens: List of token strings (may have leading underscores)

        Returns:
            List of processed tokens (underscores removed)
        """
        if not tokens:
            return []

        token_config = self.proc_params.get("token_processing", {})

        # Remove leading underscores (both regular '_' and Unicode '▁')
        if token_config.get("remove_leading_underscore", True):
            tokens = [t.lstrip('_▁') for t in tokens]

        return tokens

    def _extract_char_ngram_positions(self, ngram_data: Optional[Dict], prompt_id: int) -> List[Dict]:
        """Extract positions where a character n-gram appears for a specific prompt.

        Args:
            ngram_data: Dict with n-gram occurrences (from top_char_ngram)
            prompt_id: Prompt ID to filter for

        Returns:
            List of dicts with token_position and char_offset
        """
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
        """Extract positions where a word n-gram appears for a specific prompt.

        Args:
            ngram_data: Dict with n-gram occurrences (from top_word_ngram)
            prompt_id: Prompt ID to filter for

        Returns:
            List of token positions where the n-gram starts
        """
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

        return sorted(set(positions))  # Remove duplicates and sort

    def _compute_pattern_type(self, semantic_sim: float, char_jaccard: float, word_jaccard: float) -> str:
        """Categorize activation pattern based on separate thresholds.

        Args:
            semantic_sim: Average pairwise semantic similarity (0-1)
            char_jaccard: Character n-gram Jaccard similarity (0-1)
            word_jaccard: Word n-gram Jaccard similarity (0-1)

        Returns:
            Pattern type: "Semantic", "Lexical", "Both", or "None"
        """
        semantic_threshold = self.proc_params.get("semantic_threshold", 0.3)
        lexical_threshold = self.proc_params.get("lexical_threshold", 0.3)

        has_semantic = semantic_sim > semantic_threshold
        has_lexical = (char_jaccard > lexical_threshold) or (word_jaccard > lexical_threshold)

        if has_semantic and has_lexical:
            return "Both"
        elif has_semantic:
            return "Semantic"
        elif has_lexical:
            return "Lexical"
        else:
            return "None"

    def process_feature(self, feature_id: int) -> Optional[Dict[str, Any]]:
        """Process a single feature to create optimized display data.

        Args:
            feature_id: Feature ID to process

        Returns:
            Dictionary with processed activation display data or None if invalid
        """
        # Get similarity data for this feature
        feature_sim = self.similarity_df.filter(pl.col("feature_id") == feature_id)

        if len(feature_sim) == 0:
            self.stats["features_with_no_data"] += 1
            logger.debug(f"No similarity data for feature {feature_id}")
            return None

        sim_row = feature_sim.to_dicts()[0]

        # Extract metadata
        prompt_ids = sim_row.get("prompt_ids_analyzed", [])
        semantic_sim = sim_row.get("avg_pairwise_semantic_similarity")
        quantile_boundaries = sim_row.get("quantile_boundaries", [])

        # Extract dual Jaccard values
        char_ngram_jaccard = sim_row.get("top_char_ngram_jaccard", 0.0)
        word_ngram_jaccard = sim_row.get("top_word_ngram_jaccard", 0.0)
        if char_ngram_jaccard is None:
            char_ngram_jaccard = 0.0
        if word_ngram_jaccard is None:
            word_ngram_jaccard = 0.0

        # Extract top n-grams for position mapping
        top_char_ngram = sim_row.get("top_char_ngram")
        top_word_ngram = sim_row.get("top_word_ngram")

        # Validate data
        if not prompt_ids or len(prompt_ids) == 0:
            self.stats["features_with_no_data"] += 1
            return None

        if not quantile_boundaries or len(quantile_boundaries) != 3:
            self.stats["features_with_invalid_boundaries"] += 1
            logger.debug(f"Invalid quantile boundaries for feature {feature_id}: {quantile_boundaries}")
            return None

        # Compute pattern type using dual Jaccard (char OR word)
        pattern_type = self._compute_pattern_type(
            semantic_sim if semantic_sim is not None else 0.0,
            char_ngram_jaccard,
            word_ngram_jaccard
        )

        # Update pattern stats
        if pattern_type == "Semantic":
            self.stats["semantic_patterns"] += 1
        elif pattern_type == "Lexical":
            self.stats["lexical_patterns"] += 1
        elif pattern_type == "Both":
            self.stats["both_patterns"] += 1
        else:
            self.stats["no_patterns"] += 1

        # Fetch activation examples for these prompt IDs
        feature_examples = self.examples_df.filter(
            (pl.col("feature_id") == feature_id) &
            (pl.col("prompt_id").is_in(prompt_ids))
        )

        if len(feature_examples) == 0:
            self.stats["features_with_no_data"] += 1
            return None

        # Organize into quantiles
        quantile_examples = []
        for row_dict in feature_examples.to_dicts():
            # Process tokens - array with underscores removed
            raw_tokens = row_dict.get("prompt_tokens", [])
            prompt_tokens = self._process_tokens_array(raw_tokens)

            # Find max activation position
            activation_pairs = row_dict.get("activation_pairs", [])
            max_activation = row_dict.get("max_activation")
            max_pos = 0

            if activation_pairs and len(activation_pairs) > 0:
                max_pair = max(activation_pairs, key=lambda p: p["activation_value"])
                max_pos = max_pair["token_position"]

            # Determine quantile index based on max_activation
            quantile_idx = 0
            if max_activation is not None:
                if max_activation <= quantile_boundaries[0]:
                    quantile_idx = 0
                elif max_activation <= quantile_boundaries[1]:
                    quantile_idx = 1
                elif max_activation <= quantile_boundaries[2]:
                    quantile_idx = 2
                else:
                    quantile_idx = 3

            # Extract n-gram positions for this prompt
            char_ngram_positions = self._extract_char_ngram_positions(top_char_ngram, row_dict["prompt_id"])
            word_ngram_positions = self._extract_word_ngram_positions(top_word_ngram, row_dict["prompt_id"])

            quantile_examples.append({
                "quantile_index": quantile_idx,
                "prompt_id": row_dict["prompt_id"],
                "prompt_tokens": prompt_tokens,
                "activation_pairs": activation_pairs,
                "max_activation": float(max_activation) if max_activation is not None else 0.0,
                "max_activation_position": int(max_pos),
                "char_ngram_positions": char_ngram_positions,
                "word_ngram_positions": word_ngram_positions
            })

        self.stats["total_examples_processed"] += len(quantile_examples)

        # Extract n-gram text for display
        char_ngram_text = top_char_ngram.get("ngram") if top_char_ngram else None
        word_ngram_text = top_word_ngram.get("ngram") if top_word_ngram else None

        return {
            "feature_id": feature_id,
            "sae_id": self.sae_id,
            "pattern_type": pattern_type,
            "semantic_similarity": float(semantic_sim) if semantic_sim is not None else None,
            "char_ngram_max_jaccard": float(char_ngram_jaccard),
            "word_ngram_max_jaccard": float(word_ngram_jaccard),
            "top_char_ngram_text": char_ngram_text,
            "top_word_ngram_text": word_ngram_text,
            "quantile_examples": quantile_examples
        }

    def process_all_features(self) -> pl.DataFrame:
        """Process all features and create DataFrame.

        Returns:
            Polars DataFrame with optimized display data
        """
        # Load data
        self._load_data()

        # Get unique features from similarity data
        unique_features = sorted(self.similarity_df["feature_id"].unique().to_list())

        # Apply feature limit for testing
        if self.feature_limit is not None:
            unique_features = unique_features[:self.feature_limit]
            logger.info(f"Processing limited to {self.feature_limit} features")

        logger.info(f"Processing {len(unique_features):,} features")

        # Process features
        results = []
        for feature_id in tqdm(unique_features, desc="Processing features"):
            result = self.process_feature(feature_id)
            if result is not None:
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
            pl.col("pattern_type").cast(pl.Categorical),
            pl.col("semantic_similarity").cast(pl.Float32),
            pl.col("char_ngram_max_jaccard").cast(pl.Float32),
            pl.col("word_ngram_max_jaccard").cast(pl.Float32),
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
            "pattern_type": pl.Categorical,
            "semantic_similarity": pl.Float32,
            "char_ngram_max_jaccard": pl.Float32,
            "word_ngram_max_jaccard": pl.Float32,
            "top_char_ngram_text": pl.Utf8,
            "top_word_ngram_text": pl.Utf8,
            "quantile_examples": pl.List(pl.Struct([
                pl.Field("quantile_index", pl.UInt8),
                pl.Field("prompt_id", pl.UInt32),
                pl.Field("prompt_tokens", pl.List(pl.Utf8)),
                pl.Field("activation_pairs", pl.List(pl.Struct([
                    pl.Field("token_position", pl.UInt32),
                    pl.Field("activation_value", pl.Float32)
                ]))),
                pl.Field("max_activation", pl.Float32),
                pl.Field("max_activation_position", pl.UInt32),
                pl.Field("char_ngram_positions", pl.List(pl.Struct([
                    pl.Field("token_position", pl.UInt16),
                    pl.Field("char_offset", pl.UInt8)
                ]))),
                pl.Field("word_ngram_positions", pl.List(pl.UInt16))
            ]))
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
                "features_with_data": len(df),
                "pattern_distribution": {
                    "semantic": int((df["pattern_type"] == "Semantic").sum()),
                    "lexical": int((df["pattern_type"] == "Lexical").sum()),
                    "both": int((df["pattern_type"] == "Both").sum()),
                    "none": int((df["pattern_type"] == "None").sum())
                },
                "mean_semantic_similarity": float(df["semantic_similarity"].mean()) if df["semantic_similarity"].is_not_null().any() else None,
                "mean_char_ngram_jaccard": float(df["char_ngram_max_jaccard"].mean()),
                "mean_word_ngram_jaccard": float(df["word_ngram_max_jaccard"].mean()),
                "mean_examples_per_feature": float(df["quantile_examples"].list.len().mean())
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
        description='Create optimized activation display data'
    )
    parser.add_argument(
        '--config',
        type=str,
        default='data/preprocessing/config/6_activation_display.json',
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
    processor = ActivationDisplayProcessor(config, feature_limit=args.limit)

    # Process data
    logger.info("=" * 80)
    logger.info("Starting Activation Display Data Processing")
    logger.info("=" * 80)

    df = processor.process_all_features()

    # Save parquet
    processor.save_parquet(df)

    logger.info("=" * 80)
    logger.info("Processing Complete!")
    logger.info(f"Statistics:")
    logger.info(f"  Features processed: {processor.stats['features_processed']:,}")
    logger.info(f"  Features with no data: {processor.stats['features_with_no_data']:,}")
    logger.info(f"  Features with invalid boundaries: {processor.stats['features_with_invalid_boundaries']:,}")
    logger.info(f"  Total examples processed: {processor.stats['total_examples_processed']:,}")
    logger.info(f"  Pattern distribution:")
    logger.info(f"    - Semantic: {processor.stats['semantic_patterns']:,}")
    logger.info(f"    - Lexical: {processor.stats['lexical_patterns']:,}")
    logger.info(f"    - Both: {processor.stats['both_patterns']:,}")
    logger.info(f"    - None: {processor.stats['no_patterns']:,}")
    logger.info("=" * 80)


if __name__ == "__main__":
    main()
