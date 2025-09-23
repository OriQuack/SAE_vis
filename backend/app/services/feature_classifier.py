"""
Feature classification utilities for data service.

This module handles all feature categorization logic including:
- Feature splitting classification
- Semantic distance classification
- Score agreement classification
- Both legacy and hierarchical threshold systems
"""

import polars as pl
from typing import Dict, Optional
from ..models.common import HierarchicalThresholds
from .data_constants import *


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

    def classify_score_agreement_simple(self, df: pl.DataFrame, score_threshold: float) -> pl.DataFrame:
        """
        Classify features based on simple score agreement with global threshold.

        Args:
            df: DataFrame with score columns
            score_threshold: Global threshold for all scores

        Returns:
            DataFrame with score_agreement and high_score_count columns
        """
        return df.with_columns([
            # Count how many scores are above threshold
            (
                (pl.col(COL_SCORE_FUZZ) >= score_threshold).cast(pl.Int32) +
                (pl.col(COL_SCORE_SIMULATION) >= score_threshold).cast(pl.Int32) +
                (pl.col(COL_SCORE_DETECTION) >= score_threshold).cast(pl.Int32)
            ).alias(COL_HIGH_SCORE_COUNT)
        ]).with_columns([
            # Create agreement category based on count
            pl.when(pl.col(COL_HIGH_SCORE_COUNT) == AGREEMENT_THRESHOLDS[AGREE_ALL])
            .then(pl.lit(AGREE_ALL))
            .when(pl.col(COL_HIGH_SCORE_COUNT) == AGREEMENT_THRESHOLDS[AGREE_2OF3])
            .then(pl.lit(AGREE_2OF3))
            .when(pl.col(COL_HIGH_SCORE_COUNT) == AGREEMENT_THRESHOLDS[AGREE_1OF3])
            .then(pl.lit(AGREE_1OF3))
            .otherwise(pl.lit(AGREE_NONE))
            .alias(COL_SCORE_AGREEMENT)
        ])

    def classify_score_agreement_with_node_thresholds(
        self,
        df: pl.DataFrame,
        global_threshold: float,
        node_thresholds: Dict[str, Dict[str, float]]
    ) -> pl.DataFrame:
        """
        Classify features using parent-node-specific thresholds.

        Args:
            df: DataFrame with splitting and semantic categories
            global_threshold: Default threshold for scores
            node_thresholds: Node-specific threshold overrides

        Returns:
            DataFrame with score agreement classification
        """
        # Add parent node ID for threshold resolution
        df_with_parent = df.with_columns([
            (
                pl.lit(NODE_SPLIT_PREFIX) +
                pl.col(COL_SPLITTING_CATEGORY) +
                pl.lit(NODE_SEMDIST_SUFFIX) +
                pl.col(COL_SEMDIST_CATEGORY)
            ).alias(COL_PARENT_NODE_ID)
        ])

        # Initialize with global thresholds
        df_with_thresholds = df_with_parent.with_columns([
            pl.lit(global_threshold).alias(COL_THRESHOLD_FUZZ),
            pl.lit(global_threshold).alias(COL_THRESHOLD_SIMULATION),
            pl.lit(global_threshold).alias(COL_THRESHOLD_DETECTION)
        ])

        # Apply node-specific thresholds
        for parent_node_id, thresholds in node_thresholds.items():
            if parent_node_id.startswith(NODE_SPLIT_PREFIX) and NODE_SEMDIST_SUFFIX in parent_node_id:
                threshold_updates = {}

                for score_col, threshold_col in [
                    (COL_SCORE_FUZZ, COL_THRESHOLD_FUZZ),
                    (COL_SCORE_SIMULATION, COL_THRESHOLD_SIMULATION),
                    (COL_SCORE_DETECTION, COL_THRESHOLD_DETECTION)
                ]:
                    if score_col in thresholds:
                        threshold_updates[threshold_col] = pl.when(
                            pl.col(COL_PARENT_NODE_ID) == parent_node_id
                        ).then(pl.lit(thresholds[score_col])).otherwise(pl.col(threshold_col))

                if threshold_updates:
                    df_with_thresholds = df_with_thresholds.with_columns(threshold_updates)

        # Apply classification with node-specific thresholds
        return self._apply_threshold_classification(df_with_thresholds).drop([
            COL_PARENT_NODE_ID, COL_THRESHOLD_FUZZ, COL_THRESHOLD_SIMULATION, COL_THRESHOLD_DETECTION
        ])

    def classify_with_hierarchical_thresholds(
        self,
        df: pl.DataFrame,
        hierarchical_thresholds: HierarchicalThresholds
    ) -> pl.DataFrame:
        """
        Classify features using hierarchical threshold system.

        Args:
            df: DataFrame with initial categories
            hierarchical_thresholds: Hierarchical threshold configuration

        Returns:
            DataFrame with hierarchical classification applied
        """
        # Add parent node IDs for threshold group resolution
        df_with_parents = self._add_hierarchical_parent_ids(df, hierarchical_thresholds)

        # Apply hierarchical semantic distance thresholds
        df_with_semdist = self._apply_hierarchical_semdist_thresholds(
            df_with_parents, hierarchical_thresholds
        )

        # Reclassify semantic distance and update parent IDs
        df_reclassified = self._reclassify_semantic_distance(df_with_semdist)

        # Apply hierarchical score thresholds
        df_with_scores = self._apply_hierarchical_score_thresholds(
            df_reclassified, hierarchical_thresholds
        )

        # Apply final classification and cleanup
        return self._apply_threshold_classification(df_with_scores).drop([
            "splitting_parent_id", "semantic_parent_id", COL_SEMDIST_THRESHOLD,
            COL_THRESHOLD_FUZZ, COL_THRESHOLD_SIMULATION, COL_THRESHOLD_DETECTION
        ])

    def _add_hierarchical_parent_ids(
        self,
        df: pl.DataFrame,
        hierarchical_thresholds: HierarchicalThresholds
    ) -> pl.DataFrame:
        """Add parent node IDs for hierarchical threshold resolution."""
        return df.with_columns([
            # Splitting parent ID
            (
                pl.lit(NODE_SPLIT_PREFIX) +
                pl.when(pl.col(COL_FEATURE_SPLITTING) >= hierarchical_thresholds.get_feature_splitting_threshold())
                .then(pl.lit(SPLITTING_TRUE)).otherwise(pl.lit(SPLITTING_FALSE))
            ).alias("splitting_parent_id"),

            # Semantic parent ID
            (
                pl.lit(NODE_SPLIT_PREFIX) +
                pl.when(pl.col(COL_FEATURE_SPLITTING) >= hierarchical_thresholds.get_feature_splitting_threshold())
                .then(pl.lit(SPLITTING_TRUE)).otherwise(pl.lit(SPLITTING_FALSE)) +
                pl.lit(NODE_SEMDIST_SUFFIX) +
                pl.col(COL_SEMDIST_CATEGORY)
            ).alias("semantic_parent_id")
        ])

    def _apply_hierarchical_semdist_thresholds(
        self,
        df: pl.DataFrame,
        hierarchical_thresholds: HierarchicalThresholds
    ) -> pl.DataFrame:
        """Apply hierarchical semantic distance thresholds."""
        return df.with_columns([
            pl.col("splitting_parent_id")
            .map_elements(
                lambda parent_id: hierarchical_thresholds.get_semdist_threshold_for_node(f"{parent_id}_semdist_dummy"),
                return_dtype=pl.Float64
            )
            .alias(COL_SEMDIST_THRESHOLD)
        ])

    def _reclassify_semantic_distance(self, df: pl.DataFrame) -> pl.DataFrame:
        """Reclassify semantic distance based on hierarchical thresholds."""
        return df.with_columns([
            # Reclassify semantic distance
            pl.when(pl.col(COL_SEMDIST_MEAN) >= pl.col(COL_SEMDIST_THRESHOLD))
            .then(pl.lit(SEMDIST_HIGH))
            .otherwise(pl.lit(SEMDIST_LOW))
            .alias(COL_SEMDIST_CATEGORY)
        ]).with_columns([
            # Update semantic parent ID based on new classification
            (
                pl.lit(NODE_SPLIT_PREFIX) +
                pl.when(pl.col(COL_SPLITTING_CATEGORY) == SPLITTING_TRUE)
                .then(pl.lit(SPLITTING_TRUE)).otherwise(pl.lit(SPLITTING_FALSE)) +
                pl.lit(NODE_SEMDIST_SUFFIX) +
                pl.col(COL_SEMDIST_CATEGORY)
            ).alias("semantic_parent_id")
        ])

    def _apply_hierarchical_score_thresholds(
        self,
        df: pl.DataFrame,
        hierarchical_thresholds: HierarchicalThresholds
    ) -> pl.DataFrame:
        """Apply hierarchical score thresholds."""
        return df.with_columns([
            # Get score thresholds for each row based on semantic parent
            pl.col("semantic_parent_id")
            .map_elements(
                lambda parent_id: hierarchical_thresholds.get_score_thresholds_for_node(f"{parent_id}_agree_dummy")["score_fuzz"],
                return_dtype=pl.Float64
            )
            .alias(COL_THRESHOLD_FUZZ),

            pl.col("semantic_parent_id")
            .map_elements(
                lambda parent_id: hierarchical_thresholds.get_score_thresholds_for_node(f"{parent_id}_agree_dummy")["score_simulation"],
                return_dtype=pl.Float64
            )
            .alias(COL_THRESHOLD_SIMULATION),

            pl.col("semantic_parent_id")
            .map_elements(
                lambda parent_id: hierarchical_thresholds.get_score_thresholds_for_node(f"{parent_id}_agree_dummy")["score_detection"],
                return_dtype=pl.Float64
            )
            .alias(COL_THRESHOLD_DETECTION)
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