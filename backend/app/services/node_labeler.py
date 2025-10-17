"""
Display name generation for Sankey nodes.

This module handles generating human-readable display names for nodes
based on their category, split rules, and position in the threshold tree.
"""

import re
from typing import Optional

from ..models.threshold import SankeyThreshold, CategoryType, ThresholdStructure


class NodeDisplayNameGenerator:
    """Generates display names for Sankey nodes based on threshold structure."""

    def __init__(self, threshold_structure: ThresholdStructure):
        """
        Initialize the display name generator.

        Args:
            threshold_structure: The threshold tree structure for context
        """
        self.threshold_structure = threshold_structure

    def get_display_name(self, node: SankeyThreshold) -> str:
        """
        Generate display name for a node.

        Uses dynamic split rule analysis for flexible, stage-independent display names
        with consolidated legacy fallback patterns.
        """
        base_name = self._get_category_name(node.category)

        if node.id == "root":
            return base_name

        # Special case for "others" node - handle early
        if node.id == "others" or node.id.endswith("_others"):
            print(f"[DEBUG] Found 'others' node: {node.id}")
            return f"{base_name}: Others"

        # Try dynamic display name from split rules
        dynamic_name = self._get_dynamic_display_name(node, base_name)
        if dynamic_name:
            return dynamic_name

        # Fallback to legacy pattern matching
        return self._get_legacy_display_name(node, base_name)

    def _get_category_name(self, category: CategoryType) -> str:
        """Get category display name, supporting dynamic categories."""
        category_names = {
            CategoryType.ROOT: "All Features",
            CategoryType.FEATURE_SPLITTING: "Feature Splitting",
            CategoryType.SEMANTIC_SIMILARITY: "Semantic Similarity",
        }
        return category_names.get(category, category.value.replace("_", " ").title())

    def _get_dynamic_display_name(self, node: SankeyThreshold, base_name: str) -> Optional[str]:
        """
        Generate display name using threshold structure and split rule information.

        Returns None if no dynamic name can be generated.
        """
        if not node.parent_path:
            return None

        parent_info = node.parent_path[-1]
        parent_node = self.threshold_structure.get_node_by_id(parent_info.parent_id)

        if not parent_node or not parent_node.split_rule:
            return None

        return self._get_split_rule_display_name(
            node, parent_node.split_rule, parent_info.branch_index, base_name
        )

    def _get_legacy_display_name(self, node: SankeyThreshold, base_name: str) -> str:
        """Fallback to legacy pattern matching for display names."""
        parts = node.id.split("_")

        if node.category == CategoryType.FEATURE_SPLITTING:
            if "true" in parts:
                return "True"
            elif "false" in parts:
                return "False"

        elif node.category == CategoryType.SEMANTIC_SIMILARITY:
            if "high" in parts:
                return "High"
            elif "low" in parts:
                return "Low"

        return base_name

    def _get_split_rule_display_name(
        self, node: SankeyThreshold, split_rule, branch_index: int, base_name: str
    ) -> str:
        """Generate display name based on the split rule that created this node."""
        if split_rule.type == "range":
            return self._format_range_display_name(node, split_rule, branch_index, base_name)
        elif split_rule.type == "pattern":
            return self._format_pattern_display_name(node, branch_index, base_name)
        elif split_rule.type == "expression":
            return self._format_expression_display_name(node, split_rule, branch_index, base_name)
        return base_name

    def _format_range_display_name(
        self, node: SankeyThreshold, split_rule, branch_index: int, base_name: str
    ) -> str:
        """Format display name for range-based splits."""
        should_remove_prefix = node.category in [
            CategoryType.FEATURE_SPLITTING, CategoryType.SEMANTIC_SIMILARITY
        ]

        if branch_index == 0:
            label = "Low"
        elif branch_index == len(split_rule.thresholds):
            label = "High"
        else:
            label = f"Range {branch_index + 1}"

        return label if should_remove_prefix else f"{base_name}: {label}"

    def _format_pattern_display_name(
        self, node: SankeyThreshold, branch_index: int, base_name: str
    ) -> str:
        """Format display name for pattern-based splits."""
        # Pattern rules with generic patterns
        all_high_match = re.search(r"all_(\d+)_high", node.id)
        if all_high_match:
            return f"{base_name}: All High"

        all_low_match = re.search(r"all_(\d+)_low", node.id)
        if all_low_match:
            return f"{base_name}: All Low"

        k_of_n_match = re.search(r"(\d+)_of_(\d+)_high", node.id)
        if k_of_n_match:
            k = int(k_of_n_match.group(1))
            n = int(k_of_n_match.group(2))
            return f"{base_name}: {k} of {n} High"

        return f"{base_name}: Pattern {branch_index + 1}"

    def _format_expression_display_name(
        self, node: SankeyThreshold, split_rule, branch_index: int, base_name: str
    ) -> str:
        """Format display name for expression-based splits."""
        # Remove category prefix for all threshold group nodes (from threshold-group-converter)
        should_remove_prefix = True

        # FIRST: Check if this node has a branch with a description (prioritize explicit descriptions)
        if 0 <= branch_index < len(split_rule.branches):
            branch = split_rule.branches[branch_index]
            if branch.description:
                # Check if description already contains the category name
                if branch.description.startswith(base_name + ":"):
                    # Strip the prefix if should_remove_prefix is True
                    if should_remove_prefix:
                        # Remove "Category Name: " prefix (including the space after colon)
                        return branch.description[len(base_name) + 2:]
                    return branch.description
                return branch.description if should_remove_prefix else f"{base_name}: {branch.description}"

        # SECOND: Check for default child (branch_index -1 means default/others, or no matching branch)
        if branch_index == -1 or (hasattr(split_rule, "default_child_id") and split_rule.default_child_id == node.id):
            # Special case for "others" node
            if node.id == "others" or node.id.endswith("_others"):
                return "Others" if should_remove_prefix else f"{base_name}: Others"
            return "Default" if should_remove_prefix else f"{base_name}: Default"

        # Fallback to branch number
        label = f"Branch {branch_index + 1}"
        return label if should_remove_prefix else f"{base_name}: {label}"
