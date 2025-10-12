#!/usr/bin/env python3
"""
Create unified UMAP projections parquet file with hierarchical clustering information.

This script combines:
- Explanation UMAP embeddings with explanation clustering/labels
- Feature UMAP embeddings with feature clustering

The resulting parquet supports efficient filtering by cluster, level, label, and other attributes.
"""

import json
import sys
import argparse
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from datetime import datetime
import polars as pl


def load_json(file_path: Path) -> Dict:
    """Load JSON file."""
    with open(file_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def extract_cluster_path(node: Dict, target_id: str, current_path: List[str] = None) -> Optional[List[str]]:
    """
    Recursively find the path from root to a cluster node.

    Args:
        node: Current cluster node
        target_id: Cluster ID to find
        current_path: Current path being built

    Returns:
        List of cluster IDs from root to target, or None if not found
    """
    if current_path is None:
        current_path = []

    node_id = node.get("cluster_id")
    if node_id == target_id:
        return current_path + [node_id]

    # Search in children
    for child in node.get("children", []):
        result = extract_cluster_path(child, target_id, current_path + [node_id])
        if result:
            return result

    return None


def build_cluster_mapping(cluster_tree: Dict) -> Dict[str, Dict]:
    """
    Build mapping from cluster_id to cluster metadata (path, level, label).

    Args:
        cluster_tree: Root of cluster tree

    Returns:
        Dict mapping cluster_id to {path, level, label}
    """
    mapping = {}

    def traverse(node: Dict, level: int = -1, path: List[str] = None):
        if path is None:
            path = []

        cluster_id = node.get("cluster_id")
        if cluster_id:
            mapping[cluster_id] = {
                "path": path.copy(),
                "level": level,
                "label": node.get("label")
            }

        for child in node.get("children", []):
            traverse(child, level + 1, path + [cluster_id] if cluster_id else path)

    traverse(cluster_tree)
    return mapping


def map_explanation_to_cluster(explanation_id: str, clustering_data: Dict) -> Tuple[Optional[str], Optional[str], Optional[int]]:
    """
    Map an explanation ID to its leaf cluster ID, handling noise points.

    Args:
        explanation_id: Explanation ID (e.g., "feature_0_llama_e-llama_s")
        clustering_data: Loaded clustering JSON

    Returns:
        Tuple of (cluster_id, parent_cluster_id, noise_level):
        - cluster_id: Leaf cluster ID, or None if noise
        - parent_cluster_id: Parent cluster where point became noise, or None
        - noise_level: Level at which point became noise, or None if not noise
    """
    # Get the index from explanation_id_mapping
    explanation_id_mapping = clustering_data.get("explanation_id_mapping", {})

    # Find the index corresponding to this explanation_id
    member_index = None
    for idx_str, mapped_id in explanation_id_mapping.items():
        if mapped_id == explanation_id:
            member_index = int(idx_str)
            break

    if member_index is None:
        return None, None, None

    # Find which cluster this member_index belongs to, tracking noise
    def find_cluster(node: Dict, level: int = 0) -> Tuple[Optional[str], Optional[str], Optional[int]]:
        member_indices = node.get("member_indices", [])

        # Check if this member is in current node
        if member_index in member_indices:
            # Check if there are children
            if not node.get("children"):
                # Leaf node - this is the cluster
                return node.get("cluster_id"), None, None

            # Has children - check if member is in any child
            for child in node.get("children", []):
                result = find_cluster(child, level + 1)
                if result[0] or result[2] is not None:  # Found in child or is noise
                    return result

            # Member is in this node but not in any child = noise at this level
            return None, node.get("cluster_id"), level

        return None, None, None

    cluster_tree = clustering_data.get("cluster_tree", {})
    return find_cluster(cluster_tree)


def map_feature_to_cluster(feature_id: int, clustering_data: Dict) -> Tuple[Optional[str], Optional[str], Optional[int]]:
    """
    Map a feature ID to its leaf cluster ID, handling noise points.

    Args:
        feature_id: Feature ID (integer)
        clustering_data: Loaded clustering JSON

    Returns:
        Tuple of (cluster_id, parent_cluster_id, noise_level):
        - cluster_id: Leaf cluster ID, or None if noise
        - parent_cluster_id: Parent cluster where point became noise, or None
        - noise_level: Level at which point became noise, or None if not noise
    """
    # Feature clustering uses direct feature IDs as member_indices
    def find_cluster(node: Dict, level: int = 0) -> Tuple[Optional[str], Optional[str], Optional[int]]:
        member_indices = node.get("member_indices", [])

        # Check if this feature is in current node
        if feature_id in member_indices:
            # Check if there are children
            if not node.get("children"):
                # Leaf node - this is the cluster
                return node.get("cluster_id"), None, None

            # Has children - check if feature is in any child
            for child in node.get("children", []):
                result = find_cluster(child, level + 1)
                if result[0] or result[2] is not None:  # Found in child or is noise
                    return result

            # Feature is in this node but not in any child = noise at this level
            return None, node.get("cluster_id"), level

        return None, None, None

    cluster_tree = clustering_data.get("cluster_tree", {})
    return find_cluster(cluster_tree)


def map_feature_to_all_clusters(feature_id: int, clustering_data: Dict) -> List[Tuple[str, int, bool]]:
    """
    Map a feature ID to ALL clusters in its hierarchy path (intermediate + leaf/noise).

    Args:
        feature_id: Feature ID (integer)
        clustering_data: Loaded clustering JSON

    Returns:
        List of (cluster_id, level, is_noise) for each level in hierarchy.
        Example: [
            ("cluster_0", 0, False),
            ("cluster_1", 1, False),
            ("cluster_4", 2, False),
            ("cluster_5", 3, False)
        ]
        Or with noise: [
            ("cluster_0", 0, False),
            ("cluster_1", 1, False),
            ("noise_cluster_1", 2, True)
        ]
    """
    cluster_path = []

    def traverse_path(node: Dict, level: int = 0) -> bool:
        """
        Traverse tree and collect all clusters containing this feature.
        Returns True if feature is in this subtree.
        """
        member_indices = node.get("member_indices", [])

        # Check if feature is in this node
        if feature_id not in member_indices:
            return False

        # Feature is in this node - add to path
        cluster_id = node.get("cluster_id")
        cluster_path.append((cluster_id, level, False))

        # Check if node has children
        if not node.get("children"):
            # Leaf node - we're done
            return True

        # Has children - check if feature is in any child
        found_in_child = False
        for child in node.get("children", []):
            if traverse_path(child, level + 1):
                found_in_child = True
                break

        # If not found in any child, feature became noise at this level
        if not found_in_child:
            # Add noise cluster entry
            noise_cluster_id = f"noise_{cluster_id}"
            cluster_path.append((noise_cluster_id, level + 1, True))

        return True

    cluster_tree = clustering_data.get("cluster_tree", {})
    traverse_path(cluster_tree)

    return cluster_path


def map_explanation_to_all_clusters(explanation_id: str, clustering_data: Dict) -> List[Tuple[str, int, bool]]:
    """
    Map an explanation ID to ALL clusters in its hierarchy path (intermediate + leaf/noise).

    Args:
        explanation_id: Explanation ID (e.g., "feature_0_llama_e-llama_s")
        clustering_data: Loaded clustering JSON

    Returns:
        List of (cluster_id, level, is_noise) for each level in hierarchy
    """
    # Get the index from explanation_id_mapping
    explanation_id_mapping = clustering_data.get("explanation_id_mapping", {})

    # Find the index corresponding to this explanation_id
    member_index = None
    for idx_str, mapped_id in explanation_id_mapping.items():
        if mapped_id == explanation_id:
            member_index = int(idx_str)
            break

    if member_index is None:
        return []

    cluster_path = []

    def traverse_path(node: Dict, level: int = 0) -> bool:
        """
        Traverse tree and collect all clusters containing this explanation.
        Returns True if explanation is in this subtree.
        """
        member_indices = node.get("member_indices", [])

        # Check if explanation is in this node
        if member_index not in member_indices:
            return False

        # Explanation is in this node - add to path
        cluster_id = node.get("cluster_id")
        cluster_path.append((cluster_id, level, False))

        # Check if node has children
        if not node.get("children"):
            # Leaf node - we're done
            return True

        # Has children - check if explanation is in any child
        found_in_child = False
        for child in node.get("children", []):
            if traverse_path(child, level + 1):
                found_in_child = True
                break

        # If not found in any child, explanation became noise at this level
        if not found_in_child:
            # Add noise cluster entry
            noise_cluster_id = f"noise_{cluster_id}"
            cluster_path.append((noise_cluster_id, level + 1, True))

        return True

    cluster_tree = clustering_data.get("cluster_tree", {})
    traverse_path(cluster_tree)

    return cluster_path


def process_explanation_umap(config: Dict, project_root: Path) -> pl.DataFrame:
    """
    Process explanation UMAP data with clustering and labels.

    Args:
        config: Configuration dictionary
        project_root: Project root path

    Returns:
        Polars DataFrame with explanation UMAP points
    """
    print("\n=== Processing Explanation UMAP ===")

    # Load data
    umap_path = project_root / config["explanation_umap"]["data_path"]
    clustering_path = project_root / config["explanation_umap"]["clustering_path"]
    labels_path = project_root / config["explanation_umap"]["labels_path"]

    print(f"Loading UMAP data from: {umap_path}")
    umap_data = load_json(umap_path)

    print(f"Loading clustering from: {clustering_path}")
    clustering_data = load_json(clustering_path)

    print(f"Loading labels from: {labels_path}")
    labels_data = load_json(labels_path)
    cluster_labels = labels_data.get("cluster_labels", {})

    # Build cluster mapping
    cluster_tree = clustering_data.get("cluster_tree", {})
    cluster_mapping = build_cluster_mapping(cluster_tree)

    # Process each feature's explanations
    rows = []
    feature_embeddings = umap_data.get("feature_embeddings", {})

    for feature_key, sources in feature_embeddings.items():
        # Extract feature_id from key (e.g., "feature_0" -> 0)
        feature_id = int(feature_key.split("_")[1])

        for source_name, coords in sources.items():
            # Build explanation_id
            explanation_id = f"{feature_key}_{source_name}"

            # Get ALL clusters in hierarchy path
            cluster_hierarchy_path = map_explanation_to_all_clusters(explanation_id, clustering_data)

            if not cluster_hierarchy_path:
                # No mapping found - skip this explanation
                continue

            # Extract LLM explainer from source name
            llm_explainer = source_name  # Full source name for now

            # Create one row for each cluster level in the hierarchy
            for cluster_id, level, is_noise in cluster_hierarchy_path:
                # Determine cluster metadata
                cluster_label = "noise" if is_noise else None

                # Get label from cluster_labels if available (non-noise clusters only)
                if not is_noise and cluster_id in cluster_labels:
                    cluster_label = cluster_labels[cluster_id].get("label")

                # Build ancestors based on level
                ancestors = [None, None, None]
                if level > 0:
                    # Get ancestors from earlier entries in cluster_hierarchy_path
                    for i in range(min(level, 3)):
                        if i < len(cluster_hierarchy_path):
                            # Only use non-noise clusters as ancestors
                            ancestor_cluster_id, ancestor_level, ancestor_is_noise = cluster_hierarchy_path[i]
                            if not ancestor_is_noise and ancestor_level == i:
                                ancestors[i] = ancestor_cluster_id

                row = {
                    "umap_type": "explanation",
                    "feature_id": feature_id,
                    "source": source_name,
                    "llm_explainer": llm_explainer,
                    "umap_x": coords["x"],
                    "umap_y": coords["y"],
                    "sae_id": umap_data.get("metadata", {}).get("sources", ["unknown"])[0],
                    "cluster_id": cluster_id,
                    "cluster_level": level,
                    "cluster_label": cluster_label,
                    "ancestor_level_0": ancestors[0],
                    "ancestor_level_1": ancestors[1],
                    "ancestor_level_2": ancestors[2]
                }
                rows.append(row)

    print(f"Processed {len(rows)} explanation UMAP points")

    # Create DataFrame with explicit schema to ensure proper types
    df = pl.DataFrame(rows, schema={
        "umap_type": pl.Utf8,
        "feature_id": pl.UInt32,
        "source": pl.Utf8,
        "llm_explainer": pl.Utf8,
        "umap_x": pl.Float32,
        "umap_y": pl.Float32,
        "sae_id": pl.Utf8,
        "cluster_id": pl.Utf8,
        "cluster_level": pl.UInt8,
        "cluster_label": pl.Utf8,
        "ancestor_level_0": pl.Utf8,
        "ancestor_level_1": pl.Utf8,
        "ancestor_level_2": pl.Utf8
    })
    return df


def process_feature_umap(config: Dict, project_root: Path) -> pl.DataFrame:
    """
    Process feature UMAP data with clustering.

    Args:
        config: Configuration dictionary
        project_root: Project root path

    Returns:
        Polars DataFrame with feature UMAP points
    """
    print("\n=== Processing Feature UMAP ===")

    # Load data
    umap_path = project_root / config["feature_umap"]["data_path"]
    clustering_path = project_root / config["feature_umap"]["clustering_path"]

    print(f"Loading UMAP data from: {umap_path}")
    umap_data = load_json(umap_path)

    print(f"Loading clustering from: {clustering_path}")
    clustering_data = load_json(clustering_path)

    # Build cluster mapping
    cluster_tree = clustering_data.get("cluster_tree", {})
    cluster_mapping = build_cluster_mapping(cluster_tree)

    # Process feature embeddings
    rows = []
    feature_embeddings = umap_data.get("feature_embeddings", [])

    for feature_data in feature_embeddings:
        feature_id = feature_data["feature_id"]

        # Get ALL clusters in hierarchy path
        cluster_hierarchy_path = map_feature_to_all_clusters(feature_id, clustering_data)

        if not cluster_hierarchy_path:
            # No mapping found - skip this feature
            continue

        # Create one row for each cluster level in the hierarchy
        for cluster_id, level, is_noise in cluster_hierarchy_path:
            # Determine cluster metadata
            cluster_label = "noise" if is_noise else None

            # Build ancestors based on level
            # For level 0, no ancestors
            # For level 1, ancestor_level_0 is the cluster at level 0
            # For level 2, ancestor_level_0/1 are clusters at levels 0/1
            # etc.
            ancestors = [None, None, None]
            if level > 0:
                # Get ancestors from earlier entries in cluster_hierarchy_path
                for i in range(min(level, 3)):
                    if i < len(cluster_hierarchy_path):
                        # Only use non-noise clusters as ancestors
                        ancestor_cluster_id, ancestor_level, ancestor_is_noise = cluster_hierarchy_path[i]
                        if not ancestor_is_noise and ancestor_level == i:
                            ancestors[i] = ancestor_cluster_id

            row = {
                "umap_type": "feature",
                "feature_id": feature_id,
                "source": "decoder",
                "llm_explainer": None,
                "umap_x": feature_data["umap_x"],
                "umap_y": feature_data["umap_y"],
                "sae_id": umap_data.get("metadata", {}).get("model_info", {}).get("model_name_or_path", "unknown"),
                "cluster_id": cluster_id,
                "cluster_level": level,
                "cluster_label": cluster_label,
                "ancestor_level_0": ancestors[0],
                "ancestor_level_1": ancestors[1],
                "ancestor_level_2": ancestors[2]
            }
            rows.append(row)

    print(f"Processed {len(rows)} feature UMAP points")

    # Create DataFrame with explicit schema matching explanation schema
    df = pl.DataFrame(rows, schema={
        "umap_type": pl.Utf8,
        "feature_id": pl.UInt32,
        "source": pl.Utf8,
        "llm_explainer": pl.Utf8,
        "umap_x": pl.Float32,
        "umap_y": pl.Float32,
        "sae_id": pl.Utf8,
        "cluster_id": pl.Utf8,
        "cluster_level": pl.UInt8,
        "cluster_label": pl.Utf8,
        "ancestor_level_0": pl.Utf8,
        "ancestor_level_1": pl.Utf8,
        "ancestor_level_2": pl.Utf8
    })
    return df


def create_umap_parquet(config: Dict, project_root: Path) -> None:
    """
    Create unified UMAP projections parquet file.

    Args:
        config: Configuration dictionary
        project_root: Project root path
    """
    print("=" * 80)
    print("Creating Unified UMAP Projections Parquet")
    print("=" * 80)

    # Process both UMAP types
    explanation_df = process_explanation_umap(config, project_root)
    feature_df = process_feature_umap(config, project_root)

    # Combine dataframes
    print("\n=== Combining Dataframes ===")
    combined_df = pl.concat([explanation_df, feature_df])

    # Add umap_id
    combined_df = combined_df.with_row_count("umap_id", offset=0)

    # Convert to proper types according to schema
    print("\n=== Converting to Schema Types ===")
    schema_config = config.get("schema", {})

    combined_df = combined_df.with_columns([
        pl.col("umap_id").cast(pl.UInt32),
        pl.col("umap_type").cast(pl.Categorical),
        pl.col("feature_id").cast(pl.UInt32),
        pl.col("source").cast(pl.Categorical),
        pl.col("llm_explainer").cast(pl.Categorical),
        pl.col("umap_x").cast(pl.Float32),
        pl.col("umap_y").cast(pl.Float32),
        pl.col("sae_id").cast(pl.Categorical),
        pl.col("cluster_id").cast(pl.Categorical),
        pl.col("cluster_level").cast(pl.UInt8),
        pl.col("cluster_label").cast(pl.Utf8),
        pl.col("ancestor_level_0").cast(pl.Categorical),
        pl.col("ancestor_level_1").cast(pl.Categorical),
        pl.col("ancestor_level_2").cast(pl.Categorical)
    ])

    # Sort by umap_id
    combined_df = combined_df.sort("umap_id")

    # Print statistics
    print("\n=== Dataset Statistics ===")
    print(f"Total rows: {len(combined_df)}")
    print(f"Explanation points: {len(explanation_df)}")
    print(f"Feature points: {len(feature_df)}")

    # Count noise points
    noise_mask = combined_df.filter(pl.col("cluster_label") == "noise")
    n_noise_explanations = len(noise_mask.filter(pl.col("umap_type") == "explanation"))
    n_noise_features = len(noise_mask.filter(pl.col("umap_type") == "feature"))

    print(f"\nNoise Statistics:")
    print(f"  Explanation noise points: {n_noise_explanations}")
    print(f"  Feature noise points: {n_noise_features}")
    print(f"  Total noise points: {len(noise_mask)}")

    print(f"\nColumns: {combined_df.columns}")
    print(f"\nSchema:")
    for col, dtype in zip(combined_df.columns, combined_df.dtypes):
        print(f"  {col:20s} {dtype}")

    # Save parquet
    output_dir = project_root / config["output_directory"]
    output_dir.mkdir(parents=True, exist_ok=True)

    output_file = output_dir / config["output_filename"]
    print(f"\n=== Saving to {output_file} ===")

    combined_df.write_parquet(output_file, compression="zstd")
    print(f"✓ Saved {len(combined_df)} rows to {output_file}")

    # Save metadata
    metadata = {
        "created_at": datetime.now().isoformat(),
        "total_rows": len(combined_df),
        "explanation_rows": len(explanation_df),
        "feature_rows": len(feature_df),
        "noise_statistics": {
            "explanation_noise_points": n_noise_explanations,
            "feature_noise_points": n_noise_features,
            "total_noise_points": len(noise_mask)
        },
        "schema": {col: str(dtype) for col, dtype in zip(combined_df.columns, combined_df.dtypes)},
        "config_used": config
    }

    metadata_file = output_dir / f"{config['output_filename']}.metadata.json"
    with open(metadata_file, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
    print(f"✓ Saved metadata to {metadata_file}")


def main():
    """Main function."""
    parser = argparse.ArgumentParser(
        description="Create unified UMAP projections parquet file"
    )
    parser.add_argument(
        "--config",
        default="../config/umap_parquet_config.json",
        help="Path to configuration file"
    )
    args = parser.parse_args()

    # Get project root (3 levels up from scripts directory)
    script_dir = Path(__file__).parent
    project_root = script_dir.parent.parent.parent

    # Load configuration
    config_path = script_dir / args.config
    if not config_path.exists():
        print(f"Error: Config file not found: {config_path}")
        sys.exit(1)

    print(f"Loading config from: {config_path}")
    config = load_json(config_path)

    try:
        create_umap_parquet(config, project_root)
        print("\n" + "=" * 80)
        print("SUCCESS: UMAP parquet created successfully!")
        print("=" * 80)

    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
