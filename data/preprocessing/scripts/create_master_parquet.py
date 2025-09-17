#!/usr/bin/env python3
"""
Create Master Parquet from Detailed JSON Files

This script processes detailed JSON files containing SAE feature analysis data
and creates a master parquet file with the specified schema for efficient querying.

Input: Detailed JSON files in data/detailed_json/
Output: Master parquet file following the feature_analysis schema

Usage:
    python create_master_parquet.py [--config CONFIG_FILE]
"""

import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import argparse
from datetime import datetime

import polars as pl


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class MasterParquetCreator:
    """Creates master parquet file from detailed JSON files."""

    def __init__(self, config: Dict):
        self.config = config
        self.detailed_json_dir = Path(config["detailed_json_directory"])
        self.output_path = Path(config["output_path"])
        self.sae_id_filter = config.get("sae_id_filter", None)

        # Ensure output directory exists
        self.output_path.parent.mkdir(parents=True, exist_ok=True)

    def process_all_features(self) -> pl.DataFrame:
        """Process all feature JSON files and return consolidated DataFrame."""
        all_rows = []
        processed_count = 0
        error_count = 0

        # Find all feature JSON files
        json_files = list(self.detailed_json_dir.rglob("feature_*.json"))
        logger.info(f"Found {len(json_files)} feature JSON files to process")

        for json_file in json_files:
            try:
                rows = self._process_single_feature(json_file)
                all_rows.extend(rows)
                processed_count += 1

                if processed_count % 100 == 0:
                    logger.info(f"Processed {processed_count}/{len(json_files)} files")

            except Exception as e:
                logger.error(f"Error processing {json_file}: {e}")
                error_count += 1

        logger.info(f"Processing complete: {processed_count} files processed, "
                   f"{error_count} errors, {len(all_rows)} total rows")

        # Convert to DataFrame with proper schema
        return self._create_dataframe(all_rows)

    def _process_single_feature(self, json_file: Path) -> List[Dict]:
        """Process a single feature JSON file and return rows for master table."""
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        # Extract basic feature information
        feature_id = data["feature_id"]
        sae_id = data["sae_id"]

        # Filter by SAE ID if specified
        if self.sae_id_filter and sae_id != self.sae_id_filter:
            return []

        # Calculate feature-level metrics
        feature_splitting = len(data["explanations"]) > 1
        semdist_mean, semdist_max = self._calculate_semantic_distances(
            data.get("semantic_distance_pairs", [])
        )

        # Create relative path for details_path
        try:
            # Try to make relative to current working directory
            details_path = str(json_file.relative_to(Path.cwd()))
        except ValueError:
            # If relative path fails, use absolute path
            details_path = str(json_file.absolute())

        rows = []

        # Create a row for each explanation-score combination
        for explanation in data["explanations"]:
            # Find matching score set by data_source
            matching_score = self._find_matching_score(
                explanation["data_source"],
                data.get("scores", [])
            )

            if matching_score is None:
                logger.warning(f"No matching score found for explanation {explanation['explanation_id']} "
                             f"in feature {feature_id}")
                continue

            row = {
                "feature_id": feature_id,
                "sae_id": sae_id,
                "explanation_method": explanation["explanation_method"],
                "llm_explainer": explanation["llm_explainer"],
                "llm_scorer": matching_score["llm_scorer"],
                "feature_splitting": feature_splitting,
                "semdist_mean": semdist_mean,
                "semdist_max": semdist_max,
                "score_fuzz": matching_score.get("score_fuzz"),
                "score_simulation": matching_score.get("score_simulation"),
                "score_detection": matching_score.get("score_detection"),
                "score_embedding": matching_score.get("score_embedding"),
                "details_path": details_path
            }
            rows.append(row)

        return rows

    def _calculate_semantic_distances(self, distance_pairs: List[Dict]) -> Tuple[Optional[float], Optional[float]]:
        """Calculate mean and max semantic distances from distance pairs."""
        if not distance_pairs:
            return None, None

        # Extract cosine distances (using cosine as primary metric)
        distances = [
            pair.get("cosine_distance")
            for pair in distance_pairs
            if pair.get("cosine_distance") is not None
        ]

        if not distances:
            return None, None

        return float(sum(distances) / len(distances)), float(max(distances))

    def _find_matching_score(self, data_source: str, scores: List[Dict]) -> Optional[Dict]:
        """Find score set matching the explanation's data_source."""
        for score in scores:
            if score.get("data_source") == data_source:
                return score
        return None

    def _create_dataframe(self, rows: List[Dict]) -> pl.DataFrame:
        """Create Polars DataFrame with proper schema."""
        if not rows:
            logger.warning("No rows to process, creating empty DataFrame")
            return self._create_empty_dataframe()

        # Create DataFrame
        df = pl.DataFrame(rows)

        # Apply proper data types according to schema
        df = df.with_columns([
            pl.col("feature_id").cast(pl.UInt32),
            pl.col("sae_id").cast(pl.Categorical),
            pl.col("explanation_method").cast(pl.Categorical),
            pl.col("llm_explainer").cast(pl.Categorical),
            pl.col("llm_scorer").cast(pl.Categorical),
            pl.col("feature_splitting").cast(pl.Boolean),
            pl.col("semdist_mean").cast(pl.Float32),
            pl.col("semdist_max").cast(pl.Float32),
            pl.col("score_fuzz").cast(pl.Float32),
            pl.col("score_simulation").cast(pl.Float32),
            pl.col("score_detection").cast(pl.Float32),
            pl.col("score_embedding").cast(pl.Float32),
            pl.col("details_path").cast(pl.Utf8)
        ])

        return df

    def _create_empty_dataframe(self) -> pl.DataFrame:
        """Create empty DataFrame with correct schema."""
        return pl.DataFrame(
            schema={
                "feature_id": pl.UInt32,
                "sae_id": pl.Categorical,
                "explanation_method": pl.Categorical,
                "llm_explainer": pl.Categorical,
                "llm_scorer": pl.Categorical,
                "feature_splitting": pl.Boolean,
                "semdist_mean": pl.Float32,
                "semdist_max": pl.Float32,
                "score_fuzz": pl.Float32,
                "score_simulation": pl.Float32,
                "score_detection": pl.Float32,
                "score_embedding": pl.Float32,
                "details_path": pl.Utf8
            }
        )

    def validate_output(self, df: pl.DataFrame) -> bool:
        """Validate the output DataFrame."""
        logger.info("Validating output DataFrame...")

        # Check basic constraints
        total_rows = len(df)
        unique_combinations = len(df.select([
            "feature_id", "sae_id", "explanation_method", "llm_explainer", "llm_scorer"
        ]).unique())

        logger.info(f"Total rows: {total_rows}")
        logger.info(f"Unique primary key combinations: {unique_combinations}")

        if total_rows != unique_combinations:
            logger.error(f"Primary key constraint violated: {total_rows} rows but "
                        f"{unique_combinations} unique combinations")
            return False

        # Check for expected row count (assuming 2 rows per feature)
        unique_features = len(df.select("feature_id").unique())
        expected_rows = unique_features * 2  # 2 explanations per feature

        logger.info(f"Unique features: {unique_features}")
        logger.info(f"Expected rows: {expected_rows}, Actual rows: {total_rows}")

        # Log value distributions
        logger.info("Value distributions:")
        logger.info(f"  SAE IDs: {df['sae_id'].value_counts().to_dict()}")
        logger.info(f"  Explanation methods: {df['explanation_method'].value_counts().to_dict()}")
        logger.info(f"  LLM explainers: {df['llm_explainer'].value_counts().shape[0]} unique")
        logger.info(f"  LLM scorers: {df['llm_scorer'].value_counts().to_dict()}")
        logger.info(f"  Feature splitting: {df['feature_splitting'].value_counts().to_dict()}")

        return True

    def save_parquet(self, df: pl.DataFrame) -> None:
        """Save DataFrame as parquet file."""
        logger.info(f"Saving parquet file to {self.output_path}")
        df.write_parquet(self.output_path)

        # Save metadata
        metadata = {
            "created_at": datetime.now().isoformat(),
            "total_rows": len(df),
            "total_features": len(df.select("feature_id").unique()),
            "schema_version": "1.0",
            "source_directory": str(self.detailed_json_dir),
            "config": self.config
        }

        metadata_path = self.output_path.with_suffix('.metadata.json')
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)

        logger.info(f"Metadata saved to {metadata_path}")
        logger.info(f"Master parquet creation complete: {len(df)} rows saved")


def load_config(config_path: Optional[str] = None) -> Dict:
    """Load configuration from file or use defaults."""
    default_config = {
        "detailed_json_directory": "data/detailed_json",
        "output_path": "data/master/feature_analysis.parquet",
        "sae_id_filter": None  # Process all SAE IDs by default
    }

    if config_path and Path(config_path).exists():
        logger.info(f"Loading config from {config_path}")
        with open(config_path, 'r') as f:
            file_config = json.load(f)
        default_config.update(file_config)
    else:
        logger.info("Using default configuration")

    return default_config


def main():
    """Main execution function."""
    parser = argparse.ArgumentParser(description="Create master parquet from detailed JSON files")
    parser.add_argument("--config", help="Path to configuration file")
    parser.add_argument("--validate-only", action="store_true",
                       help="Only validate existing parquet file")
    args = parser.parse_args()

    config = load_config(args.config)
    creator = MasterParquetCreator(config)

    if args.validate_only:
        # Load and validate existing file
        if not creator.output_path.exists():
            logger.error(f"Parquet file does not exist: {creator.output_path}")
            return 1

        logger.info(f"Loading existing parquet file: {creator.output_path}")
        df = pl.read_parquet(creator.output_path)
        creator.validate_output(df)
        return 0

    # Process all features
    logger.info("Starting master parquet creation...")
    df = creator.process_all_features()

    if len(df) == 0:
        logger.error("No data to save")
        return 1

    # Validate output
    if not creator.validate_output(df):
        logger.error("Validation failed")
        return 1

    # Save parquet file
    creator.save_parquet(df)

    logger.info("Master parquet creation completed successfully")
    return 0


if __name__ == "__main__":
    exit(main())