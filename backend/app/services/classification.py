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
    ParentPathInfo
)
from .split_evaluators import SplitEvaluator
from .data_constants import COL_FEATURE_ID

logger = logging.getLogger(__name__)


class ClassificationEngine:
    """
    Main classification engine for v2 threshold system.

    This replaces the old fixed-stage classification with a flexible,
    dynamic system that can handle any stage ordering and split rule types.
    """

    def __init__(self, sort_mode: str = 'within_parent'):
        """
        Initialize ClassificationEngine.

        Args:
            sort_mode: Node sorting mode - 'global' or 'within_parent'
                - 'global': Sort all nodes at each stage regardless of parent
                - 'within_parent': Sort nodes within their parent groups
        """
        self.evaluator = SplitEvaluator()
        self.sort_mode = sort_mode

    def classify_features(
        self,
        df: pl.DataFrame,
        threshold_structure: ThresholdStructure
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
            path_info = self._classify_single_feature(
                row_dict,
                root,
                nodes_by_id
            )

            # Store classification info
            feature_classifications.append({
                COL_FEATURE_ID: feature_id,
                'final_node_id': path_info['final_node_id'],
                'classification_path': path_info['path'],
                **path_info['stage_nodes']  # node_at_stage_0, node_at_stage_1, etc.
            })

        # Create classification DataFrame
        classification_df = pl.DataFrame(feature_classifications)

        # Ensure feature_id column has the same type as original DataFrame
        original_feature_id_type = df.schema[COL_FEATURE_ID]
        classification_df = classification_df.with_columns(
            pl.col(COL_FEATURE_ID).cast(original_feature_id_type)
        )

        # Join with original DataFrame
        result_df = df.join(
            classification_df,
            on=COL_FEATURE_ID,
            how='left'
        )

        # Log classification summary
        self._log_classification_summary(result_df)

        return result_df

    def _classify_single_feature(
        self,
        feature_row: Dict[str, Any],
        root: SankeyThreshold,
        nodes_by_id: Dict[str, SankeyThreshold]
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
        stage_nodes = {f'node_at_stage_{root.stage}': root.id}
        parent_path = []

        # Traverse until we reach a leaf node
        while current_node.split_rule is not None:
            # Evaluate split rule
            evaluation = self.evaluator.evaluate(
                feature_row,
                current_node.split_rule,
                current_node.children_ids
            )

            # Build parent path info
            parent_info = ParentPathInfo(
                parent_id=current_node.id,
                parent_split_rule=evaluation.split_info,
                branch_index=evaluation.branch_index,
                triggering_values=evaluation.triggering_values
            )
            parent_path.append(parent_info)

            # Move to selected child
            child_id = evaluation.child_id
            if child_id not in nodes_by_id:
                logger.error(f"Child node '{child_id}' not found in structure")
                break

            current_node = nodes_by_id[child_id]
            path.append(current_node.id)
            stage_nodes[f'node_at_stage_{current_node.stage}'] = current_node.id

        return {
            'final_node_id': current_node.id,
            'path': path,
            'stage_nodes': stage_nodes,
            'parent_path': parent_path
        }

    def build_sankey_data(
        self,
        classified_df: pl.DataFrame,
        threshold_structure: ThresholdStructure
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Build Sankey diagram nodes and links from classified data.

        This replaces the old build_sankey_nodes_and_links function
        with support for dynamic structures and aggregation.

        Returns:
            Tuple of (nodes, links) for Sankey diagram
        """
        # Step 1: Count UNIQUE features per aggregated node (fixes 4x multiplication bug)
        aggregated_node_counts = self._count_unique_features_per_aggregated_node(classified_df, threshold_structure)
        aggregated_link_counts = self._count_aggregated_links(classified_df, threshold_structure)

        # Step 2: Build aggregated Sankey nodes
        nodes = []
        aggregated_nodes_by_id = {}

        for node in threshold_structure.nodes:
            aggregated_id = self._aggregate_node_id(node.id)
            count = aggregated_node_counts.get(aggregated_id, 0)

            # Skip nodes with no features (except root)
            if count == 0 and node.stage > 0:
                continue

            # Only process each aggregated node once
            if aggregated_id not in aggregated_nodes_by_id:
                # Create new aggregated node
                aggregated_nodes_by_id[aggregated_id] = {
                    'id': aggregated_id,
                    'name': self._get_node_display_name(node),
                    'stage': node.stage,
                    'feature_count': count,
                    'category': node.category.value
                }

        nodes = list(aggregated_nodes_by_id.values())

        # Step 4: Build aggregated links
        links = []
        for (source_id, target_id), count in aggregated_link_counts.items():
            if count > 0:
                links.append({
                    'source': source_id,
                    'target': target_id,
                    'value': count
                })

        # Sort nodes using custom ordering logic for each metric type
        nodes = sorted(nodes, key=lambda n: self._get_node_sort_key(n, nodes))

        # Sort links to match node order to prevent crossing
        sorted_links = self._sort_links_to_match_nodes(links, nodes)

        return nodes, sorted_links

    def _get_node_sort_key(self, node: Dict[str, Any], all_nodes: List[Dict[str, Any]]) -> Tuple[int, int, float, str]:
        """
        Get sort key for custom ordering based on category type and metric values.

        Returns a tuple for proper ordering:
        - Global mode: (stage, sort_priority, fallback_id)
        - Within-parent mode: (stage, parent_position, sort_priority, fallback_id)

        Ordering rules:
        - Feature Splitting: False (0) → True (1)
        - Semantic Distance: Low (0) → High (1)
        - Score Agreement: By ratio of high scores (descending)

        Args:
            node: Node dictionary with 'stage', 'id', and 'category' fields
            all_nodes: List of all nodes to determine parent positions

        Returns:
            Tuple for sorting based on sort_mode
        """
        import re

        stage = node['stage']
        node_id = node['id']
        category = node['category']

        # Get parent position for within-parent sorting
        if self.sort_mode == 'within_parent':
            parent_id = self._extract_parent_id(node_id)
            parent_position = self._get_parent_position(parent_id, all_nodes)
        else:
            parent_position = 0

        # Calculate sort priority based on category and content
        sort_priority = self._get_category_sort_priority(node_id, category)

        # Return sort key based on mode
        if self.sort_mode == 'within_parent':
            return (stage, parent_position, sort_priority, node_id)
        else:  # global mode
            return (stage, 0, sort_priority, node_id)

    def _extract_parent_id(self, node_id: str) -> str:
        """
        Extract parent node ID from a node ID for within-parent sorting.

        Examples:
        - 'split_true_semdist_high' → 'split_true'
        - 'split_true_semdist_high_all_3_high' → 'split_true_semdist_high'
        - 'root' → ''

        Args:
            node_id: The node ID to extract parent from

        Returns:
            Parent node ID or empty string for root nodes
        """
        import re

        if node_id == 'root':
            return ""

        # Score agreement patterns: Check for specific score agreement patterns
        # These patterns are more specific than semantic distance
        score_patterns = [
            r'all_\d+_high',
            r'all_\d+_low',
            r'\d+_of_\d+_high',
            r'\d+_of_\d+_high_[a-z_]+',  # e.g., 2_of_3_high_fuzz_sim
            r'1_of_3_high_[a-z]+',  # e.g., 1_of_3_high_fuzz
        ]

        for pattern in score_patterns:
            match = re.search(pattern, node_id)
            if match:
                # Return everything before the score agreement pattern
                parent = node_id[:match.start()].rstrip('_')
                return parent if parent else ""

        # Semantic distance patterns: split_X_semdist_Y → split_X
        if 'semdist_' in node_id:
            # Find the position of 'semdist' and remove it and everything after
            parts = node_id.split('_')
            result = []
            for i, part in enumerate(parts):
                if part == 'semdist':
                    break
                result.append(part)
            if result:
                return '_'.join(result)

        # Feature splitting patterns: split_X → root
        if node_id in ['split_true', 'split_false']:
            return ""  # Parent is root

        # Default: This shouldn't happen with our current node structure
        return ""

    def _get_parent_position(self, parent_id: str, all_nodes: List[Dict[str, Any]]) -> int:
        """
        Get the position of a parent node in the all_nodes list.

        This ensures children are sorted by their parent's position in the visualization,
        not alphabetically by parent ID.

        Args:
            parent_id: The parent node ID to find
            all_nodes: List of all nodes

        Returns:
            Position of parent node, or 999999 if not found
        """
        if not parent_id:
            return 0  # Root or no parent

        for i, node in enumerate(all_nodes):
            if node['id'] == parent_id:
                return i

        # Parent not found - put at end
        return 999999

    def _get_category_sort_priority(self, node_id: str, category: str) -> float:
        """
        Get sort priority for a node based on its category and content.

        Args:
            node_id: The node ID
            category: The category type

        Returns:
            Sort priority (lower values sort first)
        """
        import re

        # ROOT: Always first
        if category == 'root':
            return 0.0

        # FEATURE_SPLITTING: False (0) → True (1)
        elif category == 'feature_splitting':
            if 'false' in node_id.lower():
                return 0.0
            elif 'true' in node_id.lower():
                return 1.0
            else:
                return 999.0  # Unknown pattern

        # SEMANTIC_DISTANCE: Low (0) → High (1)
        elif category == 'semantic_distance':
            if 'low' in node_id.lower():
                return 0.0
            elif 'high' in node_id.lower():
                return 1.0
            else:
                return 999.0  # Unknown pattern

        # SCORE_AGREEMENT: Sort by ratio of high scores (descending)
        elif category == 'score_agreement':
            # Parse patterns dynamically:
            # - all_n_high: ratio = 1.0 (100% high)
            # - k_of_n_high: ratio = k/n
            # - all_n_low: ratio = 0.0 (0% high)

            # Check for all_n_high pattern
            all_high_match = re.search(r'all_(\d+)_high', node_id)
            if all_high_match:
                # All scores are high: ratio = 1.0, sort_priority = 0 (first)
                return 0.0

            # Check for k_of_n_high pattern
            k_of_n_match = re.search(r'(\d+)_of_(\d+)_high', node_id)
            if k_of_n_match:
                k = int(k_of_n_match.group(1))
                n = int(k_of_n_match.group(2))
                # Higher ratio = lower sort_priority (appears first)
                # We negate the ratio so higher ratios come first
                ratio = k / n if n > 0 else 0
                sort_priority = 1.0 - ratio  # Convert so lower value = higher ratio
                return sort_priority

            # Check for all_n_low pattern
            all_low_match = re.search(r'all_(\d+)_low', node_id)
            if all_low_match:
                # All scores are low: ratio = 0.0, sort_priority = 999 (last)
                return 999.0

            # Unknown score agreement pattern
            return 500.0

        # Unknown category - use neutral priority
        else:
            return 0.0

    def _sort_links_to_match_nodes(self, links: List[Dict[str, Any]], nodes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Sort links to match node visual order and prevent crossing.

        Links should be ordered so that:
        1. Links are grouped by source node
        2. Sources are ordered by their position in the sorted nodes array
        3. Within each source group, links are ordered by target position

        Args:
            links: List of link dictionaries with source, target, value
            nodes: List of sorted node dictionaries

        Returns:
            Sorted list of links
        """
        # Create a position map for quick lookup
        node_positions = {node['id']: idx for idx, node in enumerate(nodes)}

        # Sort links by source position first, then target position
        sorted_links = sorted(links, key=lambda link: (
            node_positions.get(link['source'], 999999),  # Source position
            node_positions.get(link['target'], 999999)   # Target position
        ))

        return sorted_links

    def _count_features_per_node(
        self,
        classified_df: pl.DataFrame,
        threshold_structure: ThresholdStructure
    ) -> Dict[str, int]:
        """Count how many features reach each node"""
        node_counts = defaultdict(int)

        # Get maximum stage
        max_stage = max(node.stage for node in threshold_structure.nodes)

        # Count features at each stage
        for stage in range(max_stage + 1):
            stage_col = f'node_at_stage_{stage}'

            if stage_col in classified_df.columns:
                counts = (
                    classified_df
                    .group_by(stage_col)
                    .count()
                    .to_dicts()
                )

                for row in counts:
                    node_id = row[stage_col]
                    if node_id is not None:
                        node_counts[node_id] = row['count']

        return dict(node_counts)

    def _count_unique_features_per_aggregated_node(
        self,
        classified_df: pl.DataFrame,
        threshold_structure: ThresholdStructure
    ) -> Dict[str, int]:
        """Count unique features per aggregated node (fixes 4x multiplication bug)"""
        from .data_constants import COL_FEATURE_ID

        aggregated_counts = {}

        # Get maximum stage
        max_stage = max(node.stage for node in threshold_structure.nodes)

        # Count unique features at each stage
        for stage in range(max_stage + 1):
            stage_col = f'node_at_stage_{stage}'

            if stage_col in classified_df.columns:
                # Group by aggregated node ID and count unique feature_ids
                stage_data = (
                    classified_df
                    .filter(pl.col(stage_col).is_not_null())
                    .with_columns([
                        pl.col(stage_col).map_elements(
                            lambda x: self._aggregate_node_id(x) if x is not None else None,
                            return_dtype=pl.Utf8
                        ).alias('aggregated_node_id')
                    ])
                    .group_by('aggregated_node_id')
                    .agg(pl.col(COL_FEATURE_ID).n_unique().alias('unique_count'))
                    .to_dicts()
                )

                for row in stage_data:
                    aggregated_id = row['aggregated_node_id']
                    if aggregated_id and aggregated_id not in aggregated_counts:
                        aggregated_counts[aggregated_id] = row['unique_count']

        return aggregated_counts

    def _count_aggregated_links(
        self,
        classified_df: pl.DataFrame,
        threshold_structure: ThresholdStructure
    ) -> Dict[Tuple[str, str], int]:
        """Count features flowing through aggregated links"""
        from .data_constants import COL_FEATURE_ID

        aggregated_link_counts = defaultdict(int)

        # Get maximum stage
        max_stage = max(node.stage for node in threshold_structure.nodes)

        # Count unique features flowing between consecutive aggregated stages
        for stage in range(max_stage):
            source_col = f'node_at_stage_{stage}'
            target_col = f'node_at_stage_{stage + 1}'

            if source_col in classified_df.columns and target_col in classified_df.columns:
                # Group by aggregated source-target pairs and count unique feature_ids
                link_data = (
                    classified_df
                    .filter(
                        pl.col(source_col).is_not_null() &
                        pl.col(target_col).is_not_null()
                    )
                    .with_columns([
                        pl.col(source_col).map_elements(
                            lambda x: self._aggregate_node_id(x) if x is not None else None,
                            return_dtype=pl.Utf8
                        ).alias('aggregated_source'),
                        pl.col(target_col).map_elements(
                            lambda x: self._aggregate_node_id(x) if x is not None else None,
                            return_dtype=pl.Utf8
                        ).alias('aggregated_target')
                    ])
                    .group_by(['aggregated_source', 'aggregated_target'])
                    .agg(pl.col(COL_FEATURE_ID).n_unique().alias('unique_count'))
                    .to_dicts()
                )

                for row in link_data:
                    source = row['aggregated_source']
                    target = row['aggregated_target']
                    count = row['unique_count']
                    if source and target:
                        aggregated_link_counts[(source, target)] = count

        return dict(aggregated_link_counts)

    def _count_links(
        self,
        classified_df: pl.DataFrame,
        threshold_structure: ThresholdStructure
    ) -> Dict[Tuple[str, str], int]:
        """Count features flowing through each link"""
        link_counts = defaultdict(int)

        # Get nodes by stage for efficient processing
        nodes_by_stage = defaultdict(list)
        for node in threshold_structure.nodes:
            nodes_by_stage[node.stage].append(node)

        # Count links between consecutive stages
        max_stage = max(node.stage for node in threshold_structure.nodes)

        for stage in range(max_stage):
            source_col = f'node_at_stage_{stage}'
            target_col = f'node_at_stage_{stage + 1}'

            if source_col in classified_df.columns and target_col in classified_df.columns:
                # Group by source and target to count flows
                link_data = (
                    classified_df
                    .filter(
                        pl.col(source_col).is_not_null() &
                        pl.col(target_col).is_not_null()
                    )
                    .group_by([source_col, target_col])
                    .count()
                    .to_dicts()
                )

                for row in link_data:
                    source = row[source_col]
                    target = row[target_col]
                    count = row['count']
                    link_counts[(source, target)] = count

        return dict(link_counts)

    def _aggregate_node_id(self, node_id: str) -> str:
        """
        Map detailed node IDs to aggregated display groups.

        This implements the aggregation layer that consolidates detailed
        score agreement categories into broader groups for visualization.

        Examples:
        - split_true_semdist_high_2_of_3_high_fuzz_det → split_true_semdist_high_2_of_3_high
        - split_true_semdist_high_1_of_3_high_sim → split_true_semdist_high_1_of_3_high
        - root_2_of_3_high_fuzz_det_split_true → root_2_of_3_high_split_true

        Args:
            node_id: Original detailed node ID

        Returns:
            Aggregated node ID for display
        """
        import re

        # Handle 2_of_3_high detailed patterns - aggregate to generic 2_of_3_high
        if any(pattern in node_id for pattern in ['2_of_3_high_fuzz_det', '2_of_3_high_fuzz_sim', '2_of_3_high_sim_det']):
            # Replace specific 2-of-3 patterns with generic
            return re.sub(r'2_of_3_high_\w+(_\w+)?', '2_of_3_high', node_id)

        # Handle 1_of_3_high detailed patterns - aggregate to generic 1_of_3_high
        if any(pattern in node_id for pattern in ['1_of_3_high_fuzz', '1_of_3_high_sim', '1_of_3_high_det']):
            # Replace specific 1-of-3 patterns with generic
            return re.sub(r'1_of_3_high_\w+', '1_of_3_high', node_id)

        # Keep all_3_high, all_3_low unchanged - they're already aggregated
        return node_id

    def _get_node_display_name(self, node: SankeyThreshold) -> str:
        """Generate display name for a node without parent classification"""
        # Use aggregated node ID for display name generation
        display_id = self._aggregate_node_id(node.id)

        # Map category types to readable names
        category_names = {
            CategoryType.ROOT: "All Features",
            CategoryType.FEATURE_SPLITTING: "Feature Splitting",
            CategoryType.SEMANTIC_DISTANCE: "Semantic Distance",
            CategoryType.SCORE_AGREEMENT: "Score Agreement"
        }

        base_name = category_names.get(node.category, node.category.value)

        # Add node-specific suffix based on aggregated ID
        if display_id == 'root':
            return base_name

        # Extract meaningful suffix from aggregated ID, but only show current node's classification
        parts = display_id.split('_')

        # For FEATURE_SPLITTING nodes, show True/False
        if node.category == CategoryType.FEATURE_SPLITTING:
            if 'true' in parts:
                return f"{base_name}: True"
            elif 'false' in parts:
                return f"{base_name}: False"

        # For SEMANTIC_DISTANCE nodes, show only High/Low (no parent splitting info)
        elif node.category == CategoryType.SEMANTIC_DISTANCE:
            if 'high' in parts:
                return f"{base_name}: High"
            elif 'low' in parts:
                return f"{base_name}: Low"

        # For SCORE_AGREEMENT nodes, show only the agreement pattern (no parent info)
        elif node.category == CategoryType.SCORE_AGREEMENT:
            if 'all_3_high' in display_id:
                return f"{base_name}: All High"
            elif 'all_3_low' in display_id:
                return f"{base_name}: All Low"
            elif '2_of_3_high' in display_id:
                return f"{base_name}: 2 of 3 High"
            elif '1_of_3_high' in display_id:
                return f"{base_name}: 1 of 3 High"

        return base_name

    def _log_classification_summary(self, classified_df: pl.DataFrame):
        """Log summary statistics of classification"""
        total_features = len(classified_df)

        # Count features at final nodes
        if 'final_node_id' in classified_df.columns:
            final_counts = (
                classified_df
                .group_by('final_node_id')
                .count()
                .sort('count', descending=True)
                .to_dicts()
            )

            logger.info(f"Classification complete: {total_features} features classified")
            logger.info("Top final nodes:")
            for i, row in enumerate(final_counts[:5]):
                node_id = row['final_node_id']
                count = row['count']
                pct = (count / total_features) * 100
                logger.info(f"  {i+1}. {node_id}: {count} ({pct:.1f}%)")

    def filter_features_for_node(
        self,
        df: pl.DataFrame,
        threshold_structure: ThresholdStructure,
        node_id: str
    ) -> pl.DataFrame:
        """
        Filter features to only include those that belong to a specific node in the v2 threshold system.

        This method:
        1. Classifies all features using the threshold structure
        2. Filters to only features that are assigned to the specified node
        3. Returns the original feature data for those features

        Args:
            df: Original DataFrame with feature data
            threshold_structure: V2 threshold structure
            node_id: Target node ID to filter for

        Returns:
            Filtered DataFrame containing only features belonging to the specified node
        """
        logger.debug(f"Filtering features for node_id: {node_id}")

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
        stage_column = f'node_at_stage_{target_stage}'

        # Filter features that are assigned to this node at the target stage
        if stage_column in classified_df.columns:
            # Get feature IDs that belong to this node
            matching_features = (
                classified_df
                .filter(pl.col(stage_column) == node_id)
                .select(COL_FEATURE_ID)
                .to_series()
                .to_list()
            )

            if not matching_features:
                logger.debug(f"No features found for node {node_id} at stage {target_stage}")
                return df.filter(pl.lit(False))  # Return empty DataFrame

            # Filter original DataFrame to only include matching features
            filtered_df = df.filter(pl.col(COL_FEATURE_ID).is_in(matching_features))

            logger.debug(f"Filtered to {len(filtered_df)} features for node {node_id}")
            return filtered_df
        else:
            logger.warning(f"Stage column '{stage_column}' not found in classified data")
            return df.filter(pl.lit(False))  # Return empty DataFrame