"""
Feature classification utilities for data service.

This module handles all feature categorization logic including:
- Feature splitting classification
- Semantic distance classification
- Score agreement classification
- Both legacy and hierarchical threshold systems
"""

import polars as pl
import logging
from .data_constants import *
from .threshold_tree_utils import ThresholdTreeTraverser

logger = logging.getLogger(__name__)


class FeatureClassifier:
    """Handles feature classification and categorization operations."""

    def classify_splitting(self, df: pl.DataFrame, threshold: float) -> pl.DataFrame:
        """
        Classify features based on feature splitting threshold.

        Args:
            df: DataFrame with feature_splitting column
            threshold: Threshold for splitting classification

        Returns:
            DataFrame with splitting_category column added
        """
        return df.with_columns([
            pl.when(pl.col(COL_FEATURE_SPLITTING) >= threshold)
            .then(pl.lit(SPLITTING_TRUE))
            .otherwise(pl.lit(SPLITTING_FALSE))
            .alias(COL_SPLITTING_CATEGORY)
        ])

    def classify_semantic_distance(self, df: pl.DataFrame, threshold: float) -> pl.DataFrame:
        """
        Classify features based on semantic distance threshold.

        Args:
            df: DataFrame with semdist_mean column
            threshold: Threshold for semantic distance classification

        Returns:
            DataFrame with semdist_category column added
        """
        return df.with_columns([
            pl.when(pl.col(COL_SEMDIST_MEAN) >= threshold)
            .then(pl.lit(SEMDIST_HIGH))
            .otherwise(pl.lit(SEMDIST_LOW))
            .alias(COL_SEMDIST_CATEGORY)
        ])



    def _apply_threshold_classification(self, df: pl.DataFrame) -> pl.DataFrame:
        """
        Apply score agreement classification using threshold columns.

        Args:
            df: DataFrame with threshold columns

        Returns:
            DataFrame with score agreement classification
        """
        return df.with_columns([
            # Count scores above their respective thresholds
            (
                (pl.col(COL_SCORE_FUZZ) >= pl.col(COL_THRESHOLD_FUZZ)).cast(pl.Int32) +
                (pl.col(COL_SCORE_SIMULATION) >= pl.col(COL_THRESHOLD_SIMULATION)).cast(pl.Int32) +
                (pl.col(COL_SCORE_DETECTION) >= pl.col(COL_THRESHOLD_DETECTION)).cast(pl.Int32)
            ).alias(COL_HIGH_SCORE_COUNT)
        ]).with_columns([
            # Create agreement category
            pl.when(pl.col(COL_HIGH_SCORE_COUNT) == AGREEMENT_THRESHOLDS[AGREE_ALL])
            .then(pl.lit(AGREE_ALL))
            .when(pl.col(COL_HIGH_SCORE_COUNT) == AGREEMENT_THRESHOLDS[AGREE_2OF3])
            .then(pl.lit(AGREE_2OF3))
            .when(pl.col(COL_HIGH_SCORE_COUNT) == AGREEMENT_THRESHOLDS[AGREE_1OF3])
            .then(pl.lit(AGREE_1OF3))
            .otherwise(pl.lit(AGREE_NONE))
            .alias(COL_SCORE_AGREEMENT)
        ])

    def classify_with_threshold_tree(
        self,
        df: pl.DataFrame,
        tree_traverser: ThresholdTreeTraverser
    ) -> pl.DataFrame:
        """
        Classify features using the unified threshold tree system.

        Args:
            df: DataFrame with feature values
            tree_traverser: Tree traverser for threshold lookups

        Returns:
            DataFrame with classification columns added
        """
        logger.info(f"🌳 Starting tree-based classification for {len(df)} features")

        # Extract threshold values for all features using tree traversal
        threshold_columns = tree_traverser.extract_thresholds_from_tree(df)

        # Add threshold columns to the DataFrame
        df_with_thresholds = df.with_columns([
            pl.Series(name, values) for name, values in threshold_columns.items()
        ])

        # Apply all three stages of classification using the per-row thresholds
        # Stage 1: Feature splitting classification (using per-row thresholds)
        df_classified = df_with_thresholds.with_columns([
            pl.when(pl.col(COL_FEATURE_SPLITTING) >= pl.col("feature_splitting_threshold"))
            .then(pl.lit(SPLITTING_TRUE))
            .otherwise(pl.lit(SPLITTING_FALSE))
            .alias(COL_SPLITTING_CATEGORY)
        ])

        # Stage 2: Semantic distance classification (using per-row thresholds)
        df_classified = df_classified.with_columns([
            pl.when(pl.col(COL_SEMDIST_MEAN) >= pl.col("semdist_mean_threshold"))
            .then(pl.lit(SEMDIST_HIGH))
            .otherwise(pl.lit(SEMDIST_LOW))
            .alias(COL_SEMDIST_CATEGORY)
        ])

        # Stage 3: Score agreement classification
        return self._apply_threshold_classification(df_classified)