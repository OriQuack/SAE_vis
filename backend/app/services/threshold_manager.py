"""
Threshold management utilities for data service.

This module handles threshold operations and provides a unified interface
for both legacy and hierarchical threshold systems.
"""

import polars as pl
import logging
from typing import Dict, Optional
from ..models.common import HierarchicalThresholds
from .data_constants import *
from .feature_classifier import FeatureClassifier

logger = logging.getLogger(__name__)


class ThresholdManager:
    """Manages threshold operations and feature classification strategies."""

    def __init__(self):
        self.classifier = FeatureClassifier()

    def apply_classification(
        self,
        df: pl.DataFrame,
        hierarchical_thresholds: HierarchicalThresholds = None
    ) -> pl.DataFrame:
        """
        Apply feature classification using the appropriate threshold system.

        Args:
            df: Input DataFrame
            thresholds: Legacy threshold values
            node_thresholds: Node-specific threshold overrides
            hierarchical_thresholds: Hierarchical threshold configuration

        Returns:
            DataFrame with all classification columns added
        """
        logger.info(f"🚀 ThresholdManager.apply_classification called for {len(df)} features")

        # Note: Due to auto-conversion validator in SankeyRequest, hierarchical_thresholds
        # should always be present. Legacy nodeThresholds are automatically converted.
        if not hierarchical_thresholds:
            raise ValueError("Hierarchical thresholds are required but not provided")

        logger.info("🎯 Using HIERARCHICAL classification strategy")
        return self._apply_hierarchical_classification(df, hierarchical_thresholds)

    def _apply_hierarchical_classification(
        self,
        df: pl.DataFrame,
        hierarchical_thresholds: HierarchicalThresholds
    ) -> pl.DataFrame:
        """Apply hierarchical threshold system classification."""
        # Initial categorization required by hierarchical method
        initial_df = df.with_columns([
            # Initial semantic distance category
            pl.when(pl.col(COL_SEMDIST_MEAN) >= hierarchical_thresholds.global_thresholds.semdist_mean)
            .then(pl.lit(SEMDIST_HIGH))
            .otherwise(pl.lit(SEMDIST_LOW))
            .alias(COL_SEMDIST_CATEGORY),

            # Feature splitting category
            pl.when(pl.col(COL_FEATURE_SPLITTING) >= hierarchical_thresholds.get_feature_splitting_threshold())
            .then(pl.lit(SPLITTING_TRUE))
            .otherwise(pl.lit(SPLITTING_FALSE))
            .alias(COL_SPLITTING_CATEGORY)
        ])

        # Apply hierarchical threshold classification
        return self.classifier.classify_with_hierarchical_thresholds(
            initial_df, hierarchical_thresholds
        )



    def validate_thresholds(self, thresholds: Dict[str, float]) -> bool:
        """
        Validate threshold values are within acceptable ranges.

        Args:
            thresholds: Threshold values to validate

        Returns:
            True if all thresholds are valid
        """
        # Validate semantic distance threshold (0.0 to 1.0)
        if COL_SEMDIST_MEAN in thresholds:
            if not (0.0 <= thresholds[COL_SEMDIST_MEAN] <= 1.0):
                return False

        # Validate individual score thresholds (0.0 to 1.0, simulation can be -1.0 to 1.0)
        if COL_SCORE_FUZZ in thresholds:
            if not (0.0 <= thresholds[COL_SCORE_FUZZ] <= 1.0):
                return False

        if COL_SCORE_DETECTION in thresholds:
            if not (0.0 <= thresholds[COL_SCORE_DETECTION] <= 1.0):
                return False

        if COL_SCORE_SIMULATION in thresholds:
            if not (-1.0 <= thresholds[COL_SCORE_SIMULATION] <= 1.0):
                return False

        # Validate feature splitting threshold (typically small positive value)
        if COL_FEATURE_SPLITTING in thresholds:
            if thresholds[COL_FEATURE_SPLITTING] < 0.0:
                return False

        return True

    def get_effective_thresholds(
        self,
        base_thresholds: Dict[str, float],
        node_thresholds: Optional[Dict[str, Dict[str, float]]] = None,
        hierarchical_thresholds: Optional[HierarchicalThresholds] = None
    ) -> Dict[str, float]:
        """
        Get the effective thresholds that will be applied.

        Args:
            base_thresholds: Base threshold values
            node_thresholds: Node-specific overrides
            hierarchical_thresholds: Hierarchical threshold configuration

        Returns:
            Dictionary of effective threshold values
        """
        if hierarchical_thresholds:
            return {
                COL_SEMDIST_MEAN: hierarchical_thresholds.global_thresholds.semdist_mean,
                COL_SCORE_FUZZ: hierarchical_thresholds.global_thresholds.score_fuzz,
                COL_SCORE_DETECTION: hierarchical_thresholds.global_thresholds.score_detection,
                COL_SCORE_SIMULATION: hierarchical_thresholds.global_thresholds.score_simulation,
                COL_FEATURE_SPLITTING: hierarchical_thresholds.get_feature_splitting_threshold()
            }
        else:
            # Fallback for cases where hierarchical thresholds are not provided
            # This should not happen due to auto-conversion validator
            return base_thresholds.copy()