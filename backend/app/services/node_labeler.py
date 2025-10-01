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
            CategoryType.SEMANTIC_DISTANCE: "Semantic Distance",
            CategoryType.SCORE_AGREEMENT: "Score Agreement",
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

        elif node.category == CategoryType.SEMANTIC_DISTANCE:
            if "high" in parts:
                return "High"
            elif "low" in parts:
                return "Low"

        elif node.category == CategoryType.SCORE_AGREEMENT:
            return self._get_detailed_score_display_name(node.id)

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
            CategoryType.FEATURE_SPLITTING, CategoryType.SEMANTIC_DISTANCE
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
        if node.category == CategoryType.SCORE_AGREEMENT:
            return self._get_detailed_score_display_name(node.id)

        # For non-score-agreement pattern rules
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
        should_remove_prefix = node.category in [
            CategoryType.FEATURE_SPLITTING, CategoryType.SEMANTIC_DISTANCE
        ]

        # Use branch description if available
        if branch_index < len(split_rule.branches):
            branch = split_rule.branches[branch_index]
            if branch.description:
                return branch.description if should_remove_prefix else f"{base_name}: {branch.description}"

        # Check for default child
        if hasattr(split_rule, "default_child_id") and split_rule.default_child_id == node.id:
            return "Default" if should_remove_prefix else f"{base_name}: Default"

        # Fallback to branch number
        label = f"Branch {branch_index + 1}"
        return label if should_remove_prefix else f"{base_name}: {label}"

    def _get_detailed_score_display_name(self, node_id: str) -> str:
        """
        Generate detailed score display name with specific scoring methods.

        Examples:
        - root_2_of_3_high_fuzz_det → "2 of 3 High (Fuzz, Detection)"
        - root_all_3_high → "All High"
        - root_1_of_3_high_sim → "1 of 3 High (Simulation)"
        """
        # All high/low patterns
        if re.search(r"all_(\d+)_high", node_id):
            return "All High"
        if re.search(r"all_(\d+)_low", node_id):
            return "All Low"

        # K of N high with methods
        match = re.search(r"(\d+)_of_(\d+)_high(?:_(.+))?", node_id)
        if match:
            k, n, methods_part = int(match.group(1)), int(match.group(2)), match.group(3)
            if methods_part:
                methods = self._format_scoring_methods(methods_part)
                return f"{k} of {n} High ({methods})"
            return f"{k} of {n} High"

        # K of N low with methods
        match = re.search(r"(\d+)_of_(\d+)_low(?:_(.+))?", node_id)
        if match:
            k, n, methods_part = int(match.group(1)), int(match.group(2)), match.group(3)
            if methods_part:
                methods = self._format_scoring_methods(methods_part)
                return f"{k} of {n} Low ({methods})"
            return f"{k} of {n} Low"

        return "Score Agreement"

    def _format_scoring_methods(self, methods_part: str) -> str:
        """
        Format scoring method abbreviations into readable names.

        Examples:
        - "fuzz_det" → "Fuzz, Detection"
        - "sim" → "Simulation"
        - "fuzz_sim_det" → "Fuzz, Simulation, Detection"
        """
        method_names = {
            "fuzz": "Fuzz",
            "sim": "Simulation",
            "simulation": "Simulation",
            "det": "Detection",
            "detection": "Detection",
            "embed": "Embedding",
            "embedding": "Embedding",
        }

        methods = methods_part.split("_")
        formatted_methods = [
            method_names.get(method.lower(), method.capitalize())
            for method in methods
        ]
        return ", ".join(formatted_methods)
