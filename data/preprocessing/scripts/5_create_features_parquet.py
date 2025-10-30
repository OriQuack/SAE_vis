#!/usr/bin/env python3
"""
Create Features Parquet Directly from Preprocessed Directories

This script generates features.parquet with nested scores structure by loading
data directly from preprocessed directories (embeddings, scores, semantic_similarities).
It combines the data loading approach from the deprecated script with the nested
structure and decoder_similarity feature from the current implementation.

Input Sources:
- data/embeddings/*/embeddings.json (explanations and metadata)
- data/scores/*/scores.json (scoring metrics)
- data/semantic_similarities/*/semantic_similarities.json (pairwise similarities)
- data/feature_similarity/*/feature_similarities.json (decoder similarities)

Output:
- data/master/features.parquet (nested structure, 2,471 rows)
- data/master/features.parquet.metadata.json (processing metadata)

Usage:
    python 5_create_features_parquet.py --config config/5_features_parquet_config.json
"""

import json
import logging
import argparse
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from collections import defaultdict

import polars as pl


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class FeaturesParquetCreator:
    """Creates features.parquet directly from preprocessed data directories."""

    def __init__(self, config: Dict):
        self.config = config
        self.sae_id = config["sae_id"]

        # Resolve paths relative to project root
        self.project_root = self._find_project_root()
        logger.info(f"Project root: {self.project_root}")

        # Setup input directories
        input_paths = config["input_paths"]
        self.embeddings_dir = self.project_root / input_paths["embeddings_dir"]
        self.scores_dir = self.project_root / input_paths["scores_dir"]
        self.similarities_dir = self.project_root / input_paths["semantic_similarities_dir"]
        self.feature_similarity_dir = self.project_root / input_paths["feature_similarity_dir"]

        # Setup output paths
        output_files = config["output_files"]
        self.output_path = self.project_root / output_files["features_parquet"]
        self.metadata_path = self.project_root / output_files["metadata"]

        # Ensure output directory exists
        self.output_path.parent.mkdir(parents=True, exist_ok=True)

        # Load all data at initialization
        logger.info("Loading all preprocessed data...")
        self.embeddings_data = self._load_embeddings_data()
        self.scores_data = self._load_scores_data()
        self.similarities_data = self._load_semantic_similarities_data()

        # Load decoder similarities (top 10 neighbors per feature)
        logger.info("Loading decoder similarities...")
        self.decoder_similarities = self._load_decoder_similarities()

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

    def _load_embeddings_data(self) -> Dict[str, Dict]:
        """Load all embedding files that match the given SAE ID."""
        embeddings_data = {}

        if not self.embeddings_dir.exists():
            logger.warning(f"Embeddings directory not found: {self.embeddings_dir}")
            return embeddings_data

        for data_source_dir in self.embeddings_dir.iterdir():
            if not data_source_dir.is_dir():
                continue

            embeddings_file = data_source_dir / "embeddings.json"
            if not embeddings_file.exists():
                continue

            try:
                with open(embeddings_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)

                # Check if this embedding file matches our SAE ID
                file_sae_id = data.get("metadata", {}).get("sae_id", "")
                if file_sae_id == self.sae_id:
                    embeddings_data[data_source_dir.name] = data
                    logger.info(f"Loaded embeddings from: {data_source_dir.name}")

            except (json.JSONDecodeError, FileNotFoundError) as e:
                logger.error(f"Error loading embeddings from {embeddings_file}: {e}")

        return embeddings_data

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

    def _load_semantic_similarities_data(self) -> Dict[str, Dict]:
        """Load all semantic similarity files that match the given SAE ID."""
        similarities_data = {}

        if not self.similarities_dir.exists():
            logger.warning(f"Semantic similarities directory not found: {self.similarities_dir}")
            return similarities_data

        for comparison_dir in self.similarities_dir.iterdir():
            if not comparison_dir.is_dir():
                continue

            similarities_file = comparison_dir / "semantic_similarities.json"
            if not similarities_file.exists():
                continue

            try:
                with open(similarities_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)

                # Check if this similarity file matches our SAE ID
                metadata = data.get("metadata", {})
                file_sae_id_1 = metadata.get("sae_id_1", "")
                file_sae_id_2 = metadata.get("sae_id_2", "")
                file_sae_id_3 = metadata.get("sae_id_3", "")

                # Match if all SAE IDs present match our target SAE ID
                sae_ids = [file_sae_id_1, file_sae_id_2, file_sae_id_3]
                sae_ids = [sid for sid in sae_ids if sid]  # Remove empty strings

                if sae_ids and all(sid == self.sae_id for sid in sae_ids):
                    similarities_data[comparison_dir.name] = data
                    logger.info(f"Loaded semantic similarities from: {comparison_dir.name}")

            except (json.JSONDecodeError, FileNotFoundError) as e:
                logger.error(f"Error loading similarities from {similarities_file}: {e}")

        return similarities_data

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

    def _calculate_semantic_similarity_stats(self, feature_id: str) -> Tuple[Optional[float], Optional[float]]:
        """
        Calculate mean and max semantic similarity for a feature.

        Returns:
            Tuple of (semsim_mean, semsim_max)
        """
        cosine_similarities = []

        for comparison_name, data in self.similarities_data.items():
            pairwise_similarities = data.get("pairwise_similarities", {})

            if pairwise_similarities:
                for pair_name, pair_data in pairwise_similarities.items():
                    pair_similarities = pair_data.get("similarities", {})
                    if feature_id in pair_similarities:
                        similarity_info = pair_similarities[feature_id]
                        similarities_dict = similarity_info.get("similarities", {})
                        cosine_sim = similarities_dict.get("cosine")
                        if cosine_sim is not None:
                            cosine_similarities.append(float(cosine_sim))

        if cosine_similarities:
            return (
                sum(cosine_similarities) / len(cosine_similarities),  # mean
                max(cosine_similarities)  # max
            )
        else:
            return (None, None)

    def _build_flat_rows(self) -> pl.DataFrame:
        """
        Build flat rows from all data sources.
        One row per (feature_id, explainer, scorer) combination.
        """
        rows = []

        # Get all unique feature IDs from embeddings
        all_feature_ids = set()
        for data_source, data in self.embeddings_data.items():
            embeddings = data.get("embeddings", {})
            all_feature_ids.update(embeddings.keys())

        all_feature_ids = sorted(all_feature_ids, key=int)
        logger.info(f"Processing {len(all_feature_ids)} unique features")

        # Process each feature
        for idx, feature_id in enumerate(all_feature_ids):
            if (idx + 1) % 100 == 0:
                logger.info(f"Processed {idx + 1}/{len(all_feature_ids)} features")

            # Calculate semantic similarities once per feature
            semsim_mean, semsim_max = self._calculate_semantic_similarity_stats(feature_id)

            # Get decoder similarity once per feature
            decoder_sim = self._get_decoder_similarity(int(feature_id))

            # Iterate through all explainers for this feature
            for emb_data_source, emb_data in self.embeddings_data.items():
                embeddings = emb_data.get("embeddings", {})
                if feature_id not in embeddings:
                    continue

                embedding_info = embeddings[feature_id]
                config = emb_data.get("metadata", {}).get("config_used", {})

                explanation_text = embedding_info.get("explanation", "")
                explanation_method = config.get("explanation_method", "unknown")
                llm_explainer = config.get("llm_explainer", "unknown")
                explainer_prefix = self._get_explainer_from_data_source(emb_data_source)

                # Iterate through all scorers for this explainer
                for score_data_source, score_data in self.scores_data.items():
                    # Check if this scorer evaluated this explainer
                    if not score_data_source.startswith(explainer_prefix):
                        continue

                    latent_scores = score_data.get("latent_scores", {})
                    if feature_id not in latent_scores:
                        continue

                    score_info = latent_scores[feature_id]
                    # Get llm_scorer from metadata (top level, not config_used)
                    metadata = score_data.get("metadata", {})
                    llm_scorer = metadata.get("llm_scorer", "unknown")

                    # Extract scores
                    score_fuzz = score_info.get("fuzz", {}).get("average_score")
                    score_simulation = score_info.get("simulation", {}).get("average_score")
                    score_detection = score_info.get("detection", {}).get("average_score")
                    score_embedding = score_info.get("embedding", {}).get("average_score")

                    row = {
                        "feature_id": int(feature_id),
                        "sae_id": self.sae_id,
                        "explanation_method": explanation_method,
                        "llm_explainer": llm_explainer,
                        "llm_scorer": llm_scorer,
                        "explanation_text": explanation_text,
                        "semsim_mean": semsim_mean,
                        "semsim_max": semsim_max,
                        "score_fuzz": score_fuzz,
                        "score_simulation": score_simulation,
                        "score_detection": score_detection,
                        "score_embedding": score_embedding,
                        "decoder_similarity": decoder_sim  # Temporary as list
                    }
                    rows.append(row)

        logger.info(f"Built {len(rows)} flat rows")
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
            pl.col("semsim_mean").first(),
            pl.col("semsim_max").first(),
            pl.col("scorer_scores").alias("scores")  # This is now List(Struct)
        ])

        # Step 3: Convert decoder_similarity to proper Polars nested type
        logger.info("Converting decoder_similarity to proper nested type...")
        target_dtype = pl.List(pl.Struct([
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
            ).cast(target_dtype)
        ])

        # Step 4: Select final columns in desired order
        final_columns = primary_key + [
            "explanation_text",
            "decoder_similarity",
            "semsim_mean",
            "semsim_max",
            "scores"
        ]
        nested = nested.select(final_columns)

        # Step 5: Set proper categorical types
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

    def save_metadata(self, df: pl.DataFrame):
        """Save metadata file with processing information."""
        metadata = {
            "created_at": datetime.now().isoformat(),
            "script_version": "1.0",
            "sae_id": self.sae_id,
            "total_rows": len(df),
            "unique_features": df["feature_id"].n_unique(),
            "schema": {
                "feature_id": str(df["feature_id"].dtype),
                "sae_id": str(df["sae_id"].dtype),
                "explanation_method": str(df["explanation_method"].dtype),
                "llm_explainer": str(df["llm_explainer"].dtype),
                "explanation_text": str(df["explanation_text"].dtype),
                "decoder_similarity": "List(Struct([Field('feature_id', UInt32), Field('cosine_similarity', Float32)]))",
                "semsim_mean": str(df["semsim_mean"].dtype),
                "semsim_max": str(df["semsim_max"].dtype),
                "scores": "List(Struct([Field('scorer', Utf8), Field('fuzz', Float32), Field('simulation', Float32), Field('detection', Float32), Field('embedding', Float32)]))"
            },
            "processing_stats": {
                "unique_llm_explainers": df["llm_explainer"].n_unique(),
                "features_with_decoder_similarity": len([v for v in self.decoder_similarities.values() if v]),
                "embeddings_sources_loaded": len(self.embeddings_data),
                "scores_sources_loaded": len(self.scores_data),
                "similarities_sources_loaded": len(self.similarities_data)
            },
            "config_used": {
                "input_paths": self.config["input_paths"],
                "output_files": self.config["output_files"],
                "sae_id": self.sae_id
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
