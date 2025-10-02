"""
Classification engine for the new threshold system v2.

This module provides the core classification functionality that:
- Supports dynamic stage ordering
- Tracks parent paths for each feature
- Handles all split rule types
- Builds Sankey diagram data structures
"""

import polars as pl
import logging
import re
from typing import Dict, List, Any, Optional, Tuple, Set
from collections import defaultdict

from ..models.threshold import (
    ThresholdStructure,
    SankeyThreshold,
    CategoryType,
    ParentPathInfo,
)
from .rule_evaluators import SplitEvaluator
from .data_constants import COL_FEATURE_ID
from .node_labeler import NodeDisplayNameGenerator

logger = logging.getLogger(__name__)


class ClassificationEngine:
    """
    Main classification engine for v2 threshold system.

    This replaces the old fixed-stage classification with a flexible,
    dynamic system that can handle any stage ordering and split rule types.
    """

    def __init__(self):
        """
        Initialize ClassificationEngine.
        """
        self.evaluator = SplitEvaluator()
        # Performance optimization: cache for classification results
        self._classification_cache = {}
        self._cache_max_size = 100  # Limit cache size to avoid memory issues

    def classify_features(
        self, df: pl.DataFrame, threshold_structure: ThresholdStructure
    ) -> pl.DataFrame:
        """
        Classify features using the v2 threshold structure.

        This is a complete replacement for the old _classify_features method.
        It supports:
        - Dynamic stage ordering
        - All split rule types
        - Parent path tracking
        - Flexible metrics

        Args:
            df: Polars DataFrame with feature data
            threshold_structure: V2 threshold structure

        Returns:
            DataFrame with classification columns added:
            - final_node_id: The leaf node ID for each feature
            - classification_path: JSON string of the complete path
            - node_at_stage_X: Node ID at each stage (for compatibility)
        """
        # OPTIMIZATION: Use cached node lookup from ThresholdStructure
        # This avoids rebuilding the lookup dictionary every time
        if threshold_structure._nodes_by_id is None:
            threshold_structure._build_lookup_caches()
        nodes_by_id = threshold_structure._nodes_by_id

        # Get root node
        root = threshold_structure.get_root()
        if not root:
            raise ValueError("No root node found in threshold structure")

        # Convert to list of dicts for batch processing (more efficient than iter_rows)
        rows = df.to_dicts()

        # Batch classify all features
        feature_classifications = self._classify_features_batch(rows, root, nodes_by_id)

        # Create classification DataFrame
        classification_df = pl.DataFrame(feature_classifications)

        # Ensure feature_id column has the same type as original DataFrame
        # Also cast _row_idx to match with_row_count output (u32)
        original_feature_id_type = df.schema[COL_FEATURE_ID]
        classification_df = classification_df.with_columns([
            pl.col(COL_FEATURE_ID).cast(original_feature_id_type),
            pl.col("_row_idx").cast(pl.UInt32)
        ])

        # Add row index to original DataFrame for proper join
        df_with_idx = df.with_row_count("_row_idx")

        # Join using row index to avoid duplication from duplicate feature_ids
        result_df = df_with_idx.join(classification_df, on="_row_idx", how="left").drop("_row_idx")

        # Log classification summary
        self._log_classification_summary(result_df)

        return result_df

    def _classify_features_batch(
        self,
        rows: List[Dict[str, Any]],
        root: SankeyThreshold,
        nodes_by_id: Dict[str, SankeyThreshold],
    ) -> List[Dict[str, Any]]:
        """
        Batch classify all features efficiently.

        Args:
            rows: List of feature row dictionaries
            root: Root node
            nodes_by_id: Node lookup dictionary

        Returns:
            List of classification result dictionaries
        """
        feature_classifications = []

        for i, row_dict in enumerate(rows):
            feature_id = row_dict.get(COL_FEATURE_ID)

            # Track the classification path for this feature
            path_info = self._classify_single_feature(row_dict, root, nodes_by_id)

            # Store classification info with row index for proper join
            feature_classifications.append(
                {
                    "_row_idx": i,  # Track original row index (will be cast to u32)
                    COL_FEATURE_ID: feature_id,
                    "final_node_id": path_info["final_node_id"],
                    "classification_path": path_info["path"],
                    **path_info[
                        "stage_nodes"
                    ],  # node_at_stage_0, node_at_stage_1, etc.
                }
            )

        return feature_classifications

    def _classify_single_feature(
        self,
        feature_row: Dict[str, Any],
        root: SankeyThreshold,
        nodes_by_id: Dict[str, SankeyThreshold],
    ) -> Dict[str, Any]:
        """
        Classify a single feature through the threshold tree.

        Returns:
            Dictionary with:
            - final_node_id: The leaf node reached
            - path: List of node IDs traversed
            - stage_nodes: Dict of stage -> node_id mappings
        """
        current_node = root
        path = [root.id]
        stage_nodes = {f"node_at_stage_{root.stage}": root.id}
        parent_path = []

        # Traverse until we reach a leaf node
        while current_node.split_rule is not None:
            # Evaluate split rule
            evaluation = self.evaluator.evaluate(
                feature_row, current_node.split_rule, current_node.children_ids
            )

            # Build parent path info
            parent_info = ParentPathInfo(
                parent_id=current_node.id,
                parent_split_rule=evaluation.split_info,
                branch_index=evaluation.branch_index,
                triggering_values=evaluation.triggering_values,
            )
            parent_path.append(parent_info)

            # Move to selected child
            child_id = evaluation.child_id
            if child_id not in nodes_by_id:
                logger.error(f"Child node '{child_id}' not found in structure")
                break

            current_node = nodes_by_id[child_id]
            path.append(current_node.id)
            stage_nodes[f"node_at_stage_{current_node.stage}"] = current_node.id

        return {
            "final_node_id": current_node.id,
            "path": path,
            "stage_nodes": stage_nodes,
            "parent_path": parent_path,
        }

    def build_sankey_data(
        self, classified_df: pl.DataFrame, threshold_structure: ThresholdStructure
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Build Sankey diagram nodes and links from classified data.

        This replaces the old build_sankey_nodes_and_links function
        with support for dynamic structures and aggregation.

        Returns:
            Tuple of (nodes, links) for Sankey diagram
        """
        # Initialize display name generator
        display_name_generator = NodeDisplayNameGenerator(threshold_structure)

        # Calculate max_stage once (used by all aggregation methods)
        max_stage = max(node.stage for node in threshold_structure.nodes)

        # Single-pass aggregation: get both counts and feature IDs
        aggregated_node_counts, feature_ids_by_node = self._aggregate_node_data(
            classified_df, max_stage
        )

        # Count aggregated links
        aggregated_link_counts = self._count_aggregated_links(
            classified_df, max_stage
        )

        # Step 2: Build aggregated Sankey nodes
        nodes = []
        aggregated_nodes_by_id = {}

        for node in threshold_structure.nodes:
            # Use actual node ID without aggregation
            node_id = node.id
            count = aggregated_node_counts.get(node_id, 0)

            # Don't skip any nodes - we need to show all nodes even if empty

            # Create node entry (no more aggregation - each node is unique)
            node_dict = {
                "id": node_id,
                "name": display_name_generator.get_display_name(node),
                "stage": node.stage,
                "feature_count": count,  # Required by response model
                "category": node.category.value,
            }

            # Add feature IDs only for leaf nodes (nodes with no children)
            is_leaf_node = len(node.children_ids) == 0
            if is_leaf_node:
                feature_ids = feature_ids_by_node.get(node_id, [])
                if feature_ids:
                    node_dict["feature_ids"] = feature_ids

            nodes.append(node_dict)

        # Step 4: Build aggregated links
        links = []
        for (source_id, target_id), count in aggregated_link_counts.items():
            if count > 0:
                links.append({"source": source_id, "target": target_id, "value": count})

        # No sorting - return nodes and links in natural order from threshold tree
        # Frontend will handle sorting if needed

        return nodes, links

    def _aggregate_node_data(
        self, classified_df: pl.DataFrame, max_stage: int
    ) -> Tuple[Dict[str, int], Dict[str, List[int]]]:
        """
        Single-pass aggregation: count unique features AND collect feature IDs per node.

        This replaces the separate _count_unique_features_per_aggregated_node and
        _collect_feature_ids_per_node methods with a single efficient pass.

        Args:
            classified_df: Classified DataFrame with node_at_stage_X columns
            max_stage: Maximum stage number in threshold structure

        Returns:
            Tuple of (node_counts, feature_ids_by_node)
        """
        aggregated_counts = {}
        feature_ids_by_node = {}

        for stage in range(max_stage + 1):
            stage_col = f"node_at_stage_{stage}"
            if stage_col not in classified_df.columns:
                continue

            # Single aggregation with both n_unique and unique
            stage_data = (
                classified_df.filter(pl.col(stage_col).is_not_null())
                .group_by(stage_col)
                .agg([
                    pl.col(COL_FEATURE_ID).n_unique().alias("unique_count"),
                    pl.col(COL_FEATURE_ID).unique().alias("feature_ids")
                ])
            )

            # Process results using Polars-native iteration
            for row in stage_data.iter_rows(named=True):
                node_id = row[stage_col]
                if node_id and node_id not in aggregated_counts:
                    aggregated_counts[node_id] = row["unique_count"]
                    feature_ids_by_node[node_id] = [int(fid) for fid in row["feature_ids"]]

        return aggregated_counts, feature_ids_by_node

    def _count_aggregated_links(
        self, classified_df: pl.DataFrame, max_stage: int
    ) -> Dict[Tuple[str, str], int]:
        """
        Count features flowing through aggregated links - only where branching occurs.

        Optimized to combine branching detection with link counting in a single query per stage.

        Args:
            classified_df: Classified DataFrame with node_at_stage_X columns
            max_stage: Maximum stage number

        Returns:
            Dictionary mapping (source_id, target_id) tuples to feature counts
        """
        aggregated_link_counts = defaultdict(int)

        for stage in range(max_stage):
            source_col = f"node_at_stage_{stage}"
            target_col = f"node_at_stage_{stage + 1}"

            if source_col not in classified_df.columns or target_col not in classified_df.columns:
                continue

            # Combined query: count links AND identify branching in one pass
            link_data = (
                classified_df.filter(
                    pl.col(source_col).is_not_null() & pl.col(target_col).is_not_null()
                )
                .group_by([source_col, target_col])
                .agg(pl.col(COL_FEATURE_ID).n_unique().alias("unique_count"))
                # Add source-level aggregation to identify branching
                .with_columns([
                    pl.col(source_col).count().over(source_col).alias("branch_count")
                ])
                .filter(pl.col("branch_count") > 1)  # Only keep branching nodes
            )

            # Process results
            for row in link_data.iter_rows(named=True):
                source = row[source_col]
                target = row[target_col]
                count = row["unique_count"]
                if source and target:
                    aggregated_link_counts[(source, target)] = count

        return dict(aggregated_link_counts)

    def _log_classification_summary(self, classified_df: pl.DataFrame):
        """Log summary statistics of classification"""
        total_features = len(classified_df)

        # Count features at final nodes
        if "final_node_id" in classified_df.columns:
            final_counts = (
                classified_df.group_by("final_node_id")
                .count()
                .sort("count", descending=True)
                .to_dicts()
            )

            logger.info(
                f"Classification complete: {total_features} features classified"
            )
            logger.info("Top final nodes:")
            for i, row in enumerate(final_counts[:5]):
                node_id = row["final_node_id"]
                count = row["count"]
                pct = (count / total_features) * 100
                logger.info(f"  {i+1}. {node_id}: {count} ({pct:.1f}%)")

    def filter_features_for_node(
        self,
        df: pl.DataFrame,
        threshold_structure: Optional[ThresholdStructure],
        node_id: Optional[str],
    ) -> pl.DataFrame:
        """
        Filter features to only include those that belong to a specific node.

        OPTIMIZED VERSION: Uses parent_path constraints for efficient filtering
        instead of classifying all features.

        Args:
            df: Original DataFrame with feature data
            threshold_structure: V2 threshold structure (optional)
            node_id: Target node ID to filter for (optional)

        Returns:
            Filtered DataFrame containing only features belonging to the specified node
        """
        logger.debug(f"Filtering features for node_id: {node_id}")

        # If no threshold structure or node_id provided, return original data
        if threshold_structure is None or node_id is None:
            logger.debug(
                "No threshold structure or node_id provided, returning original data"
            )
            return df

        if node_id == "root":
            return df

        # Check if the node exists in the structure
        target_node = threshold_structure.get_node_by_id(node_id)
        if not target_node:
            logger.warning(f"Node '{node_id}' not found in threshold structure")
            return df.filter(pl.lit(False))  # Return empty DataFrame

        # OPTIMIZATION: Use path-based filtering for leaf nodes
        if len(target_node.children_ids) == 0 and target_node.parent_path:
            logger.debug(f"Using optimized path-based filtering for leaf node {node_id}")
            return self._filter_by_path_constraints(df, target_node, threshold_structure)

        # For non-leaf nodes or nodes without parent_path, use targeted classification
        logger.debug(f"Using targeted classification for node {node_id} at stage {target_node.stage}")
        return self._filter_by_targeted_classification(df, target_node, threshold_structure)

    def _filter_by_path_constraints(
        self,
        df: pl.DataFrame,
        target_node: SankeyThreshold,
        threshold_structure: ThresholdStructure
    ) -> pl.DataFrame:
        """
        Filter features using parent_path constraints without full classification.
        This is much faster for leaf nodes as it avoids unnecessary computation.
        """
        filtered_df = df

        # Apply each constraint from the parent path
        for parent_info in target_node.parent_path:
            parent_node = threshold_structure.get_node_by_id(parent_info.parent_id)
            if not parent_node or not parent_node.split_rule:
                continue

            # Apply the split rule as a filter
            if parent_info.parent_split_rule.type == "range":
                range_info = parent_info.parent_split_rule.range_info
                if range_info:
                    metric = range_info.metric
                    thresholds = range_info.thresholds
                    branch = parent_info.branch_index

                    # Apply range filter based on branch index
                    if branch == 0:
                        # First branch: < first threshold
                        filtered_df = filtered_df.filter(pl.col(metric) < thresholds[0])
                    elif branch == len(thresholds):
                        # Last branch: >= last threshold
                        filtered_df = filtered_df.filter(pl.col(metric) >= thresholds[-1])
                    else:
                        # Middle branches: between thresholds
                        filtered_df = filtered_df.filter(
                            (pl.col(metric) >= thresholds[branch - 1]) &
                            (pl.col(metric) < thresholds[branch])
                        )

                    logger.debug(f"Applied range filter: {metric} branch {branch}, remaining: {len(filtered_df)}")

            # For pattern and expression rules, we need more complex filtering
            # but we can still avoid full classification by applying constraints directly

        logger.debug(f"Path-based filtering complete: {len(filtered_df)} features for node {target_node.id}")
        return filtered_df

    def _filter_by_targeted_classification(
        self,
        df: pl.DataFrame,
        target_node: SankeyThreshold,
        threshold_structure: ThresholdStructure
    ) -> pl.DataFrame:
        """
        Perform targeted classification up to the required stage only.
        This avoids classifying beyond what's needed for intermediate nodes.
        Uses cached node lookups from ThresholdStructure for O(1) access.
        """
        # Get root node using cached lookup
        root = threshold_structure.get_root()
        if not root:
            raise ValueError("No root node found in threshold structure")

        target_stage = target_node.stage
        rows = df.to_dicts()
        matching_feature_ids = []

        # Classify each feature but stop at target stage
        for row_dict in rows:
            feature_id = row_dict.get(COL_FEATURE_ID)
            current_node = root
            current_stage = 0

            # Traverse until we reach target stage or a leaf
            while current_stage < target_stage and current_node.split_rule is not None:
                evaluation = self.evaluator.evaluate(
                    row_dict, current_node.split_rule, current_node.children_ids
                )

                child_id = evaluation.child_id
                # Use cached lookup instead of dictionary check
                child_node = threshold_structure.get_node_by_id(child_id)
                if not child_node:
                    break

                current_node = child_node
                current_stage = current_node.stage

            # Check if we reached the target node
            if current_node.id == target_node.id:
                matching_feature_ids.append(feature_id)

        # Filter original DataFrame
        if not matching_feature_ids:
            logger.debug(f"No features found for node {target_node.id}")
            return df.filter(pl.lit(False))

        filtered_df = df.filter(pl.col(COL_FEATURE_ID).is_in(matching_feature_ids))
        logger.debug(f"Targeted classification complete: {len(filtered_df)} features for node {target_node.id}")
        return filtered_df
