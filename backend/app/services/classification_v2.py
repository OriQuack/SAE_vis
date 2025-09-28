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
from typing import Dict, List, Any, Optional, Tuple, Set
from collections import defaultdict

from ..models.threshold_v2 import (
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

    def __init__(self):
        self.evaluator = SplitEvaluator()

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
        with support for dynamic structures.

        Returns:
            Tuple of (nodes, links) for Sankey diagram
        """
        nodes = []
        links = []

        # Build node lookup
        nodes_by_id = {node.id: node for node in threshold_structure.nodes}

        # Count features at each node
        node_counts = self._count_features_per_node(classified_df, threshold_structure)

        # Build Sankey nodes
        for node in threshold_structure.nodes:
            count = node_counts.get(node.id, 0)

            # Skip nodes with no features
            if count == 0 and node.stage > 0:
                continue

            nodes.append({
                'id': node.id,
                'name': self._get_node_display_name(node),
                'stage': node.stage,
                'feature_count': count,
                'category': node.category.value
            })

        # Build links based on actual flow
        link_counts = self._count_links(classified_df, threshold_structure)

        for (source_id, target_id), count in link_counts.items():
            if count > 0:
                links.append({
                    'source': source_id,
                    'target': target_id,
                    'value': count
                })

        # Sort nodes by stage and position within stage
        nodes = sorted(nodes, key=lambda n: (n['stage'], n['id']))

        return nodes, links

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

    def _get_node_display_name(self, node: SankeyThreshold) -> str:
        """Generate display name for a node"""
        # Map category types to readable names
        category_names = {
            CategoryType.ROOT: "All Features",
            CategoryType.FEATURE_SPLITTING: "Feature Splitting",
            CategoryType.SEMANTIC_DISTANCE: "Semantic Distance",
            CategoryType.SCORE_AGREEMENT: "Score Agreement"
        }

        base_name = category_names.get(node.category, node.category.value)

        # Add node-specific suffix
        if node.id == 'root':
            return base_name

        # Extract meaningful suffix from node ID
        # e.g., "split_true_semdist_high" -> "True, High"
        parts = node.id.split('_')

        if 'true' in parts or 'false' in parts:
            split_val = 'True' if 'true' in parts else 'False'
            base_name = f"{base_name}: {split_val}"

        if 'high' in parts or 'low' in parts:
            dist_val = 'High' if 'high' in parts else 'Low'
            base_name = f"{base_name}, {dist_val}"

        if 'agree' in parts:
            # Extract agreement level
            if 'all3high' in node.id:
                base_name = f"{base_name}: All High"
            elif 'all3low' in node.id:
                base_name = f"{base_name}: All Low"
            elif '2of3high' in node.id:
                base_name = f"{base_name}: 2 of 3 High"
            elif '1of3high' in node.id:
                base_name = f"{base_name}: 1 of 3 High"

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


class ClassificationMigrator:
    """
    Helper class to migrate from old classification to new system.

    Provides compatibility layer for gradual migration.
    """

    def __init__(self):
        self.engine = ClassificationEngine()

    def classify_with_compatibility(
        self,
        df: pl.DataFrame,
        threshold_structure: ThresholdStructure,
        add_legacy_columns: bool = True
    ) -> pl.DataFrame:
        """
        Classify features with backward compatibility columns.

        Adds legacy column names for compatibility with existing code:
        - splitting_category (from node_at_stage_1)
        - semdist_category (from node_at_stage_2)
        - score_agreement (from node_at_stage_3)
        """
        # Perform v2 classification
        classified_df = self.engine.classify_features(df, threshold_structure)

        if add_legacy_columns:
            # Map new columns to legacy names for compatibility
            legacy_mappings = [
                ('node_at_stage_1', 'splitting_category'),
                ('node_at_stage_2', 'semdist_category'),
                ('node_at_stage_3', 'score_agreement')
            ]

            for new_col, legacy_col in legacy_mappings:
                if new_col in classified_df.columns:
                    # Extract meaningful part from node ID for legacy format
                    classified_df = classified_df.with_columns([
                        self._extract_legacy_category(pl.col(new_col)).alias(legacy_col)
                    ])

        return classified_df

    def _extract_legacy_category(self, col):
        """Extract legacy category name from node ID"""
        # This is a Polars expression that extracts the category
        # e.g., "split_true" -> "true", "split_false_semdist_high" -> "high"

        # For now, return the full node ID
        # In production, implement proper extraction logic
        return col