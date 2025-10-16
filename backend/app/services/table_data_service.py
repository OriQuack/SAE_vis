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

    # Default explainers and scorers for pre-computed consistency
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

        # Cache for pre-computed consistency scores
        self._precomputed_consistency = None
        self._precomputed_max_stds = None

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

        # Check configuration and load pre-computed scores if available
        config_check = self._check_default_configuration(filters)
        use_precomputed = False
        max_stds = None

        if config_check['all_default'] or config_check['can_use_per_feature'] or any(config_check['can_use_per_explainer'].values()):
            # Try to load pre-computed scores
            use_precomputed = self._load_precomputed_consistency()
            if use_precomputed:
                max_stds = self._precomputed_max_stds
                logger.info(f"Using pre-computed consistency scores for applicable metrics")

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

        # Compute max_stds if not using pre-computed or need for non-default metrics
        if not use_precomputed or not config_check['all_default']:
            # Compute max_stds dynamically for real-time calculation
            computed_max_stds = self.consistency.compute_max_stds(df, explainer_ids, global_stats)
            if max_stds is None:
                max_stds = computed_max_stds
            else:
                # Merge with pre-computed max_stds (use computed for non-default metrics)
                max_stds = {**max_stds, **computed_max_stds}

        # PASS 1.5: Compute cross-explainer consistency (if not using pre-computed)
        cross_explainer_map = {}
        if is_averaged and len(explainer_ids) >= 2 and not config_check['can_use_per_feature']:
            cross_explainer_map = self._compute_cross_explainer_consistency_std(
                df, explainer_ids, feature_ids, max_stds
            )

        # PASS 2: Build feature rows
        features = self._build_feature_rows_with_precomputed(
            df, feature_ids, explainer_ids, scorer_map,
            is_averaged, global_stats, pairwise_df, cross_explainer_map, explanations_df,
            config_check, max_stds
        )

        return FeatureTableDataResponse(
            features=features,
            total_features=len(features),
            explainer_ids=[MODEL_NAME_MAP.get(exp, exp) for exp in explainer_ids],
            scorer_ids=scorer_ids,
            is_averaged=is_averaged,
            global_stats=global_stats
        )

    def _load_precomputed_consistency(self) -> bool:
        """
        Load pre-computed consistency scores if available.

        Returns:
            True if loaded successfully, False otherwise
        """
        if self._precomputed_consistency is not None:
            return True  # Already loaded

        try:
            import polars as pl
            pl.enable_string_cache()  # Enable for categorical compatibility

            self._precomputed_consistency = pl.read_parquet(self.consistency_scores_file)

            # Try to load max_stds from metadata
            metadata_file = self.consistency_scores_file.with_suffix('.parquet.metadata.json')
            if metadata_file.exists():
                import json
                with open(metadata_file, 'r') as f:
                    metadata = json.load(f)
                    self._precomputed_max_stds = metadata.get('max_std_values', {})

            logger.info(f"Loaded pre-computed consistency scores: {len(self._precomputed_consistency)} rows")
            return True
        except Exception as e:
            logger.warning(f"Could not load pre-computed consistency scores: {e}")
            return False

    def _check_default_configuration(self, filters: Filters) -> Dict[str, any]:
        """
        Check which parts of the configuration match defaults.

        Args:
            filters: Filter criteria

        Returns:
            Dict with:
                - 'all_default': True if all explainers and scorers are defaults
                - 'explainers_default': Set of explainers that are defaults
                - 'scorers_default': True if all scorers are defaults
                - 'can_use_per_feature': True if can use pre-computed per-feature metrics
                - 'can_use_per_explainer': Dict of explainer -> bool for per-explainer metrics
        """
        # Get selected explainers and scorers
        selected_explainers = set(filters.llm_explainer) if filters.llm_explainer else set(self.DEFAULT_EXPLAINERS)
        selected_scorers = set(filters.llm_scorer) if filters.llm_scorer else set(self.DEFAULT_SCORERS)

        # Check which explainers are defaults
        explainers_default = selected_explainers.intersection(self.DEFAULT_EXPLAINERS)
        scorers_default = selected_scorers.issubset(self.DEFAULT_SCORERS)

        # All defaults check
        all_default = (
            selected_explainers.issubset(self.DEFAULT_EXPLAINERS) and
            selected_scorers.issubset(self.DEFAULT_SCORERS)
        )

        # Per-feature metrics need ALL explainers to be defaults
        can_use_per_feature = selected_explainers.issubset(self.DEFAULT_EXPLAINERS)

        # Per-explainer metrics can use if that explainer is default and scorers are defaults
        can_use_per_explainer = {
            exp: (exp in self.DEFAULT_EXPLAINERS and scorers_default)
            for exp in selected_explainers
        }

        return {
            'all_default': all_default,
            'explainers_default': explainers_default,
            'scorers_default': scorers_default,
            'can_use_per_feature': can_use_per_feature,
            'can_use_per_explainer': can_use_per_explainer
        }

    def _get_precomputed_consistency_for_feature(
        self,
        feature_id: int,
        explainer: str,
        config_check: Dict[str, any]
    ) -> Dict[str, any]:
        """
        Get pre-computed consistency scores for a feature-explainer pair.

        Args:
            feature_id: Feature ID
            explainer: Explainer ID
            config_check: Configuration check results

        Returns:
            Dict with consistency scores or empty dict if not available
        """
        if self._precomputed_consistency is None:
            return {}

        # Filter for this feature-explainer
        rows = self._precomputed_consistency.filter(
            (pl.col("feature_id") == feature_id) &
            (pl.col("llm_explainer") == explainer)
        )

        if len(rows) == 0:
            return {}

        row = rows.to_dicts()[0]
        result = {}

        # Per-explainer metrics (if this explainer can use pre-computed)
        if config_check['can_use_per_explainer'].get(explainer, False):
            if row.get('scorer_consistency_fuzz') is not None:
                from ..models.responses import ConsistencyScore
                result['scorer_consistency_fuzz'] = ConsistencyScore(
                    value=row['scorer_consistency_fuzz'],
                    method="std_based"
                )
            if row.get('scorer_consistency_detection') is not None:
                from ..models.responses import ConsistencyScore
                result['scorer_consistency_detection'] = ConsistencyScore(
                    value=row['scorer_consistency_detection'],
                    method="std_based"
                )
            if row.get('within_explanation_metric_consistency') is not None:
                from ..models.responses import ConsistencyScore
                result['within_explanation_metric_consistency'] = ConsistencyScore(
                    value=row['within_explanation_metric_consistency'],
                    method="normalized_std"
                )

        # Per-feature metrics (if all explainers are defaults)
        if config_check['can_use_per_feature']:
            if row.get('cross_explanation_consistency_embedding') is not None:
                from ..models.responses import ConsistencyScore
                result['cross_explanation_consistency_embedding'] = ConsistencyScore(
                    value=row['cross_explanation_consistency_embedding'],
                    method="std_based"
                )
            if row.get('cross_explanation_consistency_fuzz') is not None:
                from ..models.responses import ConsistencyScore
                result['cross_explanation_consistency_fuzz'] = ConsistencyScore(
                    value=row['cross_explanation_consistency_fuzz'],
                    method="std_based"
                )
            if row.get('cross_explanation_consistency_detection') is not None:
                from ..models.responses import ConsistencyScore
                result['cross_explanation_consistency_detection'] = ConsistencyScore(
                    value=row['cross_explanation_consistency_detection'],
                    method="std_based"
                )
            if row.get('llm_explainer_consistency') is not None:
                from ..models.responses import ConsistencyScore
                result['llm_explainer_consistency'] = ConsistencyScore(
                    value=row['llm_explainer_consistency'],
                    method="avg_pairwise_cosine"
                )

        return result

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

    def _compute_cross_explainer_consistency_std(
        self,
        df: pl.DataFrame,
        explainer_ids: List[str],
        feature_ids: List[int],
        max_stds: Dict[str, float]
    ) -> Dict[int, Dict[str, any]]:
        """
        Compute cross-explainer metric consistency using std-based method.

        For each feature, compute how consistent each metric (embedding, fuzz, detection)
        is across the selected explainers using 1 - (std / max_std).

        Args:
            df: Filtered DataFrame
            explainer_ids: List of explainer IDs
            feature_ids: List of feature IDs
            max_stds: Dict of max_std values for each metric

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

            # Compute std-based consistency for each metric
            consistency_dict = {}

            emb_consistency = self.consistency.compute_std_consistency(
                embedding_scores,
                max_stds.get('cross_explanation_embedding', 0.5)
            )
            if emb_consistency:
                consistency_dict['embedding'] = emb_consistency

            fuzz_consistency = self.consistency.compute_std_consistency(
                fuzz_scores_across,
                max_stds.get('cross_explanation_fuzz', 0.5)
            )
            if fuzz_consistency:
                consistency_dict['fuzz'] = fuzz_consistency

            det_consistency = self.consistency.compute_std_consistency(
                detection_scores_across,
                max_stds.get('cross_explanation_detection', 0.5)
            )
            if det_consistency:
                consistency_dict['detection'] = det_consistency

            if consistency_dict:
                cross_explainer_consistency_map[feature_id] = consistency_dict

        logger.info(f"Computed cross-explainer consistency (std-based) for {len(cross_explainer_consistency_map)} features")
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

    def _build_feature_rows_with_precomputed(
        self,
        df: pl.DataFrame,
        feature_ids: List[int],
        explainer_ids: List[str],
        scorer_map: Dict[str, str],
        is_averaged: bool,
        global_stats: Dict[str, Dict[str, float]],
        pairwise_df: Optional[pl.DataFrame],
        cross_explainer_map: Dict[int, Dict[str, any]],
        explanations_df: Optional[pl.DataFrame],
        config_check: Dict[str, any],
        max_stds: Dict[str, float]
    ) -> List[FeatureTableRow]:
        """
        Build feature rows with mixed pre-computed and real-time consistency scores.

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
            config_check: Configuration check results
            max_stds: Max std values for consistency calculations

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
                    explainers_dict[explainer_key] = self._build_averaged_explainer_data_with_precomputed(
                        explainer_df, embedding_score, feature_id,
                        explainer_ids, global_stats, pairwise_df, cross_explainer_map,
                        explainer, explanations_df, config_check, max_stds
                    )
                else:
                    # Build explainer data for individual scorer mode (single explainer)
                    explainers_dict[explainer_key] = self._build_individual_explainer_data_with_precomputed(
                        explainer_df, embedding_score, scorer_map, global_stats,
                        explainer, feature_id, explanations_df, config_check, max_stds
                    )

            if explainers_dict:
                features.append(FeatureTableRow(
                    feature_id=feature_id,
                    explainers=explainers_dict
                ))

        logger.info(f"Built {len(features)} feature rows with mixed pre-computed/real-time consistency")
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

        # Compute scorer consistency (CV) for each metric (same logic as individual mode)
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
            scorer_consistency=scorer_consistency if scorer_consistency else None,
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

    def _build_averaged_explainer_data_with_precomputed(
        self,
        explainer_df: pl.DataFrame,
        embedding_score: Optional[float],
        feature_id: int,
        explainer_ids: List[str],
        global_stats: Dict[str, Dict[str, float]],
        pairwise_df: Optional[pl.DataFrame],
        cross_explainer_map: Dict[int, Dict[str, any]],
        explainer: str,
        explanations_df: Optional[pl.DataFrame],
        config_check: Dict[str, any],
        max_stds: Dict[str, float]
    ) -> ExplainerScoreData:
        """
        Build ExplainerScoreData with mixed pre-computed and real-time consistency (averaged mode).

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
            config_check: Configuration check results
            max_stds: Max std values for consistency calculations

        Returns:
            ExplainerScoreData with mixed pre-computed and real-time consistency scores
        """
        # Get scores as before
        fuzz_dict = {'s1': None, 's2': None, 's3': None}
        detection_dict = {'s1': None, 's2': None, 's3': None}

        scorer_map = {}
        for i, row_dict in enumerate(explainer_df.iter_rows(named=True)):
            scorer = row_dict["llm_scorer"]
            scorer_key = f"s{i+1}"
            scorer_map[scorer] = scorer_key

            fuzz_dict[scorer_key] = round(row_dict["score_fuzz"], 3) if row_dict["score_fuzz"] is not None else None
            detection_dict[scorer_key] = round(row_dict["score_detection"], 3) if row_dict["score_detection"] is not None else None

        # Calculate averages
        fuzz_scores = explainer_df["score_fuzz"].to_list()
        detection_scores = explainer_df["score_detection"].to_list()

        fuzz_avg = round(sum(s for s in fuzz_scores if s is not None) / len([s for s in fuzz_scores if s is not None]), 3) if any(s is not None for s in fuzz_scores) else None
        detection_avg = round(sum(s for s in detection_scores if s is not None) / len([s for s in detection_scores if s is not None]), 3) if any(s is not None for s in detection_scores) else None

        # Try to get pre-computed consistency scores
        precomputed = self._get_precomputed_consistency_for_feature(feature_id, explainer, config_check)

        # Scorer consistency - use pre-computed or calculate
        scorer_consistency = {}
        if 'scorer_consistency_fuzz' in precomputed:
            scorer_consistency["fuzz"] = precomputed['scorer_consistency_fuzz']
        else:
            # Calculate using std method
            fuzz_scores_list = [fuzz_dict.get("s1"), fuzz_dict.get("s2"), fuzz_dict.get("s3")]
            fuzz_consistency = self.consistency.compute_std_consistency(
                fuzz_scores_list,
                max_stds.get('scorer_fuzz', 0.5)
            )
            if fuzz_consistency:
                scorer_consistency["fuzz"] = fuzz_consistency

        if 'scorer_consistency_detection' in precomputed:
            scorer_consistency["detection"] = precomputed['scorer_consistency_detection']
        else:
            detection_scores_list = [detection_dict.get("s1"), detection_dict.get("s2"), detection_dict.get("s3")]
            detection_consistency = self.consistency.compute_std_consistency(
                detection_scores_list,
                max_stds.get('scorer_detection', 0.5)
            )
            if detection_consistency:
                scorer_consistency["detection"] = detection_consistency

        # Within-explanation metric consistency - use pre-computed or calculate
        metric_consistency = None
        if 'within_explanation_metric_consistency' in precomputed:
            metric_consistency = precomputed['within_explanation_metric_consistency']
        else:
            # Calculate using normalized std method
            values = {
                'embedding': embedding_score,
                'fuzz': fuzz_avg,
                'detection': detection_avg
            }
            metric_consistency = self.consistency.compute_normalized_std_consistency(
                values, global_stats, max_stds.get('within_explanation', 0.5)
            )

        # LLM explainer consistency - use pre-computed or calculate
        explainer_consistency = None
        if 'llm_explainer_consistency' in precomputed:
            explainer_consistency = precomputed['llm_explainer_consistency']
        elif pairwise_df is not None:
            explainer_consistency = self.consistency.compute_semantic_similarity_consistency(
                feature_id, explainer_ids, pairwise_df
            )

        # Cross-explainer consistency - use pre-computed or from map
        cross_explainer_consistency = None
        if config_check['can_use_per_feature']:
            # Try to get from pre-computed
            if any(key.startswith('cross_explanation_consistency') for key in precomputed):
                cross_explainer_consistency = {
                    'embedding': precomputed.get('cross_explanation_consistency_embedding'),
                    'fuzz': precomputed.get('cross_explanation_consistency_fuzz'),
                    'detection': precomputed.get('cross_explanation_consistency_detection')
                }
                # Filter out None values
                cross_explainer_consistency = {k: v for k, v in cross_explainer_consistency.items() if v is not None}
        else:
            # Use from real-time calculation map
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
            scorer_consistency=scorer_consistency if scorer_consistency else None,
            metric_consistency=metric_consistency,
            explainer_consistency=explainer_consistency,
            cross_explainer_metric_consistency=cross_explainer_consistency
        )

    def _build_individual_explainer_data_with_precomputed(
        self,
        explainer_df: pl.DataFrame,
        embedding_score: Optional[float],
        scorer_map: Dict[str, str],
        global_stats: Dict[str, Dict[str, float]],
        explainer: str,
        feature_id: int,
        explanations_df: Optional[pl.DataFrame],
        config_check: Dict[str, any],
        max_stds: Dict[str, float]
    ) -> ExplainerScoreData:
        """
        Build ExplainerScoreData with mixed pre-computed and real-time consistency (individual mode).

        Args:
            explainer_df: DataFrame for this explainer
            embedding_score: Embedding score value
            scorer_map: Mapping from scorer ID to s1/s2/s3
            global_stats: Global statistics
            explainer: Explainer ID (full name)
            feature_id: Feature ID
            explanations_df: Explanations DataFrame (if available)
            config_check: Configuration check results
            max_stds: Max std values for consistency calculations

        Returns:
            ExplainerScoreData with mixed pre-computed and real-time consistency scores
        """
        # Get individual fuzz and detection scores per scorer
        fuzz_dict = {}
        detection_dict = {}

        for _, row in enumerate(explainer_df.iter_rows(named=True)):
            scorer = row["llm_scorer"]
            scorer_key = scorer_map[scorer]

            fuzz_dict[scorer_key] = round(row["score_fuzz"], 3) if row["score_fuzz"] is not None else None
            detection_dict[scorer_key] = round(row["score_detection"], 3) if row["score_detection"] is not None else None

        # Prepare score lists
        fuzz_scores_list = [fuzz_dict.get("s1"), fuzz_dict.get("s2"), fuzz_dict.get("s3")]
        detection_scores_list = [detection_dict.get("s1"), detection_dict.get("s2"), detection_dict.get("s3")]

        # Try to get pre-computed consistency scores
        precomputed = self._get_precomputed_consistency_for_feature(feature_id, explainer, config_check)

        # Scorer consistency - use pre-computed or calculate
        scorer_consistency = {}
        if 'scorer_consistency_fuzz' in precomputed:
            scorer_consistency["fuzz"] = precomputed['scorer_consistency_fuzz']
        else:
            # Calculate using std method
            fuzz_consistency = self.consistency.compute_std_consistency(
                fuzz_scores_list,
                max_stds.get('scorer_fuzz', 0.5)
            )
            if fuzz_consistency:
                scorer_consistency["fuzz"] = fuzz_consistency

        if 'scorer_consistency_detection' in precomputed:
            scorer_consistency["detection"] = precomputed['scorer_consistency_detection']
        else:
            detection_consistency = self.consistency.compute_std_consistency(
                detection_scores_list,
                max_stds.get('scorer_detection', 0.5)
            )
            if detection_consistency:
                scorer_consistency["detection"] = detection_consistency

        # Within-explanation metric consistency - use pre-computed or calculate
        metric_consistency = None
        if 'within_explanation_metric_consistency' in precomputed:
            metric_consistency = precomputed['within_explanation_metric_consistency']
        else:
            # Calculate using normalized std method
            fuzz_avg = np.mean([s for s in fuzz_scores_list if s is not None]) if any(s is not None for s in fuzz_scores_list) else None
            detection_avg = np.mean([s for s in detection_scores_list if s is not None]) if any(s is not None for s in detection_scores_list) else None

            values = {
                'embedding': embedding_score,
                'fuzz': fuzz_avg,
                'detection': detection_avg
            }
            metric_consistency = self.consistency.compute_normalized_std_consistency(
                values, global_stats, max_stds.get('within_explanation', 0.5)
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
