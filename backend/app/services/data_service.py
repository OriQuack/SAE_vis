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
        self.detailed_json_dir = self.data_path / "detailed_json"

        # Path configuration: all files from data/output/ directory
        self.master_file = self._resolve_data_path("features.parquet")
        self.activation_display_file = self._resolve_data_path("activation_display.parquet")
        self.interfeature_similarity_file = self._resolve_data_path("interfeature_similarity.parquet")
        self.svm_feature_metrics_file = self._resolve_data_path("svm_feature_metrics.parquet")
        self.svm_pair_metrics_file = self._resolve_data_path("svm_pair_metrics.parquet")

        # Cache for frequently accessed data
        self._filter_options_cache: Optional[Dict[str, List[str]]] = None
        self._df_lazy: Optional[pl.LazyFrame] = None
        self._activation_display_lazy: Optional[pl.LazyFrame] = None
        self._interfeature_similarity_lazy: Optional[pl.LazyFrame] = None
        self._svm_feature_metrics_lazy: Optional[pl.LazyFrame] = None
        self._svm_pair_metrics_lazy: Optional[pl.LazyFrame] = None
        self._ready = False

    def _resolve_data_path(self, filename: str) -> Path:
        """Resolve data file path (output directory only).

        Args:
            filename: Name of the file to find

        Returns:
            Path to the file in output directory

        Raises:
            FileNotFoundError: If file does not exist
        """
        path = self.data_path / "output" / filename
        if not path.exists():
            raise FileNotFoundError(f"Required data file not found: {path}")
        return path

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

            # Load activation display data (required)
            self._activation_display_lazy = pl.scan_parquet(self.activation_display_file)
            logger.info(f"Activation display loaded: {self.activation_display_file}")

            # Load inter-feature activation similarity (required)
            self._interfeature_similarity_lazy = pl.scan_parquet(self.interfeature_similarity_file)
            logger.info(f"Inter-feature similarity loaded: {self.interfeature_similarity_file}")

            # Load SVM feature metrics (required for feature classification)
            self._svm_feature_metrics_lazy = pl.scan_parquet(self.svm_feature_metrics_file)
            logger.info(f"SVM feature metrics loaded: {self.svm_feature_metrics_file}")

            # Load SVM pair metrics (required for pair classification)
            self._svm_pair_metrics_lazy = pl.scan_parquet(self.svm_pair_metrics_file)
            logger.info(f"SVM pair metrics loaded: {self.svm_pair_metrics_file}")

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

        # Require activation_display data
        if self._activation_display_lazy is None:
            logger.warning("[get_activation_examples] activation_display data not loaded")
            return {}

        return self._get_activation_examples_optimized(feature_ids)

    def _get_activation_examples_optimized(self, feature_ids: List[int]) -> Dict[int, Dict]:
        """Fast path using pre-processed activation_display.parquet.

        Uses pre-computed fields from step_10 v4.0+:
        - pattern_type: Pre-computed pattern classification
        - best_ngram_type, best_ngram_text, best_ngram_size: Pre-computed best n-gram
        - quantile_examples with ngram_positions: Pre-computed positions
        """
        try:
            # Select only the columns we need (all pre-computed in step_10 v4.0+)
            columns_to_select = [
                "feature_id",
                "quantile_examples",
                "semantic_similarity",
                "char_ngram_max_jaccard",
                "word_ngram_max_jaccard",
                "top_word_ngram_text",
                "pattern_type",  # Pre-computed in step_10 v4.0+
                "best_ngram_type",  # Pre-computed in step_10 v4.0+
                "best_ngram_text",  # Pre-computed in step_10 v4.0+
            ]

            # Filter to only columns that exist (backward compatibility)
            available_columns = self._activation_display_lazy.columns
            columns_to_select = [c for c in columns_to_select if c in available_columns]

            display_df = self._activation_display_lazy.filter(
                pl.col("feature_id").is_in(feature_ids)
            ).select(columns_to_select).collect()

            logger.info(f"[get_activation_examples] Loaded optimized data for {len(display_df)} features in ~20ms")

            # Convert to dictionary format expected by frontend
            result = {}
            for row in display_df.iter_rows(named=True):
                feature_id = row["feature_id"]

                # Use pre-computed pattern_type (required in step_10 v4.0+)
                pattern_type = row.get("pattern_type") or "None"

                # Use pre-computed best n-gram fields (step_10 v4.0+)
                ngram_type = row.get("best_ngram_type")
                ngram_text = row.get("best_ngram_text")

                # For backward compatibility, map to old field names
                best_char_ngram_text = ngram_text if ngram_type == "char" else None
                best_word_ngram_text = ngram_text if ngram_type == "word" else row.get("top_word_ngram_text")

                # quantile_examples already has ngram_positions pre-computed in step_10 v4.0+
                quantile_examples = row["quantile_examples"]

                result[feature_id] = {
                    "quantile_examples": quantile_examples,
                    "semantic_similarity": row["semantic_similarity"],
                    # Dual n-gram fields (character + word)
                    "char_ngram_max_jaccard": row["char_ngram_max_jaccard"],
                    "word_ngram_max_jaccard": row["word_ngram_max_jaccard"],
                    "top_char_ngram_text": None,
                    "top_word_ngram_text": row.get("top_word_ngram_text"),
                    "pattern_type": pattern_type,
                    # Best n-gram text (longest above threshold, for display)
                    "best_char_ngram_text": best_char_ngram_text,
                    "best_word_ngram_text": best_word_ngram_text,
                }

            logger.info(f"[get_activation_examples] Successfully returned {len(result)} features (optimized path)")
            return result

        except Exception as e:
            logger.error(f"[get_activation_examples] Error in optimized path: {e}", exc_info=True)
            return {}
