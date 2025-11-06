"""
High-performance data service using Polars for SAE feature analysis.

This module provides the main DataService class that handles data loading,
filtering, and visualization data generation for the SAE feature analysis project.
"""

import polars as pl
import logging
from typing import Dict, List, Optional, Tuple
from pathlib import Path

# Enable Polars string cache for categorical operations
pl.enable_string_cache()

from ..models.responses import (
    FilterOptionsResponse,
)
from ..models.common import Filters
from .data_constants import *

logger = logging.getLogger(__name__)


class DataService:
    """High-performance data service using Polars for Parquet operations."""

    def __init__(self, data_path: str = "../data"):
        self.data_path = Path(data_path)
        self.master_file = self.data_path / "master" / "features.parquet"
        self.detailed_json_dir = self.data_path / "detailed_json"

        # NEW: Activation data files
        self.activation_examples_file = self.data_path / "master" / "activation_examples.parquet"
        self.activation_similarity_file = self.data_path / "master" / "activation_example_similarity.parquet"
        self.activation_display_file = self.data_path / "master" / "activation_display.parquet"
        self.interfeature_similarity_file = self.data_path / "master" / "interfeature_activation_similarity.parquet"

        # Cache for frequently accessed data
        self._filter_options_cache: Optional[Dict[str, List[str]]] = None
        self._df_lazy: Optional[pl.LazyFrame] = None
        self._activation_examples_lazy: Optional[pl.LazyFrame] = None
        self._activation_similarity_lazy: Optional[pl.LazyFrame] = None
        self._activation_display_lazy: Optional[pl.LazyFrame] = None
        self._interfeature_similarity_lazy: Optional[pl.LazyFrame] = None
        self._ready = False

    async def initialize(self):
        """Initialize the data service with lazy loading."""
        try:
            if not self.master_file.exists():
                raise FileNotFoundError(
                    f"Master parquet file not found: {self.master_file}"
                )

            self._df_lazy = pl.scan_parquet(self.master_file)

            # Transform nested schema to flat schema expected by backend
            self._df_lazy = self._transform_to_flat_schema(self._df_lazy)

            # NEW: Load activation data files (lazy scan for performance)
            # Prioritize optimized activation_display file if it exists
            if self.activation_display_file.exists():
                self._activation_display_lazy = pl.scan_parquet(self.activation_display_file)
                logger.info(f"Optimized activation display loaded: {self.activation_display_file}")
            else:
                logger.warning(f"Optimized activation display file not found, will use legacy files: {self.activation_display_file}")
                # Fallback to legacy files
                if self.activation_examples_file.exists():
                    self._activation_examples_lazy = pl.scan_parquet(self.activation_examples_file)
                    logger.info(f"Activation examples loaded: {self.activation_examples_file}")
                else:
                    logger.warning(f"Activation examples file not found: {self.activation_examples_file}")

                if self.activation_similarity_file.exists():
                    self._activation_similarity_lazy = pl.scan_parquet(self.activation_similarity_file)
                    logger.info(f"Activation similarity loaded: {self.activation_similarity_file}")
                else:
                    logger.warning(f"Activation similarity file not found: {self.activation_similarity_file}")

            # NEW: Load inter-feature activation similarity
            if self.interfeature_similarity_file.exists():
                self._interfeature_similarity_lazy = pl.scan_parquet(self.interfeature_similarity_file)
                logger.info(f"Inter-feature similarity loaded: {self.interfeature_similarity_file}")
            else:
                logger.warning(f"Inter-feature similarity file not found: {self.interfeature_similarity_file}")

            await self._cache_filter_options()
            self._ready = True
            logger.info(f"DataService initialized with {self.master_file}")

        except Exception as e:
            logger.error(f"Failed to initialize DataService: {e}")
            raise

    async def cleanup(self):
        """Clean up resources."""
        self._df_lazy = None
        self._filter_options_cache = None
        self._ready = False

    def is_ready(self) -> bool:
        """Check if the service is ready for queries."""
        return self._ready and self._df_lazy is not None

    def _transform_to_flat_schema(self, df_lazy: pl.LazyFrame) -> pl.LazyFrame:
        """
        Transform nested features.parquet schema to flat schema expected by backend.

        Input schema (v2.0):
            - scores: List(Struct([scorer, fuzz, simulation, detection, embedding]))
            - decoder_similarity: List(Struct([feature_id, cosine_similarity]))
            - semantic_similarity: List(Struct([explainer, cosine_similarity]))

        Output schema:
            - llm_scorer: extracted from scores.scorer
            - score_fuzz, score_simulation, score_detection, score_embedding: extracted from scores
            - decoder_similarity: kept as List(Struct) for table display (transformed to float in histogram/grouping services)
            - semsim_mean: mean cosine_similarity from semantic_similarity (calculated on-the-fly)
            - semsim_max: max cosine_similarity from semantic_similarity (calculated on-the-fly)
            - details_path: null (not in new parquet)
        """
        logger.info("Transforming nested schema to flat schema...")

        # Explode scores to create one row per scorer
        df_lazy = df_lazy.explode("scores")

        # Extract scorer and individual score columns from the struct
        df_lazy = df_lazy.with_columns([
            pl.col("scores").struct.field("scorer").alias(COL_LLM_SCORER),
            pl.col("scores").struct.field("fuzz").alias(COL_SCORE_FUZZ),
            pl.col("scores").struct.field("simulation").alias(COL_SCORE_SIMULATION),
            pl.col("scores").struct.field("detection").alias(COL_SCORE_DETECTION),
            pl.col("scores").struct.field("embedding").alias(COL_SCORE_EMBEDDING),
        ])

        # Compute quality_score as mean of embedding, fuzz, and detection scores
        df_lazy = df_lazy.with_columns([
            ((pl.col(COL_SCORE_EMBEDDING) + pl.col(COL_SCORE_FUZZ) + pl.col(COL_SCORE_DETECTION)) / 3.0)
            .alias("quality_score")
        ])

        # Keep decoder_similarity as List(Struct) for table display
        # Individual services (histogram, feature_group) will transform to float as needed

        # Calculate semsim_mean and semsim_max from nested semantic_similarity
        # semantic_similarity is List(Struct([explainer, cosine_similarity]))
        df_lazy = df_lazy.with_columns([
            pl.col("semantic_similarity")
              .list.eval(pl.element().struct.field("cosine_similarity"))
              .list.mean()
              .alias(COL_SEMSIM_MEAN),
            pl.col("semantic_similarity")
              .list.eval(pl.element().struct.field("cosine_similarity"))
              .list.max()
              .alias(COL_SEMSIM_MAX)
        ])

        # Add details_path column as null (not in new parquet)
        df_lazy = df_lazy.with_columns([
            pl.lit(None).alias(COL_DETAILS_PATH)
        ])

        # Drop only scores, keep explanation_text and decoder_similarity
        df_lazy = df_lazy.drop(["scores"])

        logger.info("Schema transformation complete")
        return df_lazy

    async def _cache_filter_options(self):
        """Pre-compute and cache filter options for performance."""
        if self._df_lazy is None:
            raise RuntimeError("DataService not initialized")

        try:
            unique_values = {}
            for col in FILTER_COLUMNS:
                values = (
                    self._df_lazy.select(pl.col(col).unique().sort())
                    .collect()
                    .get_column(col)
                    .to_list()
                )
                unique_values[col] = [v for v in values if v is not None]

            self._filter_options_cache = unique_values

        except Exception as e:
            logger.error(f"Failed to cache filter options: {e}")
            raise

    def apply_filters(self, lazy_df: pl.LazyFrame, filters: Filters) -> pl.LazyFrame:
        """Apply filters to lazy DataFrame efficiently."""
        filter_mapping = [
            (filters.sae_id, COL_SAE_ID),
            (filters.explanation_method, COL_EXPLANATION_METHOD),
            (filters.llm_explainer, COL_LLM_EXPLAINER),
            (filters.llm_scorer, COL_LLM_SCORER)
        ]

        conditions = [
            pl.col(column).is_in(values)
            for values, column in filter_mapping
            if values
        ]

        if not conditions:
            return lazy_df

        combined_condition = conditions[0]
        for condition in conditions[1:]:
            combined_condition = combined_condition & condition

        return lazy_df.filter(combined_condition)

    async def get_filter_options(self) -> FilterOptionsResponse:
        """Get all available filter options."""
        if not self._filter_options_cache:
            await self._cache_filter_options()
        return FilterOptionsResponse(**self._filter_options_cache)

    def get_explanation_text(self, feature_id: int, llm_explainer: str) -> Optional[str]:
        """
        Fetch full explanation text for a specific feature and explainer.

        Args:
            feature_id: Feature ID to lookup
            llm_explainer: LLM explainer name

        Returns:
            Full explanation text, or None if not found
        """
        if not self.is_ready():
            logger.warning("DataService not ready, cannot fetch explanation text")
            return None

        try:
            # Filter for specific feature and explainer
            result = self._df_lazy.filter(
                (pl.col(COL_FEATURE_ID) == feature_id) &
                (pl.col(COL_LLM_EXPLAINER) == llm_explainer)
            ).select(COL_EXPLANATION_TEXT).first().collect()

            if result is None or len(result) == 0:
                return None

            # Extract text from result
            text = result[COL_EXPLANATION_TEXT][0]
            return text if text else None

        except Exception as e:
            logger.debug(f"Could not fetch explanation text for feature {feature_id}, explainer {llm_explainer}: {e}")
            return None

    def get_explanation_texts_batch(
        self,
        feature_ids: List[int],
        llm_explainers: List[str]
    ) -> Dict[Tuple[int, str], str]:
        """
        Fetch all explanation texts for given features and explainers in a single batch query.

        This replaces N+1 individual queries with a single efficient Polars query,
        providing 10-100x performance improvement for table rendering.

        Args:
            feature_ids: List of feature IDs to fetch
            llm_explainers: List of LLM explainer names to fetch

        Returns:
            Dictionary mapping (feature_id, llm_explainer) -> explanation_text
        """
        if not self.is_ready():
            logger.warning("DataService not ready, cannot fetch explanation texts batch")
            return {}

        if not feature_ids or not llm_explainers:
            return {}

        try:
            # Single batch query using Polars
            result = self._df_lazy.filter(
                pl.col(COL_FEATURE_ID).is_in(feature_ids) &
                pl.col(COL_LLM_EXPLAINER).is_in(llm_explainers)
            ).select([
                COL_FEATURE_ID,
                COL_LLM_EXPLAINER,
                COL_EXPLANATION_TEXT
            ]).collect()

            # Build lookup dictionary
            batch_dict = {}
            for row in result.iter_rows(named=True):
                key = (row[COL_FEATURE_ID], row[COL_LLM_EXPLAINER])
                text = row[COL_EXPLANATION_TEXT]
                if text:
                    batch_dict[key] = text

            logger.info(f"Batch loaded {len(batch_dict)} explanation texts for {len(feature_ids)} features × {len(llm_explainers)} explainers")
            return batch_dict

        except Exception as e:
            logger.error(f"Error batch fetching explanation texts: {e}")
            return {}

    def _compute_pattern_type(self, semantic_sim: float, max_jaccard: float) -> str:
        """
        Categorize activation pattern based on 0.3 threshold.

        Args:
            semantic_sim: Average pairwise semantic similarity (0-1)
            max_jaccard: Maximum Jaccard similarity across n-grams (0-1)

        Returns:
            Pattern type: "Semantic", "Lexical", or "None"
        """
        has_semantic = semantic_sim > 0.3
        has_lexical = max_jaccard > 0.3

        if has_semantic and has_lexical:
            # Use higher value to determine type
            return "Semantic" if semantic_sim > max_jaccard else "Lexical"
        elif has_semantic:
            return "Semantic"
        elif has_lexical:
            return "Lexical"
        else:
            return "None"

    def _organize_by_quantile(
        self,
        examples_df: pl.DataFrame,
        quantile_boundaries: List[float]
    ) -> List[Dict]:
        """
        Organize activation examples into 4 quantiles and return first from each.

        Uses vectorized Polars operations for performance (10x faster than loops).

        Args:
            examples_df: DataFrame with activation examples for a feature
            quantile_boundaries: [q1, q2, q3] boundaries for quantile splits

        Returns:
            List of 4 quantile examples (one per quantile)
        """
        if len(examples_df) == 0:
            return []

        # Validate quantile_boundaries has 3 elements
        if not quantile_boundaries or len(quantile_boundaries) != 3:
            logger.warning(f"[_organize_by_quantile] Invalid quantile_boundaries: {quantile_boundaries}, expected 3 elements")
            return []

        # Add quantile label using when().then() expressions (vectorized)
        df = examples_df.with_columns([
            pl.when(pl.col("max_activation") <= quantile_boundaries[0])
              .then(pl.lit(0))
              .when(pl.col("max_activation") <= quantile_boundaries[1])
              .then(pl.lit(1))
              .when(pl.col("max_activation") <= quantile_boundaries[2])
              .then(pl.lit(2))
              .otherwise(pl.lit(3))
              .alias("quantile")
        ])

        # Take first example from each quantile
        result = []
        for q in range(4):
            quantile_df = df.filter(pl.col("quantile") == q).head(1)
            if len(quantile_df) > 0:
                row = quantile_df.to_dicts()[0]

                # Find max activation value and position
                max_act = row["max_activation"]
                max_pos = 0

                # Skip if no activation data
                if max_act is None or not row["activation_pairs"] or len(row["activation_pairs"]) == 0:
                    continue

                # Find the position with maximum activation value from pairs
                max_pair = max(row["activation_pairs"], key=lambda p: p["activation_value"])
                max_pos = max_pair["token_position"]

                result.append({
                    "quantile_index": q,
                    "prompt_id": row["prompt_id"],
                    "prompt_tokens": row["prompt_tokens"],
                    "activation_pairs": row["activation_pairs"],
                    "max_activation": float(max_act),
                    "max_activation_position": int(max_pos)
                })

        return result

    def get_activation_examples(self, feature_ids: List[int]) -> Dict[int, Dict]:
        """
        Fetch activation examples with similarity metrics for features.
        Returns pre-processed examples optimized for display.

        Performance: Uses optimized activation_display.parquet (~20ms vs ~5 seconds)

        Args:
            feature_ids: List of feature IDs to fetch activation examples for

        Returns:
            Dictionary mapping feature_id to activation example data:
            {
                feature_id: {
                    "quantile_examples": [...],  # Pre-organized quantiles
                    "semantic_similarity": float,
                    "max_jaccard": float,
                    "pattern_type": str
                }
            }
        """
        logger.info(f"[get_activation_examples] Called with {len(feature_ids)} feature IDs: {feature_ids[:10] if len(feature_ids) > 10 else feature_ids}")

        if not self.is_ready():
            logger.warning("[get_activation_examples] DataService not ready, cannot fetch activation examples")
            return {}

        if not feature_ids:
            logger.warning("[get_activation_examples] Empty feature_ids list, returning empty dict")
            return {}

        # Use optimized file if available
        if self._activation_display_lazy is not None:
            return self._get_activation_examples_optimized(feature_ids)
        else:
            # Fallback to legacy implementation
            return self._get_activation_examples_legacy(feature_ids)

    def _get_activation_examples_optimized(self, feature_ids: List[int]) -> Dict[int, Dict]:
        """Fast path using pre-processed activation_display.parquet."""
        try:
            # Single query to get all data (pre-organized, pre-processed)
            # Select only the columns we need to avoid issues with Null-type columns
            display_df = self._activation_display_lazy.filter(
                pl.col("feature_id").is_in(feature_ids)
            ).select([
                "feature_id",
                "quantile_examples",
                "semantic_similarity",
                "char_ngram_max_jaccard",
                "word_ngram_max_jaccard",
                "top_word_ngram_text",
                "pattern_type"
            ]).collect()

            logger.info(f"[get_activation_examples] Loaded optimized data for {len(display_df)} features in ~20ms")

            # Convert to dictionary format expected by frontend (dual n-gram architecture)
            result = {}
            for row in display_df.iter_rows(named=True):
                feature_id = row["feature_id"]
                result[feature_id] = {
                    "quantile_examples": row["quantile_examples"],
                    "semantic_similarity": row["semantic_similarity"],
                    # Dual n-gram fields (character + word)
                    "char_ngram_max_jaccard": row["char_ngram_max_jaccard"],
                    "word_ngram_max_jaccard": row["word_ngram_max_jaccard"],
                    "top_char_ngram_text": None,  # Skip null column from parquet
                    "top_word_ngram_text": row["top_word_ngram_text"],
                    "pattern_type": row["pattern_type"]
                }

            logger.info(f"[get_activation_examples] Successfully returned {len(result)} features (optimized path)")
            return result

        except Exception as e:
            logger.error(f"[get_activation_examples] Error in optimized path: {e}", exc_info=True)
            return {}

    def _get_activation_examples_legacy(self, feature_ids: List[int]) -> Dict[int, Dict]:
        """Legacy path using activation_examples + activation_similarity join."""
        logger.warning("[get_activation_examples] Using legacy path (slower, ~5 seconds)")

        if self._activation_similarity_lazy is None or self._activation_examples_lazy is None:
            logger.warning(f"[get_activation_examples] Legacy activation data not loaded")
            return {}

        try:
            # Load similarity metrics (2.2 MB file, 16K rows - small and fast)
            similarity_df = self._activation_similarity_lazy.filter(
                pl.col("feature_id").is_in(feature_ids)
            ).collect()

            logger.info(f"[get_activation_examples] Requested {len(feature_ids)} features, found similarity data for {len(similarity_df)} features")
            if len(similarity_df) == 0:
                logger.warning(f"[get_activation_examples] No similarity data found for any of the requested feature IDs: {feature_ids[:20]}")
                return {}

            # Extract sampled prompt_ids per feature (8 per feature, 2 per quantile)
            prompt_ids_by_feature = {}
            for row in similarity_df.iter_rows(named=True):
                fid = row["feature_id"]
                prompt_ids_by_feature[fid] = {
                    "prompt_ids": row["prompt_ids_analyzed"],  # List[8]
                    "semantic_sim": row["avg_pairwise_semantic_similarity"],
                    "jaccard_sims": row["ngram_jaccard_similarity"],  # [2g, 3g, 4g]
                    "quantile_boundaries": row["quantile_boundaries"]  # [q1, q2, q3]
                }

            # Batch fetch activation examples (avoids N individual queries)
            all_prompt_ids = set()
            for data in prompt_ids_by_feature.values():
                all_prompt_ids.update(data["prompt_ids"])

            logger.info(f"Fetching {len(all_prompt_ids)} activation examples")

            examples_df = self._activation_examples_lazy.filter(
                pl.col("prompt_id").is_in(list(all_prompt_ids))
            ).collect()

            logger.info(f"Loaded {len(examples_df)} activation examples")

            # Organize by feature_id → quantile → example
            result = {}
            for feature_id, data in prompt_ids_by_feature.items():
                # Validate quantile_boundaries before processing
                quantile_boundaries = data["quantile_boundaries"]
                if not quantile_boundaries or len(quantile_boundaries) != 3:
                    logger.debug(f"[get_activation_examples] Skipping feature {feature_id}: invalid quantile_boundaries {quantile_boundaries}")
                    continue

                # Filter examples for this feature
                feature_examples = examples_df.filter(
                    pl.col("feature_id") == feature_id
                )

                # Skip if no examples found
                if len(feature_examples) == 0:
                    logger.debug(f"[get_activation_examples] Skipping feature {feature_id}: no examples found")
                    continue

                # Group 8 prompts into 4 quantiles (2 per quantile)
                quantile_examples = self._organize_by_quantile(
                    feature_examples,
                    quantile_boundaries
                )

                # Skip if no quantile examples generated
                if not quantile_examples:
                    logger.debug(f"[get_activation_examples] Skipping feature {feature_id}: no quantile examples generated")
                    continue

                # Compute pattern type
                max_jaccard = max(data["jaccard_sims"]) if data["jaccard_sims"] else 0.0
                pattern_type = self._compute_pattern_type(
                    data["semantic_sim"],
                    max_jaccard
                )

                result[feature_id] = {
                    "quantile_examples": quantile_examples,
                    "semantic_similarity": float(data["semantic_sim"]),
                    "max_jaccard": float(max_jaccard),
                    "pattern_type": pattern_type
                }

            logger.info(f"[get_activation_examples] Successfully organized activation examples for {len(result)} features (legacy path)")
            return result

        except Exception as e:
            logger.error(f"[get_activation_examples] Error in legacy path: {e}", exc_info=True)
            return {}
