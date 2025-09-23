"""
Threshold management utilities for data service.

This module handles threshold operations and provides a unified interface
for both legacy and hierarchical threshold systems.
"""

import polars as pl
from typing import Dict, Optional
from ..models.common import HierarchicalThresholds
from .data_constants import *
from .feature_classifier import FeatureClassifier


class ThresholdManager:
    """Manages threshold operations and feature classification strategies."""

    def __init__(self):
        self.classifier = FeatureClassifier()

    def apply_classification(
        self,
        df: pl.DataFrame,
        thresholds: Dict[str, float],
        node_thresholds: Optional[Dict[str, Dict[str, float]]] = None,
        hierarchical_thresholds: Optional[HierarchicalThresholds] = None
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
        if hierarchical_thresholds:
            return self._apply_hierarchical_classification(df, hierarchical_thresholds)
        else:
            return self._apply_legacy_classification(df, thresholds, node_thresholds)

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

    def _apply_legacy_classification(
        self,
        df: pl.DataFrame,
        thresholds: Dict[str, float],
        node_thresholds: Optional[Dict[str, Dict[str, float]]] = None
    ) -> pl.DataFrame:
        """Apply legacy threshold system classification."""
        # Extract thresholds with defaults
        semdist_threshold = thresholds.get(COL_SEMDIST_MEAN, 0.5)
        score_threshold = thresholds.get("score_high", 0.5)
        splitting_threshold = thresholds.get(COL_FEATURE_SPLITTING, DEFAULT_FEATURE_SPLITTING_THRESHOLD)

        # Apply node threshold overrides for semantic distance
        if node_thresholds:
            for node_id, node_thresh in node_thresholds.items():
                if COL_SEMDIST_MEAN in node_thresh:
                    semdist_threshold = node_thresh[COL_SEMDIST_MEAN]
                    break  # Use first found override

        # Apply basic categorization
        categorized_df = self.classifier.classify_splitting(df, splitting_threshold)
        categorized_df = self.classifier.classify_semantic_distance(categorized_df, semdist_threshold)

        # Apply score agreement classification
        if node_thresholds:
            return self.classifier.classify_score_agreement_with_node_thresholds(
                categorized_df, score_threshold, node_thresholds
            )
        else:
            return self.classifier.classify_score_agreement_simple(categorized_df, score_threshold)

    def extract_node_threshold_overrides(
        self,
        node_thresholds: Optional[Dict[str, Dict[str, float]]]
    ) -> Dict[str, float]:
        """
        Extract threshold overrides from node-specific thresholds.

        Args:
            node_thresholds: Node-specific threshold configuration

        Returns:
            Dictionary of threshold overrides for legacy system compatibility
        """
        overrides = {}

        if not node_thresholds:
            return overrides

        # Extract semantic distance threshold from first suitable node
        for node_id, thresholds in node_thresholds.items():
            if COL_SEMDIST_MEAN in thresholds:
                overrides[COL_SEMDIST_MEAN] = thresholds[COL_SEMDIST_MEAN]
                break

        return overrides

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

        # Validate score threshold (0.0 to 1.0)
        if "score_high" in thresholds:
            if not (0.0 <= thresholds["score_high"] <= 1.0):
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
                "score_high": hierarchical_thresholds.global_thresholds.score_high,
                COL_FEATURE_SPLITTING: hierarchical_thresholds.get_feature_splitting_threshold()
            }
        else:
            effective = base_thresholds.copy()

            # Apply node threshold overrides
            if node_thresholds:
                overrides = self.extract_node_threshold_overrides(node_thresholds)
                effective.update(overrides)

            return effective