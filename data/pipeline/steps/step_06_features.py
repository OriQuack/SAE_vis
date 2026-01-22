#!/usr/bin/env python3
"""
Step 6: Create Main Features Parquet

This step creates the main features.parquet file with nested structure by
combining data from explanation embeddings, aggregated scores, and decoder similarities.
It calculates semantic similarities on-the-fly from explanation embeddings.

Input:
- explanation_embeddings.parquet: Pre-computed embeddings from Step 4
- aggregated_scores.parquet: Scores from Step 3
- decoder_similarity_matrix.npz: Decoder similarities from Step 2
- clustering_linkage.npy: Linkage matrix from Step 5

Output:
- features.parquet: Main dataset with nested structure

Features:
- Nested scores structure (List(Struct))
- Decoder similarity neighbors (List(Struct))
- Semantic similarity between explainers (List(Struct))
- On-the-fly cosine similarity calculation
"""

import json
import logging
from pathlib import Path
from typing import Dict, List

import numpy as np
import polars as pl
from tqdm import tqdm

# Enable string cache for categorical operations
pl.enable_string_cache()

# Add parent directory to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.base import BaseProcessor, load_yaml_config
from core.logging import setup_logging

logger = logging.getLogger(__name__)


class FeaturesProcessor(BaseProcessor):
    """Create main features.parquet with nested structure."""

    @property
    def step_name(self) -> str:
        return "Step 6: Features Parquet"

    @property
    def version(self) -> str:
        return "2.1"

    def _init_paths(self) -> None:
        """Initialize paths from configuration."""
        super()._init_paths()

        global_config = self.config.get("global", {})
        paths = global_config.get("paths", {})
        inputs = self.config.get("inputs", {})
        outputs = self.config.get("outputs", {})

        # Fallback paths from global config
        intermediate_dir = paths.get("intermediate", "data/intermediate")
        output_dir = paths.get("output", "data/output")

        # Input paths from step config
        self.explanation_embeddings_path = self._resolve_path(
            inputs.get("explanation_embeddings", f"{intermediate_dir}/explanation_embeddings.parquet")
        )
        self.aggregated_scores_path = self._resolve_path(
            inputs.get("aggregated_scores", f"{intermediate_dir}/aggregated_scores.parquet")
        )
        self.decoder_similarities_path = self._resolve_path(
            inputs.get("decoder_similarity_matrix", f"{intermediate_dir}/decoder_similarity_matrix.npz")
        )
        self.linkage_path = self._resolve_path(
            inputs.get("clustering_linkage", f"{output_dir}/clustering_linkage.npy")
        )
        self.frac_nonzero_path = self._resolve_path(
            inputs.get("frac_nonzero", f"{paths.get('input', 'data/input')}/neuronpedia_frac_nonzero/frac_nonzero.json")
        )

        # Output path from step config
        self.output_path = self._resolve_path(
            outputs.get("main", f"{output_dir}/features.parquet")
        )

        # Processing parameters
        params = self.config.get("parameters", {})
        self.top_k_decoder_sim = params.get("top_k_decoder_sim", 10)

        # Statistics tracking
        self.stats = {
            "features_processed": 0,
            "rows_created": 0,
            "missing_scores": 0,
            "missing_embeddings": 0
        }

        # Data holders
        self.explanation_embeddings_df = None
        self.scores_df = None
        self.decoder_similarities = {}
        self.first_merge_distances = {}
        self.frac_nonzero = {}


    def _load_explanation_embeddings(self) -> None:
        """Load explanation embeddings parquet."""
        logger.info(f"Loading explanation embeddings from {self.explanation_embeddings_path}")
        if not self.explanation_embeddings_path.exists():
            raise FileNotFoundError(f"Explanation embeddings not found: {self.explanation_embeddings_path}")
        self.explanation_embeddings_df = pl.read_parquet(self.explanation_embeddings_path)
        logger.info(f"Loaded {len(self.explanation_embeddings_df):,} embeddings")

    def _load_scores(self) -> None:
        """Load aggregated scores from parquet."""
        logger.info(f"Loading scores from {self.aggregated_scores_path}")
        if not self.aggregated_scores_path.exists():
            raise FileNotFoundError(f"Aggregated scores not found: {self.aggregated_scores_path}")
        self.scores_df = pl.read_parquet(self.aggregated_scores_path)
        logger.info(f"Loaded {len(self.scores_df):,} score rows")

    def _load_decoder_similarities(self) -> None:
        """Load decoder weight similarities from NPZ.

        Uses top_k_decoder_sim parameter to limit the number of similar features.
        """
        if self.decoder_similarities_path.exists():
            try:
                import numpy as np
                data = np.load(self.decoder_similarities_path)
                top_k_indices = data['top_k_indices']  # [n_features, k]
                top_k_values = data['top_k_values']    # [n_features, k]
                feature_ids = data.get('feature_ids', np.arange(top_k_indices.shape[0]))

                # Use configured top_k or available columns, whichever is smaller
                k = min(self.top_k_decoder_sim, top_k_indices.shape[1])
                logger.info(f"Using top {k} decoder similarity values per feature")

                for i, feature_id in enumerate(feature_ids):
                    self.decoder_similarities[int(feature_id)] = [
                        {
                            "feature_id": int(top_k_indices[i, j]),
                            "cosine_similarity": float(top_k_values[i, j])
                        }
                        for j in range(k)
                    ]

                logger.info(f"Loaded decoder similarity for {len(self.decoder_similarities)} features")
            except Exception as e:
                logger.warning(f"Error loading decoder similarities: {e}")

    def _load_first_merge_distances(self) -> None:
        """Compute first merge distances from linkage matrix.

        The first merge distance is the threshold at which a feature transitions
        from being a singleton to being part of a cluster.
        """
        if not self.linkage_path.exists():
            logger.warning(f"Linkage matrix not found: {self.linkage_path}")
            return

        try:
            linkage_matrix = np.load(self.linkage_path)
            n_features = linkage_matrix.shape[0] + 1

            # Initialize with infinity (features that never merge)
            first_merge = np.full(n_features, np.inf, dtype=np.float64)

            # Linkage matrix format: [cluster1_id, cluster2_id, distance, size]
            # IDs < n_features are original features (singletons)
            for cluster1, cluster2, distance, _ in linkage_matrix:
                cluster1 = int(cluster1)
                cluster2 = int(cluster2)

                # Check if cluster1 is an original feature (singleton)
                if cluster1 < n_features:
                    first_merge[cluster1] = min(first_merge[cluster1], distance)

                # Check if cluster2 is an original feature (singleton)
                if cluster2 < n_features:
                    first_merge[cluster2] = min(first_merge[cluster2], distance)

            # Store in dictionary (feature_id == index for our case)
            for feature_id in range(n_features):
                if np.isfinite(first_merge[feature_id]):
                    self.first_merge_distances[feature_id] = float(first_merge[feature_id])

            logger.info(f"Computed first merge distances for {len(self.first_merge_distances)} features")
        except Exception as e:
            logger.warning(f"Error computing first merge distances: {e}")

    def _load_frac_nonzero(self) -> None:
        """Load frac_nonzero from Neuronpedia data."""
        if self.frac_nonzero_path.exists():
            try:
                with open(self.frac_nonzero_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                for key, value in data.items():
                    self.frac_nonzero[int(key)] = float(value)
                logger.info(f"Loaded frac_nonzero for {len(self.frac_nonzero)} features")
            except Exception as e:
                logger.warning(f"Error loading frac_nonzero: {e}")

    def _calculate_semantic_similarity(self, feature_id: int, llm_explainer: str) -> List[Dict]:
        """Calculate cosine similarity between this explainer and others.

        Args:
            feature_id: Feature ID
            llm_explainer: Current LLM explainer name

        Returns:
            List of {explainer, cosine_similarity} dicts
        """
        if self.explanation_embeddings_df is None or len(self.explanation_embeddings_df) == 0:
            return []

        feature_embeddings = self.explanation_embeddings_df.filter(
            pl.col("feature_id") == feature_id
        )

        if len(feature_embeddings) == 0:
            return []

        current_row = feature_embeddings.filter(pl.col("llm_explainer") == llm_explainer)
        if len(current_row) == 0:
            return []

        current_embedding = np.array(current_row["embedding"][0], dtype=np.float32)

        similarities = []
        for row in feature_embeddings.iter_rows(named=True):
            other_explainer = row["llm_explainer"]
            if other_explainer == llm_explainer:
                continue

            other_embedding = np.array(row["embedding"], dtype=np.float32)

            # Cosine similarity
            dot_product = np.dot(current_embedding, other_embedding)
            norm_current = np.linalg.norm(current_embedding)
            norm_other = np.linalg.norm(other_embedding)

            if norm_current == 0 or norm_other == 0:
                cosine_sim = 0.0
            else:
                cosine_sim = dot_product / (norm_current * norm_other)

            similarities.append({
                "explainer": other_explainer,
                "cosine_similarity": float(cosine_sim)
            })

        return similarities

    def _build_rows(self) -> List[Dict]:
        """Build flat rows by joining embeddings with scores."""
        rows = []

        if self.explanation_embeddings_df is None or len(self.explanation_embeddings_df) == 0:
            logger.warning("No explanation embeddings loaded")
            return rows

        if self.scores_df is None or len(self.scores_df) == 0:
            logger.warning("No scores loaded")
            return rows

        # Apply feature limit if specified
        embeddings_df = self.explanation_embeddings_df
        if self.feature_limit is not None:
            embeddings_df = embeddings_df.filter(pl.col("feature_id") < self.feature_limit)

        logger.info(f"Processing {embeddings_df['feature_id'].n_unique()} unique features")

        # Build scores lookup: (feature_id, data_source) -> score row
        scores_lookup = {}
        for score_row in self.scores_df.iter_rows(named=True):
            key = (score_row["feature_id"], score_row["data_source"])
            scores_lookup[key] = score_row

        logger.info(f"Built scores lookup with {len(scores_lookup)} entries")

        # Build rows by iterating through embeddings
        for row in tqdm(embeddings_df.iter_rows(named=True), desc="Building rows"):
            feature_id = row["feature_id"]
            data_source = row.get("data_source", "")
            llm_explainer = row["llm_explainer"]
            explanation_text = row.get("explanation_text", "")

            # Get pre-computed data
            decoder_sim = self.decoder_similarities.get(int(feature_id), [])
            first_merge_sim = self.first_merge_distances.get(int(feature_id))
            if first_merge_sim is not None:
                first_merge_sim = 1.0 - first_merge_sim  # Convert distance to similarity
            frac_nonzero = self.frac_nonzero.get(int(feature_id))

            # Look up scores by (feature_id, data_source)
            score_key = (feature_id, data_source)
            score_row = scores_lookup.get(score_key)

            if score_row is None:
                self.stats["missing_scores"] += 1
                continue

            # Calculate semantic similarity
            semantic_sim = self._calculate_semantic_similarity(int(feature_id), llm_explainer)

            # Extract scorer name from data_source (e.g., "llama_e-llama_s-16k-v2" -> "llama_s")
            llm_scorer = "unknown"
            if "-" in data_source:
                parts = data_source.split("-")
                if len(parts) >= 2:
                    llm_scorer = parts[1]  # e.g., "llama_s"

            row_data = {
                "feature_id": int(feature_id),
                "sae_id": self.sae_id,
                "explanation_method": "quantiles",
                "llm_explainer": llm_explainer,
                "llm_scorer": llm_scorer,
                "explanation_text": explanation_text,
                "semantic_similarity": semantic_sim,
                "score_fuzz": score_row.get("score_fuzz"),
                "score_simulation": None,  # Not in aggregated_scores.parquet
                "score_detection": score_row.get("score_detection"),
                "score_embedding": score_row.get("score_embedding"),
                "decoder_similarity": decoder_sim,
                "decoder_similarity_merge_threshold": first_merge_sim,
                "frac_nonzero": frac_nonzero
            }
            rows.append(row_data)

        self.stats["rows_created"] = len(rows)
        self.stats["features_processed"] = len(set(r["feature_id"] for r in rows))

        return rows

    def _build_nested_structure(self, flat_df: pl.DataFrame) -> pl.DataFrame:
        """Transform flat rows into nested structure."""
        logger.info("Creating nested scores structure...")

        primary_key = ["feature_id", "sae_id", "explanation_method", "llm_explainer"]

        # Create scorer_scores struct
        flat_df = flat_df.with_columns([
            pl.struct([
                pl.col("llm_scorer").alias("scorer"),
                pl.col("score_fuzz").alias("fuzz"),
                pl.col("score_simulation").alias("simulation"),
                pl.col("score_detection").alias("detection"),
                pl.col("score_embedding").alias("embedding")
            ]).alias("scorer_scores")
        ])

        # Group by primary key
        nested = flat_df.group_by(primary_key).agg([
            pl.col("explanation_text").first(),
            pl.col("decoder_similarity").first(),
            pl.col("decoder_similarity_merge_threshold").first(),
            pl.col("frac_nonzero").first(),
            pl.col("semantic_similarity").first(),
            pl.col("scorer_scores").alias("scores")
        ])

        # Convert decoder_similarity to proper nested type
        decoder_dtype = pl.List(pl.Struct([
            pl.Field("feature_id", pl.UInt32),
            pl.Field("cosine_similarity", pl.Float32)
        ]))

        nested = nested.with_columns([
            pl.col("decoder_similarity").map_elements(
                lambda x: [
                    {"feature_id": int(item["feature_id"]), "cosine_similarity": float(item["cosine_similarity"])}
                    for item in (x if x is not None else [])
                ],
                return_dtype=pl.List(pl.Struct([
                    pl.Field("feature_id", pl.Int64),
                    pl.Field("cosine_similarity", pl.Float64)
                ]))
            ).cast(decoder_dtype)
        ])

        # Convert semantic_similarity to proper nested type
        semantic_dtype = pl.List(pl.Struct([
            pl.Field("explainer", pl.Categorical),
            pl.Field("cosine_similarity", pl.Float32)
        ]))

        nested = nested.with_columns([
            pl.col("semantic_similarity").map_elements(
                lambda x: [
                    {"explainer": str(item["explainer"]), "cosine_similarity": float(item["cosine_similarity"])}
                    for item in (x if x is not None else [])
                ],
                return_dtype=pl.List(pl.Struct([
                    pl.Field("explainer", pl.Utf8),
                    pl.Field("cosine_similarity", pl.Float64)
                ]))
            ).cast(semantic_dtype)
        ])

        # Select final columns
        final_columns = primary_key + [
            "explanation_text",
            "decoder_similarity",
            "decoder_similarity_merge_threshold",
            "frac_nonzero",
            "semantic_similarity",
            "scores"
        ]
        nested = nested.select(final_columns)

        # Set categorical types
        nested = nested.with_columns([
            pl.col("sae_id").cast(pl.Categorical),
            pl.col("explanation_method").cast(pl.Categorical),
            pl.col("llm_explainer").cast(pl.Categorical)
        ])

        logger.info(f"Created nested structure with {len(nested)} rows")
        return nested

    def process(self) -> pl.DataFrame:
        """Execute the main processing logic.

        Returns:
            Processed DataFrame
        """
        # Load all data
        self._load_explanation_embeddings()
        self._load_scores()
        self._load_decoder_similarities()
        self._load_first_merge_distances()
        self._load_frac_nonzero()

        # Build flat rows
        rows = self._build_rows()

        if not rows:
            logger.warning("No rows created")
            return self._create_empty_dataframe()

        # Create DataFrame and nested structure
        flat_df = pl.DataFrame(rows)
        nested_df = self._build_nested_structure(flat_df)

        logger.info(f"Created features parquet with {len(nested_df)} rows")
        return nested_df

    def _create_empty_dataframe(self) -> pl.DataFrame:
        """Create empty DataFrame with correct schema."""
        schema = {
            "feature_id": pl.UInt32,
            "sae_id": pl.Categorical,
            "explanation_method": pl.Categorical,
            "llm_explainer": pl.Categorical,
            "explanation_text": pl.Utf8,
            "decoder_similarity": pl.List(pl.Struct([
                pl.Field("feature_id", pl.UInt32),
                pl.Field("cosine_similarity", pl.Float32)
            ])),
            "decoder_similarity_merge_threshold": pl.Float32,
            "frac_nonzero": pl.Float32,
            "semantic_similarity": pl.List(pl.Struct([
                pl.Field("explainer", pl.Categorical),
                pl.Field("cosine_similarity", pl.Float32)
            ])),
            "scores": pl.List(pl.Struct([
                pl.Field("scorer", pl.Utf8),
                pl.Field("fuzz", pl.Float32),
                pl.Field("simulation", pl.Float32),
                pl.Field("detection", pl.Float32),
                pl.Field("embedding", pl.Float32)
            ]))
        }
        return pl.DataFrame(schema=schema)


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Create main features parquet")
    parser.add_argument("--config", type=str, help="Path to configuration file")
    parser.add_argument("--limit", type=int, help="Limit number of features (for testing)")

    args = parser.parse_args()

    setup_logging()

    if args.config:
        full_config = load_yaml_config(args.config)
        # Extract step-specific config if present
        config = full_config.get("steps", {}).get("step_06_features", {})
        if not config:
            # Fallback: treat entire config as step config (legacy format)
            config = full_config
        config["sae_id"] = full_config.get("global", {}).get("sae_id_sanitized", "")
        config["global"] = full_config.get("global", {})
    else:
        config_path = Path(__file__).parent.parent / "config.yaml"
        if config_path.exists():
            full_config = load_yaml_config(config_path)
            config = full_config.get("steps", {}).get("step_06_features", {})
            config["sae_id"] = full_config.get("global", {}).get("sae_id_sanitized", "")
            config["global"] = full_config.get("global", {})
        else:
            config = {}

    processor = FeaturesProcessor(config, feature_limit=args.limit)
    processor.run()


if __name__ == "__main__":
    main()
