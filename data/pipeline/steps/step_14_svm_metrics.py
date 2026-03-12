#!/usr/bin/env python3
"""
Step 14: SVM Metrics Pre-computation

This step pre-aggregates metrics used by backend services for SVM-based classification:
- cause_service.py (Stage 3 cause classification)
- similarity_sort_service.py (Stage 2 quality scoring)
- pair_similarity_service.py (Stage 1 pair similarity)

Output:
1. svm_feature_metrics.parquet - Feature-level metrics (1 row per feature)
2. svm_pair_metrics.parquet - Pair-level metrics (1 row per pair)

Feature Metrics Schema (15 columns):
- feature_id: UInt32
- score_embedding: Float32 (mean across 3 explainers)
- score_fuzz: Float32 (mean across 3 explainers)
- score_detection: Float32 (mean across 3 explainers)
- explanation_semantic_sim: Float32 (mean across 3 explainers)
- frac_nonzero: Float32 (mean across 3 explainers)
- consensus_score: Float32 (cross-explainer phrase clustering agreement from explanation_consensus)
- intra_ngram_jaccard: Float32 (max of char/word ngram from activation_display)
- intra_ngram_jaccard_std: Float32 (std of pairwise Jaccard for the best k-size)
- intra_semantic_sim: Float32 (from activation_display)
- score_embedding_std: Float32 (cross-explainer disagreement)
- score_fuzz_std: Float32 (cross-explainer disagreement)
- score_detection_std: Float32 (cross-explainer disagreement)
- explanation_semantic_sim_std: Float32 (cross-explainer disagreement)
- intra_semantic_sim_std: Float32 (from activation_display)

Pair Metrics Schema (6 columns):
- feature_a: UInt32 (smaller feature ID)
- feature_b: UInt32 (larger feature ID)
- inter_ngram_jaccard: Float32 (max of char/word jaccard from interfeature_similarity)
- inter_semantic_sim: Float32 (semantic_similarity from interfeature_similarity)
- decoder_sim: Float32 (cosine_similarity from features.parquet decoder_similarity)
- feature_correlation: Float32 (activation correlation from feature_correlation.npy)

Note: log_frac_nonzero is computed at SVM training time in backend.
"""

import logging
from pathlib import Path
from typing import Optional, Tuple

import numpy as np
import polars as pl

# Enable string cache for categorical operations
pl.enable_string_cache()

# Add parent directory to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.base import BaseProcessor, load_yaml_config, resolve_variables
from core.logging import setup_logging

logger = logging.getLogger(__name__)

# Category A: null = missing measurement → median impute
MEDIAN_IMPUTE_COLS = [
    "score_embedding", "score_fuzz", "score_detection",
    "explanation_semantic_sim", "frac_nonzero", "consensus_score",
    "score_embedding_std", "score_fuzz_std", "score_detection_std",
    "explanation_semantic_sim_std",
]
# Category B: null = no pattern exists → 0 is correct
ZERO_FILL_COLS = [
    "intra_ngram_jaccard", "intra_ngram_jaccard_std",
    "intra_semantic_sim", "intra_semantic_sim_std",
]


class SvmMetricsProcessor(BaseProcessor):
    """Process feature and pair data into pre-aggregated SVM metrics."""

    @property
    def step_name(self) -> str:
        return "Step 14: SVM Metrics"

    @property
    def version(self) -> str:
        return "4.1"

    def _init_paths(self) -> None:
        """Initialize paths from configuration."""
        super()._init_paths()

        global_config = self.config.get("global", {})
        paths = global_config.get("paths", {})

        # Input paths
        inputs = self.config.get("inputs", {})
        self.features_path = self._resolve_path(
            inputs.get("features", f"{paths.get('output', 'data/output')}/features.parquet")
        )
        self.activation_display_path = self._resolve_path(
            inputs.get("activation_display", f"{paths.get('output', 'data/output')}/activation_display.parquet")
        )
        self.interfeature_similarity_path = self._resolve_path(
            inputs.get("interfeature_similarity", f"{paths.get('output', 'data/output')}/interfeature_similarity.parquet")
        )
        self.explanation_consensus_path = self._resolve_path(
            inputs.get("explanation_consensus", f"{paths.get('output', 'data/output')}/explanation_consensus.parquet")
        )
        self.feature_correlation_path = self._resolve_path(
            inputs.get("feature_correlation", "data/raw/feature_similarity/feature_correlation.npy")
        )

        # Output paths
        outputs = self.config.get("outputs", {})
        self.feature_metrics_path = self._resolve_path(
            outputs.get("feature_metrics", f"{paths.get('output', 'data/output')}/svm_feature_metrics.parquet")
        )
        self.pair_metrics_path = self._resolve_path(
            outputs.get("pair_metrics", f"{paths.get('output', 'data/output')}/svm_pair_metrics.parquet")
        )

        # Statistics tracking
        self.stats = {
            "features_processed": 0,
            "pairs_processed": 0,
            "missing_values_filled": 0,
        }

        # Data holders
        self.features_df: Optional[pl.DataFrame] = None
        self.activation_df: Optional[pl.DataFrame] = None
        self.interfeature_df: Optional[pl.DataFrame] = None
        self.consensus_df: Optional[pl.DataFrame] = None
        self.correlation_matrix: Optional[np.ndarray] = None

    def _load_data(self) -> None:
        """Load all required data files."""
        logger.info(f"Loading features from {self.features_path}")
        if not self.features_path.exists():
            raise FileNotFoundError(f"Features file not found: {self.features_path}")
        self.features_df = pl.read_parquet(self.features_path)
        logger.info(f"Loaded {len(self.features_df):,} feature rows")

        logger.info(f"Loading activation display from {self.activation_display_path}")
        if not self.activation_display_path.exists():
            raise FileNotFoundError(f"Activation display file not found: {self.activation_display_path}")
        self.activation_df = pl.read_parquet(self.activation_display_path)
        logger.info(f"Loaded {len(self.activation_df):,} activation display rows")

        logger.info(f"Loading interfeature similarity from {self.interfeature_similarity_path}")
        if not self.interfeature_similarity_path.exists():
            raise FileNotFoundError(f"Interfeature similarity file not found: {self.interfeature_similarity_path}")
        self.interfeature_df = pl.read_parquet(self.interfeature_similarity_path)
        logger.info(f"Loaded {len(self.interfeature_df):,} interfeature similarity rows")

        logger.info(f"Loading explanation consensus from {self.explanation_consensus_path}")
        if not self.explanation_consensus_path.exists():
            raise FileNotFoundError(f"Explanation consensus file not found: {self.explanation_consensus_path}")
        self.consensus_df = pl.read_parquet(
            self.explanation_consensus_path,
            columns=["feature_id", "consensus_score"]
        )
        logger.info(f"Loaded {len(self.consensus_df):,} consensus rows")

        logger.info(f"Loading feature correlation matrix from {self.feature_correlation_path}")
        if self.feature_correlation_path.exists():
            self.correlation_matrix = np.load(self.feature_correlation_path)
            logger.info(f"Loaded correlation matrix: shape={self.correlation_matrix.shape}, dtype={self.correlation_matrix.dtype}")
        else:
            logger.warning(f"Feature correlation file not found: {self.feature_correlation_path} — feature_correlation will be 0.0")

    def _prepare_feature_metrics(self) -> pl.DataFrame:
        """Prepare feature-level metrics with extracted and aggregated scores."""
        assert self.features_df is not None
        df = self.features_df

        # Explode scores to get per-explanation metrics (3 rows per feature)
        df = df.explode("scores")

        # Extract score fields from nested structure
        df = df.with_columns([
            pl.col("scores").struct.field("fuzz").alias("score_fuzz"),
            pl.col("scores").struct.field("detection").alias("score_detection"),
            pl.col("scores").struct.field("embedding").alias("score_embedding"),
        ])

        # Calculate explanation_semantic_sim (mean cosine similarity across explainer pairs)
        df = df.with_columns([
            pl.col("semantic_similarity")
                .list.eval(pl.element().struct.field("cosine_similarity"))
                .list.mean()
                .alias("explanation_semantic_sim")
        ])

        # Fill null frac_nonzero with median (before aggregation)
        frac_nonzero_median = df["frac_nonzero"].drop_nulls().median()
        if frac_nonzero_median is None:
            frac_nonzero_median = 0.0
        logger.info(f"frac_nonzero pre-agg median: {frac_nonzero_median:.6f}, nulls={df['frac_nonzero'].null_count()}")
        df = df.with_columns([
            pl.col("frac_nonzero").fill_null(frac_nonzero_median)
        ])

        # Apply feature limit before aggregation
        if self.feature_limit is not None:
            unique_features = df["feature_id"].unique().sort()[:self.feature_limit]
            df = df.filter(pl.col("feature_id").is_in(unique_features))
            logger.info(f"Limited to {self.feature_limit} features")

        # Aggregate to 1 row per feature: compute mean and std across 3 explainers
        agg_df = df.group_by("feature_id").agg([
            # Mean metrics (across 3 explainers)
            pl.col("score_embedding").mean().alias("score_embedding"),
            pl.col("score_fuzz").mean().alias("score_fuzz"),
            pl.col("score_detection").mean().alias("score_detection"),
            pl.col("explanation_semantic_sim").mean().alias("explanation_semantic_sim"),
            pl.col("frac_nonzero").mean().alias("frac_nonzero"),
            # Std metrics (cross-explainer disagreement)
            pl.col("score_embedding").std().alias("score_embedding_std"),
            pl.col("score_fuzz").std().alias("score_fuzz_std"),
            pl.col("score_detection").std().alias("score_detection_std"),
            pl.col("explanation_semantic_sim").std().alias("explanation_semantic_sim_std"),
        ])

        # Cast feature_id to UInt32 for consistency with activation data
        agg_df = agg_df.with_columns([pl.col("feature_id").cast(pl.UInt32)])

        logger.info(f"Aggregated to {len(agg_df):,} features (1 row per feature)")
        return agg_df

    def _prepare_activation_metrics(self) -> pl.DataFrame:
        """Prepare activation display data with intra-feature metrics."""
        assert self.activation_df is not None
        df = self.activation_df

        # Compute intra_ngram_jaccard = max(char_ngram, word_ngram)
        df = df.with_columns([
            pl.max_horizontal(
                pl.col("char_ngram_max_jaccard").fill_null(0.0),
                pl.col("word_ngram_max_jaccard").fill_null(0.0),
            ).alias("intra_ngram_jaccard")
        ])

        # Compute intra_ngram_jaccard_std: pick the std that corresponds to
        # whichever of char/word had the higher mean
        df = df.with_columns([
            pl.when(pl.col("char_ngram_max_jaccard").fill_null(0.0) >= pl.col("word_ngram_max_jaccard").fill_null(0.0))
              .then(pl.col("char_ngram_max_jaccard_std").fill_null(0.0))
              .otherwise(pl.col("word_ngram_max_jaccard_std").fill_null(0.0))
              .alias("intra_ngram_jaccard_std")
        ])

        # Select needed columns (semantic_similarity is intra_semantic_sim)
        df = df.select([
            pl.col("feature_id").cast(pl.UInt32),
            "intra_ngram_jaccard",
            "intra_ngram_jaccard_std",
            pl.col("semantic_similarity").fill_null(0.0).alias("intra_semantic_sim"),
            pl.col("semantic_similarity_std").fill_null(0.0).alias("intra_semantic_sim_std"),
        ])

        return df

    def _prepare_pair_metrics(self) -> pl.DataFrame:
        """Prepare pair-level metrics from interfeature_similarity and features.parquet.

        Creates a unified pair metrics table with:
        - inter_ngram_jaccard: max(char_jaccard, word_jaccard) from interfeature_similarity
        - inter_semantic_sim: semantic_similarity from interfeature_similarity
        - decoder_sim: cosine_similarity from features.parquet decoder_similarity
        """
        logger.info("Preparing pair metrics...")
        assert self.interfeature_df is not None
        assert self.features_df is not None

        # Step 1: Get inter-feature metrics from interfeature_similarity
        # Columns: main_feature_id, similar_feature_id, char_ngram_max_jaccard, word_ngram_max_jaccard, semantic_similarity
        inter_df = self.interfeature_df.select([
            "main_feature_id",
            "similar_feature_id",
            pl.max_horizontal(
                pl.col("char_ngram_max_jaccard").fill_null(0.0),
                pl.col("word_ngram_max_jaccard").fill_null(0.0),
            ).alias("inter_ngram_jaccard"),
            pl.col("semantic_similarity").fill_null(0.0).alias("inter_semantic_sim"),
        ])

        # Normalize to canonical pair ordering (smaller ID first)
        inter_df = inter_df.with_columns([
            pl.min_horizontal("main_feature_id", "similar_feature_id").alias("feature_a"),
            pl.max_horizontal("main_feature_id", "similar_feature_id").alias("feature_b"),
        ]).select([
            pl.col("feature_a").cast(pl.UInt32),
            pl.col("feature_b").cast(pl.UInt32),
            "inter_ngram_jaccard",
            "inter_semantic_sim",
        ])

        # Deduplicate pairs (keep first occurrence, or could aggregate)
        inter_df = inter_df.unique(subset=["feature_a", "feature_b"])
        logger.info(f"Inter-feature pairs: {len(inter_df):,}")

        # Step 2: Extract decoder similarities from features.parquet
        # The decoder_similarity column is a list of structs: [{feature_id, cosine_similarity}, ...]

        # Apply feature limit if set
        features_to_process = self.features_df
        if self.feature_limit is not None:
            unique_features = features_to_process["feature_id"].unique().sort()[:self.feature_limit]
            features_to_process = features_to_process.filter(pl.col("feature_id").is_in(unique_features))

        # Get unique features (one row per feature, not per explainer)
        features_unique = features_to_process.select(["feature_id", "decoder_similarity"]).unique(subset=["feature_id"])

        logger.info(f"Extracting decoder similarities from {len(features_unique):,} unique features...")

        # Explode decoder_similarity list to get one row per pair
        decoder_df = features_unique.explode("decoder_similarity")

        # Filter out null decoder_similarity entries
        decoder_df = decoder_df.filter(pl.col("decoder_similarity").is_not_null())

        # Extract fields from struct
        decoder_df = decoder_df.with_columns([
            pl.col("decoder_similarity").struct.field("feature_id").alias("similar_feature_id"),
            pl.col("decoder_similarity").struct.field("cosine_similarity").alias("decoder_sim"),
        ]).select([
            pl.col("feature_id").cast(pl.UInt32).alias("main_feature_id"),
            pl.col("similar_feature_id").cast(pl.UInt32),
            pl.col("decoder_sim").cast(pl.Float32),
        ])

        # Normalize to canonical pair ordering
        decoder_df = decoder_df.with_columns([
            pl.min_horizontal("main_feature_id", "similar_feature_id").alias("feature_a"),
            pl.max_horizontal("main_feature_id", "similar_feature_id").alias("feature_b"),
        ]).select([
            pl.col("feature_a").cast(pl.UInt32),
            pl.col("feature_b").cast(pl.UInt32),
            "decoder_sim",
        ])

        # Deduplicate decoder pairs
        decoder_df = decoder_df.unique(subset=["feature_a", "feature_b"])
        logger.info(f"Decoder pairs: {len(decoder_df):,}")

        # Step 3: Join inter-feature and decoder metrics
        # Use outer join to keep all pairs from both sources
        pair_df = inter_df.join(
            decoder_df,
            on=["feature_a", "feature_b"],
            how="outer"
        )

        # Fill nulls with 0.0
        pair_df = pair_df.with_columns([
            pl.col("inter_ngram_jaccard").fill_null(0.0).cast(pl.Float32),
            pl.col("inter_semantic_sim").fill_null(0.0).cast(pl.Float32),
            pl.col("decoder_sim").fill_null(0.0).cast(pl.Float32),
        ])

        # Ensure proper types
        pair_df = pair_df.with_columns([
            pl.col("feature_a").cast(pl.UInt32),
            pl.col("feature_b").cast(pl.UInt32),
        ])

        # Add feature_correlation from pre-computed correlation matrix
        if self.correlation_matrix is not None:
            matrix = self.correlation_matrix
            max_id = matrix.shape[0]
            feature_a = pair_df["feature_a"].to_numpy()
            feature_b = pair_df["feature_b"].to_numpy()
            # Vectorized lookup — features outside matrix range get 0.0
            valid = (feature_a < max_id) & (feature_b < max_id)
            correlations = np.where(valid, matrix[feature_a, feature_b], 0.0)
            pair_df = pair_df.with_columns(
                pl.Series("feature_correlation", correlations, dtype=pl.Float32)
            )
            logger.info(f"Added feature_correlation: min={correlations.min():.4f}, max={correlations.max():.4f}, mean={correlations.mean():.4f}")
        else:
            pair_df = pair_df.with_columns(
                pl.lit(0.0).cast(pl.Float32).alias("feature_correlation")
            )
            logger.warning("No correlation matrix — feature_correlation set to 0.0 for all pairs")

        logger.info(f"Combined pair metrics: {len(pair_df):,} unique pairs")
        self.stats["pairs_processed"] = len(pair_df)

        return pair_df

    def process(self) -> Tuple[pl.DataFrame, pl.DataFrame]:  # type: ignore[override]
        """Execute the main processing logic.

        Returns:
            Tuple of (feature_metrics_df, pair_metrics_df)
        """
        self._load_data()

        # Process feature-level metrics
        logger.info("Preparing feature metrics (aggregating across explainers)...")
        features_agg = self._prepare_feature_metrics()

        logger.info("Preparing activation metrics...")
        activation_prepared = self._prepare_activation_metrics()
        logger.info(f"Prepared {len(activation_prepared):,} activation rows")

        # Join features with activation metrics
        logger.info("Joining features with activation metrics...")
        feature_df = features_agg.join(
            activation_prepared,
            on="feature_id",
            how="left"
        )

        # Join consensus_score from explanation_consensus
        logger.info("Joining consensus scores...")
        consensus_prepared = self.consensus_df.with_columns([
            pl.col("feature_id").cast(pl.UInt32),
        ])
        feature_df = feature_df.join(
            consensus_prepared,
            on="feature_id",
            how="left"
        )

        # Category A: median imputation (null = missing measurement)
        median_values = {}
        for col in MEDIAN_IMPUTE_COLS:
            if col in feature_df.columns:
                null_count = feature_df[col].null_count()
                if null_count > 0:
                    col_median = feature_df[col].drop_nulls().median()
                    if col_median is None:
                        col_median = 0.0
                    median_values[col] = col_median
                    self.stats["missing_values_filled"] += null_count
                    logger.info(f"Median imputation: {col} — {null_count} nulls, median={col_median:.6f}")
                    feature_df = feature_df.with_columns([pl.col(col).fill_null(col_median)])

        # Category B: zero fill (null = no pattern exists, 0 is correct)
        for col in ZERO_FILL_COLS:
            if col in feature_df.columns:
                null_count = feature_df[col].null_count()
                if null_count > 0:
                    self.stats["missing_values_filled"] += null_count
                    logger.info(f"Zero fill: {col} — {null_count} nulls")
                feature_df = feature_df.with_columns([pl.col(col).fill_null(0.0)])

        self.stats["median_imputation_values"] = median_values

        # Cast types
        feature_df = feature_df.with_columns([
            pl.col("feature_id").cast(pl.UInt32),
        ])

        # Cast all float columns to Float32
        float_cols = [
            "score_embedding", "score_fuzz", "score_detection",
            "explanation_semantic_sim", "frac_nonzero", "consensus_score",
            "intra_ngram_jaccard", "intra_ngram_jaccard_std", "intra_semantic_sim",
            "score_embedding_std", "score_fuzz_std", "score_detection_std",
            "explanation_semantic_sim_std", "intra_semantic_sim_std"
        ]
        for col in float_cols:
            if col in feature_df.columns:
                feature_df = feature_df.with_columns([pl.col(col).cast(pl.Float32)])

        self.stats["features_processed"] = len(feature_df)
        logger.info(f"Created feature metrics DataFrame with {len(feature_df)} rows (1 per feature)")
        logger.info(f"Feature columns: {feature_df.columns}")

        # Process pair-level metrics
        pair_df = self._prepare_pair_metrics()
        logger.info(f"Created pair metrics DataFrame with {len(pair_df)} rows (1 per pair)")
        logger.info(f"Pair columns: {pair_df.columns}")

        return feature_df, pair_df

    def run(self) -> None:  # type: ignore[override]
        """Execute the processing step with file output."""
        logger.info(f"{'='*60}")
        logger.info(f"Starting {self.step_name} (v{self.version})")
        logger.info(f"{'='*60}")

        try:
            feature_df, pair_df = self.process()

            # Save feature metrics
            logger.info(f"Saving feature metrics to {self.feature_metrics_path}")
            feature_df.write_parquet(self.feature_metrics_path)

            # Save pair metrics
            logger.info(f"Saving pair metrics to {self.pair_metrics_path}")
            pair_df.write_parquet(self.pair_metrics_path)

            # Save metadata for feature metrics
            self._save_feature_metadata(self.feature_metrics_path, feature_df)

            # Save metadata for pair metrics
            self._save_pair_metadata(self.pair_metrics_path, pair_df)

            logger.info(f"{'='*60}")
            logger.info(f"{self.step_name} completed successfully")
            logger.info(f"Features processed: {self.stats['features_processed']:,}")
            logger.info(f"Pairs processed: {self.stats['pairs_processed']:,}")
            logger.info(f"Missing values filled: {self.stats['missing_values_filled']:,}")
            logger.info(f"{'='*60}")

        except Exception as e:
            logger.error(f"{self.step_name} failed: {e}")
            raise

    def _save_feature_metadata(self, output_path: Path, df: pl.DataFrame) -> None:
        """Save metadata for feature metrics output file."""
        import json
        from datetime import datetime

        metadata = {
            "step_name": self.step_name,
            "version": self.version,
            "created_at": datetime.now().isoformat(),
            "row_count": len(df),
            "columns": df.columns,
            "schema": {col: str(dtype) for col, dtype in df.schema.items()},
            "stats": {
                "features_processed": self.stats["features_processed"],
                "missing_values_filled": self.stats["missing_values_filled"],
                "median_imputation_values": self.stats.get("median_imputation_values", {}),
            },
        }

        metadata_path = Path(str(output_path) + ".metadata.json")
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        logger.info(f"Feature metadata saved to {metadata_path}")

    def _save_pair_metadata(self, output_path: Path, df: pl.DataFrame) -> None:
        """Save metadata for pair metrics output file."""
        import json
        from datetime import datetime

        metadata = {
            "step_name": self.step_name,
            "version": self.version,
            "created_at": datetime.now().isoformat(),
            "row_count": len(df),
            "columns": df.columns,
            "schema": {col: str(dtype) for col, dtype in df.schema.items()},
            "stats": {
                "pairs_processed": self.stats["pairs_processed"],
            },
        }

        metadata_path = Path(str(output_path) + ".metadata.json")
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        logger.info(f"Pair metadata saved to {metadata_path}")

    def _create_empty_dataframe(self) -> pl.DataFrame:
        """Create empty DataFrame with correct schema for feature metrics."""
        schema = {
            "feature_id": pl.UInt32,
            "score_embedding": pl.Float32,
            "score_fuzz": pl.Float32,
            "score_detection": pl.Float32,
            "explanation_semantic_sim": pl.Float32,
            "frac_nonzero": pl.Float32,
            "consensus_score": pl.Float32,
            "intra_ngram_jaccard": pl.Float32,
            "intra_ngram_jaccard_std": pl.Float32,
            "intra_semantic_sim": pl.Float32,
            "score_embedding_std": pl.Float32,
            "score_fuzz_std": pl.Float32,
            "score_detection_std": pl.Float32,
            "explanation_semantic_sim_std": pl.Float32,
            "intra_semantic_sim_std": pl.Float32,
        }
        return pl.DataFrame(schema=schema)


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Create SVM metrics for feature and pair classification")
    parser.add_argument("--config", type=str, help="Path to configuration file")
    parser.add_argument("--limit", type=int, help="Limit number of features (for testing)")

    args = parser.parse_args()

    setup_logging()

    if args.config:
        full_config = load_yaml_config(args.config)
        full_config = resolve_variables(full_config)
        # Extract step-specific config if present
        config = full_config.get("steps", {}).get("step_14_svm_metrics", {})
        if not config:
            # Fallback: treat entire config as step config (legacy format)
            config = full_config
        config["sae_id"] = full_config.get("global", {}).get("sae_id_sanitized", "")
        config["global"] = full_config.get("global", {})
    else:
        config_path = Path(__file__).parent.parent / "config.yaml"
        if config_path.exists():
            full_config = load_yaml_config(config_path)
            full_config = resolve_variables(full_config)
            config = full_config.get("steps", {}).get("step_14_svm_metrics", {})
            config["sae_id"] = full_config.get("global", {}).get("sae_id_sanitized", "")
            config["global"] = full_config.get("global", {})
        else:
            config = {}

    processor = SvmMetricsProcessor(config, feature_limit=args.limit)
    processor.run()


if __name__ == "__main__":
    main()
