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
from .split_evaluators import SplitEvaluator
from .data_constants import (
    COL_FEATURE_ID,
    CATEGORY_ROOT,
    CATEGORY_FEATURE_SPLITTING,
    CATEGORY_SEMANTIC_DISTANCE,
    CATEGORY_SCORE_AGREEMENT,
    SPLITTING_TRUE,
    SPLITTING_FALSE,
    SEMDIST_HIGH,
    SEMDIST_LOW,
    NODE_KEYWORD_SEMDIST,
    NODE_SPLIT_TRUE,
    NODE_SPLIT_FALSE,
    PATTERN_ALL_N_HIGH,
    PATTERN_ALL_N_LOW,
    PATTERN_K_OF_N_HIGH,
    PATTERN_SCORE_DETAILED,
    BOOLEAN_DISPLAY_NAMES,
    SCORE_PATTERN_PREFIXES,
    SINGLE_SCORE_PATTERNS,
)

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
        # Build node lookup for efficient access
        nodes_by_id = {node.id: node for node in threshold_structure.nodes}

        # Get root node
        root = threshold_structure.get_root()
        if not root:
            raise ValueError("No root node found in threshold structure")

        # Initialize tracking structures
        feature_classifications = []

        # Process each feature
        for row_dict in df.iter_rows(named=True):
            feature_id = row_dict.get(COL_FEATURE_ID)

            # Track the classification path for this feature
            path_info = self._classify_single_feature(row_dict, root, nodes_by_id)

            # Store classification info
            feature_classifications.append(
                {
                    COL_FEATURE_ID: feature_id,
                    "final_node_id": path_info["final_node_id"],
                    "classification_path": path_info["path"],
                    **path_info[
                        "stage_nodes"
                    ],  # node_at_stage_0, node_at_stage_1, etc.
                }
            )

        # Create classification DataFrame
        classification_df = pl.DataFrame(feature_classifications)

        # Ensure feature_id column has the same type as original DataFrame
        original_feature_id_type = df.schema[COL_FEATURE_ID]
        classification_df = classification_df.with_columns(
            pl.col(COL_FEATURE_ID).cast(original_feature_id_type)
        )

        # Join with original DataFrame
        result_df = df.join(classification_df, on=COL_FEATURE_ID, how="left")

        # Log classification summary
        self._log_classification_summary(result_df)

        return result_df

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
        # Store threshold structure for stage-agnostic parent resolution
        self._current_threshold_structure = threshold_structure
        # Step 1: Count UNIQUE features per aggregated node (fixes 4x multiplication bug)
        aggregated_node_counts = self._count_unique_features_per_aggregated_node(
            classified_df, threshold_structure
        )
        # Collect feature IDs for all nodes
        feature_ids_by_node = self._collect_feature_ids_per_node(
            classified_df, threshold_structure
        )
        aggregated_link_counts = self._count_aggregated_links(
            classified_df, threshold_structure
        )

        # Step 2: Build aggregated Sankey nodes
        nodes = []
        aggregated_nodes_by_id = {}

        for node in threshold_structure.nodes:
            # Use actual node ID without aggregation
            node_id = node.id
            count = aggregated_node_counts.get(node_id, 0)

            # Skip nodes with no features (except root)
            if count == 0 and node.stage > 0:
                continue

            # Create node entry (no more aggregation - each node is unique)
            node_dict = {
                "id": node_id,
                "name": self._get_node_display_name(node),
                "stage": node.stage,
                "feature_count": count,
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

    def _count_unique_features_per_aggregated_node(
        self, classified_df: pl.DataFrame, threshold_structure: ThresholdStructure
    ) -> Dict[str, int]:
        """Count unique features per node - all nodes that appear in classification"""
        from .data_constants import COL_FEATURE_ID

        aggregated_counts = {}

        # Get maximum stage
        max_stage = max(node.stage for node in threshold_structure.nodes)

        # Count unique features at each stage - include ALL nodes that appear
        for stage in range(max_stage + 1):
            stage_col = f"node_at_stage_{stage}"

            if stage_col in classified_df.columns:
                # Count all nodes at this stage
                stage_data = (
                    classified_df.filter(pl.col(stage_col).is_not_null())
                    .with_columns([pl.col(stage_col).alias("actual_node_id")])
                    .group_by("actual_node_id")
                    .agg(pl.col(COL_FEATURE_ID).n_unique().alias("unique_count"))
                    .to_dicts()
                )

                for row in stage_data:
                    actual_id = row["actual_node_id"]
                    if actual_id and actual_id not in aggregated_counts:
                        aggregated_counts[actual_id] = row["unique_count"]

        return aggregated_counts

    def _collect_feature_ids_per_node(
        self, classified_df: pl.DataFrame, threshold_structure: ThresholdStructure
    ) -> Dict[str, List[int]]:
        """Collect feature IDs for each node at all stages"""
        from .data_constants import COL_FEATURE_ID

        feature_ids_by_node = {}

        # Get maximum stage
        max_stage = max(node.stage for node in threshold_structure.nodes)

        # Collect feature IDs at each stage
        for stage in range(max_stage + 1):
            stage_col = f"node_at_stage_{stage}"

            if stage_col in classified_df.columns:
                # Group by node and collect feature IDs
                stage_data = (
                    classified_df.filter(pl.col(stage_col).is_not_null())
                    .with_columns([pl.col(stage_col).alias("actual_node_id")])
                    .group_by("actual_node_id")
                    .agg(pl.col(COL_FEATURE_ID).unique().alias("feature_ids"))
                    .to_dicts()
                )

                for row in stage_data:
                    actual_id = row["actual_node_id"]
                    if actual_id and actual_id not in feature_ids_by_node:
                        # Convert to list of integers
                        feature_ids_by_node[actual_id] = [int(fid) for fid in row["feature_ids"]]

        return feature_ids_by_node

    def _count_aggregated_links(
        self, classified_df: pl.DataFrame, threshold_structure: ThresholdStructure
    ) -> Dict[Tuple[str, str], int]:
        """Count features flowing through aggregated links - only where branching occurs"""
        from .data_constants import COL_FEATURE_ID

        aggregated_link_counts = defaultdict(int)

        # Build node lookup
        nodes_by_id = {node.id: node for node in threshold_structure.nodes}

        # Get maximum stage
        max_stage = max(node.stage for node in threshold_structure.nodes)

        # Count unique features flowing between stages, but only where branching occurs
        for stage in range(max_stage):
            source_col = f"node_at_stage_{stage}"
            target_col = f"node_at_stage_{stage + 1}"

            if (
                source_col in classified_df.columns
                and target_col in classified_df.columns
            ):
                # First, identify which source nodes actually branch (have multiple children)
                branching_sources = (
                    classified_df.filter(
                        pl.col(source_col).is_not_null()
                        & pl.col(target_col).is_not_null()
                    )
                    .group_by(pl.col(source_col))
                    .agg(pl.col(target_col).n_unique().alias("children_count"))
                    .filter(pl.col("children_count") > 1)
                    .select(pl.col(source_col))
                    .to_series()
                    .to_list()
                )

                # Only create links from nodes that actually branch
                if branching_sources:
                    link_data = (
                        classified_df.filter(
                            pl.col(source_col).is_not_null()
                            & pl.col(target_col).is_not_null()
                            & pl.col(source_col).is_in(branching_sources)
                        )
                        .with_columns([
                            pl.col(source_col).alias("actual_source"),
                            pl.col(target_col).alias("actual_target")
                        ])
                        .group_by(["actual_source", "actual_target"])
                        .agg(pl.col(COL_FEATURE_ID).n_unique().alias("unique_count"))
                        .to_dicts()
                    )

                    for row in link_data:
                        source = row["actual_source"]
                        target = row["actual_target"]
                        count = row["unique_count"]
                        if source and target:
                            aggregated_link_counts[(source, target)] = count

        return dict(aggregated_link_counts)

    def _get_node_display_name(self, node: SankeyThreshold) -> str:
        """
        Generate display name for a node using threshold structure information.

        Uses dynamic split rule analysis for flexible, stage-independent display names
        with consolidated legacy fallback patterns.
        """
        # Use actual node ID for display name generation - no aggregation
        display_id = node.id

        # Get dynamic base name from category
        base_name = self._get_dynamic_category_name(node.category)

        # Root node special case
        if display_id == "root":
            return base_name

        # Try to use threshold structure for dynamic display names
        dynamic_name = self._get_dynamic_display_name(node, base_name, display_id)
        if dynamic_name:
            return dynamic_name

        # Consolidated legacy pattern matching (integrated from _get_legacy_display_name)
        parts = display_id.split("_")

        # For FEATURE_SPLITTING nodes, show True/False
        if node.category == CategoryType.FEATURE_SPLITTING:
            if "true" in parts:
                return "True"
            elif "false" in parts:
                return "False"

        # For SEMANTIC_DISTANCE nodes, show only High/Low
        elif node.category == CategoryType.SEMANTIC_DISTANCE:
            if "high" in parts:
                return "High"
            elif "low" in parts:
                return "Low"

        # For SCORE_AGREEMENT nodes, show detailed information without category prefix
        elif node.category == CategoryType.SCORE_AGREEMENT:
            return self._get_detailed_score_display_name(display_id)

        return base_name

    def _get_dynamic_category_name(self, category: CategoryType) -> str:
        """Get category display name, supporting dynamic categories"""
        # Default category names - can be extended
        category_names = {
            CategoryType.ROOT: "All Features",
            CategoryType.FEATURE_SPLITTING: "Feature Splitting",
            CategoryType.SEMANTIC_DISTANCE: "Semantic Distance",
            CategoryType.SCORE_AGREEMENT: "Score Agreement",
        }

        return category_names.get(category, category.value.replace("_", " ").title())

    def _get_dynamic_display_name(
        self, node: SankeyThreshold, base_name: str, display_id: str
    ) -> Optional[str]:
        """
        Generate display name using threshold structure and split rule information.

        Returns None if no dynamic name can be generated.
        """
        if not node.parent_path:
            return None

        # Get parent information
        parent_info = node.parent_path[-1]
        parent_node = self._current_threshold_structure.get_node_by_id(
            parent_info.parent_id
        )

        if not parent_node or not parent_node.split_rule:
            return None

        return self._get_split_rule_display_name(
            node,
            parent_node.split_rule,
            parent_info.branch_index,
            base_name,
            display_id,
        )

    def _get_split_rule_display_name(
        self,
        node: SankeyThreshold,
        split_rule,
        branch_index: int,
        base_name: str,
        display_id: str,
    ) -> str:
        """Generate display name based on the split rule that created this node."""
        import re

        # Range rules: use descriptive range labels
        if split_rule.type == "range":
            # For Feature Splitting and Semantic Distance, remove category prefix
            if node.category in [CategoryType.FEATURE_SPLITTING, CategoryType.SEMANTIC_DISTANCE]:
                if branch_index == 0:
                    return "Low"
                elif branch_index == len(split_rule.thresholds):
                    return "High"
                else:
                    return f"Range {branch_index + 1}"
            else:
                # Other categories keep prefix
                if branch_index == 0:
                    return f"{base_name}: Low"
                elif branch_index == len(split_rule.thresholds):
                    return f"{base_name}: High"
                else:
                    return f"{base_name}: Range {branch_index + 1}"

        # Pattern rules: dynamic score pattern analysis
        elif split_rule.type == "pattern":
            # For score agreement nodes, show detailed information without category prefix
            if node.category == CategoryType.SCORE_AGREEMENT:
                return self._get_detailed_score_display_name(display_id)

            # For non-score-agreement pattern rules, use category prefix
            all_high_match = re.search(r"all_(\d+)_high", display_id)
            if all_high_match:
                return f"{base_name}: All High"

            all_low_match = re.search(r"all_(\d+)_low", display_id)
            if all_low_match:
                return f"{base_name}: All Low"

            k_of_n_match = re.search(r"(\d+)_of_(\d+)_high", display_id)
            if k_of_n_match:
                k = int(k_of_n_match.group(1))
                n = int(k_of_n_match.group(2))
                return f"{base_name}: {k} of {n} High"

            # Fallback to pattern index for unknown patterns
            return f"{base_name}: Pattern {branch_index + 1}"

        # Expression rules: use branch descriptions if available
        elif split_rule.type == "expression":
            if branch_index < len(split_rule.branches):
                branch = split_rule.branches[branch_index]
                if branch.description:
                    # For Feature Splitting and Semantic Distance, remove category prefix from descriptions
                    if node.category in [CategoryType.FEATURE_SPLITTING, CategoryType.SEMANTIC_DISTANCE]:
                        return branch.description
                    return f"{base_name}: {branch.description}"

            # Use default child description
            if (
                hasattr(split_rule, "default_child_id")
                and split_rule.default_child_id == node.id
            ):
                if node.category in [CategoryType.FEATURE_SPLITTING, CategoryType.SEMANTIC_DISTANCE]:
                    return "Default"
                return f"{base_name}: Default"

            if node.category in [CategoryType.FEATURE_SPLITTING, CategoryType.SEMANTIC_DISTANCE]:
                return f"Branch {branch_index + 1}"
            return f"{base_name}: Branch {branch_index + 1}"

        return base_name

    def _get_detailed_score_display_name(self, display_id: str) -> str:
        """
        Generate detailed score display name with specific scoring methods.

        Examples:
        - root_2_of_3_high_fuzz_det → "2 of 3 High (Fuzz, Detection)"
        - root_all_3_high → "All High"
        - root_1_of_3_high_sim → "1 of 3 High (Simulation)"
        """
        import re

        # Handle all_n_high patterns
        all_high_match = re.search(r"all_(\d+)_high", display_id)
        if all_high_match:
            return "All High"

        # Handle all_n_low patterns
        all_low_match = re.search(r"all_(\d+)_low", display_id)
        if all_low_match:
            return "All Low"

        # Handle k_of_n_high with specific scoring methods
        k_of_n_pattern = re.compile(r"(\d+)_of_(\d+)_high(?:_(.+))?")
        match = k_of_n_pattern.search(display_id)
        if match:
            k = int(match.group(1))
            n = int(match.group(2))
            methods_part = match.group(3)  # Could be None

            if methods_part:
                # Extract and format scoring methods
                methods = self._format_scoring_methods(methods_part)
                return f"{k} of {n} High ({methods})"
            else:
                return f"{k} of {n} High"

        # Handle k_of_n_low patterns (if they exist)
        k_of_n_low_pattern = re.compile(r"(\d+)_of_(\d+)_low(?:_(.+))?")
        match = k_of_n_low_pattern.search(display_id)
        if match:
            k = int(match.group(1))
            n = int(match.group(2))
            methods_part = match.group(3)

            if methods_part:
                methods = self._format_scoring_methods(methods_part)
                return f"{k} of {n} Low ({methods})"
            else:
                return f"{k} of {n} Low"

        # Fallback to basic display name
        return "Score Agreement"

    def _format_scoring_methods(self, methods_part: str) -> str:
        """
        Format scoring method abbreviations into readable names.

        Examples:
        - "fuzz_det" → "Fuzz, Detection"
        - "sim" → "Simulation"
        - "fuzz_sim_det" → "Fuzz, Simulation, Detection"
        """
        # Define method name mappings
        method_names = {
            "fuzz": "Fuzz",
            "sim": "Simulation",
            "simulation": "Simulation",
            "det": "Detection",
            "detection": "Detection",
            "embed": "Embedding",
            "embedding": "Embedding",
        }

        # Split by underscore and map to full names
        methods = methods_part.split("_")
        formatted_methods = []

        for method in methods:
            if method.lower() in method_names:
                formatted_methods.append(method_names[method.lower()])
            else:
                # Capitalize unknown methods
                formatted_methods.append(method.capitalize())

        return ", ".join(formatted_methods)

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
        Filter features to only include those that belong to a specific node in the v2 threshold system.

        This method:
        1. Classifies all features using the threshold structure
        2. Filters to only features that are assigned to the specified node
        3. Returns the original feature data for those features

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

        # Classify all features using the threshold structure
        classified_df = self.classify_features(df, threshold_structure)

        # Find which features belong to this node by checking different stage columns
        target_stage = target_node.stage
        stage_column = f"node_at_stage_{target_stage}"

        # Filter features that are assigned to this node at the target stage
        if stage_column in classified_df.columns:
            # Get feature IDs that belong to this node
            matching_features = (
                classified_df.filter(pl.col(stage_column) == node_id)
                .select(COL_FEATURE_ID)
                .to_series()
                .to_list()
            )

            if not matching_features:
                logger.debug(
                    f"No features found for node {node_id} at stage {target_stage}"
                )
                return df.filter(pl.lit(False))  # Return empty DataFrame

            # Filter original DataFrame to only include matching features
            filtered_df = df.filter(pl.col(COL_FEATURE_ID).is_in(matching_features))

            logger.debug(f"Filtered to {len(filtered_df)} features for node {node_id}")
            return filtered_df
        else:
            logger.warning(
                f"Stage column '{stage_column}' not found in classified data"
            )
            return df.filter(pl.lit(False))  # Return empty DataFrame
