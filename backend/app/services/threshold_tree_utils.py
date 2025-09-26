"""
Tree traversal utilities for the unified ThresholdTree system.

This module provides utilities to traverse the threshold tree and extract
the appropriate thresholds for feature classification.
"""

import polars as pl
import logging
from typing import Dict, List, Optional, Union, Any
from ..models.common import ThresholdNode, ThresholdTree

logger = logging.getLogger(__name__)


class ThresholdTreeTraverser:
    """Handles traversal of threshold trees to extract applicable thresholds."""

    def __init__(self, threshold_tree: ThresholdTree):
        self.tree = threshold_tree
        self.cache: Dict[str, float] = {}  # Cache for performance

    def get_threshold_for_path(self, feature_values: Dict[str, float], path: List[str] = None) -> Optional[float]:
        """
        Get threshold for a feature following its path through the tree.

        Args:
            feature_values: Dictionary of metric values for the feature
            path: Optional explicit path to follow (for debugging)

        Returns:
            Threshold value if found, None if path leads to no threshold
        """
        if path is None:
            path = []

        cache_key = self._generate_cache_key(feature_values, path)
        if cache_key in self.cache:
            return self.cache[cache_key]

        threshold = self._traverse_node(self.tree.root, feature_values, path)
        self.cache[cache_key] = threshold
        return threshold

    def _traverse_node(self, node: ThresholdNode, feature_values: Dict[str, float], path: List[str]) -> Optional[float]:
        """
        Recursively traverse a node to find the appropriate threshold.

        Args:
            node: Current node being traversed
            feature_values: Feature values to guide traversal
            path: Current path through the tree

        Returns:
            Threshold value or None
        """
        logger.debug(f"Traversing node: {node.id}, path: {path}")

        # If this node has no split, it's a leaf node
        if node.split is None:
            # Leaf nodes should have a threshold value in the feature_values
            # using the node's metric name
            if node.metric and node.metric in feature_values:
                return feature_values[node.metric]
            return None

        # This is a branch node - determine which child to follow
        metric = node.metric
        if not metric or metric not in feature_values:
            logger.warning(f"Node {node.id} has split but no valid metric: {metric}")
            return None

        feature_value = feature_values[metric]
        thresholds = node.split['thresholds']
        children = node.split['children']

        # Find which child to traverse based on thresholds
        child_index = 0
        for i, threshold in enumerate(thresholds):
            if feature_value >= threshold:
                child_index = i + 1
            else:
                break

        if child_index >= len(children):
            logger.warning(f"Child index {child_index} out of range for node {node.id}")
            return None

        # Recursively traverse the chosen child
        child = children[child_index]
        new_path = path + [child.id]
        return self._traverse_node(child, feature_values, new_path)

    def extract_thresholds_from_tree(self, df: pl.DataFrame) -> Dict[str, pl.Series]:
        """
        Extract threshold values for all features in the DataFrame.

        Args:
            df: DataFrame containing feature values

        Returns:
            Dictionary mapping metric names to Series of threshold values
        """
        from .data_constants import DEFAULT_THRESHOLDS

        threshold_columns = {}
        num_rows = len(df)

        # Get metrics that are actually part of the tree structure
        tree_metrics = self._get_tree_metrics()

        for metric in self.tree.metrics:
            # Map metric names to the expected column name format
            if metric.startswith("score_"):
                # score_fuzz -> threshold_fuzz
                column_name = f"threshold_{metric.replace('score_', '')}"
            else:
                # feature_splitting -> feature_splitting_threshold
                column_name = f"{metric}_threshold"

            if metric in tree_metrics:
                # For metrics in tree structure, traverse the tree
                thresholds = []
                for row in df.iter_rows(named=True):
                    threshold = self.get_threshold_for_path(dict(row))
                    thresholds.append(threshold if threshold is not None else DEFAULT_THRESHOLDS.get(metric, 0.0))
                threshold_columns[column_name] = pl.Series(thresholds)
            else:
                # For metrics not in tree structure, use default threshold
                default_threshold = DEFAULT_THRESHOLDS.get(metric, 0.0)
                threshold_columns[column_name] = pl.Series([default_threshold] * num_rows)

        return threshold_columns

    def _get_tree_metrics(self) -> set:
        """Get the set of metrics that are actually used in the tree structure."""
        tree_metrics = set()

        def traverse_for_metrics(node: 'ThresholdNode'):
            if node.metric:
                tree_metrics.add(node.metric)
            if node.split and node.split.get('children'):
                for child in node.split['children']:
                    traverse_for_metrics(child)

        traverse_for_metrics(self.tree.root)
        return tree_metrics

    def _generate_cache_key(self, feature_values: Dict[str, float], path: List[str]) -> str:
        """Generate a cache key for the given feature values and path."""
        def format_value(v):
            if v is None:
                return "none"
            elif isinstance(v, (int, float)):
                return f"{v:.6f}"
            else:
                return str(v)

        values_str = "_".join([f"{k}-{format_value(v)}" for k, v in sorted(feature_values.items())])
        path_str = "_".join(path)
        return f"{values_str}|{path_str}"

    def get_stage_summary(self, df: pl.DataFrame) -> Dict[str, Any]:
        """
        Get summary statistics for tree-based classification.

        Args:
            df: DataFrame with feature values

        Returns:
            Dictionary with tree traversal statistics
        """
        total_features = len(df)

        # Count features at each leaf node
        leaf_counts = {}
        for row in df.iter_rows(named=True):
            path = self._get_full_path_for_feature(dict(row))
            if path:
                leaf_node = path[-1]
                leaf_counts[leaf_node] = leaf_counts.get(leaf_node, 0) + 1

        return {
            "total_features": total_features,
            "leaf_distribution": leaf_counts,
            "tree_metrics": list(self.tree.metrics)
        }

    def _get_full_path_for_feature(self, feature_values: Dict[str, float]) -> List[str]:
        """Get the complete path a feature takes through the tree."""
        path = []
        current_node = self.tree.root

        while current_node.split is not None:
            path.append(current_node.id)

            metric = current_node.metric
            if not metric or metric not in feature_values:
                break

            feature_value = feature_values[metric]
            thresholds = current_node.split['thresholds']
            children = current_node.split['children']

            child_index = 0
            for i, threshold in enumerate(thresholds):
                if feature_value >= threshold:
                    child_index = i + 1
                else:
                    break

            if child_index >= len(children):
                break

            current_node = children[child_index]

        # Add the final leaf node
        path.append(current_node.id)
        return path




def create_default_threshold_tree() -> ThresholdTree:
    """Create a default threshold tree with standard SAE feature classification."""

    # Default thresholds
    default_feature_splitting = 0.00002
    default_semdist_mean = 0.15
    default_score_thresholds = [0.8, 0.8, 0.8]  # fuzz, simulation, detection

    # Create leaf nodes for score agreements
    agree_leaves = []
    for agreement in ["agree_none", "agree_1of3", "agree_2of3", "agree_all"]:
        agree_leaves.append(ThresholdNode(id=agreement, metric=None))

    # Create semantic distance nodes
    semdist_nodes = []
    for semdist_cat in ["low", "high"]:
        semdist_node = ThresholdNode(
            id=f"semdist_{semdist_cat}",
            metric=None,  # Will handle score classification
            split={
                "thresholds": default_score_thresholds,
                "children": agree_leaves.copy()
            }
        )
        semdist_nodes.append(semdist_node)

    # Create splitting nodes
    splitting_nodes = []
    for split_cat in ["false", "true"]:
        split_node = ThresholdNode(
            id=f"split_{split_cat}",
            metric="semdist_mean",
            split={
                "thresholds": [default_semdist_mean],
                "children": semdist_nodes.copy()
            }
        )
        splitting_nodes.append(split_node)

    # Create root node
    root = ThresholdNode(
        id="root",
        metric="feature_splitting",
        split={
            "thresholds": [default_feature_splitting],
            "children": splitting_nodes
        }
    )

    metrics = {"feature_splitting", "semdist_mean", "score_fuzz", "score_simulation", "score_detection"}

    return ThresholdTree(root=root, metrics=metrics)