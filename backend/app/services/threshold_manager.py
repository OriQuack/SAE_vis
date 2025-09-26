"""
Threshold management utilities for data service.

This module handles threshold operations and provides a unified interface
for both legacy and hierarchical threshold systems.
"""

import polars as pl
import logging
from typing import Dict
from ..models.common import ThresholdTree
from .data_constants import *
from .feature_classifier import FeatureClassifier
from .threshold_tree_utils import ThresholdTreeTraverser

logger = logging.getLogger(__name__)


class ThresholdManager:
    """Manages threshold operations and feature classification strategies."""

    def __init__(self):
        self.classifier = FeatureClassifier()

    def apply_classification(
        self,
        df: pl.DataFrame,
        threshold_tree: ThresholdTree
    ) -> pl.DataFrame:
        """
        Apply feature classification using threshold tree system.

        Args:
            df: Input DataFrame
            threshold_tree: Unified threshold tree configuration

        Returns:
            DataFrame with all classification columns added
        """
        logger.info(f"🚀 ThresholdManager.apply_classification called for {len(df)} features")
        logger.info("🌳 Using TREE-BASED classification strategy")
        return self._apply_tree_classification(df, threshold_tree)


    def _apply_tree_classification(
        self,
        df: pl.DataFrame,
        threshold_tree: ThresholdTree
    ) -> pl.DataFrame:
        """Apply tree-based threshold system classification."""
        logger.info("🌳 Starting tree-based classification")

        # Create tree traverser
        traverser = ThresholdTreeTraverser(threshold_tree)

        # Apply tree-based classification
        return self.classifier.classify_with_threshold_tree(
            df, traverser
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
        threshold_tree: ThresholdTree,
        base_thresholds: Dict[str, float]
    ) -> Dict[str, float]:
        """
        Get the effective thresholds that will be applied from threshold tree.

        Args:
            threshold_tree: Unified threshold tree
            base_thresholds: Base threshold values for fallback

        Returns:
            Dictionary of effective threshold values
        """
        # Extract representative thresholds from tree structure for metadata
        root_node = threshold_tree.root
        effective = {}

        # Extract thresholds from tree structure
        if root_node.metric and root_node.split:
            effective[root_node.metric] = root_node.split['thresholds'][0] if root_node.split['thresholds'] else 0.0

        # Add other metrics with default values from base_thresholds
        for metric in threshold_tree.metrics:
            if metric not in effective:
                effective[metric] = base_thresholds.get(metric, 0.0)

        return effective