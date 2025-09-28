"""
Migration utilities for converting between old and new threshold systems.

This module provides functions to:
- Convert old ThresholdTree to new ThresholdStructure
- Convert new ThresholdStructure to old ThresholdTree (for backward compatibility)
- Detect format versions
- Handle gradual migration
"""

import logging
import json
from typing import Dict, List, Any, Optional, Union

from ..models.common import ThresholdTree, ThresholdNode
from ..models.threshold_v2 import (
    ThresholdStructure,
    SankeyThreshold,
    CategoryType,
    RangeSplitRule,
    PatternSplitRule,
    PatternCondition,
    Pattern,
    ParentPathInfo,
    ParentSplitRuleInfo,
    RangeInfo,
    create_default_v2_structure
)

logger = logging.getLogger(__name__)


class ThresholdMigrator:
    """Main migration class for threshold system conversion"""

    def migrate_to_v2(
        self,
        old_tree: Union[ThresholdTree, Dict[str, Any]]
    ) -> ThresholdStructure:
        """
        Convert old ThresholdTree to new ThresholdStructure.

        Args:
            old_tree: Old format ThresholdTree or dict representation

        Returns:
            New format ThresholdStructure
        """
        if isinstance(old_tree, dict):
            # Convert dict to ThresholdTree object
            old_tree = ThresholdTree(**old_tree)

        # Build nodes list by traversing the tree
        nodes = []
        self._convert_node_recursive(
            old_tree.root,
            nodes,
            stage=0,
            parent_path=[]
        )

        # Collect all metrics
        metrics = set()
        for node in nodes:
            if node.split_rule:
                if isinstance(node.split_rule, RangeSplitRule):
                    metrics.add(node.split_rule.metric)
                elif isinstance(node.split_rule, PatternSplitRule):
                    metrics.update(node.split_rule.conditions.keys())

        return ThresholdStructure(
            nodes=nodes,
            metrics=list(metrics),
            version=2
        )

    def _convert_node_recursive(
        self,
        old_node: ThresholdNode,
        nodes: List[SankeyThreshold],
        stage: int,
        parent_path: List[ParentPathInfo]
    ) -> SankeyThreshold:
        """
        Recursively convert old node to new format.

        Returns the converted node and adds it to nodes list.
        """
        # Determine category based on stage and node ID
        category = self._determine_category(old_node.id, stage)

        # Convert split rule if present
        split_rule = None
        children_ids = []

        if old_node.split and old_node.split.get('children'):
            # Extract child IDs first
            children_ids = [
                child.id if isinstance(child, ThresholdNode) else child['id']
                for child in old_node.split['children']
            ]

            # Convert split rule based on metric type
            if old_node.metric == "score_combined":
                # Convert to PatternSplitRule for score agreement
                split_rule = self._create_pattern_split_for_scores(
                    old_node.split['thresholds'],
                    children_ids
                )
            else:
                # Convert to RangeSplitRule for single metric
                split_rule = RangeSplitRule(
                    type="range",
                    metric=old_node.metric or "unknown",
                    thresholds=old_node.split['thresholds']
                )

        # Create new node
        new_node = SankeyThreshold(
            id=old_node.id,
            stage=stage,
            category=category,
            parent_path=parent_path,
            split_rule=split_rule,
            children_ids=children_ids
        )

        # Add to nodes list
        nodes.append(new_node)

        # Recursively process children
        if old_node.split and old_node.split.get('children'):
            for i, old_child in enumerate(old_node.split['children']):
                # Handle both ThresholdNode objects and dicts
                if isinstance(old_child, dict):
                    old_child = ThresholdNode(**old_child)

                # Build parent path info for child
                if split_rule:
                    if isinstance(split_rule, RangeSplitRule):
                        child_parent_info = ParentPathInfo(
                            parent_id=new_node.id,
                            parent_split_rule=ParentSplitRuleInfo(
                                type='range',
                                range_info=RangeInfo(
                                    metric=split_rule.metric,
                                    thresholds=split_rule.thresholds,
                                    selected_range=i
                                )
                            ),
                            branch_index=i
                        )
                    elif isinstance(split_rule, PatternSplitRule):
                        child_parent_info = ParentPathInfo(
                            parent_id=new_node.id,
                            parent_split_rule=ParentSplitRuleInfo(
                                type='pattern'
                                # Pattern info will be filled during classification
                            ),
                            branch_index=i
                        )
                    else:
                        child_parent_info = ParentPathInfo(
                            parent_id=new_node.id,
                            parent_split_rule=ParentSplitRuleInfo(type='range'),
                            branch_index=i
                        )

                    child_parent_path = parent_path + [child_parent_info]
                else:
                    child_parent_path = parent_path

                # Recursively convert child
                self._convert_node_recursive(
                    old_child,
                    nodes,
                    stage + 1,
                    child_parent_path
                )

        return new_node

    def _determine_category(self, node_id: str, stage: int) -> CategoryType:
        """Determine category type from node ID and stage"""
        if stage == 0 or node_id == "root":
            return CategoryType.ROOT
        elif "split_" in node_id and stage == 1:
            return CategoryType.FEATURE_SPLITTING
        elif "semdist" in node_id and stage == 2:
            return CategoryType.SEMANTIC_DISTANCE
        elif "agree" in node_id and stage == 3:
            return CategoryType.SCORE_AGREEMENT
        else:
            # Default based on stage
            if stage == 1:
                return CategoryType.FEATURE_SPLITTING
            elif stage == 2:
                return CategoryType.SEMANTIC_DISTANCE
            elif stage == 3:
                return CategoryType.SCORE_AGREEMENT
            else:
                return CategoryType.ROOT

    def _create_pattern_split_for_scores(
        self,
        thresholds: List[float],
        children_ids: List[str]
    ) -> PatternSplitRule:
        """
        Create PatternSplitRule for score agreement nodes.

        Assumes thresholds are [fuzz, detection, simulation].
        Children are expected to be [all3low, 1of3high, 2of3high, all3high].
        """
        if len(thresholds) < 3:
            # Pad with defaults if needed
            thresholds = thresholds + [0.5] * (3 - len(thresholds))

        fuzz_threshold = thresholds[0]
        detection_threshold = thresholds[1] if len(thresholds) > 1 else 0.5
        simulation_threshold = thresholds[2] if len(thresholds) > 2 else 0.5

        # Define conditions
        conditions = {
            "score_fuzz": PatternCondition(threshold=fuzz_threshold),
            "score_detection": PatternCondition(threshold=detection_threshold),
            "score_simulation": PatternCondition(threshold=simulation_threshold)
        }

        # Define patterns for score agreement
        patterns = []

        # Map child IDs to expected patterns
        for child_id in children_ids:
            if "all3low" in child_id:
                patterns.append(Pattern(
                    match={
                        "score_fuzz": "low",
                        "score_detection": "low",
                        "score_simulation": "low"
                    },
                    child_id=child_id,
                    description="All 3 scores low"
                ))
            elif "all3high" in child_id:
                patterns.append(Pattern(
                    match={
                        "score_fuzz": "high",
                        "score_detection": "high",
                        "score_simulation": "high"
                    },
                    child_id=child_id,
                    description="All 3 scores high"
                ))
            elif "2of3high" in child_id:
                # Add all 2-of-3 patterns
                patterns.extend([
                    Pattern(
                        match={"score_fuzz": "high", "score_detection": "high", "score_simulation": "low"},
                        child_id=child_id,
                        description="2 of 3 high (fuzz & detection)"
                    ),
                    Pattern(
                        match={"score_fuzz": "high", "score_detection": "low", "score_simulation": "high"},
                        child_id=child_id,
                        description="2 of 3 high (fuzz & simulation)"
                    ),
                    Pattern(
                        match={"score_fuzz": "low", "score_detection": "high", "score_simulation": "high"},
                        child_id=child_id,
                        description="2 of 3 high (detection & simulation)"
                    )
                ])
            elif "1of3high" in child_id:
                # Add all 1-of-3 patterns
                patterns.extend([
                    Pattern(
                        match={"score_fuzz": "high", "score_detection": "low", "score_simulation": "low"},
                        child_id=child_id,
                        description="1 of 3 high (fuzz)"
                    ),
                    Pattern(
                        match={"score_fuzz": "low", "score_detection": "high", "score_simulation": "low"},
                        child_id=child_id,
                        description="1 of 3 high (detection)"
                    ),
                    Pattern(
                        match={"score_fuzz": "low", "score_detection": "low", "score_simulation": "high"},
                        child_id=child_id,
                        description="1 of 3 high (simulation)"
                    )
                ])

        # Use first child as default if no patterns match
        default_child_id = children_ids[0] if children_ids else None

        return PatternSplitRule(
            type="pattern",
            conditions=conditions,
            patterns=patterns if patterns else [
                Pattern(
                    match={},
                    child_id=default_child_id or "unknown",
                    description="Default pattern"
                )
            ],
            default_child_id=default_child_id
        )

    def migrate_to_v1(
        self,
        new_structure: ThresholdStructure
    ) -> ThresholdTree:
        """
        Convert new ThresholdStructure back to old ThresholdTree format.

        This is for backward compatibility during migration period.
        Only works for structures that match the old 3-stage format.

        Args:
            new_structure: New format ThresholdStructure

        Returns:
            Old format ThresholdTree
        """
        # Find root node
        root_node = new_structure.get_root()
        if not root_node:
            raise ValueError("No root node found in structure")

        # Convert root node recursively
        old_root = self._convert_to_old_node(root_node, new_structure)

        # Extract metrics
        metrics = new_structure.metrics

        return ThresholdTree(
            root=old_root,
            metrics=metrics
        )

    def _convert_to_old_node(
        self,
        new_node: SankeyThreshold,
        structure: ThresholdStructure
    ) -> ThresholdNode:
        """Convert new node back to old format"""
        # Extract metric and thresholds
        metric = None
        thresholds = []
        children = []

        if new_node.split_rule:
            if isinstance(new_node.split_rule, RangeSplitRule):
                metric = new_node.split_rule.metric
                thresholds = new_node.split_rule.thresholds
            elif isinstance(new_node.split_rule, PatternSplitRule):
                # Convert pattern rule back to score_combined
                metric = "score_combined"
                # Extract thresholds from conditions
                conditions = new_node.split_rule.conditions
                thresholds = [
                    conditions.get("score_fuzz", PatternCondition()).threshold or 0.5,
                    conditions.get("score_detection", PatternCondition()).threshold or 0.5,
                    conditions.get("score_simulation", PatternCondition()).threshold or 0.5
                ]

            # Convert children
            for child_id in new_node.children_ids:
                child_node = structure.get_node_by_id(child_id)
                if child_node:
                    children.append(self._convert_to_old_node(child_node, structure))

        # Build old node
        old_node = {
            'id': new_node.id,
            'metric': metric
        }

        if children:
            old_node['split'] = {
                'thresholds': thresholds,
                'children': children
            }

        return ThresholdNode(**old_node)


class FormatDetector:
    """Detect threshold format version"""

    @staticmethod
    def detect_format(data: Dict[str, Any]) -> int:
        """
        Detect whether data is v1 (old) or v2 (new) format.

        Returns:
            1 for old format (ThresholdTree)
            2 for new format (ThresholdStructure)
        """
        # Check for v2 specific fields
        if 'nodes' in data and 'version' in data:
            return 2

        # Check for v1 specific fields
        if 'root' in data and isinstance(data.get('root'), dict):
            root = data['root']
            if 'split' in root and 'metric' in root:
                return 1

        # Default to v1 for unknown formats
        logger.warning("Unknown threshold format, defaulting to v1")
        return 1

    @staticmethod
    def is_v2_request(request_data: Dict[str, Any]) -> bool:
        """
        Check if API request contains v2 threshold data.

        Looks for:
        - threshold_structure field (v2)
        - thresholdTree field (v1)
        - version parameter
        """
        # Explicit version parameter
        if request_data.get('version') == 2:
            return True
        if request_data.get('version') == 1:
            return False

        # Check for v2 field names
        if 'threshold_structure' in request_data:
            return True

        # Check structure of threshold data
        if 'thresholdTree' in request_data:
            tree_data = request_data['thresholdTree']
            if isinstance(tree_data, dict):
                return FormatDetector.detect_format(tree_data) == 2

        return False


def migrate_if_needed(
    threshold_data: Union[Dict, ThresholdTree, ThresholdStructure],
    target_version: int = 2
) -> Union[ThresholdTree, ThresholdStructure]:
    """
    Migrate threshold data to target version if needed.

    Args:
        threshold_data: Input threshold data (any format)
        target_version: Target version (1 or 2)

    Returns:
        Threshold data in target format
    """
    migrator = ThresholdMigrator()

    # Detect current format
    if isinstance(threshold_data, ThresholdStructure):
        current_version = 2
    elif isinstance(threshold_data, ThresholdTree):
        current_version = 1
    elif isinstance(threshold_data, dict):
        current_version = FormatDetector.detect_format(threshold_data)
    else:
        raise ValueError(f"Unknown threshold data type: {type(threshold_data)}")

    # Migrate if needed
    if current_version == target_version:
        # Already in target format
        if isinstance(threshold_data, dict):
            if target_version == 2:
                return ThresholdStructure.from_dict(threshold_data)
            else:
                return ThresholdTree(**threshold_data)
        return threshold_data

    if target_version == 2:
        # Migrate to v2
        if isinstance(threshold_data, dict):
            threshold_data = ThresholdTree(**threshold_data)
        return migrator.migrate_to_v2(threshold_data)
    else:
        # Migrate to v1
        if isinstance(threshold_data, dict):
            threshold_data = ThresholdStructure.from_dict(threshold_data)
        return migrator.migrate_to_v1(threshold_data)