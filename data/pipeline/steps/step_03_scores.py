#!/usr/bin/env python3
"""
Step 3: Process Raw Scoring Metrics

This step processes raw scoring data from LLM scorers and generates
aggregated scores per feature.

Input:
- data/input/{data_source}/scores/{method}/layers.30_latent*.txt

Output:
- aggregated_scores.parquet: Aggregated scoring data

Features:
- Reads raw score files from data_sources in config
- Processes binary scores (fuzz, detection) → accuracy
- Processes embedding scores → AUC
- Outputs per-feature aggregated scores
"""

import json
import logging
import math
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import polars as pl
from tqdm import tqdm

try:
    from sklearn.metrics import roc_auc_score
except ImportError:
    roc_auc_score = None

# Enable string cache for categorical operations
pl.enable_string_cache()

# Add parent directory to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.base import BaseProcessor, load_yaml_config
from core.logging import setup_logging

logger = logging.getLogger(__name__)


class ScoresProcessor(BaseProcessor):
    """Process raw scoring data from LLM scorers."""

    @property
    def step_name(self) -> str:
        return "Step 3: Score Processing"

    @property
    def version(self) -> str:
        return "3.0"

    def _init_paths(self) -> None:
        """Initialize paths from configuration."""
        super()._init_paths()

        global_config = self.config.get("global", {})
        paths = global_config.get("paths", {})
        inputs = self.config.get("inputs", {})
        params = self.config.get("parameters", {})

        # Input: input data directory
        self.input_dir = self._resolve_path(
            inputs.get("raw_dir", paths.get("input", "data/input"))
        )

        # Data sources from global config (inputs reference is just for documentation)
        self.data_sources = global_config.get("data_sources", [])

        # Scoring methods from parameters
        self.scoring_methods = params.get("scoring_methods", ["fuzz", "detection", "embedding"])

        # Output path
        outputs = self.config.get("outputs", {})
        intermediate_dir = paths.get("intermediate", "data/intermediate")
        self.output_path = self._resolve_path(
            outputs.get("main", f"{intermediate_dir}/aggregated_scores.parquet")
        )

        # Statistics tracking
        self.stats = {
            "sources_processed": 0,
            "features_processed": 0,
            "total_scores": 0,
            "missing_files": 0,
            "processing_errors": 0
        }

    def _extract_feature_id(self, filename: str) -> Optional[int]:
        """Extract feature ID from filename (e.g., layers.30_latent123.txt -> 123)."""
        match = re.search(r'latent(\d+)\.txt$', filename)
        if match:
            return int(match.group(1))
        return None

    def _load_score_file(self, filepath: Path) -> Optional[List[Dict]]:
        """Load score data from JSON-formatted text file."""
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                return json.loads(content)
        except (json.JSONDecodeError, FileNotFoundError) as e:
            logger.debug(f"Error loading {filepath}: {e}")
            return None

    def _process_binary_scores(self, score_data: List[Dict]) -> Optional[float]:
        """Process binary scores (fuzz/detection) that have 'correct' field.

        Returns accuracy (proportion correct).
        """
        if not isinstance(score_data, list) or not score_data:
            return None

        correct_count = 0
        valid_count = 0

        for item in score_data:
            if isinstance(item, dict) and 'correct' in item:
                correct_value = item['correct']
                if isinstance(correct_value, bool):
                    valid_count += 1
                    if correct_value:
                        correct_count += 1

        if valid_count == 0:
            return None

        return correct_count / valid_count

    def _process_embedding_scores(self, score_data: List[Dict]) -> Optional[float]:
        """Process embedding scores using AUC.

        Uses similarity as prediction score and distance-based labels:
        - distance >= 0: activating (label = 1)
        - distance == -1: non-activating (label = 0)

        Returns AUC score.
        """
        if roc_auc_score is None:
            logger.warning("sklearn not available, skipping AUC calculation")
            return None

        if not isinstance(score_data, list) or not score_data:
            return None

        labels = []
        similarities = []

        for item in score_data:
            if isinstance(item, dict) and 'similarity' in item and 'distance' in item:
                try:
                    similarity = float(item['similarity'])
                    distance = float(item['distance'])

                    if math.isnan(similarity) or not math.isfinite(similarity):
                        continue

                    # Label: 1 for activating (distance >= 0), 0 for non-activating
                    label = 1 if distance >= 0 else 0
                    labels.append(label)
                    similarities.append(similarity)
                except (ValueError, TypeError):
                    continue

        if not labels or len(set(labels)) < 2:
            return None

        try:
            return roc_auc_score(labels, similarities)
        except Exception:
            return None

    def _get_score_files(self, data_source: str, method: str) -> List[Path]:
        """Get all score files for a specific scoring method."""
        method_dir = self.input_dir / data_source / "scores" / method
        if not method_dir.exists():
            return []

        files = list(method_dir.glob("layers.30_latent*.txt"))
        return sorted(files)

    def _process_data_source(self, data_source: str) -> Dict[int, Dict[str, Optional[float]]]:
        """Process all scores for a single data source.

        Returns:
            Dict mapping feature_id to scores dict
        """
        logger.info(f"Processing data source: {data_source}")

        scores_dir = self.input_dir / data_source / "scores"
        if not scores_dir.exists():
            logger.warning(f"Scores directory not found: {scores_dir}")
            return {}

        # Collect all feature IDs across all methods
        all_feature_ids = set()
        for method in self.scoring_methods:
            files = self._get_score_files(data_source, method)
            for filepath in files:
                feature_id = self._extract_feature_id(filepath.name)
                if feature_id is not None:
                    if self.feature_limit is None or feature_id < self.feature_limit:
                        all_feature_ids.add(feature_id)

        logger.info(f"  Found {len(all_feature_ids):,} features")

        # Process each feature
        feature_scores = {}
        for feature_id in all_feature_ids:
            scores = {}

            for method in self.scoring_methods:
                score_file = scores_dir / method / f"layers.30_latent{feature_id}.txt"

                if score_file.exists():
                    score_data = self._load_score_file(score_file)
                    if score_data:
                        if method in ("fuzz", "detection"):
                            scores[method] = self._process_binary_scores(score_data)
                        elif method == "embedding":
                            scores[method] = self._process_embedding_scores(score_data)
                    else:
                        scores[method] = None
                        self.stats["processing_errors"] += 1
                else:
                    scores[method] = None
                    self.stats["missing_files"] += 1

            feature_scores[feature_id] = scores

        return feature_scores

    def process(self) -> pl.DataFrame:
        """Execute the main processing logic.

        Returns:
            Processed DataFrame
        """
        rows = []

        for data_source in tqdm(self.data_sources, desc="Processing data sources"):
            feature_scores = self._process_data_source(data_source)

            if not feature_scores:
                continue

            self.stats["sources_processed"] += 1

            for feature_id, scores in feature_scores.items():
                row = {
                    "feature_id": feature_id,
                    "sae_id": self.sae_id,
                    "data_source": data_source,
                    "score_fuzz": scores.get("fuzz"),
                    "score_detection": scores.get("detection"),
                    "score_embedding": scores.get("embedding"),
                }
                rows.append(row)
                self.stats["total_scores"] += 1

        self.stats["features_processed"] = len(set(r["feature_id"] for r in rows))
        logger.info(f"Processed {len(rows):,} score entries for {self.stats['features_processed']:,} features")

        return self._create_dataframe(rows)

    def _create_dataframe(self, rows: List[Dict]) -> pl.DataFrame:
        """Create Polars DataFrame with proper schema."""
        logger.info("Creating DataFrame with proper schema")

        if not rows:
            logger.warning("No results to convert to DataFrame")
            return self._create_empty_dataframe()

        df = pl.DataFrame(rows)

        # Cast types
        df = df.with_columns([
            pl.col("feature_id").cast(pl.UInt32),
            pl.col("sae_id").cast(pl.Categorical),
            pl.col("data_source").cast(pl.Categorical),
            pl.col("score_fuzz").cast(pl.Float32),
            pl.col("score_detection").cast(pl.Float32),
            pl.col("score_embedding").cast(pl.Float32),
        ])

        logger.info(f"Created DataFrame with {len(df)} rows and {len(df.columns)} columns")
        return df

    def _create_empty_dataframe(self) -> pl.DataFrame:
        """Create empty DataFrame with correct schema."""
        schema = {
            "feature_id": pl.UInt32,
            "sae_id": pl.Categorical,
            "data_source": pl.Categorical,
            "score_fuzz": pl.Float32,
            "score_detection": pl.Float32,
            "score_embedding": pl.Float32,
        }
        return pl.DataFrame(schema=schema)


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Process raw scoring metrics")
    parser.add_argument("--config", type=str, help="Path to configuration file")
    parser.add_argument("--limit", type=int, help="Limit number of features (for testing)")

    args = parser.parse_args()

    setup_logging()

    if args.config:
        full_config = load_yaml_config(args.config)
        # Extract step-specific config if present
        config = full_config.get("steps", {}).get("step_03_scores", {})
        if not config:
            # Fallback: treat entire config as step config (legacy format)
            config = full_config
        config["sae_id"] = full_config.get("global", {}).get("sae_id_sanitized", "")
        config["global"] = full_config.get("global", {})
    else:
        config_path = Path(__file__).parent.parent / "config.yaml"
        if config_path.exists():
            full_config = load_yaml_config(config_path)
            config = full_config.get("steps", {}).get("step_03_scores", {})
            config["sae_id"] = full_config.get("global", {}).get("sae_id_sanitized", "")
            config["global"] = full_config.get("global", {})
        else:
            config = {}

    processor = ScoresProcessor(config, feature_limit=args.limit)
    processor.run()


if __name__ == "__main__":
    main()
