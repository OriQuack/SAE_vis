"""
High-performance data service using Polars for SAE feature analysis.

This module provides the main DataService class that handles data loading,
filtering, and visualization data generation for the SAE feature analysis project.
"""

import polars as pl
import logging
from typing import Dict, List, Optional
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
        self.master_file = self.data_path / "master" / "feature_analysis.parquet"
        self.pairwise_similarity_file = (
            self.data_path / "master" / "semantic_similarity_pairwise.parquet"
        )
        self.consistency_scores_file = (
            self.data_path / "master" / "consistency_scores.parquet"
        )
        self.detailed_json_dir = self.data_path / "detailed_json"

        # Cache for frequently accessed data
        self._filter_options_cache: Optional[Dict[str, List[str]]] = None
        self._df_lazy: Optional[pl.LazyFrame] = None
        self._pairwise_sim_lazy: Optional[pl.LazyFrame] = None
        self._consistency_lazy: Optional[pl.LazyFrame] = None
        self._ready = False

    async def initialize(self):
        """Initialize the data service with lazy loading."""
        try:
            if not self.master_file.exists():
                raise FileNotFoundError(
                    f"Master parquet file not found: {self.master_file}"
                )

            self._df_lazy = pl.scan_parquet(self.master_file)

            # Load consistency scores if available
            if self.consistency_scores_file.exists():
                self._consistency_lazy = pl.scan_parquet(self.consistency_scores_file)
                logger.info(
                    f"Loaded consistency scores: {self.consistency_scores_file}"
                )
            else:
                logger.warning(
                    f"Consistency scores not found: {self.consistency_scores_file}"
                )
                self._consistency_lazy = None

            await self._cache_filter_options()
            self._ready = True
            logger.info(f"DataService initialized with {self.master_file}")

        except Exception as e:
            logger.error(f"Failed to initialize DataService: {e}")
            raise

    async def cleanup(self):
        """Clean up resources."""
        self._df_lazy = None
        self._pairwise_sim_lazy = None
        self._consistency_lazy = None
        self._filter_options_cache = None
        self._ready = False

    def is_ready(self) -> bool:
        """Check if the service is ready for queries."""
        return self._ready and self._df_lazy is not None

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
