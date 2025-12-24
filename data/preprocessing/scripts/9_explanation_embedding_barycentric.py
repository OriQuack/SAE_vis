#!/usr/bin/env python3
"""
Preprocessing Script: Explanation Embedding with Barycentric Dimension Reduction

This script generates explanation embedding vectors and applies anchor-based
barycentric dimension reduction for visualizing explanation quality failure modes.

Input:
- features.parquet: Main feature dataset with scores and semantic similarity
- activation_display.parquet: Feature-level activation metrics

Output:
- explanation_barycentric.parquet: Per-explanation embeddings with 2D positions
- explanation_barycentric_metadata.json: Processing metadata

Metrics Vector (5D):
1. intra_feature_sim: max(char_ngram_max_jaccard, word_ngram_max_jaccard, semantic_similarity)
2. score_embedding: Per explanation
3. score_fuzz: Per explanation
4. score_detection: Per explanation
5. explanation_semantic_sim: Per feature (avg across explainer pairs)

Anchors (Triangle Vertices):
- Missed N-gram: Low fuzz score (explanation misses lexical patterns)
- Missed Context: Low embedding and detection scores (misses semantic context)
- Noisy Activation: Low intra-feature sim and semantic sim (inconsistent activations)

Usage:
    python 9_explanation_embedding_barycentric.py [--config CONFIG_PATH] [--limit N]

Example:
    python 9_explanation_embedding_barycentric.py
    python 9_explanation_embedding_barycentric.py --limit 100  # Test on 100 features
"""

import json
import logging
import argparse
from pathlib import Path
from typing import Dict, List, Optional, Any, Union
from datetime import datetime
import numpy as np
import polars as pl

# Enable string cache for categorical operations
pl.enable_string_cache()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Constants
METRICS = ["intra_feature_sim", "score_embedding", "score_fuzz", "score_detection", "explanation_semantic_sim"]
ANCHOR_NAMES = ["missed_ngram", "missed_context", "noisy_activation"]


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
        "sae_id": "google--gemma-scope-9b-pt-res--layer_30--width_16k--average_l0_120",
        "input": {
            "features_parquet": "data/master/features.parquet",
            "activation_display_parquet": "data/master/activation_display.parquet"
        },
        "output": {
            "output_path": "data/master/explanation_barycentric.parquet",
            "metadata_path": "data/master/explanation_barycentric_metadata.json"
        },
        "metrics": {
            "order": METRICS
        },
        "anchors": {
            "missed_ngram": {
                "intra_feature_sim": "p75",
                "score_embedding": "p75",
                "score_fuzz": "min",
                "score_detection": "p75",
                "explanation_semantic_sim": "p75"
            },
            "missed_context": {
                "intra_feature_sim": "p75",
                "score_embedding": "min",
                "score_fuzz": "p75",
                "score_detection": "min",
                "explanation_semantic_sim": "p75"
            },
            "noisy_activation": {
                "intra_feature_sim": "min",
                "score_embedding": "p75",
                "score_fuzz": "p75",
                "score_detection": "p75",
                "explanation_semantic_sim": "min"
            }
        },
        "processing": {
            "normalization": "zscore",
            "distance_metric": "euclidean"
        },
        "triangle_vertices": {
            "missed_ngram": [0.0, 0.0],
            "missed_context": [1.0, 0.0],
            "noisy_activation": [0.5, 0.866]
        }
    }

    if config_path and Path(config_path).exists():
        logger.info(f"Loading config from {config_path}")
        with open(config_path, 'r') as f:
            file_config = json.load(f)
        # Deep merge configs
        for key in file_config:
            if isinstance(file_config[key], dict) and key in default_config:
                if isinstance(default_config[key], dict):
                    default_config[key].update(file_config[key])
                else:
                    default_config[key] = file_config[key]
            else:
                default_config[key] = file_config[key]
    else:
        logger.info("Using default configuration")

    return default_config


class BarycentricEmbeddingProcessor:
    """Process explanation data into barycentric embeddings."""

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
        self.features_path = self._resolve_path(config["input"]["features_parquet"])
        self.activation_display_path = self._resolve_path(config["input"]["activation_display_parquet"])
        self.output_path = self._resolve_path(config["output"]["output_path"])
        self.metadata_path = self._resolve_path(config["output"]["metadata_path"])

        # Configuration
        self.sae_id = config["sae_id"]
        self.metrics_order = config["metrics"]["order"]
        self.anchor_configs = config["anchors"]
        self.processing = config["processing"]
        self.triangle_vertices = config["triangle_vertices"]

        # Statistics tracking
        self.stats = {
            "features_processed": 0,
            "explanations_processed": 0,
            "missing_values_filled": 0,
            "anchor_distribution": {name: 0 for name in ANCHOR_NAMES}
        }

        # Data containers
        self.features_df = None
        self.activation_df = None
        self.merged_df = None
        self.metric_stats = {}
        self.anchors = {}

    def _resolve_path(self, path_str: str) -> Path:
        """Resolve path relative to project root if not absolute."""
        path = Path(path_str)
        if not path.is_absolute():
            return self.project_root / path
        return path

    def _load_data(self):
        """Load features and activation display data."""
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

    def _prepare_features_data(self) -> pl.DataFrame:
        """Prepare features data with extracted scores and semantic similarity.

        Returns:
            DataFrame with per-explanation rows
        """
        df = self.features_df

        # Explode scores to get per-explanation metrics
        df = df.explode("scores")

        # Extract score fields
        df = df.with_columns([
            pl.col("scores").struct.field("fuzz").alias("score_fuzz"),
            pl.col("scores").struct.field("detection").alias("score_detection"),
            pl.col("scores").struct.field("embedding").alias("score_embedding"),
        ])

        # Calculate explanation_semantic_sim (per feature - avg across explainer pairs)
        df = df.with_columns([
            pl.col("semantic_similarity")
                .list.eval(pl.element().struct.field("cosine_similarity"))
                .list.mean()
                .alias("explanation_semantic_sim")
        ])

        # Select relevant columns
        df = df.select([
            "feature_id",
            "llm_explainer",
            "score_fuzz",
            "score_detection",
            "score_embedding",
            "explanation_semantic_sim"
        ])

        return df

    def _prepare_activation_data(self) -> pl.DataFrame:
        """Prepare activation display data with intra_feature_sim.

        Returns:
            DataFrame with per-feature intra_feature_sim
        """
        df = self.activation_df

        # Compute intra_feature_sim = max(char, word, semantic)
        df = df.with_columns([
            pl.max_horizontal(
                pl.col("char_ngram_max_jaccard").fill_null(0.0),
                pl.col("word_ngram_max_jaccard").fill_null(0.0),
                pl.col("semantic_similarity").fill_null(0.0)
            ).alias("intra_feature_sim")
        ])

        # Select only needed columns and cast feature_id to match features.parquet
        df = df.select([
            pl.col("feature_id").cast(pl.Int64),
            "intra_feature_sim"
        ])

        return df

    def _merge_data(self):
        """Merge features and activation data."""
        logger.info("Preparing features data...")
        features_prepared = self._prepare_features_data()
        logger.info(f"Prepared {len(features_prepared):,} explanation rows")

        logger.info("Preparing activation data...")
        activation_prepared = self._prepare_activation_data()
        logger.info(f"Prepared {len(activation_prepared):,} feature rows with intra_feature_sim")

        # Apply feature limit if specified
        if self.feature_limit is not None:
            unique_features = features_prepared["feature_id"].unique().sort()[:self.feature_limit]
            features_prepared = features_prepared.filter(pl.col("feature_id").is_in(unique_features))
            logger.info(f"Limited to {self.feature_limit} features ({len(features_prepared)} explanations)")

        # Join: per-feature metrics will be shared across all explanations of that feature
        logger.info("Merging data...")
        self.merged_df = features_prepared.join(
            activation_prepared,
            on="feature_id",
            how="left"
        )

        # Fill null values with 0.0
        for metric in self.metrics_order:
            null_count = self.merged_df[metric].null_count()
            if null_count > 0:
                self.stats["missing_values_filled"] += null_count
                logger.info(f"Filling {null_count} null values in {metric}")
            self.merged_df = self.merged_df.with_columns([
                pl.col(metric).fill_null(0.0)
            ])

        logger.info(f"Merged data: {len(self.merged_df):,} rows")

    def _compute_statistics(self):
        """Compute statistics for each metric."""
        logger.info("Computing metric statistics...")
        for metric in self.metrics_order:
            col = self.merged_df[metric]
            self.metric_stats[metric] = {
                "mean": float(col.mean()),
                "std": float(col.std()),
                "min": float(col.min()),
                "max": float(col.max()),
                "p5": float(col.quantile(0.05)),
                "p10": float(col.quantile(0.10)),
                "p25": float(col.quantile(0.25)),
                "p50": float(col.quantile(0.50)),
                "p75": float(col.quantile(0.75)),
                "p90": float(col.quantile(0.90))
            }
            logger.info(f"  {metric}: mean={self.metric_stats[metric]['mean']:.4f}, "
                       f"std={self.metric_stats[metric]['std']:.4f}, "
                       f"min={self.metric_stats[metric]['min']:.4f}, "
                       f"max={self.metric_stats[metric]['max']:.4f}")

    def _get_anchor_value(self, value_spec: Union[str, float], metric: str) -> float:
        """Get anchor value from specification.

        Args:
            value_spec: Value specification ("min", "max", "p25", "p50", "p75", "p90", or numeric)
            metric: Metric name

        Returns:
            Raw value for the anchor
        """
        stats = self.metric_stats[metric]

        if isinstance(value_spec, (int, float)):
            return float(value_spec)
        elif value_spec == "min":
            return stats["min"]
        elif value_spec == "max":
            return stats["max"]
        elif value_spec == "p5":
            return stats["p5"]
        elif value_spec == "p10":
            return stats["p10"]
        elif value_spec == "p25":
            return stats["p25"]
        elif value_spec == "p50":
            return stats["p50"]
        elif value_spec == "p75":
            return stats["p75"]
        elif value_spec == "p90":
            return stats["p90"]
        else:
            raise ValueError(f"Unknown anchor value specification: {value_spec}")

    def _build_anchors(self):
        """Build anchor vectors in standardized space."""
        logger.info("Building anchor vectors...")
        for anchor_name, anchor_config in self.anchor_configs.items():
            raw_vector = []
            std_vector = []

            for metric in self.metrics_order:
                # Get raw value
                raw_val = self._get_anchor_value(anchor_config[metric], metric)
                raw_vector.append(raw_val)

                # Standardize (z-score)
                mean_val = self.metric_stats[metric]["mean"]
                std_val = self.metric_stats[metric]["std"]
                std_val_z = (raw_val - mean_val) / (std_val + 1e-8)
                std_vector.append(std_val_z)

            self.anchors[anchor_name] = {
                "raw": np.array(raw_vector),
                "standardized": np.array(std_vector)
            }

            logger.info(f"  {anchor_name}: raw={raw_vector}, std={[f'{v:.3f}' for v in std_vector]}")

    def _standardize_metrics(self):
        """Apply z-score standardization to metrics."""
        logger.info("Standardizing metrics...")
        for metric in self.metrics_order:
            mean_val = self.metric_stats[metric]["mean"]
            std_val = self.metric_stats[metric]["std"]
            self.merged_df = self.merged_df.with_columns([
                ((pl.col(metric) - mean_val) / (std_val + 1e-8))
                    .alias(f"{metric}_std")
            ])

    def _compute_barycentric(self):
        """Compute barycentric coordinates for all explanations."""
        logger.info("Computing barycentric coordinates...")

        # Extract standardized metrics as numpy array
        std_cols = [f"{m}_std" for m in self.metrics_order]
        X = self.merged_df.select(std_cols).to_numpy()

        # Build anchors matrix
        anchors_matrix = np.stack([
            self.anchors[name]["standardized"] for name in ANCHOR_NAMES
        ])

        # Compute Euclidean distances to each anchor
        distances = np.zeros((len(X), 3))
        for i, anchor in enumerate(anchors_matrix):
            distances[:, i] = np.linalg.norm(X - anchor, axis=1)

        # Inverse distance weights
        eps = 1e-8
        weights = 1.0 / (distances + eps)
        weights_sum = weights.sum(axis=1, keepdims=True)
        barycentric = weights / weights_sum

        # Map to 2D triangle
        V = np.array([
            self.triangle_vertices["missed_ngram"],
            self.triangle_vertices["missed_context"],
            self.triangle_vertices["noisy_activation"]
        ])
        positions = barycentric @ V

        # Determine nearest anchor
        nearest_idx = np.argmin(distances, axis=1)
        nearest_anchor = [ANCHOR_NAMES[i] for i in nearest_idx]

        # Update anchor distribution stats
        for name in ANCHOR_NAMES:
            self.stats["anchor_distribution"][name] = int((nearest_idx == ANCHOR_NAMES.index(name)).sum())

        # Add columns to dataframe
        self.merged_df = self.merged_df.with_columns([
            # Distances
            pl.Series("dist_missed_ngram", distances[:, 0].astype(np.float32)),
            pl.Series("dist_missed_context", distances[:, 1].astype(np.float32)),
            pl.Series("dist_noisy_activation", distances[:, 2].astype(np.float32)),
            # Barycentric coordinates
            pl.Series("bary_missed_ngram", barycentric[:, 0].astype(np.float32)),
            pl.Series("bary_missed_context", barycentric[:, 1].astype(np.float32)),
            pl.Series("bary_noisy_activation", barycentric[:, 2].astype(np.float32)),
            # 2D position
            pl.Series("position_x", positions[:, 0].astype(np.float32)),
            pl.Series("position_y", positions[:, 1].astype(np.float32)),
            # Nearest anchor
            pl.Series("nearest_anchor", nearest_anchor),
        ])

        self.stats["explanations_processed"] = len(self.merged_df)
        self.stats["features_processed"] = self.merged_df["feature_id"].n_unique()

        logger.info(f"Computed barycentric coordinates for {len(self.merged_df):,} explanations")
        logger.info(f"Anchor distribution: {self.stats['anchor_distribution']}")

    def process(self) -> pl.DataFrame:
        """Run the full processing pipeline.

        Returns:
            Processed DataFrame
        """
        self._load_data()
        self._merge_data()
        self._compute_statistics()
        self._build_anchors()
        self._standardize_metrics()
        self._compute_barycentric()

        return self.merged_df

    def save(self, df: pl.DataFrame):
        """Save output parquet and metadata.

        Args:
            df: Processed DataFrame
        """
        # Ensure output directory exists
        self.output_path.parent.mkdir(parents=True, exist_ok=True)

        # Cast columns to appropriate types
        df = df.with_columns([
            pl.col("feature_id").cast(pl.Int64),
            pl.col("llm_explainer").cast(pl.Utf8),
            pl.col("nearest_anchor").cast(pl.Utf8),
        ])

        # Cast float columns
        float_cols = (
            self.metrics_order +
            [f"{m}_std" for m in self.metrics_order] +
            ["dist_missed_ngram", "dist_missed_context", "dist_noisy_activation",
             "bary_missed_ngram", "bary_missed_context", "bary_noisy_activation",
             "position_x", "position_y"]
        )
        for col in float_cols:
            if col in df.columns:
                df = df.with_columns([pl.col(col).cast(pl.Float32)])

        logger.info(f"Saving parquet to {self.output_path}")
        df.write_parquet(self.output_path)

        # Prepare serializable stats
        serializable_stats = {}
        for metric, stats in self.metric_stats.items():
            serializable_stats[metric] = {k: float(v) for k, v in stats.items()}

        # Prepare serializable anchors
        serializable_anchors = {}
        for name, anchor in self.anchors.items():
            serializable_anchors[name] = {
                "raw": anchor["raw"].tolist(),
                "standardized": anchor["standardized"].tolist()
            }

        # Save metadata
        metadata = {
            "created_at": datetime.now().isoformat(),
            "script_version": "1.0",
            "sae_id": self.sae_id,
            "total_rows": len(df),
            "schema": {col: str(df[col].dtype) for col in df.columns},
            "metrics_order": self.metrics_order,
            "anchor_coordinates": serializable_anchors,
            "normalization_stats": serializable_stats,
            "processing_stats": self.stats,
            "config_used": self.config
        }

        with open(self.metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)

        logger.info(f"Saved metadata to {self.metadata_path}")
        logger.info(f"Successfully created parquet with {len(df):,} rows")


def main():
    """Main execution function."""
    parser = argparse.ArgumentParser(
        description='Create explanation barycentric embeddings'
    )
    parser.add_argument(
        '--config',
        type=str,
        default='data/preprocessing/config/9_explanation_embedding_barycentric.json',
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
    processor = BarycentricEmbeddingProcessor(config, feature_limit=args.limit)

    # Process data
    logger.info("=" * 80)
    logger.info("Starting Explanation Barycentric Embedding Processing")
    logger.info("=" * 80)

    df = processor.process()

    # Save output
    processor.save(df)

    logger.info("=" * 80)
    logger.info("Processing Complete!")
    logger.info(f"Statistics:")
    logger.info(f"  Features processed: {processor.stats['features_processed']:,}")
    logger.info(f"  Explanations processed: {processor.stats['explanations_processed']:,}")
    logger.info(f"  Missing values filled: {processor.stats['missing_values_filled']:,}")
    logger.info(f"  Anchor distribution:")
    for name, count in processor.stats['anchor_distribution'].items():
        pct = count / processor.stats['explanations_processed'] * 100 if processor.stats['explanations_processed'] > 0 else 0
        logger.info(f"    - {name}: {count:,} ({pct:.1f}%)")
    logger.info("=" * 80)


if __name__ == "__main__":
    main()
