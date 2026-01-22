"""
Logging configuration for the SAE preprocessing pipeline.

Provides consistent logging setup across all preprocessing steps.
"""

import logging
import sys
from pathlib import Path
from typing import Optional
from datetime import datetime


# Module-level logger cache
_loggers: dict = {}


def setup_logging(
    level: int = logging.INFO,
    format_string: Optional[str] = None,
    log_file: Optional[Path] = None,
    name: Optional[str] = None
) -> logging.Logger:
    """Configure logging for the pipeline.

    Sets up console logging with optional file logging.

    Args:
        level: Logging level (default: INFO)
        format_string: Custom format string (optional)
        log_file: Optional path to log file
        name: Logger name (default: root logger)

    Returns:
        Configured logger instance
    """
    if format_string is None:
        format_string = '%(asctime)s - %(levelname)s - %(message)s'

    # Get or create logger
    logger = logging.getLogger(name)
    logger.setLevel(level)

    # Clear existing handlers to avoid duplicates
    logger.handlers.clear()

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    console_handler.setFormatter(logging.Formatter(format_string))
    logger.addHandler(console_handler)

    # File handler (optional)
    if log_file is not None:
        log_file = Path(log_file)
        log_file.parent.mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(log_file)
        file_handler.setLevel(level)
        file_handler.setFormatter(logging.Formatter(format_string))
        logger.addHandler(file_handler)

    return logger


def get_logger(name: str) -> logging.Logger:
    """Get a logger instance with the given name.

    Caches loggers to avoid reconfiguration.

    Args:
        name: Logger name (typically __name__ of the calling module)

    Returns:
        Logger instance
    """
    if name not in _loggers:
        _loggers[name] = logging.getLogger(name)
    return _loggers[name]


class StepLogger:
    """Context manager for logging step execution with timing."""

    def __init__(self, step_name: str, logger: Optional[logging.Logger] = None):
        """Initialize step logger.

        Args:
            step_name: Name of the step being executed
            logger: Logger instance (uses root logger if not provided)
        """
        self.step_name = step_name
        self.logger = logger or logging.getLogger()
        self.start_time: Optional[datetime] = None

    def __enter__(self):
        """Start step execution logging."""
        self.start_time = datetime.now()
        self.logger.info("=" * 80)
        self.logger.info(f"Starting: {self.step_name}")
        self.logger.info("=" * 80)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """End step execution logging with duration."""
        duration = datetime.now() - self.start_time if self.start_time else None
        duration_str = f" (took {duration})" if duration else ""

        if exc_type is not None:
            self.logger.error(f"Failed: {self.step_name}{duration_str}")
            self.logger.error(f"Error: {exc_val}")
        else:
            self.logger.info("=" * 80)
            self.logger.info(f"Completed: {self.step_name}{duration_str}")
            self.logger.info("=" * 80)

        return False  # Don't suppress exceptions
