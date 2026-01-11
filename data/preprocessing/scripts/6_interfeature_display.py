#!/usr/bin/env python3
"""
7_interfeature_display.py - Apply thresholds and classify inter-feature similarity pairs

This script reads the raw inter-feature similarity data from script 6 and applies
configurable thresholds to classify pairs into semantic_pairs and lexical_pairs.

Input: interfeature_activation_similarity_raw.parquet (from script 6)
Output: interfeature_activation_similarity.parquet (filtered, classified)

Usage:
    python 7_interfeature_display.py --config ../config/7_interfeature_display.json
    python 7_interfeature_display.py --config ../config/7_interfeature_display.json --semantic-threshold 0.5
"""

import argparse
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any

import polars as pl

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def find_project_root() -> Path:
    """Find the project root directory."""
    current = Path(__file__).resolve()
    for parent in current.parents:
        if (parent / "backend").exists() and (parent / "frontend").exists():
            return parent
    else:
        raise RuntimeError("Could not find interface project root")


def load_config(config_path: Optional[str] = None) -> Dict:
    """Load configuration from file or use defaults."""
    default_config = {
        "input_path": "data/master/interfeature_activation_similarity_raw.parquet",
        "output_path": "data/master/interfeature_activation_similarity.parquet",
        "sae_id": "google--gemma-scope-9b-pt-res--layer_30--width_16k--average_l0_120",
        "thresholds": {
            "semantic_threshold": 0.6,
            "char_jaccard_threshold": 0.6,
            "word_jaccard_threshold": 0.6
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


class InterFeatureDisplayProcessor:
    """Apply thresholds to raw inter-feature similarity data and classify pairs."""

    def __init__(self, config: Dict):
        """Initialize processor with configuration."""
        self.config = config
        self.project_root = find_project_root()

        # Resolve paths
        self.input_path = self._resolve_path(config["input_path"])
        self.output_path = self._resolve_path(config["output_path"])

        # Thresholds
        self.thresholds = config["thresholds"]
        self.sae_id = config["sae_id"]

        # Statistics
        self.stats = {
            "features_processed": 0,
            "total_pairs_input": 0,
            "semantic_pairs_output": 0,
            "lexical_pairs_output": 0,
            "pairs_with_both_patterns": 0,
            "pairs_below_threshold": 0
        }

    def _resolve_path(self, path_str: str) -> Path:
        """Resolve path relative to project root if not absolute."""
        path = Path(path_str)
        if not path.is_absolute():
            return self.project_root / path
        return path

    def classify_pair(self, pair: Dict) -> List[str]:
        """Classify a pair based on thresholds.

        Args:
            pair: Dictionary with pair metrics

        Returns:
            List of pattern types: ["Semantic"], ["Lexical"], ["Semantic", "Lexical"], or []
        """
        semantic_sim = pair.get("semantic_similarity")
        char_jaccard = pair.get("char_jaccard")
        word_jaccard = pair.get("word_jaccard")

        semantic_threshold = self.thresholds["semantic_threshold"]
        char_threshold = self.thresholds["char_jaccard_threshold"]
        word_threshold = self.thresholds["word_jaccard_threshold"]

        has_semantic = semantic_sim is not None and semantic_sim > semantic_threshold
        has_lexical = ((char_jaccard is not None and char_jaccard > char_threshold) or
                      (word_jaccard is not None and word_jaccard > word_threshold))

        pattern_types = []
        if has_semantic:
            pattern_types.append("Semantic")
        if has_lexical:
            pattern_types.append("Lexical")

        return pattern_types

    def process(self) -> pl.DataFrame:
        """Process raw data and apply thresholds.

        Returns:
            Filtered DataFrame with semantic_pairs and lexical_pairs columns
        """
        logger.info(f"Loading raw data from {self.input_path}")

        if not self.input_path.exists():
            raise FileNotFoundError(f"Input file not found: {self.input_path}")

        raw_df = pl.read_parquet(self.input_path)
        logger.info(f"Loaded {len(raw_df)} features from raw parquet")

        # Process each feature
        results = []
        for row in raw_df.iter_rows(named=True):
            feature_id = row["feature_id"]
            sae_id = row["sae_id"]
            all_pairs = row["all_pairs"] or []

            self.stats["features_processed"] += 1
            self.stats["total_pairs_input"] += len(all_pairs)

            semantic_pairs = []
            lexical_pairs = []

            for pair in all_pairs:
                # Convert struct to dict if needed
                if hasattr(pair, '_asdict'):
                    pair = pair._asdict()
                elif not isinstance(pair, dict):
                    pair = dict(pair)

                pattern_types = self.classify_pair(pair)

                if not pattern_types:
                    self.stats["pairs_below_threshold"] += 1
                    continue

                if len(pattern_types) == 2:
                    self.stats["pairs_with_both_patterns"] += 1

                # Add pattern_type field and append to appropriate lists
                for ptype in pattern_types:
                    pair_with_type = dict(pair)
                    pair_with_type["pattern_type"] = ptype

                    if ptype == "Semantic":
                        semantic_pairs.append(pair_with_type)
                        self.stats["semantic_pairs_output"] += 1
                    elif ptype == "Lexical":
                        lexical_pairs.append(pair_with_type)
                        self.stats["lexical_pairs_output"] += 1

            results.append({
                "feature_id": feature_id,
                "sae_id": sae_id,
                "semantic_pairs": semantic_pairs,
                "lexical_pairs": lexical_pairs
            })

        logger.info(f"Processed {self.stats['features_processed']} features")
        logger.info(f"Input pairs: {self.stats['total_pairs_input']}")
        logger.info(f"Output - Semantic: {self.stats['semantic_pairs_output']}, Lexical: {self.stats['lexical_pairs_output']}")
        logger.info(f"Pairs below threshold: {self.stats['pairs_below_threshold']}")

        return self._create_dataframe(results)

    def _create_dataframe(self, rows: List[Dict]) -> pl.DataFrame:
        """Create DataFrame with proper schema."""
        if not rows:
            return self._create_empty_dataframe()

        df = pl.DataFrame(rows)

        # Get target schema and cast
        target_schema = self._get_target_schema()
        df = df.with_columns([
            pl.col("feature_id").cast(pl.UInt32),
            pl.col("sae_id").cast(pl.Categorical),
            pl.col("semantic_pairs").cast(target_schema["semantic_pairs"]),
            pl.col("lexical_pairs").cast(target_schema["lexical_pairs"])
        ])

        return df

    def _get_target_schema(self) -> Dict:
        """Get the target schema with proper types."""
        # Position structures (same as script 6)
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

        # Pair struct WITH pattern_type field (for filtered output)
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
            pl.Field("max_char_ngram_jaccard", pl.Float32),
            pl.Field("max_word_ngram", pl.Utf8),
            pl.Field("max_word_ngram_size", pl.UInt8),
            pl.Field("max_word_ngram_jaccard", pl.Float32),
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
        """Create empty DataFrame with correct schema."""
        schema = self._get_target_schema()
        return pl.DataFrame(schema=schema)

    def save_parquet(self, df: pl.DataFrame) -> None:
        """Save DataFrame as parquet with metadata."""
        self.output_path.parent.mkdir(parents=True, exist_ok=True)

        logger.info(f"Saving parquet to {self.output_path}")
        df.write_parquet(self.output_path)

        # Calculate statistics
        if len(df) > 0:
            features_with_semantic = int((df["semantic_pairs"].list.len() > 0).sum())
            features_with_lexical = int((df["lexical_pairs"].list.len() > 0).sum())
            features_with_any = int(((df["semantic_pairs"].list.len() > 0) |
                                     (df["lexical_pairs"].list.len() > 0)).sum())

            total_semantic = int(df["semantic_pairs"].list.len().sum())
            total_lexical = int(df["lexical_pairs"].list.len().sum())

            result_stats = {
                "features_with_any_pairs": features_with_any,
                "features_with_semantic_pairs": features_with_semantic,
                "features_with_lexical_pairs": features_with_lexical,
                "total_semantic_pairs": total_semantic,
                "total_lexical_pairs": total_lexical,
                "mean_pairs_per_feature": float((total_semantic + total_lexical) / len(df)) if len(df) > 0 else 0
            }
        else:
            result_stats = {}

        # Save metadata
        metadata = {
            "created_at": datetime.now().isoformat(),
            "script_version": "1.0",
            "architecture": "threshold_filtered_pattern_classified",
            "sae_id": self.sae_id,
            "total_rows": len(df),
            "schema": {col: str(df[col].dtype) for col in df.columns},
            "thresholds_used": self.thresholds,
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
        description='Apply thresholds to inter-feature similarity data'
    )
    parser.add_argument(
        '--config', '-c',
        type=str,
        help='Path to configuration JSON file'
    )
    parser.add_argument(
        '--semantic-threshold',
        type=float,
        help='Override semantic similarity threshold'
    )
    parser.add_argument(
        '--char-jaccard-threshold',
        type=float,
        help='Override character Jaccard threshold'
    )
    parser.add_argument(
        '--word-jaccard-threshold',
        type=float,
        help='Override word Jaccard threshold'
    )

    args = parser.parse_args()

    # Load configuration
    config = load_config(args.config)

    # Override thresholds from command line if provided
    if args.semantic_threshold is not None:
        config["thresholds"]["semantic_threshold"] = args.semantic_threshold
    if args.char_jaccard_threshold is not None:
        config["thresholds"]["char_jaccard_threshold"] = args.char_jaccard_threshold
    if args.word_jaccard_threshold is not None:
        config["thresholds"]["word_jaccard_threshold"] = args.word_jaccard_threshold

    logger.info("Configuration loaded:")
    logger.info(f"  Input: {config['input_path']}")
    logger.info(f"  Output: {config['output_path']}")
    logger.info(f"  Thresholds: {config['thresholds']}")

    # Process
    processor = InterFeatureDisplayProcessor(config)
    df = processor.process()
    processor.save_parquet(df)

    logger.info("Processing complete!")


if __name__ == "__main__":
    main()
