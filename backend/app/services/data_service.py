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

        # Cache for frequently accessed data
        self._filter_options_cache: Optional[Dict[str, List[str]]] = None
        self._df_lazy: Optional[pl.LazyFrame] = None
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
            - feature_splitting: max cosine_similarity from decoder_similarity
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

        # Convert decoder_similarity to feature_splitting (max cosine_similarity)
        # decoder_similarity is List(Struct) with top 10 neighbors
        # We'll use the max similarity as feature_splitting value
        # Keep decoder_similarity for table display
        df_lazy = df_lazy.with_columns([
            pl.col("decoder_similarity")
              .list.eval(pl.element().struct.field("cosine_similarity"))
              .list.max()
              .alias(COL_FEATURE_SPLITTING)
        ])

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
