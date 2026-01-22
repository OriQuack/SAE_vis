#!/usr/bin/env python3
"""
SAE Preprocessing Pipeline - Master Script

This script orchestrates the execution of all preprocessing steps with dependency resolution.

Usage:
    # Run full pipeline
    python data/pipeline/run.py

    # Run specific steps (with dependencies)
    python data/pipeline/run.py --steps step_06_features step_10_activation_display

    # Run from a step onwards
    python data/pipeline/run.py --from step_06_features

    # Dry run (show execution order)
    python data/pipeline/run.py --dry-run

    # Limit features for testing
    python data/pipeline/run.py --limit 100

    # List available steps
    python data/pipeline/run.py --list
"""

import argparse
import logging
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Set
from datetime import datetime

import yaml


# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global log directory
LOG_DIR = Path(__file__).parent / "logs"


def setup_step_logging(step_name: str) -> logging.FileHandler:
    """Set up file logging for a specific step.

    Args:
        step_name: Name of the step

    Returns:
        FileHandler that was added (for later removal)
    """
    LOG_DIR.mkdir(exist_ok=True)
    log_file = LOG_DIR / f"{step_name}.log"

    # Create file handler
    file_handler = logging.FileHandler(log_file, mode='w', encoding='utf-8')
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))

    # Add to root logger to capture all logs
    logging.getLogger().addHandler(file_handler)

    logger.info(f"Logging to: {log_file}")
    return file_handler


def teardown_step_logging(file_handler: logging.FileHandler) -> None:
    """Remove file handler after step completes.

    Args:
        file_handler: The handler to remove
    """
    file_handler.close()
    logging.getLogger().removeHandler(file_handler)


def find_project_root() -> Path:
    """Find the project root directory."""
    current = Path(__file__).parent
    while current.name != "interface" and current.parent != current:
        current = current.parent

    if current.name == "interface":
        return current

    raise RuntimeError("Could not find project root (looking for 'interface' directory)")


def load_config(config_path: Optional[Path] = None) -> Dict[str, Any]:
    """Load pipeline configuration from YAML file.

    Args:
        config_path: Optional path to config file (defaults to config.yaml in pipeline dir)

    Returns:
        Configuration dictionary
    """
    if config_path is None:
        config_path = Path(__file__).parent / "config.yaml"

    if not config_path.exists():
        raise FileNotFoundError(f"Configuration file not found: {config_path}")

    with open(config_path, 'r', encoding='utf-8') as f:
        config = yaml.safe_load(f)

    return config


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
            import re
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


def topological_sort(dependencies: Dict[str, List[str]]) -> List[str]:
    """Sort steps in dependency order using topological sort.

    Args:
        dependencies: Dictionary mapping step names to their dependencies

    Returns:
        List of step names in execution order

    Raises:
        ValueError: If there's a circular dependency
    """
    # Build in-degree map
    in_degree = {step: 0 for step in dependencies}
    for step, deps in dependencies.items():
        for dep in deps:
            if dep not in in_degree:
                in_degree[dep] = 0

    for step, deps in dependencies.items():
        in_degree[step] = len(deps)

    # Queue with steps that have no dependencies
    queue = [step for step, degree in in_degree.items() if degree == 0]
    result = []

    while queue:
        # Sort queue for deterministic order
        queue.sort()
        step = queue.pop(0)
        result.append(step)

        # Reduce in-degree for dependent steps
        for dependent, deps in dependencies.items():
            if step in deps:
                in_degree[dependent] -= 1
                if in_degree[dependent] == 0:
                    queue.append(dependent)

    if len(result) != len(dependencies):
        remaining = set(dependencies.keys()) - set(result)
        raise ValueError(f"Circular dependency detected involving: {remaining}")

    return result


def get_steps_to_run(
    all_steps: List[str],
    dependencies: Dict[str, List[str]],
    target_steps: Optional[List[str]] = None,
    from_step: Optional[str] = None
) -> List[str]:
    """Determine which steps to run based on targets and dependencies.

    Args:
        all_steps: All available steps in order
        dependencies: Step dependency mapping
        target_steps: Specific steps to run (with their dependencies)
        from_step: Run from this step onwards

    Returns:
        List of steps to run in order
    """
    if target_steps:
        # Collect target steps and their dependencies
        to_run: Set[str] = set()

        def add_with_deps(step: str):
            if step in to_run:
                return
            to_run.add(step)
            for dep in dependencies.get(step, []):
                add_with_deps(dep)

        for step in target_steps:
            add_with_deps(step)

        # Return in topological order
        return [s for s in all_steps if s in to_run]

    if from_step:
        # Find index of from_step and return all steps from there
        try:
            idx = all_steps.index(from_step)
            return all_steps[idx:]
        except ValueError:
            raise ValueError(f"Step '{from_step}' not found")

    # Return all steps
    return all_steps


def get_legacy_script_mapping() -> Dict[str, tuple]:
    """Map step names to legacy scripts and configs.

    Returns:
        Dictionary mapping step name to (script_path, config_path) tuples
    """
    scripts_dir = find_project_root() / "data" / "preprocessing" / "scripts"
    config_dir = find_project_root() / "data" / "preprocessing" / "config"

    return {
        "step_01_activations": (
            scripts_dir / "0_create_activation_examples_parquet.py",
            config_dir / "0_activation_examples_config.json"
        ),
        "step_02_decoder_similarity": (
            scripts_dir / "0_feature_similarities.py",
            config_dir / "0_feature_similarity_config.json"
        ),
        "step_03_scores": (
            scripts_dir / "1_scores.py",
            config_dir / "1_score_config.json"
        ),
        "step_04_explanation_embeddings": (
            scripts_dir / "2_ex_embeddings.py",
            config_dir / "2_ex_embeddings_config.json"
        ),
        "step_05_clustering": (
            scripts_dir / "2_feature_clustering.py",
            config_dir / "2_feature_clustering.json"
        ),
        "step_06_features": (
            scripts_dir / "3_features_parquet.py",
            config_dir / "3_create_features_parquet.json"
        ),
        "step_07_activation_embeddings": (
            scripts_dir / "4_act_embeddings.py",
            config_dir / "4_act_embeddings.json"
        ),
        "step_08_activation_similarity": (
            scripts_dir / "5_act_similarity.py",
            config_dir / "5_act_similarity.json"
        ),
        "step_09_interfeature_similarity": (
            scripts_dir / "5_interfeature_similarity.py",
            config_dir / "5_interfeature_similarity.json"
        ),
        "step_10_activation_display": (
            scripts_dir / "6_activation_display.py",
            config_dir / "6_activation_display.json"
        ),
        "step_11_interfeature_display": (
            scripts_dir / "6_interfeature_display.py",
            config_dir / "6_interfeature_display.json"
        ),
        "step_12_explanation_alignment": (
            scripts_dir / "7_explanation_alignment.py",
            config_dir / "7_explanation_alignment.json"
        ),
        "step_13_svm_metrics": (
            scripts_dir / "9_explanation_embedding_barycentric.py",
            config_dir / "9_explanation_embedding_barycentric.json"
        ),
    }


def run_legacy_step(step_name: str, limit: Optional[int] = None) -> bool:
    """Run a step using its legacy script.

    Args:
        step_name: Name of the step to run
        limit: Optional feature limit for testing

    Returns:
        True if successful, False otherwise
    """
    mapping = get_legacy_script_mapping()

    if step_name not in mapping:
        logger.error(f"No legacy script mapping for {step_name}")
        return False

    script_path, config_path = mapping[step_name]

    if not script_path.exists():
        logger.error(f"Legacy script not found: {script_path}")
        return False

    if not config_path.exists():
        logger.warning(f"Legacy config not found: {config_path}")
        config_path = None

    # Build command
    cmd = [sys.executable, "-u", str(script_path)]  # -u for unbuffered output

    if config_path:
        cmd.extend(["--config", str(config_path)])

    if limit is not None:
        cmd.extend(["--limit", str(limit)])

    logger.info(f"Running: {' '.join(cmd)}")

    # Get the log file path for this step
    log_file = LOG_DIR / f"{step_name}.log"

    try:
        # Run subprocess and capture output, writing to both console and log file
        with subprocess.Popen(
            cmd,
            cwd=find_project_root(),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1  # Line buffered
        ) as proc:
            # Open log file in append mode (setup_step_logging already created it)
            with open(log_file, 'a', encoding='utf-8') as f:
                if proc.stdout is not None:
                    for line in proc.stdout:
                        # Write to console
                        print(line, end='', flush=True)
                        # Write to log file
                        f.write(line)
                        f.flush()

            proc.wait()

            if proc.returncode != 0:
                logger.error(f"Step {step_name} failed with return code {proc.returncode}")
                return False

            return True

    except subprocess.CalledProcessError as e:
        logger.error(f"Step {step_name} failed with return code {e.returncode}")
        return False
    except Exception as e:
        logger.error(f"Error running {step_name}: {e}")
        return False


def get_refactored_steps() -> Set[str]:
    """Get the set of steps that have been refactored to the new architecture.

    Returns:
        Set of step names with new implementations
    """
    return {
        "step_01_activations",
        "step_02_decoder_similarity",
        "step_03_scores",
        "step_04_explanation_embeddings",
        "step_05_clustering",
        "step_06_features",
        "step_07_activation_embeddings",
        "step_08_activation_similarity",
        "step_09_interfeature_similarity",
        "step_10_activation_display",
        "step_11_interfeature_display",
        "step_12_explanation_alignment",
        "step_13_svm_metrics",
    }


def run_refactored_step(
    step_name: str,
    config: Dict[str, Any],
    limit: Optional[int] = None
) -> bool:
    """Run a step using the new refactored processor.

    Args:
        step_name: Name of the step to run
        config: Pipeline configuration
        limit: Optional feature limit for testing

    Returns:
        True if successful, False otherwise
    """
    try:
        from steps import STEP_PROCESSORS

        if step_name not in STEP_PROCESSORS:
            logger.error(f"No refactored processor for {step_name}")
            return False

        processor_class = STEP_PROCESSORS[step_name]

        # Build step config with global settings
        step_config = config.get("steps", {}).get(step_name, {})
        step_config["sae_id"] = config.get("global", {}).get("sae_id_sanitized", "")
        step_config["global"] = config.get("global", {})

        # Create and run processor
        processor = processor_class(step_config, feature_limit=limit)
        processor.run()

        return True
    except Exception as e:
        logger.error(f"Error running refactored step {step_name}: {e}")
        import traceback
        traceback.print_exc()
        return False


def run_step(
    step_name: str,
    config: Dict[str, Any],
    limit: Optional[int] = None,
    use_legacy: bool = True
) -> bool:
    """Run a single processing step.

    Args:
        step_name: Name of the step to run
        config: Pipeline configuration
        limit: Optional feature limit
        use_legacy: Whether to use legacy scripts

    Returns:
        True if successful, False otherwise
    """
    step_config = config.get("steps", {}).get(step_name, {})

    # Check if step is enabled
    if not step_config.get("enabled", True):
        logger.info(f"Skipping disabled step: {step_name}")
        return True

    # Set up per-step file logging
    file_handler = setup_step_logging(step_name)

    logger.info("=" * 80)
    logger.info(f"Running step: {step_name}")
    logger.info("=" * 80)

    start_time = datetime.now()
    success = False

    # Check if step has been refactored
    refactored_steps = get_refactored_steps()

    try:
        if use_legacy:
            # Use legacy script
            logger.info(f"Using legacy script for {step_name}")
            success = run_legacy_step(step_name, limit)
        elif step_name in refactored_steps:
            # Use refactored step
            success = run_refactored_step(step_name, config, limit)
        else:
            logger.error(f"No processor available for {step_name}")
            success = False
    finally:
        # Always clean up the file handler
        duration = datetime.now() - start_time
        status = "SUCCESS" if success else "FAILED"

        logger.info(f"Step {step_name} {status} (took {duration})")
        logger.info("=" * 80)

        teardown_step_logging(file_handler)

    return success


def list_steps(config: Dict[str, Any]) -> None:
    """Print available steps and their dependencies.

    Args:
        config: Pipeline configuration
    """
    dependencies = config.get("dependencies", {})
    steps_config = config.get("steps", {})

    # Get execution order
    order = topological_sort(dependencies)

    print("\nAvailable steps (in execution order):")
    print("-" * 60)

    for i, step in enumerate(order, 1):
        step_cfg = steps_config.get(step, {})
        enabled = step_cfg.get("enabled", True)
        status = "" if enabled else " [DISABLED]"
        deps = dependencies.get(step, [])
        deps_str = f" <- {', '.join(deps)}" if deps else ""

        print(f"  {i:2}. {step}{status}{deps_str}")

    print("-" * 60)
    print(f"\nTotal: {len(order)} steps")

    # Show backend-required outputs
    required = config.get("backend_required", [])
    if required:
        print(f"\nBackend-required outputs ({len(required)} files):")
        for f in required:
            print(f"  - {f}")


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="SAE Preprocessing Pipeline - Master Script",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )

    parser.add_argument(
        "--config",
        type=Path,
        help="Path to configuration file (default: config.yaml)"
    )
    parser.add_argument(
        "--steps",
        nargs="+",
        help="Specific steps to run (includes dependencies)"
    )
    parser.add_argument(
        "--from",
        dest="from_step",
        help="Run from this step onwards"
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="Limit number of features to process (for testing)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show execution plan without running"
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List available steps"
    )
    parser.add_argument(
        "--legacy",
        action="store_true",
        help="Use legacy scripts instead of refactored steps"
    )
    parser.add_argument(
        "--no-deps",
        action="store_true",
        help="Skip dependencies when running specific steps (for testing)"
    )

    args = parser.parse_args()

    # Load configuration
    try:
        config = load_config(args.config)
        config = resolve_variables(config)
    except Exception as e:
        logger.error(f"Failed to load configuration: {e}")
        return 1

    # List steps if requested
    if args.list:
        list_steps(config)
        return 0

    # Get dependency graph and determine execution order
    dependencies = config.get("dependencies", {})
    all_steps = topological_sort(dependencies)

    # Determine which steps to run
    try:
        if args.no_deps and args.steps:
            # Skip dependency resolution - run only specified steps in order
            steps_to_run = [s for s in all_steps if s in args.steps]
            if not steps_to_run:
                # Steps not in all_steps, use as-is
                steps_to_run = args.steps
        else:
            steps_to_run = get_steps_to_run(
                all_steps,
                dependencies,
                target_steps=args.steps,
                from_step=args.from_step
            )
    except ValueError as e:
        logger.error(str(e))
        return 1

    # Filter to only enabled steps
    steps_config = config.get("steps", {})
    steps_to_run = [
        s for s in steps_to_run
        if steps_config.get(s, {}).get("enabled", True)
    ]

    # Print execution plan
    logger.info("=" * 80)
    logger.info("SAE Preprocessing Pipeline")
    logger.info("=" * 80)
    logger.info(f"Steps to run: {len(steps_to_run)}")

    for i, step in enumerate(steps_to_run, 1):
        logger.info(f"  {i}. {step}")

    if args.limit:
        logger.info(f"Feature limit: {args.limit}")

    # Dry run - just show plan
    if args.dry_run:
        logger.info("Dry run - no steps executed")
        return 0

    # Run steps
    use_legacy = args.legacy
    failed_steps = []

    for step in steps_to_run:
        success = run_step(step, config, limit=args.limit, use_legacy=use_legacy)
        if not success:
            failed_steps.append(step)
            logger.error(f"Step {step} failed, stopping pipeline")
            break

    # Summary
    logger.info("=" * 80)
    logger.info("Pipeline Summary")
    logger.info("=" * 80)

    if failed_steps:
        logger.error(f"Failed steps: {', '.join(failed_steps)}")
        return 1
    else:
        logger.info(f"All {len(steps_to_run)} steps completed successfully")
        return 0


if __name__ == "__main__":
    sys.exit(main())
