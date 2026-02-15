"""
Table data service for feature-level score visualization.

Clean flow:
1. Fetch scores from features.parquet
2. Fetch explanations from features.parquet (explanation_text column)
3. Extract pairwise similarity from nested semantic_similarity structure
4. Build response (pure assembly, no calculations)
"""

import polars as pl
import numpy as np
import logging
import time
from typing import Dict, List, Optional, Tuple

from ..models.common import Filters
from ..models.table import (
    FeatureTableDataResponse, FeatureTableRow,
    ExplainerScoreData, ScorerScoreSet,
    HighlightedExplanation
)
from .alignment_service import AlignmentService
from .data_constants import (
    COL_DECODER_SIMILARITY,
    COL_DECODER_SIMILARITY_MERGE_THRESHOLD,
)
from .data_service import DataService

logger = logging.getLogger(__name__)

# Model name mapping for display (16k dataset)
MODEL_NAME_MAP = {
    'hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4': 'llama',
    'google/gemini-flash-2.5': 'gemini',
    'openai/gpt-4o-mini': 'openai'
}


def extract_scores_from_explainer_df(
    explainer_data: List[dict],
    scorer_map: Optional[Dict[str, str]] = None
) -> Tuple[Dict[str, Optional[float]], Dict[str, Optional[float]], Optional[float]]:
    """
    Extract score dictionaries from explainer data.

    Args:
        explainer_data: List of dicts for one explainer
        scorer_map: Optional mapping from scorer ID to s1/s2/s3.
                    If None, creates automatic mapping (s1, s2, s3)

    Returns:
        Tuple of (fuzz_dict, detection_dict, embedding_score):
        - fuzz_dict: {'s1': val, 's2': val, 's3': val}
        - detection_dict: {'s1': val, 's2': val, 's3': val}
        - embedding_score: float or None
    """
    fuzz_dict = {'s1': None, 's2': None, 's3': None}
    detection_dict = {'s1': None, 's2': None, 's3': None}
    embedding_score = None

    if len(explainer_data) == 0:
        return fuzz_dict, detection_dict, embedding_score

    for score_dict in explainer_data:
        score = score_dict.get("score_embedding")
        if score is not None:
            embedding_score = round(score, 3)
            break

    if scorer_map is None:
        scorer_map = {}
        for i, score_dict in enumerate(explainer_data):
            scorer = score_dict["llm_scorer"]
            scorer_key = f"s{i+1}"
            scorer_map[scorer] = scorer_key

            fuzz_val = score_dict.get("score_fuzz")
            detection_val = score_dict.get("score_detection")

            fuzz_dict[scorer_key] = round(fuzz_val, 3) if fuzz_val is not None else None
            detection_dict[scorer_key] = round(detection_val, 3) if detection_val is not None else None
    else:
        for score_dict in explainer_data:
            scorer = score_dict["llm_scorer"]
            scorer_key = scorer_map.get(scorer)

            if scorer_key:
                fuzz_val = score_dict.get("score_fuzz")
                detection_val = score_dict.get("score_detection")

                fuzz_dict[scorer_key] = round(fuzz_val, 3) if fuzz_val is not None else None
                detection_dict[scorer_key] = round(detection_val, 3) if detection_val is not None else None

    return fuzz_dict, detection_dict, embedding_score


class TableDataService:
    """Service for generating table visualization data."""

    def __init__(self, data_service: DataService, alignment_service: Optional[AlignmentService] = None):
        """
        Initialize TableDataService.

        Args:
            data_service: Instance of DataService for raw data access
            alignment_service: Optional AlignmentService for explanation highlighting
        """
        self.data_service = data_service
        self.alignment_service = alignment_service

        # Read explainers and scorers dynamically from data
        self._default_explainers = None
        self._default_scorers = None

        # Load intra-feature similarity metrics from svm_feature_metrics.parquet
        self._intra_feature_sim_lookup: Dict[int, float] = self._load_intra_feature_sim_lookup()

    # TODO: Loading from different parquet is actually stupid:
    # should be merged into main features.parquet in data pipeline
    def _load_intra_feature_sim_lookup(self) -> Dict[int, float]:
        """
        Load intra-feature similarity from svm_feature_metrics.parquet via DataService.

        Computes intra_feature_sim = max(intra_ngram_jaccard, intra_semantic_sim)
        for each feature and returns a lookup dict.

        Returns:
            Dict mapping feature_id to intra_feature_sim value
        """
        try:
            if self.data_service._svm_feature_metrics_lazy is None:
                logger.warning("svm_feature_metrics not loaded in DataService")
                return {}

            df = self.data_service._svm_feature_metrics_lazy.collect()
            lookup = {}

            # Extract columns as lists for fast iteration
            feature_ids = df["feature_id"].to_list()
            intra_ngram = df["intra_ngram_jaccard"].to_list()
            intra_semantic = df["intra_semantic_sim"].to_list()

            for i, feature_id in enumerate(feature_ids):
                ngram_val = intra_ngram[i] if intra_ngram[i] is not None else 0.0
                semantic_val = intra_semantic[i] if intra_semantic[i] is not None else 0.0
                lookup[feature_id] = max(ngram_val, semantic_val)

            logger.info(f"Loaded intra_feature_sim lookup: {len(lookup)} features")
            return lookup

        except Exception as e:
            logger.warning(f"Could not load intra_feature_sim lookup: {e}")
            return {}

    def _get_default_explainers(self) -> List[str]:
        """Get all unique explainers from the dataset."""
        if self._default_explainers is None:
            df = self.data_service._df_lazy.select("llm_explainer").unique().collect()
            self._default_explainers = sorted(df["llm_explainer"].to_list())
            logger.info(f"Detected {len(self._default_explainers)} explainers from data: {self._default_explainers}")
        return self._default_explainers

    def _get_default_scorers(self) -> List[str]:
        """Get all unique scorers from the dataset (uses llm_scorer column after DataService transformation)."""
        if self._default_scorers is None:
            try:
                # After DataService transformation, llm_scorer is a flat column
                df = self.data_service._df_lazy.select("llm_scorer").unique().collect()
                self._default_scorers = sorted(df["llm_scorer"].to_list())
                logger.info(f"Detected {len(self._default_scorers)} scorers from data: {self._default_scorers}")
            except Exception as e:
                logger.error(f"Error detecting scorers: {e}")
                raise
        return self._default_scorers

    async def get_table_data(self, filters: Filters) -> FeatureTableDataResponse:
        """
        Generate feature-level table data.

        Clean 4-step flow:
        1. Fetch scores from features.parquet
        2. Fetch explanations from features.parquet
        3. Extract pairwise similarity from nested semantic_similarity structure
        4. Build response (pure assembly, no calculations)

        Performance monitoring: Logs timing for each step to identify bottlenecks.

        Args:
            filters: Filter criteria for data selection

        Returns:
            FeatureTableDataResponse with features and metadata
        """
        start_time = time.time()
        logger.info("Starting table data generation")

        if not self.data_service.is_ready():
            raise RuntimeError("DataService not ready")

        # Get default explainers/scorers from data
        default_explainers = self._get_default_explainers()
        default_scorers = self._get_default_scorers()

        # Validate filters are default (all explainers/scorers selected)
        if not self._is_default_configuration(filters, default_explainers, default_scorers):
            raise ValueError(
                f"Only default filters are supported. "
                f"All {len(default_explainers)} explainers must be selected, "
                f"with no sae_id or explanation_method filters applied."
            )

        # STEP 1: Fetch scores from features.parquet
        step_start = time.time()
        scores_df = self._fetch_scores()
        logger.info(f"✓ Step 1 (Fetch scores): {time.time() - step_start:.3f}s")

        # Extract metadata
        feature_ids = sorted(scores_df["feature_id"].unique().to_list())
        explainer_ids = scores_df["llm_explainer"].unique().to_list()
        # Scorer IDs are extracted from nested scores structure
        scorer_ids = sorted(scores_df["llm_scorer"].unique().to_list())

        # Create scorer mapping
        scorer_map = {scorer: f"s{i+1}" for i, scorer in enumerate(scorer_ids)}

        # OPTIMIZATION: Preload all explanation texts in single batch query (Phase 2)
        if self.alignment_service and self.alignment_service.is_ready:
            step_start = time.time()
            self.alignment_service.preload_explanations(feature_ids, explainer_ids)
            logger.info(f"✓ Preload alignment: {time.time() - step_start:.3f}s ({len(feature_ids)} features × {len(explainer_ids)} explainers)")

        # STEP 2: Fetch explanations from features.parquet
        step_start = time.time()
        explanations_df = self._fetch_explanations()
        logger.info(f"✓ Step 2 (Fetch explanations): {time.time() - step_start:.3f}s")

        # STEP 3: Fetch pairwise semantic similarity data from nested structure
        step_start = time.time()
        pairwise_df = self._fetch_pairwise_similarity(feature_ids, explainer_ids)
        logger.info(f"✓ Step 3 (Fetch pairwise similarity): {time.time() - step_start:.3f}s")

        # STEP 4: Fetch inter-feature activation similarity data
        step_start = time.time()
        interfeature_df = self._fetch_interfeature_similarity(feature_ids)
        logger.info(f"✓ Step 4 (Fetch interfeature similarity): {time.time() - step_start:.3f}s")

        # STEP 5: Build response (pure assembly, no calculations)
        step_start = time.time()
        features = self._build_feature_rows_simple(
            scores_df, explanations_df, pairwise_df, interfeature_df,
            feature_ids, explainer_ids, scorer_map
        )
        logger.info(f"✓ Step 5 (Build feature rows): {time.time() - step_start:.3f}s")

        # Compute global stats for frontend normalization
        step_start = time.time()
        global_stats = self._compute_global_stats(scores_df, explainer_ids, feature_ids)
        logger.info(f"✓ Global stats: {time.time() - step_start:.3f}s")

        total_time = time.time() - start_time
        logger.info(f"✓ Table data generation complete: {total_time:.3f}s ({len(features)} features)")

        return FeatureTableDataResponse(
            features=features,
            total_features=len(features),
            explainer_ids=[MODEL_NAME_MAP.get(exp, exp) for exp in explainer_ids],
            scorer_ids=scorer_ids,
            global_stats=global_stats
        )

    def _fetch_scores(self) -> pl.DataFrame:
        """
        STEP 1: Fetch scores from features.parquet (already flattened by DataService).

        NOTE: DataService already transforms nested schema to flat during initialization.
        Assumes default filters (all explainers, 1 scorer). Validation done in get_table_data().

        Returns:
            DataFrame with scores (feature_id, llm_explainer, llm_scorer, score_*)
        """
        lf = self.data_service._df_lazy

        # Filter to default explainers only
        default_explainers = self._get_default_explainers()
        lf = lf.filter(pl.col("llm_explainer").is_in(default_explainers))

        # Select base columns (already flattened by DataService)
        base_columns = [
            "feature_id", "llm_explainer", "llm_scorer",
            "score_embedding", "score_fuzz", "score_detection", "quality_score"
        ]

        # Add additional columns if available
        available_columns = lf.columns

        if COL_DECODER_SIMILARITY in available_columns:
            base_columns.append(COL_DECODER_SIMILARITY)

        if COL_DECODER_SIMILARITY_MERGE_THRESHOLD in available_columns:
            base_columns.append(COL_DECODER_SIMILARITY_MERGE_THRESHOLD)

        logger.debug(f"Selecting columns: {base_columns}")
        df = lf.select(base_columns).collect()

        logger.info(f"Fetched scores: {len(df)} rows, {df['feature_id'].n_unique()} unique features")
        return df


    def _is_default_configuration(self, filters: Filters, default_explainers: List[str], default_scorers: List[str]) -> bool:
        """
        Check if current filters match default configuration.

        Args:
            filters: Filter criteria
            default_explainers: Expected explainers from data
            default_scorers: Expected scorers from data

        Returns:
            True if all filters are default/empty, False otherwise
        """
        # Check explainers
        if filters.llm_explainer and len(filters.llm_explainer) > 0:
            # If explainer filter is set, check if it matches defaults
            if set(filters.llm_explainer) != set(default_explainers):
                return False

        # Check scorers (optional - may not be filtered in new schema)
        if filters.llm_scorer and len(filters.llm_scorer) > 0:
            if set(filters.llm_scorer) != set(default_scorers):
                return False

        # Check other filters (sae_id, explanation_method should be empty for default)
        if filters.sae_id and len(filters.sae_id) > 0:
            return False
        if filters.explanation_method and len(filters.explanation_method) > 0:
            return False

        return True

    def _fetch_explanations(self) -> Optional[pl.DataFrame]:
        """
        Fetch explanations from features.parquet (explanation_text column).

        NOTE: Assumes default filters, no filtering applied.

        Returns:
            DataFrame with explanations (feature_id, llm_explainer, explanation_text)
        """
        try:
            # Get the main lazy frame from DataService
            df_lazy = self.data_service._df_lazy

            if df_lazy is None:
                logger.warning("DataService lazy frame is not initialized")
                return None

            # Select relevant columns and filter to default explainers
            default_explainers = self._get_default_explainers()
            explanations_df = (
                df_lazy
                .filter(pl.col("llm_explainer").is_in(default_explainers))
                .select(["feature_id", "llm_explainer", "explanation_text"])
                .unique()  # Remove duplicates since explanations are same across scorers
                .collect()
            )

            logger.info(f"Fetched explanations: {len(explanations_df)} rows")
            return explanations_df
        except Exception as e:
            logger.warning(f"Explanations data not available: {e}")
            return None

    def _fetch_pairwise_similarity(
        self,
        feature_ids: List[int],
        explainer_ids: List[str]
    ) -> Optional[pl.DataFrame]:
        """
        Extract pairwise semantic similarity from nested semantic_similarity structure.

        semantic_similarity is List(Struct([explainer: Categorical, cosine_similarity: Float32]))
        We need to transform this to pairwise format: (feature_id, explainer_1, explainer_2, cosine_similarity)

        Args:
            feature_ids: List of feature IDs to filter
            explainer_ids: List of explainer IDs to filter

        Returns:
            DataFrame with pairwise similarities (feature_id, explainer_1, explainer_2, cosine_similarity)
            or None if data not available
        """
        try:
            pl.enable_string_cache()

            # Load features.parquet with semantic_similarity nested structure
            lf = self.data_service._df_lazy

            # Filter to requested features and explainers
            lf = lf.filter(
                pl.col("feature_id").is_in(feature_ids) &
                pl.col("llm_explainer").is_in(explainer_ids)
            )

            # Select only needed columns and collect
            df = lf.select(["feature_id", "llm_explainer", "semantic_similarity"]).collect()

            # Explode the list to create one row per semantic_similarity element
            df = df.explode("semantic_similarity")

            # Filter out null values
            df = df.filter(pl.col("semantic_similarity").is_not_null())

            if len(df) == 0:
                logger.warning("No pairwise similarity data after exploding nested structure")
                return None

            # Unnest the struct to flatten explainer and cosine_similarity fields
            df = df.unnest("semantic_similarity")

            # Rename columns to match expected format
            pairwise_df = df.rename({
                "llm_explainer": "explainer_1",
                "explainer": "explainer_2"
            })

            # Select final columns
            pairwise_df = pairwise_df.select([
                "feature_id",
                "explainer_1",
                "explainer_2",
                "cosine_similarity"
            ])

            logger.info(f"Vectorized pairwise similarity extraction: {len(pairwise_df)} rows")
            return pairwise_df

        except Exception as e:
            logger.warning(f"Could not extract pairwise similarity from nested structure: {e}")
            return None

    def _fetch_interfeature_similarity(
        self,
        feature_ids: List[int]
    ) -> Optional[pl.DataFrame]:
        """
        Fetch inter-feature activation similarity data (flat DataFrame).

        Returns FLAT DataFrame (no nested aggregation) for efficient partition_by in lookup building.
        Note: pattern_type and best_ngram fields are PRE-COMPUTED in pipeline step_11.

        Args:
            feature_ids: List of feature IDs to filter

        Returns:
            FLAT DataFrame with inter-feature similarity rows, or None if data not available
        """
        try:
            if self.data_service._interfeature_similarity_lazy is None:
                logger.warning("Inter-feature similarity data not loaded")
                return None

            # Filter pairs where main_feature_id is in our set - return FLAT (no group_by)
            df = self.data_service._interfeature_similarity_lazy.filter(
                pl.col("main_feature_id").is_in(feature_ids)
            ).collect()

            if len(df) == 0:
                return None

            logger.info(f"Fetched inter-feature similarity: {len(df)} rows (flat)")
            return df

        except Exception as e:
            logger.warning(f"Could not fetch inter-feature similarity: {e}")
            return None

    def _compute_global_stats(
        self,
        scores_df: pl.DataFrame,
        explainer_ids: List[str],
        feature_ids: List[int]
    ) -> Dict[str, Dict[str, float]]:
        """
        Compute global statistics for frontend min-max normalization.

        Flow: simple scores -> min-max normalization -> average -> quality score

        Args:
            scores_df: Scores DataFrame
            explainer_ids: List of explainer IDs
            feature_ids: List of feature IDs

        Returns:
            Dict with global stats: {'metric_name': {'min': float, 'max': float}}
        """
        # Group by feature_id and explainer
        grouped = scores_df.group_by(["feature_id", "llm_explainer"]).agg([
            # Embedding: take first non-null value per explainer
            pl.col("score_embedding").drop_nulls().first().alias("embedding"),
            # Fuzz and detection: average across scorers
            pl.col("score_fuzz").mean().alias("fuzz_avg"),
            pl.col("score_detection").mean().alias("detection_avg")
        ])

        # Extract values (filter out nulls using Polars operations)
        embedding_values = grouped.filter(
            pl.col("embedding").is_not_null()
        )["embedding"].to_list()

        fuzz_values = grouped.filter(
            pl.col("fuzz_avg").is_not_null()
        )["fuzz_avg"].to_list()

        detection_values = grouped.filter(
            pl.col("detection_avg").is_not_null()
        )["detection_avg"].to_list()

        # Compute simplified global statistics (min/max only)
        global_stats = {}

        if len(embedding_values) >= 2:
            global_stats['embedding'] = {
                'min': float(np.min(embedding_values)),
                'max': float(np.max(embedding_values))
            }

        if len(fuzz_values) >= 2:
            global_stats['fuzz'] = {
                'min': float(np.min(fuzz_values)),
                'max': float(np.max(fuzz_values))
            }

        if len(detection_values) >= 2:
            global_stats['detection'] = {
                'min': float(np.min(detection_values)),
                'max': float(np.max(detection_values))
            }

        return global_stats

    def _build_feature_rows_simple(
        self,
        scores_df: pl.DataFrame,
        explanations_df: Optional[pl.DataFrame],
        pairwise_df: Optional[pl.DataFrame],
        interfeature_df: Optional[pl.DataFrame],
        feature_ids: List[int],
        explainer_ids: List[str],
        scorer_map: Dict[str, str]
    ) -> List[FeatureTableRow]:
        """
        Build feature rows (pure assembly, no calculations).

        Args:
            scores_df: Scores DataFrame from features.parquet
            explanations_df: Explanations DataFrame (optional)
            pairwise_df: Pairwise similarity DataFrame (optional)
            interfeature_df: Inter-feature similarity DataFrame (optional)
            feature_ids: List of feature IDs
            explainer_ids: List of explainer IDs
            scorer_map: Mapping from scorer ID to s1/s2/s3

        Returns:
            List of FeatureTableRow objects
        """
        # Pre-compute all lookups for O(1) access in main loop
        scores_lookup = self._build_scores_lookup(scores_df)
        explanations_lookup = self._build_explanations_lookup(explanations_df) if explanations_df is not None else {}
        pairwise_lookup = self._build_pairwise_lookup(pairwise_df) if pairwise_df is not None else {}
        interfeature_lookup = self._build_all_interfeature_lookups(interfeature_df) if interfeature_df is not None else {}
        decoder_lookup, merge_threshold_lookup = self._build_decoder_and_merge_lookups(scores_df)
        logger.debug(f"Lookups built: scores={len(scores_lookup)}, explanations={len(explanations_lookup)}, "
                     f"pairwise={len(pairwise_lookup)}, interfeature={len(interfeature_lookup)}, "
                     f"decoder={len(decoder_lookup)}, merge={len(merge_threshold_lookup)}")

        features = []

        for feature_id in feature_ids:
            decoder_sim_value = decoder_lookup.get(feature_id)
            decoder_similarity = None

            # Get decoder_similarity_merge_threshold for this feature
            merge_threshold = merge_threshold_lookup.get(feature_id)

            if decoder_sim_value is not None:
                # Get interfeature lookup for this feature (already pre-computed)
                feature_interf_lookup = interfeature_lookup.get(feature_id, {})

                # Convert from Polars struct to dict format and attach inter-feature similarity
                decoder_similarity = []
                for item in decoder_sim_value:
                    similar_feature_id = int(item["feature_id"])

                    decoder_feature = {
                        "feature_id": similar_feature_id,
                        "cosine_similarity": float(item["cosine_similarity"])
                    }

                    # Attach inter-feature similarity if available
                    if similar_feature_id in feature_interf_lookup:
                        interf_info = feature_interf_lookup[similar_feature_id]
                        decoder_feature["inter_feature_similarity"] = {
                            "pattern_type": interf_info["pattern_type"],
                            "semantic_similarity": interf_info["semantic_similarity"],
                            "char_jaccard": interf_info["char_jaccard"],
                            "word_jaccard": interf_info["word_jaccard"],
                            "best_ngram_type": interf_info.get("best_ngram_type"),
                            "best_ngram_text": interf_info.get("best_ngram_text"),
                            "main_ngram_positions": interf_info.get("main_ngram_positions"),
                            "similar_ngram_positions": interf_info.get("similar_ngram_positions"),
                        }
                    else:
                        decoder_feature["inter_feature_similarity"] = {
                            "pattern_type": "None",
                            "semantic_similarity": None,
                            "char_jaccard": None,
                            "word_jaccard": None,
                            "best_ngram_type": None,
                            "best_ngram_text": None,
                            "main_ngram_positions": None,
                            "similar_ngram_positions": None,
                        }

                    decoder_similarity.append(decoder_feature)

            explainers_dict = {}
            for explainer in explainer_ids:
                explainer_scores = scores_lookup.get((feature_id, explainer))

                if explainer_scores is None:
                    continue

                # Extract scores using helper
                fuzz_dict, detection_dict, embedding_score = extract_scores_from_explainer_df(
                    explainer_scores, scorer_map
                )

                explanation_text = explanations_lookup.get((feature_id, explainer))

                # Get highlighted explanation if alignment service available
                # NOTE: highlighted_explanation is no longer used by frontend
                highlighted_explanation = None
                if self.alignment_service and self.alignment_service.is_ready:
                    try:
                        segments = self.alignment_service.get_highlighted_explanation(
                            feature_id, explainer, explainer_ids
                        )
                        if segments:
                            highlighted_explanation = HighlightedExplanation(segments=segments)
                    except Exception as e:
                        logger.debug(f"Could not get highlighted explanation for feature {feature_id}, explainer {explainer}: {e}")

                # Build explainer data
                explainer_key = MODEL_NAME_MAP.get(explainer, explainer)

                semantic_similarity = self._build_semantic_similarity_fast(
                    feature_id, explainer, explainer_ids, pairwise_lookup
                )

                quality_score = None
                if explainer_scores:
                    quality_scores = [s.get("quality_score") for s in explainer_scores if s.get("quality_score") is not None]
                    if quality_scores:
                        quality_score = round(sum(quality_scores) / len(quality_scores), 3)

                explainers_dict[explainer_key] = ExplainerScoreData(
                    embedding=embedding_score,
                    quality_score=quality_score,
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
                    highlighted_explanation=highlighted_explanation,
                    semantic_similarity=semantic_similarity
                )

            if explainers_dict:
                # Get intra_feature_sim from pre-loaded lookup
                intra_feature_sim = self._intra_feature_sim_lookup.get(feature_id)

                features.append(FeatureTableRow(
                    feature_id=feature_id,
                    decoder_similarity=decoder_similarity,
                    decoder_similarity_merge_threshold=merge_threshold,
                    intra_feature_sim=intra_feature_sim,
                    explainers=explainers_dict
                ))

        logger.info(f"Built {len(features)} feature rows")
        return features

    # ========================================================================
    # OPTIMIZATION HELPER METHODS - Pre-compute lookups for O(1) access
    # ========================================================================

    def _build_scores_lookup(self, scores_df: pl.DataFrame) -> Dict[Tuple[int, str], list]:
        """Build lookup dict: (feature_id, explainer) -> list of score dicts."""
        lookup = {}

        feature_ids = scores_df["feature_id"].to_list()
        explainers = scores_df["llm_explainer"].to_list()
        scorers = scores_df["llm_scorer"].to_list()
        score_embedding = scores_df["score_embedding"].to_list()
        score_fuzz = scores_df["score_fuzz"].to_list()
        score_detection = scores_df["score_detection"].to_list()

        # Check if quality_score column exists
        has_quality = "quality_score" in scores_df.columns
        quality_scores = scores_df["quality_score"].to_list() if has_quality else [None] * len(feature_ids)

        for i in range(len(feature_ids)):
            key = (feature_ids[i], explainers[i])

            score_dict = {
                "llm_scorer": scorers[i],
                "score_embedding": score_embedding[i],
                "score_fuzz": score_fuzz[i],
                "score_detection": score_detection[i],
                "quality_score": quality_scores[i]
            }

            if key not in lookup:
                lookup[key] = []
            lookup[key].append(score_dict)

        return lookup

    def _build_explanations_lookup(self, explanations_df: pl.DataFrame) -> Dict[Tuple[int, str], str]:
        """
        Build lookup dict: (feature_id, explainer) -> explanation_text.
        """
        feature_ids = explanations_df["feature_id"].to_list()
        explainers = explanations_df["llm_explainer"].to_list()
        texts = explanations_df["explanation_text"].to_list()

        lookup = {(fid, exp): text for fid, exp, text in zip(feature_ids, explainers, texts)}
        return lookup

    def _build_pairwise_lookup(self, pairwise_df: pl.DataFrame) -> Dict[Tuple[int, str, str], float]:
        """
        Build lookup dict: (feature_id, explainer1, explainer2) -> cosine_similarity.
        Stores both orderings for fast bidirectional lookup.
        """
        feature_ids = pairwise_df["feature_id"].to_list()
        exp1s = pairwise_df["explainer_1"].to_list()
        exp2s = pairwise_df["explainer_2"].to_list()
        sims = pairwise_df["cosine_similarity"].to_list()
        lookup = {}
        for fid, e1, e2, sim in zip(feature_ids, exp1s, exp2s, sims):
            lookup[(fid, e1, e2)] = sim
            lookup[(fid, e2, e1)] = sim
        return lookup

    def _build_decoder_and_merge_lookups(self, scores_df: pl.DataFrame) -> tuple[Dict[int, List], Dict[int, float]]:
        """Build both decoder_similarity and merge_threshold lookups in one vectorized operation."""
        decoder_lookup = {}
        merge_threshold_lookup = {}

        # Check columns exist
        has_decoder = "decoder_similarity" in scores_df.columns
        has_merge = COL_DECODER_SIMILARITY_MERGE_THRESHOLD in scores_df.columns

        if not has_decoder and not has_merge:
            return decoder_lookup, merge_threshold_lookup

        agg_exprs = []
        if has_decoder:
            agg_exprs.append(pl.col("decoder_similarity").first().alias("decoder_sim"))
        if has_merge:
            agg_exprs.append(pl.col(COL_DECODER_SIMILARITY_MERGE_THRESHOLD).first().alias("merge_threshold"))

        if not agg_exprs:
            return decoder_lookup, merge_threshold_lookup

        unique_features = scores_df.group_by("feature_id").agg(agg_exprs)

        # Build lookups from aggregated results
        for row in unique_features.iter_rows(named=True):
            feature_id = row["feature_id"]

            if has_decoder and row.get("decoder_sim") is not None:
                decoder_lookup[feature_id] = row["decoder_sim"]

            if has_merge and row.get("merge_threshold") is not None:
                merge_val = row["merge_threshold"]
                if merge_val is not None and not pl.datatypes.Null == type(merge_val):
                    merge_threshold_lookup[feature_id] = float(merge_val)

        return decoder_lookup, merge_threshold_lookup

    def _build_all_interfeature_lookups(
        self,
        interfeature_df: pl.DataFrame,
    ) -> Dict[int, Dict[int, Dict]]:
        """
        Build lookup for ALL features at once: feature_id -> {similar_feature_id -> info}.

        Uses Polars partition_by() for efficient grouping.

        Args:
            interfeature_df: FLAT DataFrame with interfeature similarity rows

        Returns:
            Dict mapping feature_id -> {similar_feature_id -> info}
        """
        start_time = time.time()

        all_lookups: Dict[int, Dict[int, Dict]] = {}

        if interfeature_df is None or len(interfeature_df) == 0:
            return all_lookups

        # Use Polars partition_by for efficient grouping (returns dict of feature_id -> DataFrame)
        partitions = interfeature_df.partition_by("main_feature_id", as_dict=True)

        logger.info(f"Building interfeature lookups for {len(partitions)} features using partition_by...")

        for feature_id, partition_df in partitions.items():
            # Convert partition to list of dicts once (efficient - Polars native)
            rows = partition_df.to_dicts()

            feature_lookup = {}
            for row in rows:
                similar_feature_id = row["similar_feature_id"]

                # Extract values with column name mapping
                sem_sim = row.get("semantic_similarity")
                char_jacc = row.get("char_ngram_max_jaccard")
                word_jacc = row.get("word_ngram_max_jaccard")

                # Use pre-computed pattern_type
                pattern_type = row.get("pattern_type", "None")

                # Use unified best n-gram fields (word preferred over char)
                best_ngram_type = row.get("best_ngram_type")
                best_ngram_text = row.get("best_ngram_text")
                best_ngram_main_pos = row.get("best_ngram_main_positions")
                best_ngram_similar_pos = row.get("best_ngram_similar_positions")

                feature_lookup[similar_feature_id] = {
                    "pattern_type": pattern_type,
                    "semantic_similarity": float(sem_sim) if sem_sim is not None else None,
                    "char_jaccard": float(char_jacc) if char_jacc is not None else None,
                    "word_jaccard": float(word_jacc) if word_jacc is not None else None,
                    "best_ngram_type": best_ngram_type,
                    "best_ngram_text": best_ngram_text,
                    "main_ngram_positions": best_ngram_main_pos,
                    "similar_ngram_positions": best_ngram_similar_pos,
                }

            all_lookups[feature_id] = feature_lookup

        elapsed = time.time() - start_time
        logger.info(f"✅ Interfeature lookups built in {elapsed:.2f}s ({len(all_lookups)} features) using partition_by")

        return all_lookups

    def _build_semantic_similarity_fast(
        self,
        feature_id: int,
        current_explainer: str,
        all_explainer_ids: List[str],
        pairwise_lookup: Dict[Tuple[int, str, str], float]
    ) -> Optional[Dict[str, float]]:
        """
        Fast version of _build_semantic_similarity using pre-computed lookup.
        Eliminates repeated DataFrame filtering.
        """
        similarity_dict = {}

        for other_explainer in all_explainer_ids:
            if other_explainer == current_explainer:
                continue

            # Direct O(1) lookup instead of filtering
            cosine_sim = pairwise_lookup.get((feature_id, current_explainer, other_explainer))

            if cosine_sim is not None:
                other_explainer_key = MODEL_NAME_MAP.get(other_explainer, other_explainer)
                similarity_dict[other_explainer_key] = float(cosine_sim)

        return similarity_dict if similarity_dict else None

    # ========================================================================
    # END OPTIMIZATION HELPERS
    # ========================================================================
