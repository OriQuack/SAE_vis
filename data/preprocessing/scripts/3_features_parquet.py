#!/usr/bin/env python3
"""
Create Features Parquet with Nested Structure (Version 2.1)

This script generates features.parquet with nested structures by loading data from
preprocessed directories and calculating semantic similarities on-the-fly from
explanation embeddings. This version eliminates the need for pre-computed semantic
similarity JSON files by computing pairwise cosine similarities directly.

Input Sources:
- data/embeddings/*/embeddings.json (explanation texts and metadata)
- data/scores/*/scores.json (scoring metrics from LLM scorers)
- data/master/explanation_embeddings.parquet (pre-computed explanation embeddings from script 2)
- data/feature_similarity/*/feature_similarities.json (decoder vector similarities)

Output:
- data/master/features.parquet (nested structure with 3 List(Struct) fields)
- data/master/features.parquet.metadata.json (processing metadata)

Key Changes in v2.1:
- Added configurable feature range processing (start/end)
- Enables processing subsets for testing, debugging, or parallel processing
- Range is inclusive of start, exclusive of end: [start, end)

Key Changes in v2.0:
- Removed dependency on semantic_similarities JSON files (script 3 output)
- Semantic similarities now calculated on-the-fly from explanation embeddings
- Schema changed: semsim_mean/semsim_max → semantic_similarity List(Struct)
- More flexible: can compare any pair of explainers without pre-computation

Usage:
    # Process all features
    python 3_features_parquet.py --config config/3_create_features_parquet.json

    # Process first 100 features (testing)
    python 3_features_parquet.py --config config/3_create_features_parquet_test.json

    # Or create custom config with feature_range:
    # "feature_range": {"start": 0, "end": 100}  # First 100 features
    # "feature_range": {"start": 100, "end": 200}  # Features 100-199
    # "feature_range": {"start": 500}  # All features from 500 onwards
    # "feature_range": {"end": 1000}  # All features up to 999
"""

import json
import logging
import argparse
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from collections import defaultdict

import numpy as np
import polars as pl


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class FeaturesParquetCreator:
    """Creates features.parquet with nested structure and on-the-fly semantic similarity calculation.

    Version 2.1 changes:
    - Added configurable feature range processing (start/end)
    - Enables subset processing for testing, debugging, or parallel processing

    Version 2.0 changes:
    - Loads explanation embeddings from parquet (script 2 output)
    - Calculates semantic similarities on-the-fly using numpy
    - Outputs nested List(Struct) fields for decoder_similarity, semantic_similarity, and scores
    """

    def __init__(self, config: Dict):
        self.config = config
        self.sae_id = config["sae_id"]

        # Feature range configuration (optional)
        self.feature_range_start = config.get("feature_range", {}).get("start", None)
        self.feature_range_end = config.get("feature_range", {}).get("end", None)

        if self.feature_range_start is not None or self.feature_range_end is not None:
            logger.info(f"Feature range configured: {self.feature_range_start} to {self.feature_range_end}")
        else:
            logger.info("Processing all features (no range specified)")

        # Resolve paths relative to project root
        self.project_root = self._find_project_root()
        logger.info(f"Project root: {self.project_root}")

        # Setup input directories
        input_paths = config["input_paths"]
        self.scores_dir = self.project_root / input_paths["scores_dir"]
        self.explanation_embeddings_path = self.project_root / input_paths["explanation_embeddings_path"]
        self.feature_similarity_dir = self.project_root / input_paths["feature_similarity_dir"]

        # Setup output paths
        output_files = config["output_files"]
        self.output_path = self.project_root / output_files["features_parquet"]
        self.metadata_path = self.project_root / output_files["metadata"]

        # Ensure output directory exists
        self.output_path.parent.mkdir(parents=True, exist_ok=True)

        # Load all data at initialization
        logger.info("Loading all preprocessed data...")
        self.scores_data = self._load_scores_data()

        # Load explanation embeddings parquet (from script 2) - contains text and embeddings
        logger.info("Loading explanation embeddings with text...")
        self.explanation_embeddings_df = self._load_explanation_embeddings()

        # Apply feature range filter if configured
        if self.feature_range_start is not None or self.feature_range_end is not None:
            self.explanation_embeddings_df = self._apply_feature_range_filter(self.explanation_embeddings_df)

        # Load decoder similarities (top 10 neighbors per feature)
        logger.info("Loading decoder similarities...")
        self.decoder_similarities = self._load_decoder_similarities()

        # Load first merge distances from clustering
        logger.info("Loading first merge distances from clustering...")
        self.first_merge_distances = self._load_first_merge_distances()

    def _find_project_root(self) -> Path:
        """Find the project root directory (interface)."""
        current = Path.cwd()
        while current.name != "interface" and current.parent != current:
            current = current.parent

        if current.name == "interface":
            return current
        else:
            # Fallback to current directory
            logger.warning("Could not find 'interface' directory, using current directory")
            return Path.cwd()

    def _sanitize_sae_id_for_path(self, sae_id: str) -> str:
        """Convert SAE ID to filesystem-safe directory name."""
        return sae_id.replace("/", "--")


    def _load_scores_data(self) -> Dict[str, Dict]:
        """Load all score files that match the given SAE ID."""
        scores_data = {}

        if not self.scores_dir.exists():
            logger.warning(f"Scores directory not found: {self.scores_dir}")
            return scores_data

        for data_source_dir in self.scores_dir.iterdir():
            if not data_source_dir.is_dir():
                continue

            scores_file = data_source_dir / "scores.json"
            if not scores_file.exists():
                continue

            try:
                with open(scores_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)

                # Check if this score file matches our SAE ID
                file_sae_id = data.get("metadata", {}).get("sae_id", "")
                if file_sae_id == self.sae_id:
                    scores_data[data_source_dir.name] = data
                    logger.info(f"Loaded scores from: {data_source_dir.name}")

            except (json.JSONDecodeError, FileNotFoundError) as e:
                logger.error(f"Error loading scores from {scores_file}: {e}")

        return scores_data

    def _load_explanation_embeddings(self) -> pl.DataFrame:
        """Load explanation embeddings parquet created by script 2.

        Returns:
            Polars DataFrame with columns: feature_id, sae_id, data_source, llm_explainer, explanation_text, embedding
        """
        if not self.explanation_embeddings_path.exists():
            logger.warning(f"Explanation embeddings not found: {self.explanation_embeddings_path}")
            logger.warning("Please run script 2 first: python 2_ex_embeddings.py")
            return pl.DataFrame()

        df = pl.read_parquet(self.explanation_embeddings_path)
        logger.info(f"Loaded {len(df)} explanation embeddings with text")
        logger.info(f"Columns: {df.columns}")
        return df

    def _apply_feature_range_filter(self, df: pl.DataFrame) -> pl.DataFrame:
        """Filter explanation embeddings by feature range.

        Args:
            df: Input DataFrame with feature_id column

        Returns:
            Filtered DataFrame containing only features in the specified range
        """
        if len(df) == 0:
            return df

        original_count = len(df)
        unique_features_before = df["feature_id"].n_unique()

        # Build filter expression
        filter_expr = None

        if self.feature_range_start is not None and self.feature_range_end is not None:
            filter_expr = (pl.col("feature_id") >= self.feature_range_start) & (pl.col("feature_id") < self.feature_range_end)
            logger.info(f"Filtering features: {self.feature_range_start} <= feature_id < {self.feature_range_end}")
        elif self.feature_range_start is not None:
            filter_expr = pl.col("feature_id") >= self.feature_range_start
            logger.info(f"Filtering features: feature_id >= {self.feature_range_start}")
        elif self.feature_range_end is not None:
            filter_expr = pl.col("feature_id") < self.feature_range_end
            logger.info(f"Filtering features: feature_id < {self.feature_range_end}")

        if filter_expr is not None:
            df = df.filter(filter_expr)

        unique_features_after = df["feature_id"].n_unique()
        logger.info(f"Feature range filter applied: {original_count} rows -> {len(df)} rows")
        logger.info(f"Unique features: {unique_features_before} -> {unique_features_after}")

        return df

    def _load_decoder_similarities(self) -> Dict[int, List[Dict]]:
        """
        Load decoder similarities and return top 10 neighbors per feature.

        Returns:
            Dict mapping feature_id to list of top 10 neighbor dicts (sorted descending by similarity)
            {0: [{'feature_id': 1143, 'cosine_similarity': 0.2452}, ...]}
        """
        similarities = {}

        sae_dir_name = self._sanitize_sae_id_for_path(self.sae_id)
        similarity_dir = self.feature_similarity_dir / sae_dir_name
        similarity_file = similarity_dir / "feature_similarities.json"

        if similarity_file.exists():
            try:
                with open(similarity_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)

                for feature_mapping in data.get("feature_mappings", []):
                    feature_id = feature_mapping.get("source_feature_id")
                    top_10 = feature_mapping.get("top_10_neighbors", [])

                    if feature_id is not None and top_10:
                        # Sort descending and remove rank field
                        top_10_sorted = sorted(top_10, key=lambda x: x.get("cosine_similarity", 0), reverse=True)

                        similarities[feature_id] = [
                            {
                                "feature_id": neighbor["feature_id"],
                                "cosine_similarity": float(neighbor["cosine_similarity"])
                            }
                            for neighbor in top_10_sorted[:10]
                        ]

                logger.info(f"Loaded decoder similarity for {len(similarities)} features")
            except Exception as e:
                logger.warning(f"Error loading decoder similarities: {e}")

        return similarities

    def _get_decoder_similarity(self, feature_id: int) -> List[Dict]:
        """Get top 10 decoder similarities (sorted descending)."""
        return self.decoder_similarities.get(feature_id, [])

    def _load_first_merge_distances(self) -> Dict[int, float]:
        """
        Load first merge distances from clustering parquet.

        Returns:
            Dict mapping feature_id to first_merge_distance
            {0: 0.754854, 1: 0.557611, ...}
        """
        first_merge_distances = {}

        sae_dir_name = self._sanitize_sae_id_for_path(self.sae_id)
        clustering_dir = self.feature_similarity_dir / sae_dir_name
        clustering_file = clustering_dir / "first_merge_clustering.parquet"

        if clustering_file.exists():
            try:
                df = pl.read_parquet(clustering_file)

                # Convert to dictionary for fast lookup
                for row in df.iter_rows(named=True):
                    feature_id = row["feature_id"]
                    first_merge_distance = row["first_merge_distance"]
                    first_merge_distances[int(feature_id)] = float(first_merge_distance)

                logger.info(f"Loaded first merge distances for {len(first_merge_distances)} features")
            except Exception as e:
                logger.warning(f"Error loading first merge distances: {e}")
        else:
            logger.warning(f"First merge clustering file not found: {clustering_file}")

        return first_merge_distances

    def _get_first_merge_distance(self, feature_id: int) -> Optional[float]:
        """
        Get first merge distance for a feature, converted to similarity.

        Returns:
            1 - distance (similarity: 1 = very similar, 0 = very different)
        """
        distance = self.first_merge_distances.get(feature_id, None)
        if distance is not None:
            return 1.0 - distance
        return None

    def _get_explainer_from_data_source(self, data_source: str) -> str:
        """Extract explainer prefix from data_source name (e.g., 'llama_e-llama_s' -> 'llama_e')."""
        if "_e-" in data_source:
            return data_source.split("_e-")[0] + "_e"
        return data_source

    def _get_scorer_from_data_source(self, data_source: str) -> str:
        """Extract scorer prefix from data_source name (e.g., 'llama_e-llama_s' -> 'llama_s')."""
        if "_e-" in data_source and "_s" in data_source:
            return data_source.split("_e-")[1]
        return data_source

    def _calculate_semantic_similarity_list(
        self,
        feature_id: int,
        llm_explainer: str
    ) -> List[Dict]:
        """
        Calculate cosine similarity between this explainer and all other explainers for a feature.

        Args:
            feature_id: Feature ID
            llm_explainer: Current LLM explainer name

        Returns:
            List of {"explainer": name, "cosine_similarity": value} for other explainers
        """
        if len(self.explanation_embeddings_df) == 0:
            return []

        # Get all embeddings for this feature
        feature_embeddings = self.explanation_embeddings_df.filter(
            pl.col("feature_id") == feature_id
        )

        if len(feature_embeddings) == 0:
            return []

        # Get current explainer's embedding
        current_row = feature_embeddings.filter(
            pl.col("llm_explainer") == llm_explainer
        )

        if len(current_row) == 0:
            return []

        current_embedding = np.array(current_row["embedding"][0], dtype=np.float32)

        # Calculate similarity with other explainers
        similarities = []

        for row in feature_embeddings.iter_rows(named=True):
            other_explainer = row["llm_explainer"]

            if other_explainer == llm_explainer:
                continue  # Skip self-comparison

            other_embedding = np.array(row["embedding"], dtype=np.float32)

            # Calculate cosine similarity
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

    def _build_flat_rows(self) -> pl.DataFrame:
        """
        Build flat rows from explanation embeddings parquet.
        One row per (feature_id, explainer, scorer) combination.
        """
        rows = []

        if len(self.explanation_embeddings_df) == 0:
            logger.warning("No explanation embeddings loaded")
            return pl.DataFrame()

        # Get unique feature IDs from parquet
        unique_features = sorted(self.explanation_embeddings_df["feature_id"].unique().to_list())
        logger.info(f"Processing {len(unique_features)} unique features")

        # Track processed count
        processed_count = 0

        # Iterate through parquet rows
        for row in self.explanation_embeddings_df.iter_rows(named=True):
            feature_id = row["feature_id"]
            data_source = row["data_source"]
            llm_explainer = row["llm_explainer"]
            explanation_text = row["explanation_text"]

            # Get decoder similarity once per feature (cached in dict)
            decoder_sim = self._get_decoder_similarity(int(feature_id))

            # Get first merge similarity (converted from distance: 1 - distance)
            # Higher values = feature is more similar to its neighbors
            first_merge_similarity = self._get_first_merge_distance(int(feature_id))

            # Get explainer prefix for matching with scorers
            explainer_prefix = self._get_explainer_from_data_source(data_source)

            # Default explanation method (same for all in this dataset)
            explanation_method = "quantiles"

            # Match with scores for this explainer
            for score_data_source, score_data in self.scores_data.items():
                # Check if this scorer evaluated this explainer
                if not score_data_source.startswith(explainer_prefix):
                    continue

                latent_scores = score_data.get("latent_scores", {})
                feature_id_str = str(feature_id)
                if feature_id_str not in latent_scores:
                    continue

                score_info = latent_scores[feature_id_str]
                # Get llm_scorer from metadata
                metadata = score_data.get("metadata", {})
                llm_scorer = metadata.get("llm_scorer", "unknown")

                # Extract scores
                score_fuzz = score_info.get("fuzz", {}).get("average_score")
                score_simulation = score_info.get("simulation", {}).get("average_score")
                score_detection = score_info.get("detection", {}).get("average_score")
                score_embedding = score_info.get("embedding", {}).get("average_score")

                # Calculate semantic similarity list for this explainer
                semantic_sim_list = self._calculate_semantic_similarity_list(
                    int(feature_id),
                    llm_explainer
                )

                row_data = {
                    "feature_id": int(feature_id),
                    "sae_id": self.sae_id,
                    "explanation_method": explanation_method,
                    "llm_explainer": llm_explainer,
                    "llm_scorer": llm_scorer,
                    "explanation_text": explanation_text,
                    "semantic_similarity": semantic_sim_list,
                    "score_fuzz": score_fuzz,
                    "score_simulation": score_simulation,
                    "score_detection": score_detection,
                    "score_embedding": score_embedding,
                    "decoder_similarity": decoder_sim,
                    "decoder_similarity_merge_threshold": first_merge_similarity
                }
                rows.append(row_data)

            processed_count += 1
            if processed_count % 100 == 0:
                logger.info(f"Processed {processed_count}/{len(self.explanation_embeddings_df)} explanation rows")

        logger.info(f"Built {len(rows)} flat rows from {len(self.explanation_embeddings_df)} explanation embeddings")
        return pl.DataFrame(rows)

    def _build_nested_structure(self, flat_df: pl.DataFrame) -> pl.DataFrame:
        """
        Transform flat rows into nested structure.
        Group by (feature_id, sae_id, explanation_method, llm_explainer) and nest scores.
        """
        logger.info("Creating nested scores structure...")

        # Primary key columns
        primary_key = ["feature_id", "sae_id", "explanation_method", "llm_explainer"]

        # Step 1: Create scorer_scores struct for each row
        logger.info("Aggregating scores by primary key...")
        flat_df = flat_df.with_columns([
            pl.struct([
                pl.col("llm_scorer").alias("scorer"),
                pl.col("score_fuzz").alias("fuzz"),
                pl.col("score_simulation").alias("simulation"),
                pl.col("score_detection").alias("detection"),
                pl.col("score_embedding").alias("embedding")
            ]).alias("scorer_scores")
        ])

        # Step 2: Group by primary key and aggregate
        nested = flat_df.group_by(primary_key).agg([
            pl.col("explanation_text").first(),
            pl.col("decoder_similarity").first(),
            pl.col("decoder_similarity_merge_threshold").first(),
            pl.col("semantic_similarity").first(),  # NEW: List of pairwise similarities
            pl.col("scorer_scores").alias("scores")  # This is now List(Struct)
        ])

        # Step 3: Convert decoder_similarity to proper Polars nested type
        logger.info("Converting decoder_similarity to proper nested type...")
        decoder_dtype = pl.List(pl.Struct([
            pl.Field("feature_id", pl.UInt32),
            pl.Field("cosine_similarity", pl.Float32)
        ]))

        nested = nested.with_columns([
            pl.col("decoder_similarity").map_elements(
                lambda x: [
                    {"feature_id": int(item["feature_id"]),
                     "cosine_similarity": float(item["cosine_similarity"])}
                    for item in (x if x is not None else [])
                ],
                return_dtype=pl.List(pl.Struct([
                    pl.Field("feature_id", pl.Int64),
                    pl.Field("cosine_similarity", pl.Float64)
                ]))
            ).cast(decoder_dtype)
        ])

        # Step 4: Convert semantic_similarity to proper Polars nested type
        logger.info("Converting semantic_similarity to proper nested type...")
        semantic_dtype = pl.List(pl.Struct([
            pl.Field("explainer", pl.Categorical),
            pl.Field("cosine_similarity", pl.Float32)
        ]))

        nested = nested.with_columns([
            pl.col("semantic_similarity").map_elements(
                lambda x: [
                    {"explainer": str(item["explainer"]),
                     "cosine_similarity": float(item["cosine_similarity"])}
                    for item in (x if x is not None else [])
                ],
                return_dtype=pl.List(pl.Struct([
                    pl.Field("explainer", pl.Utf8),
                    pl.Field("cosine_similarity", pl.Float64)
                ]))
            ).cast(semantic_dtype)
        ])

        # Step 5: Select final columns in desired order
        final_columns = primary_key + [
            "explanation_text",
            "decoder_similarity",
            "decoder_similarity_merge_threshold",
            "semantic_similarity",  # NEW: Replaces semsim_mean/max
            "scores"
        ]
        nested = nested.select(final_columns)

        # Step 6: Set proper categorical types
        nested = nested.with_columns([
            pl.col("sae_id").cast(pl.Categorical),
            pl.col("explanation_method").cast(pl.Categorical),
            pl.col("llm_explainer").cast(pl.Categorical)
        ])

        logger.info(f"Restructuring complete: {len(nested)} rows, {len(nested.columns)} columns")
        return nested

    def create_features_parquet(self) -> pl.DataFrame:
        """Main method to create features.parquet."""
        logger.info("Starting features parquet creation...")

        # Step 1: Build flat rows from all data sources
        flat_df = self._build_flat_rows()

        # Step 2: Transform to nested structure
        nested_df = self._build_nested_structure(flat_df)

        # Step 3: Validate output
        self._validate_output(nested_df)

        # Step 4: Save to parquet
        logger.info(f"Saving parquet file to {self.output_path}")
        nested_df.write_parquet(self.output_path)

        # Step 5: Save metadata
        self.save_metadata(nested_df)

        logger.info(f"Features parquet creation complete: {len(nested_df)} rows saved")
        return nested_df

    def _validate_output(self, df: pl.DataFrame):
        """Validate the output DataFrame."""
        logger.info("Validating output DataFrame...")
        logger.info(f"Total rows: {len(df)}")
        logger.info(f"Unique features: {df['feature_id'].n_unique()}")
        logger.info(f"Value distributions:")
        logger.info(f"  SAE IDs: {df['sae_id'].n_unique()} unique")
        logger.info(f"  Explanation methods: {df['explanation_method'].n_unique()} unique")
        logger.info(f"  LLM explainers: {df['llm_explainer'].n_unique()} unique")

        # Sample the scores structure
        logger.info("\nSample scores structure (first row):")
        if len(df) > 0:
            first_row = df.row(0, named=True)
            scores = first_row["scores"]
            if scores:
                logger.info(f"  Number of scorers: {len(scores)}")
                logger.info(f"  Scorer names: {[s['scorer'] for s in scores]}")
                logger.info(f"  First scorer structure: {scores[0]}")

        # Sample the decoder_similarity structure
        logger.info("\nSample decoder_similarity structure (first row):")
        if len(df) > 0:
            first_row = df.row(0, named=True)
            decoder_sim = first_row["decoder_similarity"]
            if decoder_sim:
                logger.info(f"  Number of similar features: {len(decoder_sim)}")
                logger.info(f"  Top 3 similar: {decoder_sim[:3]}")
                # Verify descending order
                sims = [s["cosine_similarity"] for s in decoder_sim]
                is_sorted = all(sims[i] >= sims[i+1] for i in range(len(sims)-1))
                logger.info(f"  Sorted descending: {is_sorted}")

        # Sample the semantic_similarity structure
        logger.info("\nSample semantic_similarity structure (first row):")
        if len(df) > 0:
            first_row = df.row(0, named=True)
            semantic_sim = first_row["semantic_similarity"]
            if semantic_sim:
                logger.info(f"  Number of compared explainers: {len(semantic_sim)}")
                logger.info(f"  Comparisons: {semantic_sim}")

    def save_metadata(self, df: pl.DataFrame):
        """Save metadata file with processing information."""
        metadata = {
            "created_at": datetime.now().isoformat(),
            "script_version": "2.1",
            "sae_id": self.sae_id,
            "total_rows": len(df),
            "unique_features": df["feature_id"].n_unique(),
            "feature_range": {
                "start": self.feature_range_start,
                "end": self.feature_range_end,
                "enabled": self.feature_range_start is not None or self.feature_range_end is not None
            },
            "schema": {
                "feature_id": str(df["feature_id"].dtype),
                "sae_id": str(df["sae_id"].dtype),
                "explanation_method": str(df["explanation_method"].dtype),
                "llm_explainer": str(df["llm_explainer"].dtype),
                "explanation_text": str(df["explanation_text"].dtype),
                "decoder_similarity": "List(Struct([Field('feature_id', UInt32), Field('cosine_similarity', Float32)]))",
                "decoder_similarity_merge_threshold": f"{df['decoder_similarity_merge_threshold'].dtype} - Similarity threshold when feature first merges in agglomerative clustering (1 - distance). Higher = more similar to neighbors.",
                "semantic_similarity": "List(Struct([Field('explainer', Categorical), Field('cosine_similarity', Float32)]))",
                "scores": "List(Struct([Field('scorer', Utf8), Field('fuzz', Float32), Field('simulation', Float32), Field('detection', Float32), Field('embedding', Float32)]))"
            },
            "processing_stats": {
                "unique_llm_explainers": df["llm_explainer"].n_unique(),
                "features_with_decoder_similarity": len([v for v in self.decoder_similarities.values() if v]),
                "features_with_merge_threshold": len(self.first_merge_distances),
                "explanation_embeddings_loaded": len(self.explanation_embeddings_df),
                "scores_sources_loaded": len(self.scores_data)
            },
            "config_used": {
                "input_paths": self.config["input_paths"],
                "output_files": self.config["output_files"],
                "sae_id": self.sae_id,
                "feature_range": self.config.get("feature_range")
            },
            "schema_notes": {
                "semantic_similarity": "Pairwise cosine similarities between this explainer and all other explainers for the same feature, calculated directly from explanation embeddings. Replaces deprecated semsim_mean and semsim_max fields.",
                "decoder_similarity": "Cosine similarities between this feature's decoder vector and all other features",
                "scores": "Evaluation scores from all LLM scorers for this explanation"
            }
        }

        with open(self.metadata_path, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=2)

        logger.info(f"Metadata saved to {self.metadata_path}")


def load_config(config_path: str) -> Dict:
    """Load configuration from JSON file."""
    config_path = Path(config_path)

    if not config_path.is_absolute():
        # Try relative to current directory first
        if not config_path.exists():
            # Try relative to script directory
            script_dir = Path(__file__).parent
            config_path = script_dir.parent / config_path

    if not config_path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")

    with open(config_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def main():
    parser = argparse.ArgumentParser(description="Create features.parquet directly from preprocessed directories")
    parser.add_argument(
        "--config",
        type=str,
        default="config/5_features_parquet_config.json",
        help="Path to configuration file"
    )

    args = parser.parse_args()

    try:
        # Load configuration
        logger.info(f"Loading config from {args.config}")
        config = load_config(args.config)

        # Create instance and generate parquet
        creator = FeaturesParquetCreator(config)
        df = creator.create_features_parquet()

        logger.info("Features parquet creation completed successfully")
        return 0

    except Exception as e:
        logger.error(f"Error creating features parquet: {e}", exc_info=True)
        return 1


if __name__ == "__main__":
    exit(main())
