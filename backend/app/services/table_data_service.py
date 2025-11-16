"""
Table data service for feature-level score visualization (v3.0 - OPTIMIZED).

Optimizations in v3.0:
- Vectorized pairwise similarity extraction (explode/unnest instead of iter_rows)
- Vectorized global stats calculation (group_by instead of nested loops)
- Optimized lookup building (column extraction instead of iter_rows)
- Performance monitoring with detailed timing logs
- Dead code removal for maintainability

Clean 4-step flow:
1. Fetch scores from features.parquet
2. Fetch explanations from features.parquet (explanation_text column)
3. Extract pairwise similarity from nested semantic_similarity structure (VECTORIZED)
4. Build response (pure assembly, no calculations)
"""

import polars as pl
import numpy as np
import logging
import time
from typing import Dict, List, Optional, Tuple, TYPE_CHECKING
from pathlib import Path

from ..models.common import Filters
from ..models.responses import (
    FeatureTableDataResponse, FeatureTableRow,
    ExplainerScoreData, ScorerScoreSet,
    HighlightedExplanation
)
from .consistency_service import ExplainerDataBuilder
from .alignment_service import AlignmentService

# Import for type hints only (avoids circular imports)
if TYPE_CHECKING:
    from .data_service import DataService

logger = logging.getLogger(__name__)

# Model name mapping for display (16k dataset)
MODEL_NAME_MAP = {
    'hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4': 'llama',
    'google/gemini-flash-2.5': 'gemini',
    'openai/gpt-4o-mini': 'openai'
}


class TableDataService:
    """Service for generating table visualization data."""

    def __init__(self, data_service: "DataService", alignment_service: Optional[AlignmentService] = None):
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
        Generate feature-level table data (v3.0 - OPTIMIZED with performance monitoring).

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
        logger.info("=" * 80)
        logger.info("Starting table data generation (v3.0 OPTIMIZED)")
        logger.info("=" * 80)

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
        scores_df = self._fetch_scores(filters)
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
        explanations_df = self._fetch_explanations(filters)
        logger.info(f"✓ Step 2 (Fetch explanations): {time.time() - step_start:.3f}s")

        # STEP 3: Fetch pairwise semantic similarity data from nested structure
        step_start = time.time()
        pairwise_df = self._fetch_pairwise_similarity(feature_ids, explainer_ids)
        logger.info(f"✓ Step 3 (Fetch pairwise similarity - VECTORIZED): {time.time() - step_start:.3f}s")

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
        logger.info(f"✓ Global stats (VECTORIZED): {time.time() - step_start:.3f}s")

        total_time = time.time() - start_time
        logger.info("=" * 80)
        logger.info(f"✓ TOTAL TABLE DATA GENERATION TIME: {total_time:.3f}s ({len(features)} features)")
        logger.info("=" * 80)

        return FeatureTableDataResponse(
            features=features,
            total_features=len(features),
            explainer_ids=[MODEL_NAME_MAP.get(exp, exp) for exp in explainer_ids],
            scorer_ids=scorer_ids,
            global_stats=global_stats
        )

    def _fetch_scores(self, filters: Filters) -> pl.DataFrame:
        """
        STEP 1: Fetch scores from features.parquet (already flattened by DataService).

        NOTE: DataService already transforms nested schema to flat during initialization.
        Assumes default filters (all explainers, 1 scorer). Validation done in get_table_data().

        Args:
            filters: Filter criteria (validated to be default)

        Returns:
            DataFrame with scores (feature_id, llm_explainer, llm_scorer, score_*, z_score_*)
        """
        lf = self.data_service._df_lazy

        logger.info(f"Available columns in lazy frame: {lf.columns}")

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
        logger.info(f"Checking for decoder_similarity: {'decoder_similarity' in available_columns}")
        if "decoder_similarity" in available_columns:
            base_columns.append("decoder_similarity")

        logger.info(f"Selecting columns: {base_columns}")
        df = lf.select(base_columns).collect()

        # Compute z-scores for each metric
        # Z-score = (value - mean) / std
        for score_col in ["score_embedding", "score_fuzz", "score_detection"]:
            z_col = score_col.replace("score_", "z_score_")
            mean = df[score_col].mean()
            std = df[score_col].std()

            if std is not None and std > 0:
                df = df.with_columns([
                    ((pl.col(score_col) - mean) / std).alias(z_col)
                ])
            else:
                # If std is 0 or null, set z-score to 0
                df = df.with_columns([
                    pl.lit(0.0).alias(z_col)
                ])

        # Compute overall_score as average of z-scores
        df = df.with_columns([
            ((pl.col("z_score_embedding") + pl.col("z_score_fuzz") + pl.col("z_score_detection")) / 3.0)
            .alias("overall_score")
        ])

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

    def _fetch_explanations(self, filters: Filters) -> Optional[pl.DataFrame]:
        """
        STEP 3: Fetch explanations from features.parquet (explanation_text column).

        NOTE: Assumes default filters, no filtering applied.

        Args:
            filters: Filter criteria (validated to be default)

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
        Extract pairwise semantic similarity from nested semantic_similarity structure (v3.0 - VECTORIZED).

        semantic_similarity is List(Struct([explainer: Categorical, cosine_similarity: Float32]))
        We need to transform this to pairwise format: (feature_id, explainer_1, explainer_2, cosine_similarity)

        OPTIMIZATION: Uses Polars explode/unnest instead of Python iter_rows loop.
        Expected ~40-50% performance improvement.

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

            # VECTORIZED TRANSFORMATION: Replace Python loop with Polars operations
            # Step 1: Explode the list to create one row per semantic_similarity element
            df = df.explode("semantic_similarity")

            # Step 2: Filter out null values
            df = df.filter(pl.col("semantic_similarity").is_not_null())

            if len(df) == 0:
                logger.warning("No pairwise similarity data after exploding nested structure")
                return None

            # Step 3: Unnest the struct to flatten explainer and cosine_similarity fields
            df = df.unnest("semantic_similarity")

            # Step 4: Rename columns to match expected format
            pairwise_df = df.rename({
                "llm_explainer": "explainer_1",
                "explainer": "explainer_2"
            })

            # Step 5: Select final columns in correct order
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
        STEP 4: Fetch inter-feature activation similarity data.

        Returns DataFrame with:
        - feature_id
        - semantic_pairs: List(Struct) with similar features based on semantic similarity
        - lexical_pairs: List(Struct) with similar features based on lexical patterns
        - both_pairs: List(Struct) with similar features showing both patterns

        Args:
            feature_ids: List of feature IDs to filter

        Returns:
            DataFrame with inter-feature similarity or None if data not available
        """
        try:
            if self.data_service._interfeature_similarity_lazy is None:
                logger.warning("Inter-feature similarity data not loaded")
                return None

            # Filter to requested features
            df = self.data_service._interfeature_similarity_lazy.filter(
                pl.col("feature_id").is_in(feature_ids)
            ).collect()

            logger.info(f"Fetched inter-feature similarity: {len(df)} features")
            return df

        except Exception as e:
            logger.warning(f"Could not fetch inter-feature similarity: {e}")
            return None

    def _build_interfeature_lookup(
        self,
        feature_id: int,
        interfeature_df: Optional[pl.DataFrame]
    ) -> Dict[int, Dict]:
        """
        Build a lookup dictionary for inter-feature similarity data.

        Creates mapping: {similar_feature_id: {pattern_type, semantic_similarity, char_jaccard, word_jaccard, ...}}

        Args:
            feature_id: Main feature ID
            interfeature_df: DataFrame with inter-feature similarity data

        Returns:
            Dictionary mapping similar feature IDs to their similarity info
        """
        lookup = {}

        if interfeature_df is None or len(interfeature_df) == 0:
            return lookup

        # Filter for this feature
        feature_interf = interfeature_df.filter(pl.col("feature_id") == feature_id)

        if len(feature_interf) == 0:
            return lookup

        # Process semantic first, then lexical (lexical overwrites if duplicate - V4.0)
        for category in ["semantic_pairs", "lexical_pairs"]:
            # Convert Polars Series to Python list to access nested data properly
            pairs_list = feature_interf[category].to_list()[0]

            if pairs_list is None:
                continue

            for pair in pairs_list:
                similar_feature_id = int(pair["similar_feature_id"])

                # Store similarity info with position data (V4.0)
                lookup[similar_feature_id] = {
                    "pattern_type": pair["pattern_type"],
                    "semantic_similarity": float(pair["semantic_similarity"]) if pair["semantic_similarity"] is not None else None,
                    "char_jaccard": float(pair["char_jaccard"]) if pair["char_jaccard"] is not None else None,
                    "word_jaccard": float(pair["word_jaccard"]) if pair["word_jaccard"] is not None else None,
                    "max_char_ngram": pair["max_char_ngram"],
                    "max_word_ngram": pair["max_word_ngram"],
                    # NEW: Position fields (V4.0)
                    "main_char_ngram_positions": pair.get("main_char_ngram_positions"),
                    "similar_char_ngram_positions": pair.get("similar_char_ngram_positions"),
                    "main_word_ngram_positions": pair.get("main_word_ngram_positions"),
                    "similar_word_ngram_positions": pair.get("similar_word_ngram_positions")
                }

        return lookup

    def _compute_global_stats(
        self,
        scores_df: pl.DataFrame,
        explainer_ids: List[str],
        feature_ids: List[int]
    ) -> Dict[str, Dict[str, float]]:
        """
        Compute global statistics for frontend min-max normalization (v3.0 - VECTORIZED).

        Flow: simple scores -> min-max normalization -> average -> quality score

        OPTIMIZATION: Uses Polars group_by instead of nested Python loops.
        Expected ~15-20% performance improvement.

        Args:
            scores_df: Scores DataFrame
            explainer_ids: List of explainer IDs
            feature_ids: List of feature IDs

        Returns:
            Dict with global stats: {'metric_name': {'min': float, 'max': float}}
        """
        # VECTORIZED APPROACH: Group by feature_id and explainer in one operation
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
        STEP 5: Build feature rows (pure assembly, no calculations) - v2.0 OPTIMIZED.

        Optimizations:
        - Pre-compute all lookups before main loop (eliminates ~20,000 filter operations)
        - Use dictionaries for O(1) access instead of repeated DataFrame filtering
        - Replace Python list operations with Polars native methods

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
        # OPTIMIZATION 1: Pre-compute all lookups (before main loop)
        logger.info("Pre-computing lookups for fast access...")

        try:
            # Group scores by (feature_id, explainer) for O(1) access
            logger.info("Building scores lookup...")
            scores_lookup = self._build_scores_lookup(scores_df)
            logger.info(f"Scores lookup built: {len(scores_lookup)} entries")
        except Exception as e:
            logger.error(f"Error building scores lookup: {e}", exc_info=True)
            raise

        try:
            # Build explanations lookup: (feature_id, explainer) -> explanation_text
            logger.info("Building explanations lookup...")
            explanations_lookup = self._build_explanations_lookup(explanations_df) if explanations_df is not None else {}
            logger.info(f"Explanations lookup built: {len(explanations_lookup)} entries")
        except Exception as e:
            logger.error(f"Error building explanations lookup: {e}", exc_info=True)
            raise

        try:
            # Build pairwise lookup: (feature_id, explainer1, explainer2) -> cosine_similarity
            logger.info("Building pairwise lookup...")
            pairwise_lookup = self._build_pairwise_lookup(pairwise_df) if pairwise_df is not None else {}
            logger.info(f"Pairwise lookup built: {len(pairwise_lookup)} entries")
        except Exception as e:
            logger.error(f"Error building pairwise lookup: {e}", exc_info=True)
            raise

        try:
            # Build interfeature lookup ONCE for ALL features: feature_id -> {similar_feature_id -> info}
            logger.info("Building interfeature lookup...")
            interfeature_lookup = self._build_all_interfeature_lookups(interfeature_df) if interfeature_df is not None else {}
            logger.info(f"Interfeature lookup built: {len(interfeature_lookup)} entries")
        except Exception as e:
            logger.error(f"Error building interfeature lookup: {e}", exc_info=True)
            raise

        try:
            # Build decoder similarity lookup: feature_id -> decoder_sim_value
            logger.info("Building decoder lookup...")
            decoder_lookup = self._build_decoder_lookup(scores_df)
            logger.info(f"Decoder lookup built: {len(decoder_lookup)} entries")
        except Exception as e:
            logger.error(f"Error building decoder lookup: {e}", exc_info=True)
            raise

        logger.info(f"All lookups pre-computed successfully")

        features = []

        for feature_id in feature_ids:
            # OPTIMIZATION 2: Use decoder lookup instead of filtering
            decoder_sim_value = decoder_lookup.get(feature_id)
            decoder_similarity = None

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
                            "max_char_ngram": interf_info["max_char_ngram"],
                            "max_word_ngram": interf_info["max_word_ngram"],
                            "main_char_ngram_positions": interf_info.get("main_char_ngram_positions"),
                            "similar_char_ngram_positions": interf_info.get("similar_char_ngram_positions"),
                            "main_word_ngram_positions": interf_info.get("main_word_ngram_positions"),
                            "similar_word_ngram_positions": interf_info.get("similar_word_ngram_positions")
                        }
                    else:
                        # No inter-feature data, use None pattern
                        decoder_feature["inter_feature_similarity"] = {
                            "pattern_type": "None",
                            "semantic_similarity": None,
                            "char_jaccard": None,
                            "word_jaccard": None,
                            "max_char_ngram": None,
                            "max_word_ngram": None,
                            "main_char_ngram_positions": None,
                            "similar_char_ngram_positions": None,
                            "main_word_ngram_positions": None,
                            "similar_word_ngram_positions": None
                        }

                    decoder_similarity.append(decoder_feature)

            explainers_dict = {}
            for explainer in explainer_ids:
                # OPTIMIZATION 3: Use lookup instead of filtering
                explainer_scores = scores_lookup.get((feature_id, explainer))

                if explainer_scores is None:
                    continue

                # Extract scores using helper
                fuzz_dict, detection_dict, embedding_score = ExplainerDataBuilder.extract_scores_from_explainer_df(
                    explainer_scores, scorer_map
                )

                # OPTIMIZATION 4: Use pre-computed explanations lookup
                explanation_text = explanations_lookup.get((feature_id, explainer))

                # Get highlighted explanation if alignment service available
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

                # OPTIMIZATION 5: Use pre-computed pairwise lookup instead of filtering
                semantic_similarity = self._build_semantic_similarity_fast(
                    feature_id, explainer, explainer_ids, pairwise_lookup
                )

                # OPTIMIZATION 6: Use Polars .mean() instead of to_list() + manual average
                quality_score = None
                if "quality_score" in explainer_scores.columns:
                    # Use Polars native mean (much faster than to_list())
                    quality_score = explainer_scores["quality_score"].mean()
                    if quality_score is not None:
                        quality_score = float(quality_score)

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
                features.append(FeatureTableRow(
                    feature_id=feature_id,
                    decoder_similarity=decoder_similarity,
                    explainers=explainers_dict
                ))

        logger.info(f"Built {len(features)} feature rows")
        return features

    # ========================================================================
    # OPTIMIZATION HELPER METHODS - Pre-compute lookups for O(1) access
    # ========================================================================

    def _build_scores_lookup(self, scores_df: pl.DataFrame) -> Dict[Tuple[int, str], pl.DataFrame]:
        """
        Build lookup dict: (feature_id, explainer) -> DataFrame of scores for that combination.
        Eliminates repeated filtering in main loop.
        """
        lookup = {}
        # Group by feature_id and explainer
        for (feature_id, explainer), group_df in scores_df.group_by(["feature_id", "llm_explainer"]):
            lookup[(feature_id, explainer)] = group_df
        return lookup

    def _build_explanations_lookup(self, explanations_df: pl.DataFrame) -> Dict[Tuple[int, str], str]:
        """
        Build lookup dict: (feature_id, explainer) -> explanation_text (v3.0 - OPTIMIZED).
        Uses vectorized column extraction instead of iter_rows.
        """
        # Extract columns as lists (faster than iter_rows)
        feature_ids = explanations_df["feature_id"].to_list()
        explainers = explanations_df["llm_explainer"].to_list()
        texts = explanations_df["explanation_text"].to_list()

        # Build lookup using zip (faster than iterating dictionaries)
        lookup = {(fid, exp): text for fid, exp, text in zip(feature_ids, explainers, texts)}
        return lookup

    def _build_pairwise_lookup(self, pairwise_df: pl.DataFrame) -> Dict[Tuple[int, str, str], float]:
        """
        Build lookup dict: (feature_id, explainer1, explainer2) -> cosine_similarity (v3.0 - OPTIMIZED).
        Stores both orderings for fast bidirectional lookup.
        Uses vectorized column extraction instead of iter_rows.
        """
        # Extract columns as lists (faster than iter_rows)
        feature_ids = pairwise_df["feature_id"].to_list()
        exp1s = pairwise_df["explainer_1"].to_list()
        exp2s = pairwise_df["explainer_2"].to_list()
        sims = pairwise_df["cosine_similarity"].to_list()

        # Build lookup using zip, storing both orderings
        lookup = {}
        for fid, e1, e2, sim in zip(feature_ids, exp1s, exp2s, sims):
            lookup[(fid, e1, e2)] = sim
            lookup[(fid, e2, e1)] = sim
        return lookup

    def _build_decoder_lookup(self, scores_df: pl.DataFrame) -> Dict[int, List]:
        """
        Build lookup dict: feature_id -> decoder_similarity value.
        Takes first row per feature (decoder_similarity is same for all rows).
        """
        lookup = {}
        if "decoder_similarity" not in scores_df.columns:
            return lookup

        # Get unique feature_ids and their decoder_similarity (first row per feature)
        for feature_id in scores_df["feature_id"].unique().to_list():
            first_row = scores_df.filter(pl.col("feature_id") == feature_id).head(1)
            if len(first_row) > 0:
                decoder_sim = first_row["decoder_similarity"][0]
                if decoder_sim is not None:
                    lookup[feature_id] = decoder_sim
        return lookup

    def _build_all_interfeature_lookups(self, interfeature_df: pl.DataFrame) -> Dict[int, Dict[int, Dict]]:
        """
        Build lookup for ALL features at once: feature_id -> {similar_feature_id -> info} (v3.0 - OPTIMIZED).
        This replaces the per-feature _build_interfeature_lookup() which was called 14,316 times.
        Uses vectorized column extraction for better performance.
        """
        all_lookups = {}

        # Extract columns as lists (faster than iter_rows for outer loop)
        feature_ids = interfeature_df["feature_id"].to_list()
        semantic_pairs_list = interfeature_df["semantic_pairs"].to_list()
        lexical_pairs_list = interfeature_df["lexical_pairs"].to_list()

        # Iterate using zip (still need to process nested pairs, but faster outer loop)
        for feature_id, semantic_pairs, lexical_pairs in zip(feature_ids, semantic_pairs_list, lexical_pairs_list):
            if feature_id not in all_lookups:
                all_lookups[feature_id] = {}

            # Process semantic first, then lexical (lexical overwrites if duplicate)
            for category, pairs_list in [("semantic", semantic_pairs), ("lexical", lexical_pairs)]:
                if pairs_list is None:
                    continue

                for pair in pairs_list:
                    similar_feature_id = int(pair["similar_feature_id"])

                    all_lookups[feature_id][similar_feature_id] = {
                        "pattern_type": pair["pattern_type"],
                        "semantic_similarity": float(pair["semantic_similarity"]) if pair["semantic_similarity"] is not None else None,
                        "char_jaccard": float(pair["char_jaccard"]) if pair["char_jaccard"] is not None else None,
                        "word_jaccard": float(pair["word_jaccard"]) if pair["word_jaccard"] is not None else None,
                        "max_char_ngram": pair["max_char_ngram"],
                        "max_word_ngram": pair["max_word_ngram"],
                        "main_char_ngram_positions": pair.get("main_char_ngram_positions"),
                        "similar_char_ngram_positions": pair.get("similar_char_ngram_positions"),
                        "main_word_ngram_positions": pair.get("main_word_ngram_positions"),
                        "similar_word_ngram_positions": pair.get("similar_word_ngram_positions")
                    }

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
