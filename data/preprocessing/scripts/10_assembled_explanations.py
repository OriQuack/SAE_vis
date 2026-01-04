#!/usr/bin/env python3
"""
Assembled Explanations Generator: Combines thematic codes from multiple explainers.

For each feature, selects codes based on score semantics:
- Token-level codes: From explainer with highest FUZZ score
- Context-level codes: From explainer with highest DETECTION score

This allows generating explanations that combine the best aspects of multiple
LLM explainers based on their scoring performance.

Input:
- features.parquet: Scores per (feature_id, llm_explainer)
- thematic_codes.parquet: Codes per (feature_id, llm_explainer)

Output:
- assembled_explanations.parquet: Combined explanations per feature
- assembled_explanations_metadata.json: Processing metadata

Usage:
    python 10_assembled_explanations.py --config ../config/10_assembled_explanations.json
    python 10_assembled_explanations.py --limit 100
"""

import argparse
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

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
        "input_paths": {
            "features_parquet": "data/master/features.parquet",
            "thematic_codes_parquet": "data/master/thematic_codes.parquet"
        },
        "output_files": {
            "assembled_explanations_parquet": "data/master/assembled_explanations.parquet",
            "metadata": "data/master/assembled_explanations_metadata.json"
        },
        "templates": {
            "both_categories": "Activates on {token_codes} in {context_codes}",
            "token_only": "Activates on {token_codes}",
            "context_only": "Activates in {context_codes}",
            "no_codes": "{original_explanation}"
        },
        "processing": {
            "code_separator": ", ",
            "use_original_when_same_explainer": True
        }
    }

    if config_path:
        config_file = Path(config_path)
        if not config_file.is_absolute():
            # Try relative to script directory
            script_dir = Path(__file__).parent
            config_file = script_dir.parent / "config" / config_file.name
            if not config_file.exists():
                config_file = Path(config_path)

        if config_file.exists():
            logger.info(f"Loading config from {config_file}")
            with open(config_file, 'r') as f:
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
            logger.warning(f"Config file not found: {config_file}, using defaults")
    else:
        logger.info("Using default configuration")

    return default_config


class AssembledExplanationsProcessor:
    """Process features to generate assembled explanations from thematic codes."""

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
        self.features_path = self._resolve_path(config["input_paths"]["features_parquet"])
        self.thematic_codes_path = self._resolve_path(config["input_paths"]["thematic_codes_parquet"])
        self.output_path = self._resolve_path(config["output_files"]["assembled_explanations_parquet"])
        self.metadata_path = self._resolve_path(config["output_files"]["metadata"])

        # Templates and processing config
        self.templates = config["templates"]
        self.separator = config["processing"]["code_separator"]
        self.use_original_when_same_explainer = config["processing"].get(
            "use_original_when_same_explainer", True
        )

        # Statistics tracking
        self.stats = {
            "features_processed": 0,
            "template_distribution": {
                "original": 0,
                "both_categories": 0,
                "token_only": 0,
                "context_only": 0,
                "no_codes": 0
            },
            "same_explainer_count": 0
        }

        # Data containers
        self.features_df = None
        self.thematic_codes_df = None
        self.scores_df = None
        self.codes_lookup = {}

    def _resolve_path(self, path_str: str) -> Path:
        """Resolve path relative to project root if not absolute."""
        path = Path(path_str)
        if not path.is_absolute():
            return self.project_root / path
        return path

    def _load_data(self):
        """Load features and thematic codes data."""
        logger.info(f"Loading features from {self.features_path}")
        if not self.features_path.exists():
            raise FileNotFoundError(f"Features file not found: {self.features_path}")
        self.features_df = pl.read_parquet(self.features_path)
        logger.info(f"Loaded {len(self.features_df):,} feature rows")

        logger.info(f"Loading thematic codes from {self.thematic_codes_path}")
        if not self.thematic_codes_path.exists():
            raise FileNotFoundError(f"Thematic codes file not found: {self.thematic_codes_path}")
        self.thematic_codes_df = pl.read_parquet(self.thematic_codes_path)
        logger.info(f"Loaded {len(self.thematic_codes_df):,} thematic code rows")

    def _extract_scores(self):
        """Extract fuzz and detection scores per (feature_id, llm_explainer)."""
        logger.info("Extracting scores from features data...")

        df = self.features_df

        # Explode scores to get per-scorer metrics
        df = df.explode("scores")

        # Extract score fields from struct
        df = df.with_columns([
            pl.col("scores").struct.field("fuzz").alias("fuzz_score"),
            pl.col("scores").struct.field("detection").alias("detection_score"),
        ])

        # Select and keep relevant columns
        self.scores_df = df.select([
            "feature_id",
            "llm_explainer",
            "explanation_text",
            "fuzz_score",
            "detection_score"
        ])

        logger.info(f"Extracted scores for {len(self.scores_df):,} rows")

    def _parse_codes(self):
        """Parse thematic codes JSON and build lookup dictionary."""
        logger.info("Parsing thematic codes...")

        for row in self.thematic_codes_df.iter_rows(named=True):
            feature_id = row["feature_id"]
            llm_explainer = row["llm_explainer"]
            codes_json = row["codes"]

            # Parse JSON codes
            try:
                codes = json.loads(codes_json) if codes_json else []
            except json.JSONDecodeError:
                codes = []

            # Build lookup key
            key = (feature_id, llm_explainer)
            self.codes_lookup[key] = codes

        logger.info(f"Parsed codes for {len(self.codes_lookup):,} (feature, explainer) pairs")

    def _find_best_explainer(
        self,
        feature_scores: pl.DataFrame,
        score_column: str
    ) -> Tuple[Optional[str], Optional[float], Optional[str]]:
        """Find the explainer with highest score for a given metric.

        Args:
            feature_scores: DataFrame filtered to one feature
            score_column: "fuzz_score" or "detection_score"

        Returns:
            Tuple of (explainer_name, score_value, explanation_text)
        """
        valid_scores = feature_scores.filter(pl.col(score_column).is_not_null())
        if len(valid_scores) == 0:
            return None, None, None

        best_row = valid_scores.sort(score_column, descending=True).row(0, named=True)
        return (
            best_row["llm_explainer"],
            best_row[score_column],
            best_row["explanation_text"]
        )

    def _extract_codes_by_category(
        self,
        codes: List[Dict],
        category: str
    ) -> List[str]:
        """Extract code texts for a specific category.

        Args:
            codes: List of code dicts with 'code_text' and 'category' keys
            category: "token-level" or "context-level"

        Returns:
            List of code_text strings matching the category
        """
        return [c["code_text"] for c in codes if c.get("category") == category]

    def _assemble_explanation(
        self,
        token_codes: List[str],
        context_codes: List[str],
        fallback_explanation: str
    ) -> Tuple[str, str]:
        """Assemble explanation from codes using templates.

        Args:
            token_codes: List of token-level code texts
            context_codes: List of context-level code texts
            fallback_explanation: Original explanation to use if no codes

        Returns:
            Tuple of (assembled_text, template_used)
        """
        has_token = len(token_codes) > 0
        has_context = len(context_codes) > 0

        if has_token and has_context:
            template = self.templates["both_categories"]
            text = template.format(
                token_codes=self.separator.join(token_codes),
                context_codes=self.separator.join(context_codes)
            )
            return text, "both_categories"

        elif has_token:
            template = self.templates["token_only"]
            text = template.format(token_codes=self.separator.join(token_codes))
            return text, "token_only"

        elif has_context:
            template = self.templates["context_only"]
            text = template.format(context_codes=self.separator.join(context_codes))
            return text, "context_only"

        else:
            template = self.templates["no_codes"]
            text = template.format(original_explanation=fallback_explanation)
            return text, "no_codes"

    def _process_feature(self, feature_id: int) -> Optional[Dict]:
        """Process a single feature to generate assembled explanation.

        Args:
            feature_id: Feature ID to process

        Returns:
            Dict with result fields, or None if feature cannot be processed
        """
        # Filter scores to this feature
        feature_scores = self.scores_df.filter(pl.col("feature_id") == feature_id)

        if len(feature_scores) == 0:
            return None

        # Find best explainers for each score type
        best_fuzz_explainer, fuzz_score, fuzz_text = self._find_best_explainer(
            feature_scores, "fuzz_score"
        )
        best_detection_explainer, detection_score, detection_text = self._find_best_explainer(
            feature_scores, "detection_score"
        )

        # If same explainer has both best fuzz and detection, optionally use original explanation
        if best_fuzz_explainer and best_fuzz_explainer == best_detection_explainer:
            self.stats["same_explainer_count"] += 1
            if self.use_original_when_same_explainer:
                self.stats["template_distribution"]["original"] += 1
                return {
                    "feature_id": feature_id,
                    "assembled_explanation_text": fuzz_text,  # Original explanation from best explainer
                    "token_codes": [],
                    "context_codes": [],
                    "token_source_explainer": None,
                    "context_source_explainer": None,
                    "template_used": "original",
                    "fuzz_score_used": fuzz_score,
                    "detection_score_used": detection_score,
                    "fallback_explanation": None
                }

        # Initialize code lists
        token_codes = []
        context_codes = []
        token_source = None
        context_source = None

        # Get token-level codes from best fuzz explainer
        if best_fuzz_explainer:
            key = (feature_id, best_fuzz_explainer)
            if key in self.codes_lookup:
                codes = self.codes_lookup[key]
                token_codes = self._extract_codes_by_category(codes, "token-level")
                if token_codes:
                    token_source = best_fuzz_explainer

        # Get context-level codes from best detection explainer
        if best_detection_explainer:
            key = (feature_id, best_detection_explainer)
            if key in self.codes_lookup:
                codes = self.codes_lookup[key]
                context_codes = self._extract_codes_by_category(codes, "context-level")
                if context_codes:
                    context_source = best_detection_explainer

        # Find fallback explanation (highest average score)
        feature_scores_with_avg = feature_scores.with_columns([
            ((pl.col("fuzz_score").fill_null(0) + pl.col("detection_score").fill_null(0)) / 2)
            .alias("avg_score")
        ])
        best_overall = feature_scores_with_avg.sort("avg_score", descending=True).row(0, named=True)
        fallback_text = best_overall["explanation_text"]

        # Assemble explanation
        assembled_text, template_used = self._assemble_explanation(
            token_codes, context_codes, fallback_text
        )

        # Update stats
        self.stats["template_distribution"][template_used] += 1

        return {
            "feature_id": feature_id,
            "assembled_explanation_text": assembled_text,
            "token_codes": token_codes,
            "context_codes": context_codes,
            "token_source_explainer": token_source,
            "context_source_explainer": context_source,
            "template_used": template_used,
            "fuzz_score_used": fuzz_score,
            "detection_score_used": detection_score,
            "fallback_explanation": fallback_text if template_used == "no_codes" else None
        }

    def process(self) -> List[Dict]:
        """Run the full processing pipeline.

        Returns:
            List of result dictionaries
        """
        self._load_data()
        self._extract_scores()
        self._parse_codes()

        # Get unique feature IDs
        feature_ids = sorted(self.scores_df["feature_id"].unique().to_list())

        if self.feature_limit:
            feature_ids = feature_ids[:self.feature_limit]

        logger.info(f"Processing {len(feature_ids):,} features...")

        results = []
        for feature_id in tqdm(feature_ids, desc="Processing features"):
            result = self._process_feature(feature_id)
            if result:
                results.append(result)
                self.stats["features_processed"] += 1

        return results

    def save(self, results: List[Dict]):
        """Save output parquet and metadata.

        Args:
            results: List of processed feature results
        """
        if not results:
            logger.warning("No results to save")
            return

        # Ensure output directory exists
        self.output_path.parent.mkdir(parents=True, exist_ok=True)

        # Build DataFrame
        df = pl.DataFrame(results)

        # Cast columns to appropriate types
        df = df.with_columns([
            pl.col("feature_id").cast(pl.UInt32),
            pl.col("assembled_explanation_text").cast(pl.Utf8),
            pl.col("token_codes").cast(pl.List(pl.Utf8)),
            pl.col("context_codes").cast(pl.List(pl.Utf8)),
            pl.col("token_source_explainer").cast(pl.Utf8),
            pl.col("context_source_explainer").cast(pl.Utf8),
            pl.col("template_used").cast(pl.Utf8),
            pl.col("fuzz_score_used").cast(pl.Float64),
            pl.col("detection_score_used").cast(pl.Float64),
            pl.col("fallback_explanation").cast(pl.Utf8),
        ])

        logger.info(f"Saving parquet to {self.output_path}")
        df.write_parquet(self.output_path)

        # Save metadata
        metadata = {
            "created_at": datetime.now().isoformat(),
            "script_version": "1.0",
            "total_features": len(results),
            "schema": {col: str(df[col].dtype) for col in df.columns},
            "statistics": self.stats,
            "config_used": self.config
        }

        with open(self.metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)

        logger.info(f"Saved metadata to {self.metadata_path}")
        logger.info(f"Successfully created parquet with {len(df):,} rows")


def main():
    """Main execution function."""
    parser = argparse.ArgumentParser(
        description='Generate assembled explanations from thematic codes'
    )
    parser.add_argument(
        '--config',
        type=str,
        default='../config/10_assembled_explanations.json',
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
    processor = AssembledExplanationsProcessor(config, feature_limit=args.limit)

    # Process data
    logger.info("=" * 80)
    logger.info("Starting Assembled Explanations Generation")
    logger.info("=" * 80)

    results = processor.process()

    # Save output
    processor.save(results)

    # Print summary
    logger.info("=" * 80)
    logger.info("Processing Complete!")
    logger.info(f"Statistics:")
    logger.info(f"  Features processed: {processor.stats['features_processed']:,}")
    logger.info(f"  Template distribution:")
    for template, count in processor.stats['template_distribution'].items():
        pct = count / processor.stats['features_processed'] * 100 if processor.stats['features_processed'] > 0 else 0
        logger.info(f"    - {template}: {count:,} ({pct:.1f}%)")
    logger.info(f"  Same explainer for both: {processor.stats['same_explainer_count']:,}")
    logger.info("=" * 80)


if __name__ == "__main__":
    main()
