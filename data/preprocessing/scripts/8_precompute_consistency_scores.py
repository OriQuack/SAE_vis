#!/usr/bin/env python3
"""
Pre-compute Consistency Scores for Default Configuration

This script pre-calculates all consistency scores for the default setup where
all LLM scorers are selected for each LLM explainer. Uses standard deviation-based
methods with actual max_std values computed from the data.

Consistency Score Types:
1. LLM Scorer Consistency: 1 - (std / max_std_actual) across scorers
2. Within-Explanation Metric Consistency: 1 - (std_normalized / max_std_normalized)
3. Cross-Explanation Metric Consistency: 1 - (std / max_std_actual) across explainers
4. Cross-Explanation Overall Score Consistency: 1 - (std / max_std_actual) for overall scores
5. LLM Explainer Consistency: Average pairwise cosine similarity

Output: consistency_scores.parquet with pre-computed values
"""

import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple
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


class ConsistencyPreprocessor:
    """Pre-compute consistency scores for all features with default configuration."""

    def __init__(self, data_path: Path = None):
        """
        Initialize the preprocessor.

        Args:
            data_path: Root data directory path
        """
        if data_path is None:
            # Find project root
            project_root = Path.cwd()
            while project_root.name != "interface" and project_root.parent != project_root:
                project_root = project_root.parent

            if project_root.name == "interface":
                self.data_path = project_root / "data"
            else:
                raise RuntimeError("Could not find interface project root")
        else:
            self.data_path = data_path

        self.master_file = self.data_path / "master" / "features.parquet"
        self.pairwise_file = self.data_path / "master" / "semantic_similarity_pairwise.parquet"
        self.output_file = self.data_path / "master" / "consistency_scores.parquet"

        # Default configuration
        self.explainers = [
            'hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4',
            'Qwen/Qwen3-30B-A3B-Instruct-2507-FP8',
            'openai/gpt-oss-20b'
        ]
        self.scorers = [
            'hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4',
            'Qwen/Qwen3-30B-A3B-Instruct-2507-FP8',
            'openai/gpt-oss-20b'
        ]

        # Will be populated during processing
        self.global_stats = {}
        self.max_stds = {}

    def load_data(self) -> Tuple[pl.DataFrame, Optional[pl.DataFrame]]:
        """
        Load the required data files.

        Returns:
            Tuple of (feature_analysis_df, pairwise_similarity_df)
        """
        logger.info(f"Loading data from {self.master_file}")
        feature_df = pl.read_parquet(self.master_file)

        # Filter to default configuration
        feature_df = feature_df.filter(
            pl.col("llm_explainer").is_in(self.explainers) &
            pl.col("llm_scorer").is_in(self.scorers)
        )

        logger.info(f"Loaded {len(feature_df)} rows for default configuration")
        logger.info(f"Unique features: {feature_df['feature_id'].n_unique()}")

        # Load pairwise similarity data
        pairwise_df = None
        if self.pairwise_file.exists():
            logger.info(f"Loading pairwise similarity from {self.pairwise_file}")
            pairwise_df = pl.read_parquet(self.pairwise_file)
            logger.info(f"Loaded {len(pairwise_df)} pairwise similarity rows")
        else:
            logger.warning("Pairwise similarity file not found")

        return feature_df, pairwise_df

    def compute_global_statistics(self, df: pl.DataFrame) -> None:
        """
        Compute global statistics for normalization.

        Args:
            df: Feature analysis dataframe
        """
        logger.info("Computing global statistics for normalization...")

        # Compute statistics for each metric
        metrics = ['score_embedding', 'score_fuzz', 'score_detection']

        for metric in metrics:
            values = df[metric].drop_nulls().to_numpy()
            if len(values) > 0:
                self.global_stats[metric] = {
                    'min': float(np.min(values)),
                    'max': float(np.max(values)),
                    'mean': float(np.mean(values)),
                    'std': float(np.std(values, ddof=1))
                }
                logger.info(f"{metric}: min={self.global_stats[metric]['min']:.3f}, "
                          f"max={self.global_stats[metric]['max']:.3f}, "
                          f"mean={self.global_stats[metric]['mean']:.3f}, "
                          f"std={self.global_stats[metric]['std']:.3f}")

    def _compute_overall_score(self, explainer_df: pl.DataFrame) -> Optional[float]:
        """
        Compute overall score for a feature-explainer combination.

        Formula: avg(z_score(embedding), z_score(avg(fuzz)), z_score(avg(detection)))

        Args:
            explainer_df: DataFrame for a single feature-explainer combination

        Returns:
            Overall score or None if insufficient data
        """
        normalized_scores = []

        # 1. Embedding score (single value)
        embedding_vals = explainer_df['score_embedding'].drop_nulls().to_list()
        if embedding_vals and 'score_embedding' in self.global_stats:
            stats = self.global_stats['score_embedding']
            if stats['std'] > 0:
                z_score = (embedding_vals[0] - stats['mean']) / stats['std']
                normalized_scores.append(z_score)

        # 2. Average fuzz score (across 3 scorers)
        fuzz_scores = explainer_df['score_fuzz'].drop_nulls().to_list()
        if fuzz_scores and 'score_fuzz' in self.global_stats:
            avg_fuzz = np.mean(fuzz_scores)
            stats = self.global_stats['score_fuzz']
            if stats['std'] > 0:
                z_score = (avg_fuzz - stats['mean']) / stats['std']
                normalized_scores.append(z_score)

        # 3. Average detection score (across 3 scorers)
        detection_scores = explainer_df['score_detection'].drop_nulls().to_list()
        if detection_scores and 'score_detection' in self.global_stats:
            avg_detection = np.mean(detection_scores)
            stats = self.global_stats['score_detection']
            if stats['std'] > 0:
                z_score = (avg_detection - stats['mean']) / stats['std']
                normalized_scores.append(z_score)

        # Return average of z-scores
        if len(normalized_scores) >= 2:
            return float(np.mean(normalized_scores))
        return None

    def compute_max_stds(self, df: pl.DataFrame) -> None:
        """
        Pass 1: Compute actual max_std values from the data.

        Args:
            df: Feature analysis dataframe
        """
        logger.info("Pass 1: Computing actual max_std values from data...")

        # Get unique features
        feature_ids = sorted(df['feature_id'].unique().to_list())

        # Initialize collectors for max_std computation
        scorer_stds_fuzz = []
        scorer_stds_detection = []
        within_explanation_stds = []
        cross_explanation_stds_embedding = []
        cross_explanation_stds_fuzz = []
        cross_explanation_stds_detection = []
        cross_explanation_stds_overall = []

        for feature_id in feature_ids:
            feature_df = df.filter(pl.col("feature_id") == feature_id)

            # 1. Scorer consistency max_stds (per explainer)
            for explainer in self.explainers:
                explainer_df = feature_df.filter(pl.col("llm_explainer") == explainer)
                if len(explainer_df) == 0:
                    continue

                # Get scores across scorers
                fuzz_scores = explainer_df['score_fuzz'].drop_nulls().to_list()
                detection_scores = explainer_df['score_detection'].drop_nulls().to_list()

                if len(fuzz_scores) >= 2:
                    scorer_stds_fuzz.append(np.std(fuzz_scores, ddof=1))
                if len(detection_scores) >= 2:
                    scorer_stds_detection.append(np.std(detection_scores, ddof=1))

                # 2. Within-explanation metric consistency (z-score normalized)
                # Get one value per metric for this explainer
                embedding_val = explainer_df['score_embedding'].drop_nulls().to_list()
                embedding_val = embedding_val[0] if embedding_val else None

                fuzz_val = np.mean(fuzz_scores) if fuzz_scores else None
                detection_val = np.mean(detection_scores) if detection_scores else None

                # Normalize values using z-score
                normalized_values = []
                if embedding_val is not None and 'score_embedding' in self.global_stats:
                    stats = self.global_stats['score_embedding']
                    if stats['std'] > 0:
                        z_score = (embedding_val - stats['mean']) / stats['std']
                        normalized_values.append(z_score)

                if fuzz_val is not None and 'score_fuzz' in self.global_stats:
                    stats = self.global_stats['score_fuzz']
                    if stats['std'] > 0:
                        z_score = (fuzz_val - stats['mean']) / stats['std']
                        normalized_values.append(z_score)

                if detection_val is not None and 'score_detection' in self.global_stats:
                    stats = self.global_stats['score_detection']
                    if stats['std'] > 0:
                        z_score = (detection_val - stats['mean']) / stats['std']
                        normalized_values.append(z_score)

                if len(normalized_values) >= 2:
                    within_explanation_stds.append(np.std(normalized_values, ddof=1))

            # 3. Cross-explanation consistency (across explainers)
            embedding_across = []
            fuzz_across = []
            detection_across = []
            overall_across = []

            for explainer in self.explainers:
                explainer_df = feature_df.filter(pl.col("llm_explainer") == explainer)
                if len(explainer_df) == 0:
                    continue

                # Get average values for this explainer
                embedding_vals = explainer_df['score_embedding'].drop_nulls().to_list()
                if embedding_vals:
                    embedding_across.append(embedding_vals[0])

                fuzz_vals = explainer_df['score_fuzz'].drop_nulls().to_list()
                if fuzz_vals:
                    fuzz_across.append(np.mean(fuzz_vals))

                detection_vals = explainer_df['score_detection'].drop_nulls().to_list()
                if detection_vals:
                    detection_across.append(np.mean(detection_vals))

                # Compute overall score for this explainer
                overall_score = self._compute_overall_score(explainer_df)
                if overall_score is not None:
                    overall_across.append(overall_score)

            if len(embedding_across) >= 2:
                cross_explanation_stds_embedding.append(np.std(embedding_across, ddof=1))
            if len(fuzz_across) >= 2:
                cross_explanation_stds_fuzz.append(np.std(fuzz_across, ddof=1))
            if len(detection_across) >= 2:
                cross_explanation_stds_detection.append(np.std(detection_across, ddof=1))
            if len(overall_across) >= 2:
                cross_explanation_stds_overall.append(np.std(overall_across, ddof=1))

        # Compute max_stds
        self.max_stds = {
            'scorer_fuzz': float(np.max(scorer_stds_fuzz)) if scorer_stds_fuzz else 1.0,
            'scorer_detection': float(np.max(scorer_stds_detection)) if scorer_stds_detection else 1.0,
            'within_explanation': float(np.max(within_explanation_stds)) if within_explanation_stds else 1.0,
            'cross_explanation_embedding': float(np.max(cross_explanation_stds_embedding)) if cross_explanation_stds_embedding else 1.0,
            'cross_explanation_fuzz': float(np.max(cross_explanation_stds_fuzz)) if cross_explanation_stds_fuzz else 1.0,
            'cross_explanation_detection': float(np.max(cross_explanation_stds_detection)) if cross_explanation_stds_detection else 1.0,
            'cross_explanation_overall': float(np.max(cross_explanation_stds_overall)) if cross_explanation_stds_overall else 1.0
        }

        logger.info("Computed max_std values:")
        for key, value in self.max_stds.items():
            logger.info(f"  {key}: {value:.4f}")

    def compute_consistency_scores(self, df: pl.DataFrame, pairwise_df: Optional[pl.DataFrame]) -> pl.DataFrame:
        """
        Pass 2: Compute all consistency scores using actual max_stds.

        Args:
            df: Feature analysis dataframe
            pairwise_df: Pairwise similarity dataframe

        Returns:
            DataFrame with consistency scores
        """
        logger.info("Pass 2: Computing consistency scores...")

        # Get unique features
        feature_ids = sorted(df['feature_id'].unique().to_list())

        # Prepare result collectors
        feature_explainer_rows = []  # Per feature-explainer
        feature_rows = []  # Per feature (aggregated)

        for feature_id in feature_ids:
            feature_df = df.filter(pl.col("feature_id") == feature_id)

            # Cross-explanation consistency (same for all explainers of a feature)
            cross_exp_consistency = self._compute_cross_explanation_consistency(feature_df)

            # Cross-explanation overall consistency
            cross_exp_overall_consistency = self._compute_cross_explanation_overall_consistency(feature_df)

            # LLM explainer consistency (semantic similarity)
            llm_explainer_consistency = None
            if pairwise_df is not None:
                llm_explainer_consistency = self._compute_llm_explainer_consistency(
                    feature_id, pairwise_df
                )

            # Store feature-level consistency
            feature_rows.append({
                'feature_id': feature_id,
                'cross_explanation_metric_consistency_embedding': cross_exp_consistency.get('embedding'),
                'cross_explanation_metric_consistency_fuzz': cross_exp_consistency.get('fuzz'),
                'cross_explanation_metric_consistency_detection': cross_exp_consistency.get('detection'),
                'cross_explanation_overall_score_consistency': cross_exp_overall_consistency,
                'llm_explainer_consistency': llm_explainer_consistency
            })

            # Compute per-explainer consistency scores
            for explainer in self.explainers:
                explainer_df = feature_df.filter(pl.col("llm_explainer") == explainer)
                if len(explainer_df) == 0:
                    continue

                # Scorer consistency
                scorer_consistency = self._compute_scorer_consistency(explainer_df)

                # Within-explanation metric consistency
                within_consistency = self._compute_within_explanation_consistency(explainer_df)

                feature_explainer_rows.append({
                    'feature_id': feature_id,
                    'llm_explainer': explainer,
                    'llm_scorer_consistency_fuzz': scorer_consistency.get('fuzz'),
                    'llm_scorer_consistency_detection': scorer_consistency.get('detection'),
                    'within_explanation_metric_consistency': within_consistency
                })

        logger.info(f"Computed consistency for {len(feature_rows)} features")
        logger.info(f"Generated {len(feature_explainer_rows)} feature-explainer rows")

        # Create DataFrames
        feature_level_df = pl.DataFrame(feature_rows)
        feature_explainer_df = pl.DataFrame(feature_explainer_rows)

        # Merge the two levels
        result_df = feature_explainer_df.join(
            feature_level_df,
            on='feature_id',
            how='left'
        )

        return result_df

    def _compute_scorer_consistency(self, explainer_df: pl.DataFrame) -> Dict[str, Optional[float]]:
        """
        Compute scorer consistency: 1 - (std / max_std_actual).

        Args:
            explainer_df: DataFrame for a single feature-explainer combination

        Returns:
            Dict with 'fuzz' and 'detection' consistency scores
        """
        result = {}

        # Fuzz scores
        fuzz_scores = explainer_df['score_fuzz'].drop_nulls().to_list()
        if len(fuzz_scores) >= 2:
            std = np.std(fuzz_scores, ddof=1)
            consistency = 1.0 - (std / self.max_stds['scorer_fuzz'])
            result['fuzz'] = float(np.clip(consistency, 0, 1).round(3))
        else:
            result['fuzz'] = None

        # Detection scores
        detection_scores = explainer_df['score_detection'].drop_nulls().to_list()
        if len(detection_scores) >= 2:
            std = np.std(detection_scores, ddof=1)
            consistency = 1.0 - (std / self.max_stds['scorer_detection'])
            result['detection'] = float(np.clip(consistency, 0, 1).round(3))
        else:
            result['detection'] = None

        return result

    def _compute_within_explanation_consistency(self, explainer_df: pl.DataFrame) -> Optional[float]:
        """
        Compute within-explanation metric consistency: 1 - (std_z_score / max_std_z_score).

        Args:
            explainer_df: DataFrame for a single feature-explainer combination

        Returns:
            Consistency score or None
        """
        # Get one value per metric
        embedding_vals = explainer_df['score_embedding'].drop_nulls().to_list()
        embedding_val = embedding_vals[0] if embedding_vals else None

        fuzz_scores = explainer_df['score_fuzz'].drop_nulls().to_list()
        fuzz_val = np.mean(fuzz_scores) if fuzz_scores else None

        detection_scores = explainer_df['score_detection'].drop_nulls().to_list()
        detection_val = np.mean(detection_scores) if detection_scores else None

        # Normalize values using z-score
        normalized_values = []

        if embedding_val is not None and 'score_embedding' in self.global_stats:
            stats = self.global_stats['score_embedding']
            if stats['std'] > 0:
                z_score = (embedding_val - stats['mean']) / stats['std']
                normalized_values.append(z_score)

        if fuzz_val is not None and 'score_fuzz' in self.global_stats:
            stats = self.global_stats['score_fuzz']
            if stats['std'] > 0:
                z_score = (fuzz_val - stats['mean']) / stats['std']
                normalized_values.append(z_score)

        if detection_val is not None and 'score_detection' in self.global_stats:
            stats = self.global_stats['score_detection']
            if stats['std'] > 0:
                z_score = (detection_val - stats['mean']) / stats['std']
                normalized_values.append(z_score)

        if len(normalized_values) >= 2:
            std = np.std(normalized_values, ddof=1)
            consistency = 1.0 - (std / self.max_stds['within_explanation'])
            return float(np.clip(consistency, 0, 1).round(3))
        else:
            return None

    def _compute_cross_explanation_consistency(self, feature_df: pl.DataFrame) -> Dict[str, Optional[float]]:
        """
        Compute cross-explanation consistency: 1 - (std / max_std_actual).

        Args:
            feature_df: DataFrame for a single feature across all explainers

        Returns:
            Dict with consistency scores for each metric
        """
        result = {}

        # Collect values across explainers
        embedding_across = []
        fuzz_across = []
        detection_across = []

        for explainer in self.explainers:
            explainer_df = feature_df.filter(pl.col("llm_explainer") == explainer)
            if len(explainer_df) == 0:
                continue

            # Get average values for this explainer
            embedding_vals = explainer_df['score_embedding'].drop_nulls().to_list()
            if embedding_vals:
                embedding_across.append(embedding_vals[0])

            fuzz_vals = explainer_df['score_fuzz'].drop_nulls().to_list()
            if fuzz_vals:
                fuzz_across.append(np.mean(fuzz_vals))

            detection_vals = explainer_df['score_detection'].drop_nulls().to_list()
            if detection_vals:
                detection_across.append(np.mean(detection_vals))

        # Compute consistency for each metric
        if len(embedding_across) >= 2:
            std = np.std(embedding_across, ddof=1)
            consistency = 1.0 - (std / self.max_stds['cross_explanation_embedding'])
            result['embedding'] = float(np.clip(consistency, 0, 1).round(3))
        else:
            result['embedding'] = None

        if len(fuzz_across) >= 2:
            std = np.std(fuzz_across, ddof=1)
            consistency = 1.0 - (std / self.max_stds['cross_explanation_fuzz'])
            result['fuzz'] = float(np.clip(consistency, 0, 1).round(3))
        else:
            result['fuzz'] = None

        if len(detection_across) >= 2:
            std = np.std(detection_across, ddof=1)
            consistency = 1.0 - (std / self.max_stds['cross_explanation_detection'])
            result['detection'] = float(np.clip(consistency, 0, 1).round(3))
        else:
            result['detection'] = None

        return result

    def _compute_cross_explanation_overall_consistency(self, feature_df: pl.DataFrame) -> Optional[float]:
        """
        Compute cross-explanation overall score consistency: 1 - (std / max_std_actual).

        Overall score = avg(normalized(embedding), normalized(avg(fuzz)), normalized(avg(detection)))

        Args:
            feature_df: DataFrame for a single feature across all explainers

        Returns:
            Overall consistency score or None
        """
        overall_scores = []

        # Compute overall score for each explainer
        for explainer in self.explainers:
            explainer_df = feature_df.filter(pl.col("llm_explainer") == explainer)
            if len(explainer_df) == 0:
                continue

            overall_score = self._compute_overall_score(explainer_df)
            if overall_score is not None:
                overall_scores.append(overall_score)

        # Compute consistency
        if len(overall_scores) >= 2:
            std = np.std(overall_scores, ddof=1)
            consistency = 1.0 - (std / self.max_stds['cross_explanation_overall'])
            return float(np.clip(consistency, 0, 1).round(3))
        return None

    def _compute_llm_explainer_consistency(self, feature_id: int, pairwise_df: pl.DataFrame) -> Optional[float]:
        """
        Compute LLM explainer consistency using average pairwise cosine similarity.

        Args:
            feature_id: Feature ID
            pairwise_df: Pairwise similarity dataframe

        Returns:
            Average pairwise cosine similarity or None
        """
        # Filter for this feature
        feature_pairs = pairwise_df.filter(pl.col("feature_id") == feature_id)

        if len(feature_pairs) == 0:
            return None

        # Filter to only selected explainers
        relevant_pairs = feature_pairs.filter(
            pl.col("explainer_1").is_in(self.explainers) &
            pl.col("explainer_2").is_in(self.explainers)
        )

        if len(relevant_pairs) == 0:
            return None

        # Get cosine similarities
        similarities = relevant_pairs["cosine_similarity"].drop_nulls().to_list()

        if not similarities:
            return None

        # Return average
        return float(np.mean(similarities).round(3))

    def save_results(self, df: pl.DataFrame) -> None:
        """
        Save consistency scores to parquet with metadata.

        Args:
            df: DataFrame with consistency scores
        """
        logger.info(f"Saving results to {self.output_file}")

        # Ensure proper data types
        df = df.with_columns([
            pl.col("feature_id").cast(pl.UInt32),
            pl.col("llm_explainer").cast(pl.Categorical),
            pl.col("llm_scorer_consistency_fuzz").cast(pl.Float32),
            pl.col("llm_scorer_consistency_detection").cast(pl.Float32),
            pl.col("within_explanation_metric_consistency").cast(pl.Float32),
            pl.col("cross_explanation_metric_consistency_embedding").cast(pl.Float32),
            pl.col("cross_explanation_metric_consistency_fuzz").cast(pl.Float32),
            pl.col("cross_explanation_metric_consistency_detection").cast(pl.Float32),
            pl.col("cross_explanation_overall_score_consistency").cast(pl.Float32),
            pl.col("llm_explainer_consistency").cast(pl.Float32)
        ])

        # Save parquet
        df.write_parquet(self.output_file)

        # Generate column metadata
        column_descriptions = {
            'feature_id': 'SAE feature index (0-823)',
            'llm_explainer': 'LLM model used for generating feature explanations',
            'llm_scorer_consistency_fuzz': 'LLM scorer consistency for fuzz metric across 3 scorers: 1 - (std / max_std_actual)',
            'llm_scorer_consistency_detection': 'LLM scorer consistency for detection metric across 3 scorers: 1 - (std / max_std_actual)',
            'within_explanation_metric_consistency': 'Consistency across 3 metrics (embedding, fuzz, detection) within a single explainer using z-score normalization: 1 - (std_z_score / max_std_z_score)',
            'cross_explanation_metric_consistency_embedding': 'Consistency of embedding scores across 3 LLM explainers: 1 - (std / max_std_actual)',
            'cross_explanation_metric_consistency_fuzz': 'Consistency of fuzz scores across 3 LLM explainers: 1 - (std / max_std_actual)',
            'cross_explanation_metric_consistency_detection': 'Consistency of detection scores across 3 LLM explainers: 1 - (std / max_std_actual)',
            'cross_explanation_overall_score_consistency': 'Consistency of overall scores across 3 LLM explainers, where overall_score = avg(z_score(emb), z_score(avg(fuzz)), z_score(avg(det))): 1 - (std / max_std_actual)',
            'llm_explainer_consistency': 'Semantic similarity between explanations from different LLM explainers: average pairwise cosine similarity'
        }

        columns_metadata = {}
        for col_name in df.columns:
            col_data = df[col_name]
            col_meta = {
                'dtype': str(col_data.dtype),
                'description': column_descriptions.get(col_name, 'No description available')
            }

            # Add statistics for numeric columns
            if col_data.dtype in [pl.Float32, pl.Float64, pl.UInt32, pl.Int32]:
                non_null = col_data.drop_nulls()
                if len(non_null) > 0:
                    col_meta['statistics'] = {
                        'count': len(non_null),
                        'null_count': len(col_data) - len(non_null),
                        'min': float(non_null.min()),
                        'max': float(non_null.max()),
                        'mean': float(non_null.mean()),
                        'std': float(non_null.std())
                    }
            # Add value counts for categorical columns
            elif col_data.dtype == pl.Categorical:
                value_counts = col_data.value_counts().sort(col_name, descending=False)
                col_meta['unique_values'] = col_data.n_unique()
                col_meta['value_counts'] = {
                    str(row[0]): int(row[1])
                    for row in value_counts.iter_rows()
                }

            columns_metadata[col_name] = col_meta

        # Save metadata
        metadata = {
            'created_at': datetime.now().isoformat(),
            'total_rows': len(df),
            'unique_features': df['feature_id'].n_unique(),
            'explainers': self.explainers,
            'scorers': self.scorers,
            'columns': columns_metadata,
            'global_statistics': self.global_stats,
            'max_std_values': self.max_stds,
            'consistency_methods': {
                'llm_scorer_consistency': '1 - (std / max_std_actual)',
                'within_explanation_metric_consistency': '1 - (std_z_score / max_std_z_score)',
                'cross_explanation_metric_consistency': '1 - (std / max_std_actual)',
                'cross_explanation_overall_score_consistency': '1 - (std / max_std_actual), overall_score = avg(z_score(emb), z_score(avg(fuzz)), z_score(avg(det)))',
                'llm_explainer_consistency': 'avg_pairwise_cosine_similarity'
            },
            'normalization': 'Z-score normalization (value - mean) / std for within-explanation consistency and overall score computation'
        }

        metadata_path = self.output_file.with_suffix('.parquet.metadata.json')
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)

        logger.info(f"Saved {len(df)} rows to {self.output_file}")
        logger.info(f"Metadata saved to {metadata_path}")

    def run(self) -> None:
        """Run the complete preprocessing pipeline."""
        logger.info("Starting consistency score preprocessing...")

        # Load data
        feature_df, pairwise_df = self.load_data()

        # Compute global statistics
        self.compute_global_statistics(feature_df)

        # Pass 1: Compute max_stds
        self.compute_max_stds(feature_df)

        # Pass 2: Compute consistency scores
        result_df = self.compute_consistency_scores(feature_df, pairwise_df)

        # Save results
        self.save_results(result_df)

        # Print summary statistics
        logger.info("\nSummary Statistics:")
        logger.info(f"Total rows: {len(result_df)}")
        logger.info(f"Unique features: {result_df['feature_id'].n_unique()}")
        logger.info(f"Unique explainers: {result_df['llm_explainer'].n_unique()}")

        # Show sample of consistency score distributions
        logger.info("\nConsistency Score Distributions:")
        for col in result_df.columns:
            if 'consistency' in col:
                values = result_df[col].drop_nulls()
                if len(values) > 0:
                    logger.info(f"  {col}:")
                    logger.info(f"    Mean: {values.mean():.3f}")
                    logger.info(f"    Std:  {values.std():.3f}")
                    logger.info(f"    Min:  {values.min():.3f}")
                    logger.info(f"    Max:  {values.max():.3f}")

        logger.info("\nPreprocessing complete!")


def main():
    """Main execution function."""
    preprocessor = ConsistencyPreprocessor()
    preprocessor.run()


if __name__ == "__main__":
    main()