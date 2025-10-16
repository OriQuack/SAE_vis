"""
Table data service for feature-level score visualization.

Handles data processing for table visualization including:
- Multi-pass data processing (global stats, consistency, response building)
- Explainer and scorer aggregation logic
- Integration with DataService and ConsistencyService
"""

import polars as pl
import numpy as np
import logging
from typing import Dict, List, Optional
from pathlib import Path

from ..models.common import Filters
from ..models.responses import (
    FeatureTableDataResponse, FeatureTableRow,
    ExplainerScoreData, ScorerScoreSet
)
from .consistency_service import ConsistencyService

logger = logging.getLogger(__name__)

# Model name mapping for display
MODEL_NAME_MAP = {
    'hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4': 'llama',
    'Qwen/Qwen3-30B-A3B-Instruct-2507-FP8': 'qwen',
    'openai/gpt-oss-20b': 'openai'
}


class TableDataService:
    """Service for generating table visualization data."""

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

    async def get_table_data(self, filters: Filters) -> FeatureTableDataResponse:
        """
        Generate feature-level table data with consistency scores.

        Three-pass processing:
        1. Collect global statistics for normalization
        2. Compute cross-explainer consistency (if multiple explainers)
        3. Build feature rows with all consistency scores

        Args:
            filters: Filter criteria for data selection

        Returns:
            FeatureTableDataResponse with features and metadata
        """
        if not self.data_service.is_ready():
            raise RuntimeError("DataService not ready")

        # Apply filters and get base dataset
        df = self._apply_filters(filters)

        # Get metadata
        feature_ids = sorted(df["feature_id"].unique().to_list())
        explainer_ids = df["llm_explainer"].unique().to_list()
        scorer_ids = sorted(df["llm_scorer"].unique().to_list())
        is_averaged = len(explainer_ids) > 1

        # Create scorer mapping
        scorer_map = {scorer: f"s{i+1}" for i, scorer in enumerate(scorer_ids)}

        # Load pairwise similarity if needed
        pairwise_df = self._load_pairwise_data() if is_averaged else None

        # Load explanations
        explanations_df = self._load_explanations()

        # PASS 1: Collect global statistics
        global_stats = self._compute_global_stats(df, explainer_ids, feature_ids)

        # PASS 1.5: Compute cross-explainer consistency
        cross_explainer_map = {}
        if is_averaged and len(explainer_ids) >= 2:
            cross_explainer_map = self._compute_cross_explainer_consistency(
                df, explainer_ids, feature_ids
            )

        # PASS 2: Build feature rows
        features = self._build_feature_rows(
            df, feature_ids, explainer_ids, scorer_map,
            is_averaged, global_stats, pairwise_df, cross_explainer_map, explanations_df
        )

        return FeatureTableDataResponse(
            features=features,
            total_features=len(features),
            explainer_ids=[MODEL_NAME_MAP.get(exp, exp) for exp in explainer_ids],
            scorer_ids=scorer_ids,
            is_averaged=is_averaged,
            global_stats=global_stats
        )

    def _apply_filters(self, filters: Filters) -> pl.DataFrame:
        """
        Apply filters to get base dataset.

        Args:
            filters: Filter criteria

        Returns:
            Filtered DataFrame with needed columns
        """
        lf = self.data_service._df_lazy

        # Apply filters
        filter_conditions = []
        if filters.sae_id and len(filters.sae_id) > 0:
            filter_conditions.append(
                pl.col("sae_id").is_in(filters.sae_id)
            )
        if filters.explanation_method and len(filters.explanation_method) > 0:
            filter_conditions.append(
                pl.col("explanation_method").is_in(filters.explanation_method)
            )
        if filters.llm_explainer and len(filters.llm_explainer) > 0:
            filter_conditions.append(
                pl.col("llm_explainer").is_in(filters.llm_explainer)
            )
        if filters.llm_scorer and len(filters.llm_scorer) > 0:
            filter_conditions.append(
                pl.col("llm_scorer").is_in(filters.llm_scorer)
            )

        # Apply all filters
        if filter_conditions:
            for condition in filter_conditions:
                lf = lf.filter(condition)

        # Select needed columns
        df = lf.select([
            "feature_id",
            "llm_explainer",
            "llm_scorer",
            "score_embedding",
            "score_fuzz",
            "score_detection"
        ]).collect()

        logger.info(f"Filtered dataset: {len(df)} rows, {df['feature_id'].n_unique()} unique features")
        return df

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

    def _load_explanations(self) -> Optional[pl.DataFrame]:
        """
        Load explanation text data from parquet file.

        Returns:
            DataFrame with explanations (feature_id, llm_explainer, explanation_text), or None if not available
        """
        try:
            explanations_df = pl.read_parquet(self.explanations_file)
            logger.info(f"Loaded explanations data: {len(explanations_df)} rows")
            return explanations_df
        except Exception as e:
            logger.warning(f"Explanations data not available: {e}")
            return None

    def _compute_global_stats(
        self,
        df: pl.DataFrame,
        explainer_ids: List[str],
        feature_ids: List[int]
    ) -> Dict[str, Dict[str, float]]:
        """
        PASS 1: Collect global statistics for z-score normalization.

        Collects all metric values across features and explainers to compute
        global mean, std, min, and max for each metric (embedding, fuzz, detection).

        Args:
            df: Filtered DataFrame
            explainer_ids: List of explainer IDs
            feature_ids: List of feature IDs

        Returns:
            Dict with global stats: {'metric_name': {'mean': float, 'std': float, 'min': float, 'max': float}}
        """
        embedding_values = []
        fuzz_values = []
        detection_values = []

        for feature_id in feature_ids:
            feature_df = df.filter(pl.col("feature_id") == feature_id)

            for explainer in explainer_ids:
                explainer_df = feature_df.filter(pl.col("llm_explainer") == explainer)

                if len(explainer_df) == 0:
                    continue

                # Get embedding score
                embedding_scores = explainer_df["score_embedding"].to_list()
                embedding_score = embedding_scores[0] if embedding_scores else None
                if embedding_score is not None:
                    embedding_values.append(embedding_score)

                # Get fuzz and detection scores (averaged across scorers)
                fuzz_scores = explainer_df["score_fuzz"].to_list()
                detection_scores = explainer_df["score_detection"].to_list()

                fuzz_avg = np.mean([s for s in fuzz_scores if s is not None]) if any(s is not None for s in fuzz_scores) else None
                detection_avg = np.mean([s for s in detection_scores if s is not None]) if any(s is not None for s in detection_scores) else None

                if fuzz_avg is not None:
                    fuzz_values.append(fuzz_avg)
                if detection_avg is not None:
                    detection_values.append(detection_avg)

        # Compute global statistics for each metric (including min/max for frontend circle coloring)
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

        logger.info(f"Computed global statistics for {len(global_stats)} metrics")
        return global_stats

    def _compute_cross_explainer_consistency(
        self,
        df: pl.DataFrame,
        explainer_ids: List[str],
        feature_ids: List[int]
    ) -> Dict[int, Dict[str, any]]:
        """
        PASS 1.5: Compute cross-explainer metric consistency.

        For each feature, compute how consistent each metric (embedding, fuzz, detection)
        is across the selected explainers using inverse CV.

        Args:
            df: Filtered DataFrame
            explainer_ids: List of explainer IDs
            feature_ids: List of feature IDs

        Returns:
            Dict mapping feature_id to consistency scores per metric
        """
        cross_explainer_consistency_map = {}

        for feature_id in feature_ids:
            feature_df = df.filter(pl.col("feature_id") == feature_id)

            # Collect scores for each metric across explainers
            embedding_scores = []
            fuzz_scores_across = []
            detection_scores_across = []

            for explainer in explainer_ids:
                explainer_df = feature_df.filter(pl.col("llm_explainer") == explainer)

                if len(explainer_df) == 0:
                    continue

                # Embedding (one per explainer)
                emb = explainer_df["score_embedding"].to_list()
                if emb and emb[0] is not None:
                    embedding_scores.append(emb[0])

                # Fuzz (averaged across scorers)
                fuzz = explainer_df["score_fuzz"].to_list()
                fuzz_avg = np.mean([s for s in fuzz if s is not None]) if any(s is not None for s in fuzz) else None
                if fuzz_avg is not None:
                    fuzz_scores_across.append(fuzz_avg)

                # Detection (averaged across scorers)
                det = explainer_df["score_detection"].to_list()
                det_avg = np.mean([s for s in det if s is not None]) if any(s is not None for s in det) else None
                if det_avg is not None:
                    detection_scores_across.append(det_avg)

            # Compute inverse CV for each metric
            consistency_dict = {}

            emb_cv = self.consistency.compute_inverse_cv(embedding_scores)
            if emb_cv:
                consistency_dict['embedding'] = emb_cv

            fuzz_cv = self.consistency.compute_inverse_cv(fuzz_scores_across)
            if fuzz_cv:
                consistency_dict['fuzz'] = fuzz_cv

            det_cv = self.consistency.compute_inverse_cv(detection_scores_across)
            if det_cv:
                consistency_dict['detection'] = det_cv

            if consistency_dict:
                cross_explainer_consistency_map[feature_id] = consistency_dict

        logger.info(f"Computed cross-explainer consistency for {len(cross_explainer_consistency_map)} features")
        return cross_explainer_consistency_map

    def _build_feature_rows(
        self,
        df: pl.DataFrame,
        feature_ids: List[int],
        explainer_ids: List[str],
        scorer_map: Dict[str, str],
        is_averaged: bool,
        global_stats: Dict[str, Dict[str, float]],
        pairwise_df: Optional[pl.DataFrame],
        cross_explainer_map: Dict[int, Dict[str, any]],
        explanations_df: Optional[pl.DataFrame]
    ) -> List[FeatureTableRow]:
        """
        PASS 2: Build feature rows with all consistency scores.

        For each feature, build a row with scores and consistency metrics
        for each explainer.

        Args:
            df: Filtered DataFrame
            feature_ids: List of feature IDs
            explainer_ids: List of explainer IDs
            scorer_map: Mapping from scorer ID to s1/s2/s3
            is_averaged: Whether to average across scorers
            global_stats: Global statistics for z-score normalization
            pairwise_df: Pairwise similarity DataFrame (if available)
            cross_explainer_map: Cross-explainer consistency map
            explanations_df: Explanations DataFrame (if available)

        Returns:
            List of FeatureTableRow objects
        """
        features = []
        for feature_id in feature_ids:
            # Filter data for this feature
            feature_df = df.filter(pl.col("feature_id") == feature_id)

            explainers_dict = {}
            for explainer in explainer_ids:
                # Filter for this explainer
                explainer_df = feature_df.filter(pl.col("llm_explainer") == explainer)

                if len(explainer_df) == 0:
                    continue

                # Get embedding score (one per explainer, not averaged)
                embedding_scores = explainer_df["score_embedding"].to_list()
                embedding_score = round(embedding_scores[0], 3) if embedding_scores else None

                # Use short name for explainer
                explainer_key = MODEL_NAME_MAP.get(explainer, explainer)

                if is_averaged:
                    # Build explainer data for averaged mode (multiple explainers)
                    explainers_dict[explainer_key] = self._build_averaged_explainer_data(
                        explainer_df, embedding_score, feature_id,
                        explainer_ids, global_stats, pairwise_df, cross_explainer_map,
                        explainer, explanations_df
                    )
                else:
                    # Build explainer data for individual scorer mode (single explainer)
                    explainers_dict[explainer_key] = self._build_individual_explainer_data(
                        explainer_df, embedding_score, scorer_map, global_stats,
                        explainer, feature_id, explanations_df
                    )

            if explainers_dict:
                features.append(FeatureTableRow(
                    feature_id=feature_id,
                    explainers=explainers_dict
                ))

        logger.info(f"Built {len(features)} feature rows")
        return features

    def _build_averaged_explainer_data(
        self,
        explainer_df: pl.DataFrame,
        embedding_score: Optional[float],
        feature_id: int,
        explainer_ids: List[str],
        global_stats: Dict[str, Dict[str, float]],
        pairwise_df: Optional[pl.DataFrame],
        cross_explainer_map: Dict[int, Dict[str, any]],
        explainer: str,
        explanations_df: Optional[pl.DataFrame]
    ) -> ExplainerScoreData:
        """
        Build ExplainerScoreData for averaged mode (multiple explainers selected).

        Note: In averaged mode, we still preserve individual scorer values (s1, s2, s3)
        for visualization purposes (colored circles), but display shows averaged value.

        Args:
            explainer_df: DataFrame for this explainer
            embedding_score: Embedding score value
            feature_id: Feature ID
            explainer_ids: List of all explainer IDs
            global_stats: Global statistics
            pairwise_df: Pairwise similarity DataFrame
            cross_explainer_map: Cross-explainer consistency map
            explainer: Explainer ID (full name)
            explanations_df: Explanations DataFrame (if available)

        Returns:
            ExplainerScoreData with individual and averaged scores and consistency metrics
        """
        # Get individual fuzz and detection scores per scorer (preserve for circle visualization)
        fuzz_dict = {'s1': None, 's2': None, 's3': None}
        detection_dict = {'s1': None, 's2': None, 's3': None}

        scorer_map = {}
        for i, row_dict in enumerate(explainer_df.iter_rows(named=True)):
            scorer = row_dict["llm_scorer"]
            scorer_key = f"s{i+1}"
            scorer_map[scorer] = scorer_key

            fuzz_dict[scorer_key] = round(row_dict["score_fuzz"], 3) if row_dict["score_fuzz"] is not None else None
            detection_dict[scorer_key] = round(row_dict["score_detection"], 3) if row_dict["score_detection"] is not None else None

        # Also calculate averages for consistency computation
        fuzz_scores = explainer_df["score_fuzz"].to_list()
        detection_scores = explainer_df["score_detection"].to_list()

        fuzz_avg = round(sum(s for s in fuzz_scores if s is not None) / len([s for s in fuzz_scores if s is not None]), 3) if any(s is not None for s in fuzz_scores) else None
        detection_avg = round(sum(s for s in detection_scores if s is not None) / len([s for s in detection_scores if s is not None]), 3) if any(s is not None for s in detection_scores) else None

        # Compute metric consistency using global z-score normalization
        metric_consistency = self.consistency.compute_global_zscore_consistency(
            embedding_score, fuzz_avg, detection_avg, global_stats
        )

        # Compute explainer semantic consistency (average pairwise cosine similarity)
        explainer_consistency = None
        if pairwise_df is not None:
            explainer_consistency = self.consistency.compute_semantic_similarity_consistency(
                feature_id, explainer_ids, pairwise_df
            )

        # Get cross-explainer consistency for this feature (same for all explainers)
        cross_explainer_consistency = cross_explainer_map.get(feature_id)

        # Look up explanation text
        explanation_text = None
        if explanations_df is not None:
            explanation_rows = explanations_df.filter(
                (pl.col("feature_id") == feature_id) &
                (pl.col("llm_explainer") == explainer)
            )
            if len(explanation_rows) > 0:
                explanation_text = explanation_rows["explanation_text"].to_list()[0]

        return ExplainerScoreData(
            embedding=embedding_score,
            fuzz=ScorerScoreSet(s1=fuzz_dict['s1'], s2=fuzz_dict['s2'], s3=fuzz_dict['s3']),
            detection=ScorerScoreSet(s1=detection_dict['s1'], s2=detection_dict['s2'], s3=detection_dict['s3']),
            explanation_text=explanation_text,
            scorer_consistency=None,  # Not applicable when averaged
            metric_consistency=metric_consistency,
            explainer_consistency=explainer_consistency,
            cross_explainer_metric_consistency=cross_explainer_consistency
        )

    def _build_individual_explainer_data(
        self,
        explainer_df: pl.DataFrame,
        embedding_score: Optional[float],
        scorer_map: Dict[str, str],
        global_stats: Dict[str, Dict[str, float]],
        explainer: str,
        feature_id: int,
        explanations_df: Optional[pl.DataFrame]
    ) -> ExplainerScoreData:
        """
        Build ExplainerScoreData for individual scorer mode (single explainer selected).

        Args:
            explainer_df: DataFrame for this explainer
            embedding_score: Embedding score value
            scorer_map: Mapping from scorer ID to s1/s2/s3
            global_stats: Global statistics
            explainer: Explainer ID (full name)
            feature_id: Feature ID
            explanations_df: Explanations DataFrame (if available)

        Returns:
            ExplainerScoreData with individual scorer scores and consistency metrics
        """
        # Get individual fuzz and detection scores per scorer
        fuzz_dict = {}
        detection_dict = {}

        for _, row in enumerate(explainer_df.iter_rows(named=True)):
            scorer = row["llm_scorer"]
            scorer_key = scorer_map[scorer]

            fuzz_dict[scorer_key] = round(row["score_fuzz"], 3) if row["score_fuzz"] is not None else None
            detection_dict[scorer_key] = round(row["score_detection"], 3) if row["score_detection"] is not None else None

        # Compute scorer consistency (CV) for each metric
        fuzz_scores_list = [fuzz_dict.get("s1"), fuzz_dict.get("s2"), fuzz_dict.get("s3")]
        detection_scores_list = [detection_dict.get("s1"), detection_dict.get("s2"), detection_dict.get("s3")]

        scorer_consistency = {}
        fuzz_cv = self.consistency.compute_inverse_cv(fuzz_scores_list)
        if fuzz_cv:
            scorer_consistency["fuzz"] = fuzz_cv

        detection_cv = self.consistency.compute_inverse_cv(detection_scores_list)
        if detection_cv:
            scorer_consistency["detection"] = detection_cv

        # Compute metric consistency using global z-score normalization
        # Use average of scorers for each metric
        fuzz_avg = np.mean([s for s in fuzz_scores_list if s is not None]) if any(s is not None for s in fuzz_scores_list) else None
        detection_avg = np.mean([s for s in detection_scores_list if s is not None]) if any(s is not None for s in detection_scores_list) else None
        metric_consistency = self.consistency.compute_global_zscore_consistency(
            embedding_score, fuzz_avg, detection_avg, global_stats
        )

        # Look up explanation text
        explanation_text = None
        if explanations_df is not None:
            explanation_rows = explanations_df.filter(
                (pl.col("feature_id") == feature_id) &
                (pl.col("llm_explainer") == explainer)
            )
            if len(explanation_rows) > 0:
                explanation_text = explanation_rows["explanation_text"].to_list()[0]

        return ExplainerScoreData(
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
            scorer_consistency=scorer_consistency if scorer_consistency else None,
            metric_consistency=metric_consistency,
            explainer_consistency=None,  # Not applicable in single explainer mode
            cross_explainer_metric_consistency=None  # Not applicable in single explainer mode
        )
