"""
High-performance data service using Polars for SAE feature analysis.

This module provides the main DataService class that handles data loading,
filtering, and visualization data generation for the SAE feature analysis project.
"""

import polars as pl
import numpy as np
import asyncio
import logging
from typing import Dict, List, Optional, Union, Any
from pathlib import Path

# Enable Polars string cache for categorical operations
pl.enable_string_cache()

from ..models.common import Filters, MetricType, HierarchicalThresholds
from ..models.responses import (
    FilterOptionsResponse, HistogramResponse, SankeyResponse,
    ComparisonResponse, FeatureResponse
)
from .data_constants import *
from .threshold_manager import ThresholdManager
from .sankey_builder import SankeyBuilder

logger = logging.getLogger(__name__)


class DataService:
    """High-performance data service using Polars for Parquet operations."""

    def __init__(self, data_path: str = "../data"):
        self.data_path = Path(data_path)
        self.master_file = self.data_path / "master" / "feature_analysis.parquet"
        self.detailed_json_dir = self.data_path / "detailed_json"
        self.metadata_file = self.data_path / "master" / "feature_analysis.metadata.json"

        # Cache for frequently accessed data
        self._filter_options_cache: Optional[Dict[str, List[str]]] = None
        self._df_lazy: Optional[pl.LazyFrame] = None
        self._ready = False

        # Helper classes for modular functionality
        self._threshold_manager = ThresholdManager()
        self._sankey_builder = SankeyBuilder()

    async def initialize(self):
        """Initialize the data service with lazy loading."""
        try:
            if not self.master_file.exists():
                raise FileNotFoundError(f"Master parquet file not found: {self.master_file}")

            # Create lazy frame for efficient querying
            self._df_lazy = pl.scan_parquet(self.master_file)

            # Pre-compute and cache filter options
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

    async def _cache_filter_options(self):
        """Pre-compute and cache filter options for performance."""
        if self._df_lazy is None:
            raise RuntimeError("DataService not initialized")

        try:
            unique_values = {}
            for col in FILTER_COLUMNS:
                values = (
                    self._df_lazy
                    .select(pl.col(col).unique().sort())
                    .collect()
                    .get_column(col)
                    .to_list()
                )
                unique_values[col] = [v for v in values if v is not None]

            self._filter_options_cache = unique_values
            logger.info("Filter options cached successfully")

        except Exception as e:
            logger.error(f"Failed to cache filter options: {e}")
            raise

    def _apply_filters(self, lazy_df: pl.LazyFrame, filters: Filters) -> pl.LazyFrame:
        """Apply filters to lazy DataFrame efficiently."""
        conditions = []

        # Build filter conditions
        filter_mapping = [
            (filters.sae_id, COL_SAE_ID),
            (filters.explanation_method, COL_EXPLANATION_METHOD),
            (filters.llm_explainer, COL_LLM_EXPLAINER),
            (filters.llm_scorer, COL_LLM_SCORER)
        ]

        for filter_value, column_name in filter_mapping:
            if filter_value:
                conditions.append(pl.col(column_name).is_in(filter_value))

        if conditions:
            # Combine all conditions with AND logic
            combined_condition = conditions[0]
            for condition in conditions[1:]:
                combined_condition = combined_condition & condition

            return lazy_df.filter(combined_condition)

        return lazy_df

    async def get_filter_options(self) -> FilterOptionsResponse:
        """Get all available filter options."""
        if not self._filter_options_cache:
            await self._cache_filter_options()

        return FilterOptionsResponse(**self._filter_options_cache)

    async def get_histogram_data(
        self,
        filters: Filters,
        metric: MetricType,
        bins: int = DEFAULT_HISTOGRAM_BINS
    ) -> HistogramResponse:
        """Generate histogram data for a specific metric."""
        if not self.is_ready():
            raise RuntimeError("DataService not ready")

        try:
            # Apply filters and collect metric data
            metric_data = (
                self._apply_filters(self._df_lazy, filters)
                .select([pl.col(metric.value).alias("metric_value")])
                .collect()
            )

            if len(metric_data) == 0:
                raise ValueError("No data available after applying filters")

            # Extract values and remove nulls
            values = metric_data.get_column("metric_value").drop_nulls().to_numpy()

            if len(values) == 0:
                raise ValueError("No valid values found for the specified metric")

            # Calculate histogram and statistics
            counts, bin_edges = np.histogram(values, bins=bins)
            bin_centers = (bin_edges[:-1] + bin_edges[1:]) / 2

            statistics = {
                "min": float(np.min(values)),
                "max": float(np.max(values)),
                "mean": float(np.mean(values)),
                "median": float(np.median(values)),
                "std": float(np.std(values))
            }

            return HistogramResponse(
                metric=metric.value,
                histogram={
                    "bins": bin_centers.tolist(),
                    "counts": counts.tolist(),
                    "bin_edges": bin_edges.tolist()
                },
                statistics=statistics,
                total_features=len(values)
            )

        except Exception as e:
            logger.error(f"Error generating histogram: {e}")
            raise

    async def get_sankey_data(
        self,
        filters: Filters,
        thresholds: Dict[str, float],
        nodeThresholds: Optional[Dict[str, Dict[str, float]]] = None,
        hierarchicalThresholds: Optional[HierarchicalThresholds] = None
    ) -> SankeyResponse:
        """Generate Sankey diagram data with hierarchical categorization."""
        if not self.is_ready():
            raise RuntimeError("DataService not ready")

        try:
            # Apply filters and collect data
            filtered_df = self._apply_filters(self._df_lazy, filters).collect()

            if len(filtered_df) == 0:
                raise ValueError("No data available after applying filters")

            # Apply classification using threshold manager
            categorized_df = self._threshold_manager.apply_classification(
                filtered_df, thresholds, nodeThresholds, hierarchicalThresholds
            )

            # Build Sankey response using builder
            return self._sankey_builder.build_sankey_response(
                categorized_df, filters, thresholds
            )

        except Exception as e:
            logger.error(f"Error generating Sankey data: {e}")
            raise

    async def get_comparison_data(
        self,
        left_filters: Filters,
        left_thresholds: Dict[str, float],
        right_filters: Filters,
        right_thresholds: Dict[str, float]
    ) -> ComparisonResponse:
        """Generate alluvial comparison data between two Sankey configurations."""
        # Implementation for Phase 2
        raise NotImplementedError("Comparison data generation not yet implemented")

    async def get_feature_data(
        self,
        feature_id: int,
        sae_id: Optional[str] = None,
        explanation_method: Optional[str] = None,
        llm_explainer: Optional[str] = None,
        llm_scorer: Optional[str] = None
    ) -> FeatureResponse:
        """Get detailed data for a specific feature."""
        if not self.is_ready():
            raise RuntimeError("DataService not ready")

        try:
            # Build query conditions
            conditions = [pl.col(COL_FEATURE_ID) == feature_id]

            filter_params = [
                (sae_id, COL_SAE_ID),
                (explanation_method, COL_EXPLANATION_METHOD),
                (llm_explainer, COL_LLM_EXPLAINER),
                (llm_scorer, COL_LLM_SCORER)
            ]

            for param_value, column_name in filter_params:
                if param_value:
                    conditions.append(pl.col(column_name) == param_value)

            # Combine conditions
            combined_condition = conditions[0]
            for condition in conditions[1:]:
                combined_condition = combined_condition & condition

            # Query the data
            result_df = (
                self._df_lazy
                .filter(combined_condition)
                .collect()
            )

            if len(result_df) == 0:
                raise ValueError(f"Feature {feature_id} not found with specified parameters")

            # Take the first matching record
            row = result_df.row(0, named=True)

            return FeatureResponse(
                feature_id=row[COL_FEATURE_ID],
                sae_id=row[COL_SAE_ID],
                explanation_method=row[COL_EXPLANATION_METHOD],
                llm_explainer=row[COL_LLM_EXPLAINER],
                llm_scorer=row[COL_LLM_SCORER],
                feature_splitting=row[COL_FEATURE_SPLITTING],
                semdist_mean=row[COL_SEMDIST_MEAN],
                semdist_max=row[COL_SEMDIST_MAX],
                scores={
                    "fuzz": row[COL_SCORE_FUZZ] or 0.0,
                    "simulation": row[COL_SCORE_SIMULATION] or 0.0,
                    "detection": row[COL_SCORE_DETECTION] or 0.0,
                    "embedding": row[COL_SCORE_EMBEDDING] or 0.0
                },
                details_path=row[COL_DETAILS_PATH]
            )

        except Exception as e:
            logger.error(f"Error retrieving feature data: {e}")
            raise