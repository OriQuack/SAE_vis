"""
Metadata generation and saving utilities for the SAE preprocessing pipeline.

Provides consistent metadata handling across all preprocessing steps.
"""

import json
from pathlib import Path
from datetime import datetime
from typing import Any, Dict, Optional, Union
import polars as pl


def generate_metadata(
    df: pl.DataFrame,
    step_name: str,
    version: str,
    config: Dict[str, Any],
    stats: Optional[Dict[str, Any]] = None,
    sae_id: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Generate standard metadata for a processing step.

    Args:
        df: Output DataFrame
        step_name: Name of the processing step
        version: Script version string
        config: Configuration used for processing
        stats: Optional processing statistics
        sae_id: Optional SAE identifier
        extra: Optional additional metadata fields

    Returns:
        Metadata dictionary
    """
    metadata = {
        "created_at": datetime.now().isoformat(),
        "step_name": step_name,
        "script_version": version,
        "total_rows": len(df),
        "schema": {col: str(df[col].dtype) for col in df.columns},
    }

    if sae_id is not None:
        metadata["sae_id"] = sae_id

    if stats is not None:
        metadata["processing_stats"] = stats

    # Add result statistics from DataFrame
    if len(df) > 0:
        metadata["result_stats"] = _compute_result_stats(df)

    metadata["config_used"] = config

    if extra is not None:
        metadata.update(extra)

    return metadata


def _compute_result_stats(df: pl.DataFrame) -> Dict[str, Any]:
    """Compute common result statistics from DataFrame.

    Args:
        df: DataFrame to analyze

    Returns:
        Dictionary of result statistics
    """
    stats = {}

    # Count unique values for common key columns
    for col in ["feature_id", "sae_id"]:
        if col in df.columns:
            stats[f"unique_{col}s"] = df[col].n_unique()

    # Count non-null values for nullable columns
    for col in df.columns:
        null_count = df[col].null_count()
        if null_count > 0:
            stats[f"{col}_null_count"] = int(null_count)

    return stats


def save_metadata(
    metadata: Dict[str, Any],
    output_path: Union[str, Path],
    suffix: str = ".metadata.json"
) -> Path:
    """Save metadata to a JSON file.

    Args:
        metadata: Metadata dictionary to save
        output_path: Path to the output file (metadata file will be created alongside)
        suffix: Suffix for metadata file (default: .metadata.json)

    Returns:
        Path to the saved metadata file
    """
    output_path = Path(output_path)

    # Create metadata path by adding suffix
    if output_path.suffix == ".parquet":
        metadata_path = output_path.with_suffix(f".parquet{suffix}")
    else:
        metadata_path = output_path.with_suffix(suffix)

    # Ensure directory exists
    metadata_path.parent.mkdir(parents=True, exist_ok=True)

    # Write metadata
    with open(metadata_path, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2, default=str)

    return metadata_path


def load_metadata(path: Union[str, Path]) -> Dict[str, Any]:
    """Load metadata from a JSON file.

    Args:
        path: Path to metadata file

    Returns:
        Metadata dictionary

    Raises:
        FileNotFoundError: If metadata file doesn't exist
    """
    path = Path(path)

    if not path.exists():
        raise FileNotFoundError(f"Metadata file not found: {path}")

    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)
