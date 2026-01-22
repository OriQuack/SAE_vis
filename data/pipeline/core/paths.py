"""
Path resolution utilities for the SAE preprocessing pipeline.

Provides consistent path resolution across all preprocessing steps.
"""

from pathlib import Path
from typing import Optional, Union


def find_project_root(marker: str = "interface") -> Path:
    """Find the project root directory by looking for a marker directory name.

    Searches upward from the current working directory until it finds
    a directory with the specified name.

    Args:
        marker: Directory name that marks the project root (default: "interface")

    Returns:
        Path to the project root directory

    Raises:
        RuntimeError: If project root cannot be found
    """
    current = Path.cwd()

    while current.name != marker and current.parent != current:
        current = current.parent

    if current.name == marker:
        return current

    # Fallback: check if we're already in a subdirectory
    if Path.cwd().name == marker:
        return Path.cwd()

    raise RuntimeError(
        f"Could not find project root (looking for '{marker}' directory). "
        f"Current directory: {Path.cwd()}"
    )


def resolve_path(
    path_str: Union[str, Path],
    project_root: Optional[Path] = None,
    base_dir: Optional[Path] = None
) -> Path:
    """Resolve a path, making it absolute if necessary.

    Resolution order:
    1. If path is already absolute, return it
    2. If base_dir provided, resolve relative to base_dir
    3. If project_root provided, resolve relative to project_root
    4. Otherwise, resolve relative to current working directory

    Args:
        path_str: Path string or Path object to resolve
        project_root: Optional project root for relative path resolution
        base_dir: Optional base directory for relative path resolution

    Returns:
        Resolved absolute Path
    """
    path = Path(path_str)

    if path.is_absolute():
        return path

    if base_dir is not None:
        return (base_dir / path).resolve()

    if project_root is not None:
        return (project_root / path).resolve()

    return path.resolve()


def ensure_dir(path: Union[str, Path]) -> Path:
    """Ensure a directory exists, creating it if necessary.

    Args:
        path: Directory path to ensure exists

    Returns:
        Path to the directory
    """
    path = Path(path)
    path.mkdir(parents=True, exist_ok=True)
    return path


def sanitize_sae_id_for_path(sae_id: str) -> str:
    """Convert SAE ID to filesystem-safe directory name.

    Replaces forward slashes with double dashes.

    Args:
        sae_id: SAE ID string (e.g., "google/gemma-scope-9b-pt-res/layer_30/...")

    Returns:
        Sanitized string safe for use in file paths
    """
    return sae_id.replace("/", "--")


def get_pipeline_paths(project_root: Optional[Path] = None) -> dict:
    """Get standard pipeline directory paths.

    Args:
        project_root: Optional project root (auto-detected if not provided)

    Returns:
        Dictionary with keys: raw, intermediate, output, pipeline
    """
    if project_root is None:
        project_root = find_project_root()

    return {
        "raw": project_root / "data" / "raw",
        "intermediate": project_root / "data" / "intermediate",
        "output": project_root / "data" / "output",
        "pipeline": project_root / "data" / "pipeline",
        "master": project_root / "data" / "master",  # Legacy path for transition
    }
