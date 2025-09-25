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
from typing import Dict, Optional
from ..models.common import HierarchicalThresholds
from .data_constants import *

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
        logger.info(f"🔄 Starting hierarchical classification for {len(df)} features")
        logger.info(f"📊 Hierarchical thresholds: {hierarchical_thresholds.dict()}")

        # Log initial feature distribution
        initial_counts = df.group_by([COL_SPLITTING_CATEGORY, COL_SEMDIST_CATEGORY]).count()
        logger.info(f"📈 Initial feature distribution: {initial_counts}")

        # Add parent node IDs for threshold group resolution
        df_with_parents = self._add_hierarchical_parent_ids(df, hierarchical_thresholds)

        # Apply hierarchical semantic distance thresholds
        df_with_semdist = self._apply_hierarchical_semdist_thresholds(
            df_with_parents, hierarchical_thresholds
        )

        # Reclassify semantic distance and update parent IDs
        df_reclassified = self._reclassify_semantic_distance(df_with_semdist)

        # Log classification changes after semantic distance reclassification
        reclassified_counts = df_reclassified.group_by([COL_SPLITTING_CATEGORY, COL_SEMDIST_CATEGORY]).count()
        logger.info(f"📊 After semantic distance reclassification: {reclassified_counts}")

        # Apply hierarchical score thresholds
        df_with_scores = self._apply_hierarchical_score_thresholds(
            df_reclassified, hierarchical_thresholds
        )

        # Apply final classification and cleanup
        final_result = self._apply_threshold_classification(df_with_scores).drop([
            "splitting_parent_id", "semantic_parent_id", COL_SEMDIST_THRESHOLD,
            COL_THRESHOLD_FUZZ, COL_THRESHOLD_SIMULATION, COL_THRESHOLD_DETECTION
        ])

        # Log final distribution
        final_counts = final_result.group_by([COL_SPLITTING_CATEGORY, COL_SEMDIST_CATEGORY, COL_SCORE_AGREEMENT]).count()
        logger.info(f"✅ Final feature distribution: {final_counts}")

        return final_result

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
        """Apply hierarchical semantic distance thresholds with individual node support."""
        logger.info("🎯 Applying hierarchical semantic distance thresholds")

        # Start with the parent-based thresholds as default
        df_with_thresholds = df.with_columns([
            pl.col("splitting_parent_id")
            .map_elements(
                lambda parent_id: hierarchical_thresholds.get_semdist_threshold_for_node(f"{parent_id}_semdist_dummy"),
                return_dtype=pl.Float64
            )
            .alias(COL_SEMDIST_THRESHOLD)
        ])

        # Log default thresholds applied
        threshold_summary = df_with_thresholds.group_by(["splitting_parent_id", COL_SEMDIST_THRESHOLD]).count()
        logger.info(f"📋 Default semantic distance thresholds by parent: {threshold_summary}")

        # Apply individual node threshold overrides - SIMPLIFIED APPROACH
        # For each feature, check if there is a specific threshold override
        if hierarchical_thresholds.individual_node_groups:
            logger.info(f"🔧 Found individual node groups: {list(hierarchical_thresholds.individual_node_groups.keys())}")

            # Create a mapping of feature conditions to thresholds
            for node_group_id, thresholds in hierarchical_thresholds.individual_node_groups.items():
                logger.info(f"🔍 Processing node group: {node_group_id} with thresholds: {thresholds}")

                if "semdist_mean" in thresholds:
                    node_id = node_group_id.replace("node_", "")
                    logger.info(f"🎯 Found semdist_mean override for node_id: {node_id}")

                    # For semantic distance nodes: split_true_semdist_low -> apply to split_true features
                    if "_semdist_" in node_id:
                        splitting_parent = node_id.split("_semdist_")[0]
                        override_threshold = thresholds["semdist_mean"]
                        logger.info(f"🔄 Applying semdist threshold {override_threshold} to splitting_parent: {splitting_parent}")

                        # Count features that will be affected by this override
                        affected_count = len(df_with_thresholds.filter(pl.col("splitting_parent_id") == splitting_parent))
                        logger.info(f"📊 Override will affect {affected_count} features with splitting_parent={splitting_parent}")

                        # Simple approach: Apply this threshold to ALL features under this splitting parent
                        # This is conceptually cleaner - each parent can have its own semantic distance threshold
                        df_with_thresholds = df_with_thresholds.with_columns([
                            pl.when(pl.col("splitting_parent_id") == splitting_parent)
                            .then(pl.lit(override_threshold))
                            .otherwise(pl.col(COL_SEMDIST_THRESHOLD))
                            .alias(COL_SEMDIST_THRESHOLD)
                        ])

                        # Log the change
                        new_threshold_summary = df_with_thresholds.group_by(["splitting_parent_id", COL_SEMDIST_THRESHOLD]).count()
                        logger.info(f"✅ After applying override for {splitting_parent}: {new_threshold_summary}")
                    else:
                        logger.warning(f"⚠️ Node ID {node_id} doesn't contain '_semdist_', skipping")
                else:
                    logger.info(f"ℹ️ No semdist_mean override in thresholds for {node_group_id}")
        else:
            logger.info("📝 No individual node groups found, using only parent-based thresholds")

        # Final threshold summary
        final_threshold_summary = df_with_thresholds.group_by([COL_SEMDIST_THRESHOLD]).count()
        logger.info(f"📊 Final semantic distance threshold distribution: {final_threshold_summary}")

        return df_with_thresholds

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
        """Apply hierarchical score thresholds with individual node support."""
        # First apply parent-based thresholds
        df_with_parent_thresholds = df.with_columns([
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

        # Apply individual node threshold overrides for score agreement nodes
        if hierarchical_thresholds.individual_node_groups:
            # Create temporary score agreement node IDs for comparison
            df_with_temp_score_nodes = df_with_parent_thresholds.with_columns([
                (
                    pl.col("semantic_parent_id") +
                    pl.lit("_agree_") +
                    # Determine the agreement category based on current thresholds
                    pl.when(
                        (pl.col(COL_SCORE_FUZZ) >= pl.col(COL_THRESHOLD_FUZZ)).cast(pl.Int32) +
                        (pl.col(COL_SCORE_SIMULATION) >= pl.col(COL_THRESHOLD_SIMULATION)).cast(pl.Int32) +
                        (pl.col(COL_SCORE_DETECTION) >= pl.col(COL_THRESHOLD_DETECTION)).cast(pl.Int32) == 3
                    )
                    .then(pl.lit(AGREE_ALL))
                    .when(
                        (pl.col(COL_SCORE_FUZZ) >= pl.col(COL_THRESHOLD_FUZZ)).cast(pl.Int32) +
                        (pl.col(COL_SCORE_SIMULATION) >= pl.col(COL_THRESHOLD_SIMULATION)).cast(pl.Int32) +
                        (pl.col(COL_SCORE_DETECTION) >= pl.col(COL_THRESHOLD_DETECTION)).cast(pl.Int32) == 2
                    )
                    .then(pl.lit(AGREE_2OF3))
                    .when(
                        (pl.col(COL_SCORE_FUZZ) >= pl.col(COL_THRESHOLD_FUZZ)).cast(pl.Int32) +
                        (pl.col(COL_SCORE_SIMULATION) >= pl.col(COL_THRESHOLD_SIMULATION)).cast(pl.Int32) +
                        (pl.col(COL_SCORE_DETECTION) >= pl.col(COL_THRESHOLD_DETECTION)).cast(pl.Int32) == 1
                    )
                    .then(pl.lit(AGREE_1OF3))
                    .otherwise(pl.lit(AGREE_NONE))
                ).alias("temp_score_node_id")
            ])

            # Apply individual node overrides for score thresholds
            for node_group_id, thresholds in hierarchical_thresholds.individual_node_groups.items():
                node_id = node_group_id.replace("node_", "")

                # Check if this is a score agreement node override
                if "_agree_" in node_id:
                    for score_type, threshold_col in [
                        ("score_fuzz", COL_THRESHOLD_FUZZ),
                        ("score_simulation", COL_THRESHOLD_SIMULATION),
                        ("score_detection", COL_THRESHOLD_DETECTION)
                    ]:
                        if score_type in thresholds:
                            df_with_temp_score_nodes = df_with_temp_score_nodes.with_columns([
                                pl.when(pl.col("temp_score_node_id") == node_id)
                                .then(pl.lit(thresholds[score_type]))
                                .otherwise(pl.col(threshold_col))
                                .alias(threshold_col)
                            ])

            return df_with_temp_score_nodes.drop("temp_score_node_id")

        return df_with_parent_thresholds

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