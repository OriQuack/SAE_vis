"""
Utility functions for data processing and structure building.

This module provides utility functions for:
- Threshold tree parsing and extraction
- Sankey diagram node and link building
- Data structure processing and sorting
"""

import polars as pl
import logging
from typing import Dict, List, Any

from ..models.common import ThresholdTree, ThresholdNode
from .data_constants import (
    DEFAULT_THRESHOLDS, COL_FEATURE_ID, COL_FEATURE_SPLITTING, COL_SEMDIST_MEAN,
    COL_THRESHOLD_FUZZ, COL_THRESHOLD_SIMULATION, COL_THRESHOLD_DETECTION,
    COL_SPLITTING_CATEGORY, COL_SEMDIST_CATEGORY, COL_SCORE_AGREEMENT,
    COL_SCORE_FUZZ, COL_SCORE_DETECTION, COL_SCORE_SIMULATION,
    NODE_ROOT, NODE_SPLIT_PREFIX, NODE_SEMDIST_SUFFIX,
    STAGE_ROOT, STAGE_SPLITTING, STAGE_SEMANTIC, STAGE_AGREEMENT,
    CATEGORY_ROOT, CATEGORY_FEATURE_SPLITTING, CATEGORY_SEMANTIC_DISTANCE, CATEGORY_SCORE_AGREEMENT,
    STAGE_NAMES, AGREEMENT_NAMES,
    SPLITTING_ORDER, SEMDIST_ORDER, AGREEMENT_ORDER
)

logger = logging.getLogger(__name__)


def extract_thresholds_from_tree(df: pl.DataFrame, threshold_tree: ThresholdTree) -> Dict[str, pl.Series]:
    """Extract threshold values for all features from threshold tree - proper hierarchical traversal."""
    threshold_columns = {}
    num_rows = len(df)

    # Stage 1: Feature splitting - all features use root threshold
    root_threshold = 0.0
    if threshold_tree.root.split and threshold_tree.root.split.get('thresholds'):
        root_threshold = threshold_tree.root.split['thresholds'][0]
    threshold_columns["feature_splitting_threshold"] = pl.Series([root_threshold] * num_rows)

    # Initialize threshold lists for per-feature extraction
    semdist_thresholds = []
    fuzz_thresholds = []
    simulation_thresholds = []
    detection_thresholds = []

    # Process each feature individually to get proper hierarchical thresholds
    for row in df.iter_rows(named=True):
        feature_splitting_val = row.get("feature_splitting", 0.0)
        semdist_mean_val = row.get("semdist_mean", 0.0)

        # Stage 1: Determine splitting branch
        if feature_splitting_val >= root_threshold:
            splitting_branch = "split_true"
        else:
            splitting_branch = "split_false"

        # Find the splitting child node
        splitting_node = None
        if threshold_tree.root.split:
            for child in threshold_tree.root.split.get('children', []):
                if child.id == splitting_branch:
                    splitting_node = child
                    break

        # Stage 2: Extract semdist threshold
        if splitting_node and splitting_node.split and splitting_node.split.get('thresholds'):
            semdist_threshold = splitting_node.split['thresholds'][0]
        else:
            semdist_threshold = DEFAULT_THRESHOLDS.get("semdist_mean", 0.15)

        semdist_thresholds.append(semdist_threshold)

        # Stage 3: Determine semantic distance branch and extract score thresholds
        if semdist_mean_val >= semdist_threshold:
            semdist_branch = f"{splitting_branch}_semdist_high"
        else:
            semdist_branch = f"{splitting_branch}_semdist_low"

        # Find the semantic distance child node
        semdist_node = None
        if splitting_node and splitting_node.split:
            for child in splitting_node.split.get('children', []):
                if hasattr(child, 'id') and child.id == semdist_branch:
                    semdist_node = child
                    break
                elif isinstance(child, dict) and child.get('id') == semdist_branch:
                    # Handle case where children are still dicts instead of ThresholdNode objects
                    from ..models.common import ThresholdNode
                    semdist_node = ThresholdNode(**child)
                    break

        # Extract score thresholds from the semdist node
        if semdist_node:
            logger.debug(f"Feature {row[COL_FEATURE_ID]}: found semdist_node {semdist_node.id}, metric={semdist_node.metric}")

            if (semdist_node.split and
                semdist_node.split.get('thresholds') and
                semdist_node.metric == "score_combined"):

                score_thresholds = semdist_node.split['thresholds']
                # Expecting [fuzz, simulation, detection] thresholds
                fuzz_threshold = score_thresholds[0] if len(score_thresholds) > 0 else DEFAULT_THRESHOLDS.get("score_fuzz", 0.8)
                simulation_threshold = score_thresholds[1] if len(score_thresholds) > 1 else DEFAULT_THRESHOLDS.get("score_simulation", 0.8)
                detection_threshold = score_thresholds[2] if len(score_thresholds) > 2 else DEFAULT_THRESHOLDS.get("score_detection", 0.8)
                logger.info(f"✅ Found hierarchical thresholds for feature {row[COL_FEATURE_ID]}: {score_thresholds}")
            else:
                # Fallback to defaults
                fuzz_threshold = DEFAULT_THRESHOLDS.get("score_fuzz", 0.8)
                simulation_threshold = DEFAULT_THRESHOLDS.get("score_simulation", 0.8)
                detection_threshold = DEFAULT_THRESHOLDS.get("score_detection", 0.8)
                logger.debug(f"Using default thresholds for feature {row[COL_FEATURE_ID]}: metric={semdist_node.metric}")
        else:
            # Fallback to defaults - no semdist node found
            fuzz_threshold = DEFAULT_THRESHOLDS.get("score_fuzz", 0.8)
            simulation_threshold = DEFAULT_THRESHOLDS.get("score_simulation", 0.8)
            detection_threshold = DEFAULT_THRESHOLDS.get("score_detection", 0.8)
            logger.warning(f"No semdist node found for feature {row[COL_FEATURE_ID]}, branch={semdist_branch}")

        fuzz_thresholds.append(fuzz_threshold)
        simulation_thresholds.append(simulation_threshold)
        detection_thresholds.append(detection_threshold)

    # Build threshold columns
    threshold_columns["semdist_mean_threshold"] = pl.Series(semdist_thresholds)
    threshold_columns[COL_THRESHOLD_FUZZ] = pl.Series(fuzz_thresholds)
    threshold_columns[COL_THRESHOLD_SIMULATION] = pl.Series(simulation_thresholds)
    threshold_columns[COL_THRESHOLD_DETECTION] = pl.Series(detection_thresholds)

    return threshold_columns


def custom_sort_order(items: List[Dict], order_list: List[str], key: str) -> List[Dict]:
    """Sort items based on custom order list."""
    def sort_key(item):
        try:
            return order_list.index(item[key])
        except ValueError:
            # If item not in order list, put it at the end
            return len(order_list)

    return sorted(items, key=sort_key)


def build_sankey_nodes_and_links(categorized_df: pl.DataFrame) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Build Sankey nodes and links from categorized data - consolidated approach."""
    total_features = len(categorized_df)
    nodes = []
    links = []

    # Stage 0: Root node
    nodes.append({
        "id": NODE_ROOT,
        "name": STAGE_NAMES[STAGE_ROOT],
        "stage": STAGE_ROOT,
        "feature_count": total_features,
        "category": CATEGORY_ROOT
    })

    # Stage 1: Feature splitting
    splitting_counts = (
        categorized_df
        .group_by(COL_SPLITTING_CATEGORY)
        .count()
    ).to_dicts()

    # Apply custom ordering for splitting categories
    splitting_counts_sorted = custom_sort_order(
        splitting_counts, SPLITTING_ORDER, COL_SPLITTING_CATEGORY
    )

    for row in splitting_counts_sorted:
        category = row[COL_SPLITTING_CATEGORY]
        count = row["count"]
        node_id = f"{NODE_SPLIT_PREFIX}{category}"

        nodes.append({
            "id": node_id,
            "name": f"Feature Splitting: {category.title()}",
            "stage": STAGE_SPLITTING,
            "feature_count": count,
            "category": CATEGORY_FEATURE_SPLITTING
        })

        links.append({
            "source": NODE_ROOT,
            "target": node_id,
            "value": count
        })

    # Stage 2: Semantic distance
    semantic_counts = (
        categorized_df
        .group_by([COL_SPLITTING_CATEGORY, COL_SEMDIST_CATEGORY])
        .count()
    ).to_dicts()

    # Apply custom ordering for semantic distance categories
    def semantic_sort_key(row):
        split_order = SPLITTING_ORDER.index(row[COL_SPLITTING_CATEGORY]) if row[COL_SPLITTING_CATEGORY] in SPLITTING_ORDER else len(SPLITTING_ORDER)
        semdist_order = SEMDIST_ORDER.index(row[COL_SEMDIST_CATEGORY]) if row[COL_SEMDIST_CATEGORY] in SEMDIST_ORDER else len(SEMDIST_ORDER)
        return (split_order, semdist_order)

    semantic_counts_sorted = sorted(semantic_counts, key=semantic_sort_key)

    for row in semantic_counts_sorted:
        split_cat = row[COL_SPLITTING_CATEGORY]
        semdist_cat = row[COL_SEMDIST_CATEGORY]
        count = row["count"]

        source_id = f"{NODE_SPLIT_PREFIX}{split_cat}"
        target_id = f"{NODE_SPLIT_PREFIX}{split_cat}{NODE_SEMDIST_SUFFIX}{semdist_cat}"

        nodes.append({
            "id": target_id,
            "name": f"{semdist_cat.title()} Semantic Distance",
            "stage": STAGE_SEMANTIC,
            "feature_count": count,
            "category": CATEGORY_SEMANTIC_DISTANCE,
            "parent_path": [source_id]
        })

        links.append({
            "source": source_id,
            "target": target_id,
            "value": count
        })

    # Stage 3: Score agreement
    agreement_groups = (
        categorized_df
        .group_by([COL_SPLITTING_CATEGORY, COL_SEMDIST_CATEGORY, COL_SCORE_AGREEMENT])
        .agg([
            pl.count().alias("count"),
            pl.col(COL_FEATURE_ID).alias("feature_ids")
        ])
    ).to_dicts()

    # Apply custom ordering for score agreement categories
    def agreement_sort_key(row):
        split_order = SPLITTING_ORDER.index(row[COL_SPLITTING_CATEGORY]) if row[COL_SPLITTING_CATEGORY] in SPLITTING_ORDER else len(SPLITTING_ORDER)
        semdist_order = SEMDIST_ORDER.index(row[COL_SEMDIST_CATEGORY]) if row[COL_SEMDIST_CATEGORY] in SEMDIST_ORDER else len(SEMDIST_ORDER)
        agreement_order = AGREEMENT_ORDER.index(row[COL_SCORE_AGREEMENT]) if row[COL_SCORE_AGREEMENT] in AGREEMENT_ORDER else len(AGREEMENT_ORDER)
        return (split_order, semdist_order, agreement_order)

    agreement_groups_sorted = sorted(agreement_groups, key=agreement_sort_key)

    for row in agreement_groups_sorted:
        split_cat = row[COL_SPLITTING_CATEGORY]
        semdist_cat = row[COL_SEMDIST_CATEGORY]
        agreement_cat = row[COL_SCORE_AGREEMENT]
        count = row["count"]
        feature_ids = row["feature_ids"]

        source_id = f"{NODE_SPLIT_PREFIX}{split_cat}{NODE_SEMDIST_SUFFIX}{semdist_cat}"
        target_id = f"{source_id}_{agreement_cat}"

        nodes.append({
            "id": target_id,
            "name": AGREEMENT_NAMES[agreement_cat],
            "stage": STAGE_AGREEMENT,
            "feature_count": count,
            "category": CATEGORY_SCORE_AGREEMENT,
            "parent_path": [f"{NODE_SPLIT_PREFIX}{split_cat}", f"semdist_{semdist_cat}"],
            "feature_ids": feature_ids
        })

        links.append({
            "source": source_id,
            "target": target_id,
            "value": count
        })

    return nodes, links


def find_node_path_in_tree(current_node: ThresholdNode, target_id: str, path=None) -> List[ThresholdNode]:
    """
    Recursively find the path from current node to target node in threshold tree.
    Returns the path as a list of ThresholdNodes from root to target.
    """
    if path is None:
        path = []

    current_path = path + [current_node]

    # Check if this is the target node
    if current_node.id == target_id:
        return current_path

    # Search in children if they exist
    if current_node.split and 'children' in current_node.split:
        for child in current_node.split['children']:
            # Handle both dict and ThresholdNode objects
            if hasattr(child, 'id'):
                child_node = child
            else:
                child_node = ThresholdNode(**child)

            result = find_node_path_in_tree(child_node, target_id, current_path)
            if result:
                return result

    return None


def extract_node_thresholds(df: pl.DataFrame, threshold_tree: ThresholdTree, target_node_path: List[ThresholdNode]) -> Dict[str, pl.Series]:
    """
    Extract thresholds for features that should belong to a specific node path.
    This reuses the hierarchical threshold logic but scoped to a specific path.
    """
    threshold_columns = {}
    num_rows = len(df)

    # Initialize threshold lists
    thresholds_by_metric = {}

    # Walk through the node path to determine thresholds at each level
    for i, node in enumerate(target_node_path):
        if node.metric and node.split and 'thresholds' in node.split:
            metric = node.metric
            thresholds = node.split['thresholds']

            if metric not in thresholds_by_metric:
                thresholds_by_metric[metric] = []

            # For each feature, determine which threshold applies based on the path
            if i == 0:  # Root node
                # All features get the same threshold from root
                threshold_value = thresholds[0] if thresholds else DEFAULT_THRESHOLDS.get(metric, 0.0)
                thresholds_by_metric[metric] = [threshold_value] * num_rows
            else:
                # For deeper nodes, we need to trace the parent's classification
                parent_node = target_node_path[i-1]
                current_node = node

                # Apply per-feature threshold based on hierarchical classification
                feature_thresholds = []
                for row in df.iter_rows(named=True):
                    threshold_value = _get_threshold_for_feature_at_node(
                        row, parent_node, current_node, threshold_tree, thresholds
                    )
                    feature_thresholds.append(threshold_value)

                thresholds_by_metric[metric] = feature_thresholds

    # Convert to the expected format
    for metric, values in thresholds_by_metric.items():
        if metric == "feature_splitting":
            threshold_columns["feature_splitting_threshold"] = pl.Series(values)
        elif metric == "semdist_mean":
            threshold_columns["semdist_mean_threshold"] = pl.Series(values)
        elif metric == "score_combined" and len(values) > 0:
            # Handle combined score thresholds - unpack the first feature's thresholds for all
            if isinstance(values[0], list) and len(values[0]) >= 3:
                threshold_columns[COL_THRESHOLD_FUZZ] = pl.Series([v[0] if isinstance(v, list) else v for v in values])
                threshold_columns[COL_THRESHOLD_SIMULATION] = pl.Series([v[1] if isinstance(v, list) else v for v in values])
                threshold_columns[COL_THRESHOLD_DETECTION] = pl.Series([v[2] if isinstance(v, list) else v for v in values])
            else:
                # Fallback to single threshold for all score types
                threshold_columns[COL_THRESHOLD_FUZZ] = pl.Series(values)
                threshold_columns[COL_THRESHOLD_SIMULATION] = pl.Series(values)
                threshold_columns[COL_THRESHOLD_DETECTION] = pl.Series(values)

    # Fill in any missing thresholds with defaults
    for col, default_val in [
        ("feature_splitting_threshold", DEFAULT_THRESHOLDS.get("feature_splitting", 0.0)),
        ("semdist_mean_threshold", DEFAULT_THRESHOLDS.get("semdist_mean", 0.15)),
        (COL_THRESHOLD_FUZZ, DEFAULT_THRESHOLDS.get("score_fuzz", 0.8)),
        (COL_THRESHOLD_SIMULATION, DEFAULT_THRESHOLDS.get("score_simulation", 0.8)),
        (COL_THRESHOLD_DETECTION, DEFAULT_THRESHOLDS.get("score_detection", 0.8))
    ]:
        if col not in threshold_columns:
            threshold_columns[col] = pl.Series([default_val] * num_rows)

    return threshold_columns


def _get_threshold_for_feature_at_node(feature_row: Dict, parent_node: ThresholdNode, current_node: ThresholdNode,
                                     threshold_tree: ThresholdTree, node_thresholds: List[float]) -> float:
    """Helper function to get the appropriate threshold for a feature at a specific node."""
    if node_thresholds:
        return node_thresholds[0]
    return DEFAULT_THRESHOLDS.get(current_node.metric, 0.0)


def apply_node_path_classification(df: pl.DataFrame, threshold_tree: ThresholdTree,
                                 target_node_path: List[ThresholdNode]) -> pl.DataFrame:
    """
    Apply classification logic following a specific node path through the threshold tree.
    This determines which features belong to the target node.
    """
    if len(target_node_path) <= 1:
        # Root node - return all features
        return df

    # Extract thresholds for this specific path
    threshold_columns = extract_node_thresholds(df, threshold_tree, target_node_path)

    # Add threshold columns to DataFrame
    df_with_thresholds = df.with_columns([
        pl.Series(name, values) for name, values in threshold_columns.items()
    ])

    # Apply filtering step by step following the node path
    result_df = df_with_thresholds

    for i in range(1, len(target_node_path)):
        parent_node = target_node_path[i-1]
        current_node = target_node_path[i]

        if parent_node.metric:
            result_df = _apply_node_filter_step(result_df, parent_node, current_node)

    return result_df


def _apply_node_filter_step(df: pl.DataFrame, parent_node: ThresholdNode, current_node: ThresholdNode) -> pl.DataFrame:
    """Apply a single filtering step based on parent metric and current node classification."""

    if parent_node.metric == "feature_splitting":
        if "true" in current_node.id:
            return df.filter(pl.col(COL_FEATURE_SPLITTING) >= pl.col("feature_splitting_threshold"))
        elif "false" in current_node.id:
            return df.filter(pl.col(COL_FEATURE_SPLITTING) < pl.col("feature_splitting_threshold"))

    elif parent_node.metric == "semdist_mean":
        if "high" in current_node.id:
            return df.filter(pl.col(COL_SEMDIST_MEAN) >= pl.col("semdist_mean_threshold"))
        elif "low" in current_node.id:
            return df.filter(pl.col(COL_SEMDIST_MEAN) < pl.col("semdist_mean_threshold"))

    elif parent_node.metric == "score_combined":
        # Calculate score agreement count
        score_count = (
            (pl.col(COL_SCORE_FUZZ) >= pl.col(COL_THRESHOLD_FUZZ)).cast(pl.Int32) +
            (pl.col(COL_SCORE_DETECTION) >= pl.col(COL_THRESHOLD_DETECTION)).cast(pl.Int32) +
            (pl.col(COL_SCORE_SIMULATION) >= pl.col(COL_THRESHOLD_SIMULATION)).cast(pl.Int32)
        )

        if "agree_all" in current_node.id:
            return df.filter(score_count == 3)
        elif "agree_2of3" in current_node.id:
            return df.filter(score_count == 2)
        elif "agree_1of3" in current_node.id:
            return df.filter(score_count == 1)
        elif "agree_none" in current_node.id:
            return df.filter(score_count == 0)

    # If no specific filtering applies, return unchanged
    return df


def filter_dataframe_for_node(df: pl.DataFrame, threshold_tree: ThresholdTree, node_id: str) -> pl.DataFrame:
    """
    Main function to filter a dataframe to only include features that belong to a specific node.
    This is the scalable entry point that works regardless of stage order changes.
    """
    logger.debug(f"Filtering dataframe for node_id: {node_id}")

    if node_id == "root":
        return df

    # Find the path to the target node
    node_path = find_node_path_in_tree(threshold_tree.root, node_id)

    if not node_path:
        logger.warning(f"Node path not found for node_id: {node_id}")
        return df.filter(pl.lit(False))  # Return empty DataFrame

    logger.debug(f"Found node path: {[node.id for node in node_path]}")

    # Apply the classification and filtering for this specific path
    filtered_df = apply_node_path_classification(df, threshold_tree, node_path)

    logger.debug(f"Filtered dataframe: {len(filtered_df)} features for node {node_id}")
    return filtered_df