"""
Table data service for feature-level score visualization.

Clean 4-step flow:
1. Fetch scores from feature_analysis.parquet
2. Fetch consistency from consistency_scores.parquet, calculate if missing
3. Fetch explanations from explanations.parquet
4. Build response (pure assembly, no calculations)

All calculation logic is in ConsistencyService for maintainability.
"""

import polars as pl
import numpy as np
import logging
from typing import Dict, List, Optional
from pathlib import Path

from ..models.common import Filters
from ..models.responses import (
    FeatureTableDataResponse, FeatureTableRow,
    ExplainerScoreData, ScorerScoreSet, ConsistencyScore
)
from .consistency_service import ConsistencyService, ExplainerDataBuilder

logger = logging.getLogger(__name__)

# Model name mapping for display
MODEL_NAME_MAP = {
    'hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4': 'llama',
    'Qwen/Qwen3-30B-A3B-Instruct-2507-FP8': 'qwen',
    'openai/gpt-oss-20b': 'openai'
}


class TableDataService:
    """Service for generating table visualization data."""

    # Default explainers and scorers (matches pre-computed consistency data)
    DEFAULT_EXPLAINERS = [
        'hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4',
        'Qwen/Qwen3-30B-A3B-Instruct-2507-FP8',
        'openai/gpt-oss-20b'
    ]
    DEFAULT_SCORERS = DEFAULT_EXPLAINERS  # Same models used as scorers

    def __init__(self, data_service):
        """
        Initialize TableDataService.

        Args:
            data_service: Instance of DataService for raw data access
        """
        self.data_service = data_service
        self.consistency = ConsistencyService()
        self.pairwise_similarity_file = (
            Path(data_service.data_path) / "master" / "semantic_similarity_pairwise.parquet"
        )
        self.explanations_file = (
            Path(data_service.data_path) / "master" / "explanations.parquet"
        )
        self.consistency_scores_file = (
            Path(data_service.data_path) / "master" / "consistency_scores.parquet"
        )

    async def get_table_data(self, filters: Filters) -> FeatureTableDataResponse:
        """
        Generate feature-level table data with consistency scores.

        Clean 4-step flow:
        1. Fetch scores from feature_analysis.parquet
        2. Fetch consistency from consistency_scores.parquet, calculate if missing
        3. Fetch explanations from explanations.parquet
        4. Build response (pure assembly, no calculations)

        Args:
            filters: Filter criteria for data selection

        Returns:
            FeatureTableDataResponse with features and metadata
        """
        if not self.data_service.is_ready():
            raise RuntimeError("DataService not ready")

        # STEP 1: Fetch scores from feature_analysis.parquet
        scores_df = self._fetch_scores(filters)

        # Extract metadata
        feature_ids = sorted(scores_df["feature_id"].unique().to_list())
        explainer_ids = scores_df["llm_explainer"].unique().to_list()
        scorer_ids = sorted(scores_df["llm_scorer"].unique().to_list())
        is_averaged = len(explainer_ids) > 1

        # Create scorer mapping
        scorer_map = {scorer: f"s{i+1}" for i, scorer in enumerate(scorer_ids)}

        # STEP 2: Fetch consistency scores from consistency_scores.parquet
        consistency_df = self._fetch_consistency(filters, feature_ids, explainer_ids, scores_df)

        # STEP 3: Fetch explanations from explanations.parquet
        explanations_df = self._fetch_explanations(filters)

        # STEP 4: Build response (pure assembly, no calculations)
        features = self._build_feature_rows_simple(
            scores_df, consistency_df, explanations_df,
            feature_ids, explainer_ids, scorer_map, is_averaged
        )

        # Compute global stats for frontend normalization
        global_stats = self._compute_global_stats(scores_df, explainer_ids, feature_ids)

        return FeatureTableDataResponse(
            features=features,
            total_features=len(features),
            explainer_ids=[MODEL_NAME_MAP.get(exp, exp) for exp in explainer_ids],
            scorer_ids=scorer_ids,
            is_averaged=is_averaged,
            global_stats=global_stats
        )

    def _fetch_scores(self, filters: Filters) -> pl.DataFrame:
        """
        STEP 1: Fetch scores from feature_analysis.parquet with filters applied.

        Args:
            filters: Filter criteria

        Returns:
            DataFrame with scores (feature_id, llm_explainer, llm_scorer, scores, z_scores)
        """
        lf = self.data_service._df_lazy

        # Apply filters
        filter_conditions = []
        if filters.sae_id and len(filters.sae_id) > 0:
            filter_conditions.append(pl.col("sae_id").is_in(filters.sae_id))
        if filters.explanation_method and len(filters.explanation_method) > 0:
            filter_conditions.append(pl.col("explanation_method").is_in(filters.explanation_method))
        if filters.llm_explainer and len(filters.llm_explainer) > 0:
            filter_conditions.append(pl.col("llm_explainer").is_in(filters.llm_explainer))
        if filters.llm_scorer and len(filters.llm_scorer) > 0:
            filter_conditions.append(pl.col("llm_scorer").is_in(filters.llm_scorer))

        # Apply all filters
        if filter_conditions:
            for condition in filter_conditions:
                lf = lf.filter(condition)

        # Select needed columns
        df = lf.select([
            "feature_id", "llm_explainer", "llm_scorer",
            "score_embedding", "score_fuzz", "score_detection",
            "z_score_embedding", "z_score_fuzz", "z_score_detection",
            "overall_score"
        ]).collect()

        logger.info(f"Fetched scores: {len(df)} rows, {df['feature_id'].n_unique()} unique features")
        return df

    def _fetch_consistency(
        self,
        filters: Filters,
        feature_ids: List[int],
        explainer_ids: List[str],
        scores_df: pl.DataFrame
    ) -> pl.DataFrame:
        """
        STEP 2: Fetch consistency from consistency_scores.parquet, calculate if missing.

        Uses pre-computed data when filters match defaults, calculates otherwise.

        Args:
            filters: Filter criteria
            feature_ids: List of feature IDs from scores
            explainer_ids: List of explainer IDs from scores
            scores_df: Scores DataFrame for calculating missing consistency

        Returns:
            DataFrame with consistency scores (all rows for feature_ids × explainer_ids)
        """
        # Check if filters match defaults
        is_default_config = self._is_default_configuration(filters, explainer_ids)

        try:
            # Load pre-computed consistency
            pl.enable_string_cache()
            consistency_df = pl.read_parquet(self.consistency_scores_file)

            # Filter to match feature_ids and explainer_ids
            consistency_df = consistency_df.filter(
                pl.col("feature_id").is_in(feature_ids) &
                pl.col("llm_explainer").is_in(explainer_ids)
            )

            # If default configuration, use parquet data directly
            if is_default_config:
                logger.info(f"Using pre-computed consistency scores (default config): {len(consistency_df)} rows")
                return consistency_df

            # For non-default configs, check if we need to calculate
            expected_rows = len(feature_ids) * len(explainer_ids)
            actual_rows = len(consistency_df)

            if actual_rows < expected_rows:
                logger.info(f"Consistency scores incomplete ({actual_rows}/{expected_rows}), calculating missing")

                # Calculate all consistency scores
                pairwise_df = self._load_pairwise_data() if len(explainer_ids) > 1 else None
                calculated_df = ConsistencyService.calculate_all_consistency(
                    scores_df, explainer_ids, feature_ids, pairwise_df
                )

                # Merge with existing consistency (prefer existing if available)
                if len(consistency_df) > 0:
                    # Join and coalesce: use existing values when available, calculated otherwise
                    consistency_df = calculated_df.join(
                        consistency_df,
                        on=["feature_id", "llm_explainer"],
                        how="left",
                        suffix="_existing"
                    )
                    # Coalesce each column
                    for col in ['llm_scorer_consistency_fuzz', 'llm_scorer_consistency_detection',
                                'within_explanation_metric_consistency',
                                'cross_explanation_metric_consistency_embedding',
                                'cross_explanation_metric_consistency_fuzz',
                                'cross_explanation_metric_consistency_detection',
                                'cross_explanation_overall_score_consistency',
                                'llm_explainer_consistency']:
                        consistency_df = consistency_df.with_columns(
                            pl.coalesce([pl.col(f"{col}_existing"), pl.col(col)]).alias(col)
                        ).drop(f"{col}_existing")
                else:
                    consistency_df = calculated_df

                logger.info(f"Consistency scores complete after calculation: {len(consistency_df)} rows")
            else:
                logger.info(f"Using pre-computed consistency scores: {len(consistency_df)} rows")

            return consistency_df

        except Exception as e:
            logger.warning(f"Could not load consistency_scores.parquet: {e}, calculating all")

            # Calculate all consistency scores from scratch
            pairwise_df = self._load_pairwise_data() if len(explainer_ids) > 1 else None
            consistency_df = ConsistencyService.calculate_all_consistency(
                scores_df, explainer_ids, feature_ids, pairwise_df
            )

            logger.info(f"Calculated consistency scores: {len(consistency_df)} rows")
            return consistency_df

    def _is_default_configuration(self, filters: Filters, explainer_ids: List[str]) -> bool:
        """
        Check if current filters match default configuration.

        Args:
            filters: Filter criteria
            explainer_ids: List of explainer IDs from scores

        Returns:
            True if all filters are default/empty, False otherwise
        """
        # Check explainers
        if filters.llm_explainer and len(filters.llm_explainer) > 0:
            # If explainer filter is set, check if it matches defaults
            if set(filters.llm_explainer) != set(self.DEFAULT_EXPLAINERS):
                return False
        else:
            # If no explainer filter, check if actual explainers match defaults
            if set(explainer_ids) != set(self.DEFAULT_EXPLAINERS):
                return False

        # Check scorers
        if filters.llm_scorer and len(filters.llm_scorer) > 0:
            if set(filters.llm_scorer) != set(self.DEFAULT_SCORERS):
                return False

        # Check other filters (sae_id, explanation_method should be empty for default)
        if filters.sae_id and len(filters.sae_id) > 0:
            return False
        if filters.explanation_method and len(filters.explanation_method) > 0:
            return False

        return True

    def _fetch_explanations(self, filters: Filters) -> Optional[pl.DataFrame]:
        """
        STEP 3: Fetch explanations from explanations.parquet.

        Args:
            filters: Filter criteria (to match explainers)

        Returns:
            DataFrame with explanations (feature_id, llm_explainer, explanation_text)
        """
        try:
            explanations_df = pl.read_parquet(self.explanations_file)

            # Filter to match selected explainers if provided
            if filters.llm_explainer and len(filters.llm_explainer) > 0:
                explanations_df = explanations_df.filter(
                    pl.col("llm_explainer").is_in(filters.llm_explainer)
                )

            logger.info(f"Fetched explanations: {len(explanations_df)} rows")
            return explanations_df
        except Exception as e:
            logger.warning(f"Explanations data not available: {e}")
            return None

    def _compute_global_stats(
        self,
        scores_df: pl.DataFrame,
        explainer_ids: List[str],
        feature_ids: List[int]
    ) -> Dict[str, Dict[str, float]]:
        """
        Compute simple global statistics for frontend normalization.

        Args:
            scores_df: Scores DataFrame
            explainer_ids: List of explainer IDs
            feature_ids: List of feature IDs

        Returns:
            Dict with global stats: {'metric_name': {'mean': float, 'std': float, 'min': float, 'max': float}}
        """
        embedding_values = []
        fuzz_values = []
        detection_values = []

        for feature_id in feature_ids:
            feature_df = scores_df.filter(pl.col("feature_id") == feature_id)

            for explainer in explainer_ids:
                explainer_df = feature_df.filter(pl.col("llm_explainer") == explainer)

                if len(explainer_df) == 0:
                    continue

                # Embedding (one per explainer)
                emb = explainer_df["score_embedding"].to_list()
                if emb and emb[0] is not None:
                    embedding_values.append(emb[0])

                # Fuzz and detection (averaged across scorers)
                fuzz = explainer_df["score_fuzz"].to_list()
                fuzz_avg = np.mean([s for s in fuzz if s is not None]) if any(s is not None for s in fuzz) else None
                if fuzz_avg is not None:
                    fuzz_values.append(fuzz_avg)

                det = explainer_df["score_detection"].to_list()
                det_avg = np.mean([s for s in det if s is not None]) if any(s is not None for s in det) else None
                if det_avg is not None:
                    detection_values.append(det_avg)

        # Compute global statistics
        global_stats = {}
        if len(embedding_values) >= 2:
            global_stats['embedding'] = {
                'mean': float(np.mean(embedding_values)),
                'std': float(np.std(embedding_values, ddof=1)),
                'min': float(np.min(embedding_values)),
                'max': float(np.max(embedding_values))
            }
        if len(fuzz_values) >= 2:
            global_stats['fuzz'] = {
                'mean': float(np.mean(fuzz_values)),
                'std': float(np.std(fuzz_values, ddof=1)),
                'min': float(np.min(fuzz_values)),
                'max': float(np.max(fuzz_values))
            }
        if len(detection_values) >= 2:
            global_stats['detection'] = {
                'mean': float(np.mean(detection_values)),
                'std': float(np.std(detection_values, ddof=1)),
                'min': float(np.min(detection_values)),
                'max': float(np.max(detection_values))
            }

        return global_stats

    def _build_feature_rows_simple(
        self,
        scores_df: pl.DataFrame,
        consistency_df: pl.DataFrame,
        explanations_df: Optional[pl.DataFrame],
        feature_ids: List[int],
        explainer_ids: List[str],
        scorer_map: Dict[str, str],
        is_averaged: bool
    ) -> List[FeatureTableRow]:
        """
        STEP 4: Build feature rows (pure assembly, no calculations).

        Args:
            scores_df: Scores DataFrame from feature_analysis.parquet
            consistency_df: Consistency DataFrame (pre-computed or calculated)
            explanations_df: Explanations DataFrame (optional)
            feature_ids: List of feature IDs
            explainer_ids: List of explainer IDs
            scorer_map: Mapping from scorer ID to s1/s2/s3
            is_averaged: Whether to average across scorers

        Returns:
            List of FeatureTableRow objects
        """
        features = []

        for feature_id in feature_ids:
            # Filter data for this feature
            feature_scores = scores_df.filter(pl.col("feature_id") == feature_id)
            feature_consistency = consistency_df.filter(pl.col("feature_id") == feature_id)

            explainers_dict = {}
            for explainer in explainer_ids:
                # Filter for this explainer
                explainer_scores = feature_scores.filter(pl.col("llm_explainer") == explainer)
                explainer_consistency = feature_consistency.filter(pl.col("llm_explainer") == explainer)

                if len(explainer_scores) == 0:
                    continue

                # Extract scores using helper
                fuzz_dict, detection_dict, embedding_score = ExplainerDataBuilder.extract_scores_from_explainer_df(
                    explainer_scores, scorer_map if not is_averaged else None
                )

                # Get consistency scores from DataFrame
                consistency_row = explainer_consistency.to_dicts()[0] if len(explainer_consistency) > 0 else {}

                # Look up explanation text
                explanation_text = ExplainerDataBuilder.lookup_explanation_text(
                    feature_id, explainer, explanations_df
                )

                # Build explainer data
                explainer_key = MODEL_NAME_MAP.get(explainer, explainer)

                if is_averaged:
                    # Averaged mode: average scores across scorers
                    fuzz_scores_list = [fuzz_dict.get("s1"), fuzz_dict.get("s2"), fuzz_dict.get("s3")]
                    detection_scores_list = [detection_dict.get("s1"), detection_dict.get("s2"), detection_dict.get("s3")]

                    fuzz_avg = round(np.mean([s for s in fuzz_scores_list if s is not None]), 3) if any(s is not None for s in fuzz_scores_list) else None
                    detection_avg = round(np.mean([s for s in detection_scores_list if s is not None]), 3) if any(s is not None for s in detection_scores_list) else None

                    # Build consistency scores
                    scorer_consistency = self._build_scorer_consistency(consistency_row)
                    metric_consistency = self._build_metric_consistency(consistency_row)
                    explainer_consistency = self._build_explainer_consistency(consistency_row)
                    cross_explainer_consistency = self._build_cross_explainer_consistency(consistency_row)

                    explainers_dict[explainer_key] = ExplainerScoreData(
                        embedding=embedding_score,
                        fuzz=ScorerScoreSet(s1=fuzz_dict['s1'], s2=fuzz_dict['s2'], s3=fuzz_dict['s3']),
                        detection=ScorerScoreSet(s1=detection_dict['s1'], s2=detection_dict['s2'], s3=detection_dict['s3']),
                        explanation_text=explanation_text,
                        scorer_consistency=scorer_consistency,
                        metric_consistency=metric_consistency,
                        explainer_consistency=explainer_consistency,
                        cross_explainer_metric_consistency=cross_explainer_consistency
                    )
                else:
                    # Individual mode: show individual scorer values
                    scorer_consistency = self._build_scorer_consistency(consistency_row)
                    metric_consistency = self._build_metric_consistency(consistency_row)

                    explainers_dict[explainer_key] = ExplainerScoreData(
                        embedding=embedding_score,
                        fuzz=ScorerScoreSet(
                            s1=fuzz_dict.get("s1"),
                            s2=fuzz_dict.get("s2"),
                            s3=fuzz_dict.get("s3")
                        ),
                        detection=ScorerScoreSet(
                            s1=detection_dict.get("s1"),
                            s2=detection_dict.get("s2"),
                            s3=detection_dict.get("s3")
                        ),
                        explanation_text=explanation_text,
                        scorer_consistency=scorer_consistency,
                        metric_consistency=metric_consistency,
                        explainer_consistency=None,
                        cross_explainer_metric_consistency=None
                    )

            if explainers_dict:
                features.append(FeatureTableRow(
                    feature_id=feature_id,
                    explainers=explainers_dict
                ))

        logger.info(f"Built {len(features)} feature rows")
        return features

    def _build_scorer_consistency(self, consistency_row: Dict) -> Optional[Dict[str, ConsistencyScore]]:
        """Build scorer consistency dict from consistency row."""
        if not consistency_row:
            return None

        scorer_consistency = {}
        if consistency_row.get('llm_scorer_consistency_fuzz') is not None:
            scorer_consistency["fuzz"] = ConsistencyScore(
                value=consistency_row['llm_scorer_consistency_fuzz'],
                method="std_based"
            )
        if consistency_row.get('llm_scorer_consistency_detection') is not None:
            scorer_consistency["detection"] = ConsistencyScore(
                value=consistency_row['llm_scorer_consistency_detection'],
                method="std_based"
            )

        return scorer_consistency if scorer_consistency else None

    def _build_metric_consistency(self, consistency_row: Dict) -> Optional[ConsistencyScore]:
        """Build metric consistency from consistency row."""
        if not consistency_row:
            return None

        if consistency_row.get('within_explanation_metric_consistency') is not None:
            return ConsistencyScore(
                value=consistency_row['within_explanation_metric_consistency'],
                method="normalized_std"
            )

        return None

    def _build_explainer_consistency(self, consistency_row: Dict) -> Optional[ConsistencyScore]:
        """Build explainer consistency from consistency row."""
        if not consistency_row:
            return None

        if consistency_row.get('llm_explainer_consistency') is not None:
            return ConsistencyScore(
                value=consistency_row['llm_explainer_consistency'],
                method="avg_pairwise_cosine"
            )

        return None

    def _build_cross_explainer_consistency(self, consistency_row: Dict) -> Optional[Dict[str, ConsistencyScore]]:
        """Build cross-explainer consistency dict from consistency row."""
        if not consistency_row:
            return None

        cross_consistency = {}
        if consistency_row.get('cross_explanation_metric_consistency_embedding') is not None:
            cross_consistency['embedding'] = ConsistencyScore(
                value=consistency_row['cross_explanation_metric_consistency_embedding'],
                method="std_based"
            )
        if consistency_row.get('cross_explanation_metric_consistency_fuzz') is not None:
            cross_consistency['fuzz'] = ConsistencyScore(
                value=consistency_row['cross_explanation_metric_consistency_fuzz'],
                method="std_based"
            )
        if consistency_row.get('cross_explanation_metric_consistency_detection') is not None:
            cross_consistency['detection'] = ConsistencyScore(
                value=consistency_row['cross_explanation_metric_consistency_detection'],
                method="std_based"
            )
        if consistency_row.get('cross_explanation_overall_score_consistency') is not None:
            cross_consistency['overall_score'] = ConsistencyScore(
                value=consistency_row['cross_explanation_overall_score_consistency'],
                method="std_based"
            )

        return cross_consistency if cross_consistency else None

    def _load_pairwise_data(self) -> Optional[pl.DataFrame]:
        """
        Load pairwise semantic similarity data if available.

        Returns:
            DataFrame with pairwise similarities, or None if not available
        """
        try:
            pairwise_df = pl.read_parquet(self.pairwise_similarity_file)
            logger.info(f"Loaded pairwise similarity data: {len(pairwise_df)} rows")
            return pairwise_df
        except Exception as e:
            logger.warning(f"Pairwise similarity data not available: {e}")
            return None
