"""
Base processor class for SAE preprocessing pipeline steps.

Provides common functionality for loading configs, resolving paths,
processing data, and saving outputs with metadata.
"""

import json
import logging
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import polars as pl

from .paths import find_project_root, resolve_path, ensure_dir
from .metadata import generate_metadata, save_metadata
from .logging import StepLogger


class BaseProcessor(ABC):
    """Abstract base class for preprocessing steps.

    Provides common functionality:
    - Configuration loading and path resolution
    - Project root detection
    - Statistics tracking
    - DataFrame creation and saving with metadata
    - Logging integration

    Subclasses must implement:
    - process(): Main processing logic
    - step_name: Property returning the step name
    - version: Property returning the version string
    """

    def __init__(
        self,
        config: Dict[str, Any],
        feature_limit: Optional[int] = None,
        project_root: Optional[Path] = None
    ):
        """Initialize the processor.

        Args:
            config: Configuration dictionary
            feature_limit: Optional limit on number of features to process
            project_root: Optional project root (auto-detected if not provided)
        """
        self.config = config
        self.feature_limit = feature_limit

        # Detect project root
        if project_root is not None:
            self.project_root = Path(project_root)
        else:
            self.project_root = find_project_root()

        # Initialize logger
        self.logger = logging.getLogger(self.__class__.__name__)

        # Statistics tracking
        self.stats: Dict[str, Any] = {}

        # Initialize paths from config
        self._init_paths()

    @property
    @abstractmethod
    def step_name(self) -> str:
        """Return the step name for logging and metadata."""
        pass

    @property
    @abstractmethod
    def version(self) -> str:
        """Return the version string for metadata."""
        pass

    def _init_paths(self) -> None:
        """Initialize input/output paths from configuration.

        Override in subclasses to set up specific paths.
        Default implementation looks for common config patterns.
        """
        # Common path patterns in configs
        self.sae_id = self.config.get("sae_id", "")

        # Try to get output path from various config patterns
        output_files = self.config.get("output_files", {})
        if "output_path" in self.config:
            self.output_path = self._resolve_path(self.config["output_path"])
        elif output_files:
            # Take first output file as primary
            first_key = list(output_files.keys())[0]
            self.output_path = self._resolve_path(output_files[first_key])
        else:
            self.output_path = None

    def _resolve_path(self, path_str: Union[str, Path]) -> Path:
        """Resolve a path relative to project root.

        Args:
            path_str: Path string or Path object

        Returns:
            Resolved absolute Path
        """
        return resolve_path(path_str, project_root=self.project_root)

    def _ensure_output_dir(self) -> None:
        """Ensure the output directory exists."""
        if self.output_path is not None:
            ensure_dir(self.output_path.parent)

    @abstractmethod
    def process(self) -> pl.DataFrame:
        """Execute the main processing logic.

        Returns:
            Processed DataFrame

        Raises:
            Subclass-specific exceptions for processing errors
        """
        pass

    def run(self) -> pl.DataFrame:
        """Run the full processing pipeline with logging.

        This is the main entry point that wraps process() with
        logging and error handling.

        Returns:
            Processed DataFrame
        """
        with StepLogger(self.step_name, self.logger):
            # Process
            df = self.process()

            # Save output
            if self.output_path is not None:
                self.save_parquet(df)

            # Log statistics
            self._log_stats()

            return df

    def save_parquet(self, df: pl.DataFrame) -> None:
        """Save DataFrame to parquet with metadata.

        Args:
            df: DataFrame to save
        """
        if self.output_path is None:
            raise ValueError("No output path configured")

        self._ensure_output_dir()

        self.logger.info(f"Saving parquet to {self.output_path}")
        df.write_parquet(self.output_path)

        # Generate and save metadata
        metadata = generate_metadata(
            df=df,
            step_name=self.step_name,
            version=self.version,
            config=self.config,
            stats=self.stats,
            sae_id=self.sae_id
        )

        metadata_path = save_metadata(metadata, self.output_path)
        self.logger.info(f"Saved metadata to {metadata_path}")
        self.logger.info(f"Successfully created parquet with {len(df):,} rows")

    def _log_stats(self) -> None:
        """Log processing statistics.

        Override in subclasses for custom stat logging.
        """
        if not self.stats:
            return

        self.logger.info("Statistics:")
        for key, value in self.stats.items():
            if isinstance(value, int):
                self.logger.info(f"  {key}: {value:,}")
            elif isinstance(value, float):
                self.logger.info(f"  {key}: {value:.4f}")
            else:
                self.logger.info(f"  {key}: {value}")

    def create_empty_dataframe(self, schema: Dict[str, pl.DataType]) -> pl.DataFrame:
        """Create an empty DataFrame with the given schema.

        Args:
            schema: Dictionary mapping column names to Polars dtypes

        Returns:
            Empty DataFrame with proper schema
        """
        self.logger.info("Creating empty DataFrame with schema")
        return pl.DataFrame(schema=schema)


def load_config(config_path: Union[str, Path]) -> Dict[str, Any]:
    """Load configuration from a JSON file.

    Args:
        config_path: Path to configuration file

    Returns:
        Configuration dictionary

    Raises:
        FileNotFoundError: If config file doesn't exist
    """
    config_path = Path(config_path)

    if not config_path.is_absolute():
        # Try relative to current directory first
        if not config_path.exists():
            # Try relative to script directory
            script_dir = Path(__file__).parent.parent
            config_path = script_dir / config_path

    if not config_path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")

    with open(config_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_yaml_config(config_path: Union[str, Path]) -> Dict[str, Any]:
    """Load configuration from a YAML file.

    Args:
        config_path: Path to configuration file

    Returns:
        Configuration dictionary

    Raises:
        FileNotFoundError: If config file doesn't exist
    """
    import yaml

    config_path = Path(config_path)

    if not config_path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")

    with open(config_path, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)


def resolve_variables(config: Dict[str, Any]) -> Dict[str, Any]:
    """Resolve ${variable} references in configuration.

    Supports:
    - ${input}, ${intermediate}, ${output} - path shortcuts
    - ${sae_id_sanitized} - sanitized SAE ID
    - ${global.key} - global config values

    Args:
        config: Raw configuration dictionary

    Returns:
        Configuration with variables resolved
    """
    import re

    global_config = config.get("global", {})
    paths = global_config.get("paths", {})

    # Build variable mapping
    variables = {
        "input": paths.get("input", "data/input"),
        "intermediate": paths.get("intermediate", "data/intermediate"),
        "output": paths.get("output", "data/output"),
        "master": paths.get("master", "data/master"),
        "feature_similarity": paths.get("feature_similarity", "data/feature_similarity"),
        "scores": paths.get("scores", "data/scores"),
        "sae_id": global_config.get("sae_id", ""),
        "sae_id_sanitized": global_config.get("sae_id_sanitized", ""),
    }

    def resolve_string(s: str) -> str:
        """Resolve variables in a string."""
        if not isinstance(s, str):
            return s

        for var_name, var_value in variables.items():
            s = s.replace(f"${{{var_name}}}", str(var_value))

        # Handle global references like ${global.data_sources}
        if "${global." in s:
            for match in re.finditer(r'\$\{global\.([^}]+)\}', s):
                key = match.group(1)
                value = global_config.get(key, "")
                s = s.replace(match.group(0), str(value))

        return s

    def resolve_dict(d: Dict) -> Dict:
        """Recursively resolve variables in a dictionary."""
        result = {}
        for key, value in d.items():
            if isinstance(value, dict):
                result[key] = resolve_dict(value)
            elif isinstance(value, list):
                result[key] = [resolve_string(v) if isinstance(v, str) else v for v in value]
            elif isinstance(value, str):
                result[key] = resolve_string(value)
            else:
                result[key] = value
        return result

    return resolve_dict(config)
