#!/usr/bin/env python3
"""
Master Pipeline Runner for SAE Feature Analysis Data Processing

This script runs all preprocessing scripts in the correct dependency order.
You can easily enable/disable specific steps by modifying the PIPELINE_STEPS list.

Dependency Order:
1. process_scores.py - Processes raw scores (independent)
2. generate_embeddings.py - Generates embeddings from explanations (independent)
3. calculate_semantic_distances.py - Requires embeddings from step 2
4. calculate_feature_similarities.py - Computes feature similarities (independent)
5. generate_umap_features.py - Generates UMAP for SAE features (optional)
6. generate_umap_explanations.py - Generates UMAP for explanations (optional)
7. generate_detailed_json.py - Requires embeddings, scores, and distances
8. create_master_parquet.py - Requires detailed JSON and feature similarities

Usage:
    python run_pipeline.py [--steps STEP1,STEP2,...]
    python run_pipeline.py --help

Examples:
    # Run full pipeline
    python run_pipeline.py

    # Run only specific steps
    python run_pipeline.py --steps scores,embeddings,distances

    # Run final steps only (assuming earlier steps completed)
    python run_pipeline.py --steps detailed_json,master_parquet
"""

import argparse
import subprocess
import sys
from pathlib import Path
from typing import List, Dict, Optional
from datetime import datetime


# =============================================================================
# PIPELINE CONFIGURATION
# =============================================================================
# You can modify this list to enable/disable specific steps

PIPELINE_STEPS = [
    # -------------------------------------------------------------------------
    # STEP 1: Score Processing (Independent)
    # -------------------------------------------------------------------------
    {
        "name": "scores_llama",
        "script": "process_scores.py",
        "config": "../config/score_config.json",
        "description": "Process scores for llama_e-llama_s data source",
        "enabled": True,
        "required_for": ["detailed_json", "master_parquet"]
    },
    {
        "name": "scores_gwen",
        "script": "process_scores.py",
        "config": "../config/gwen_score_config.json",  # Assuming this exists
        "description": "Process scores for gwen_e-llama_s data source",
        "enabled": False,  # Enable if you have gwen score config
        "required_for": ["detailed_json", "master_parquet"]
    },

    # -------------------------------------------------------------------------
    # STEP 2: Embedding Generation (Independent)
    # -------------------------------------------------------------------------
    {
        "name": "embeddings_llama",
        "script": "generate_embeddings.py",
        "config": "../config/embedding_config.json",
        "description": "Generate embeddings for llama_e-llama_s explanations",
        "enabled": True,
        "required_for": ["distances", "umap_explanations", "detailed_json"]
    },
    {
        "name": "embeddings_gwen",
        "script": "generate_embeddings.py",
        "config": "../config/gwen_embedding_config.json",  # Assuming this exists
        "description": "Generate embeddings for gwen_e-llama_s explanations",
        "enabled": False,  # Enable if you have gwen embedding config
        "required_for": ["distances", "umap_explanations", "detailed_json"]
    },

    # -------------------------------------------------------------------------
    # STEP 3: Semantic Distance Calculation (Requires embeddings)
    # -------------------------------------------------------------------------
    {
        "name": "distances",
        "script": "calculate_semantic_distances.py",
        "config": "../config/semantic_distance_config.json",
        "description": "Calculate semantic distances between explanation embeddings",
        "enabled": True,
        "depends_on": ["embeddings_llama", "embeddings_gwen"],
        "required_for": ["detailed_json"]
    },

    # -------------------------------------------------------------------------
    # STEP 4: Feature Similarity Calculation (Independent)
    # -------------------------------------------------------------------------
    {
        "name": "feature_similarities",
        "script": "calculate_feature_similarities.py",
        "config": "../config/feature_similarity_config.json",
        "description": "Calculate SAE feature cosine similarities",
        "enabled": True,
        "required_for": ["master_parquet"]
    },

    # -------------------------------------------------------------------------
    # STEP 5: UMAP Generation (Optional visualization steps)
    # -------------------------------------------------------------------------
    {
        "name": "umap_features",
        "script": "generate_umap_features.py",
        "config": "../config/umap_config.json",
        "description": "Generate UMAP embeddings for SAE feature vectors",
        "enabled": False,  # Optional - enable if you need UMAP visualizations
        "required_for": []
    },
    {
        "name": "umap_explanations",
        "script": "generate_umap_explanations.py",
        "config": "../config/umap_explanations_config.json",
        "description": "Generate UMAP embeddings for explanation embeddings",
        "enabled": False,  # Optional - enable if you need UMAP visualizations
        "depends_on": ["embeddings_llama", "embeddings_gwen"],
        "required_for": []
    },

    # -------------------------------------------------------------------------
    # STEP 6: Detailed JSON Consolidation (Requires embeddings, scores, distances)
    # -------------------------------------------------------------------------
    {
        "name": "detailed_json",
        "script": "generate_detailed_json.py",
        "config": "../config/detailed_json_config.json",
        "description": "Consolidate all data into detailed JSON per feature",
        "enabled": True,
        "depends_on": ["scores_llama", "embeddings_llama", "distances"],
        "required_for": ["master_parquet"]
    },

    # -------------------------------------------------------------------------
    # STEP 7: Master Parquet Creation (Requires detailed JSON and feature similarities)
    # -------------------------------------------------------------------------
    {
        "name": "master_parquet",
        "script": "create_master_parquet.py",
        "config": "../config/master_parquet_config.json",
        "description": "Create master parquet file from detailed JSON",
        "enabled": True,
        "depends_on": ["detailed_json", "feature_similarities"],
        "required_for": []
    },
]


# =============================================================================
# PIPELINE RUNNER
# =============================================================================

class PipelineRunner:
    """Runs the data preprocessing pipeline with dependency management."""

    def __init__(self, steps_to_run: Optional[List[str]] = None):
        self.script_dir = Path(__file__).parent
        self.steps_to_run = set(steps_to_run) if steps_to_run else None
        self.completed_steps = set()
        self.failed_steps = []
        self.skipped_steps = []

    def should_run_step(self, step: Dict) -> tuple[bool, str]:
        """
        Determine if a step should be run.

        Returns:
            (should_run, reason)
        """
        # Check if step is enabled
        if not step["enabled"]:
            return False, "Step is disabled in configuration"

        # Check if specific steps were requested
        if self.steps_to_run is not None and step["name"] not in self.steps_to_run:
            return False, "Step not in requested steps list"

        # Check dependencies
        dependencies = step.get("depends_on", [])
        for dep in dependencies:
            if dep not in self.completed_steps:
                return False, f"Missing dependency: {dep}"

        # Check if config file exists
        config_path = self.script_dir / step["config"]
        if not config_path.exists():
            return False, f"Config file not found: {config_path}"

        return True, "Ready to run"

    def run_step(self, step: Dict) -> bool:
        """
        Run a single pipeline step.

        Returns:
            True if successful, False otherwise
        """
        script_path = self.script_dir / step["script"]
        config_path = self.script_dir / step["config"]

        if not script_path.exists():
            print(f"  ERROR: Script not found: {script_path}")
            return False

        print(f"\n{'='*80}")
        print(f"Running: {step['name']}")
        print(f"Description: {step['description']}")
        print(f"Script: {step['script']}")
        print(f"Config: {step['config']}")
        print(f"{'='*80}\n")

        # Run the script
        try:
            cmd = [
                sys.executable,
                str(script_path),
                "--config",
                str(config_path)
            ]

            result = subprocess.run(
                cmd,
                cwd=str(self.script_dir),
                check=True,
                text=True,
                capture_output=False  # Show output in real-time
            )

            print(f"\n✓ {step['name']} completed successfully")
            return True

        except subprocess.CalledProcessError as e:
            print(f"\n✗ {step['name']} failed with exit code {e.returncode}")
            return False
        except Exception as e:
            print(f"\n✗ {step['name']} failed with error: {e}")
            return False

    def run_pipeline(self) -> bool:
        """
        Run the full pipeline with dependency management.

        Returns:
            True if all steps completed successfully, False otherwise
        """
        start_time = datetime.now()
        print("\n" + "="*80)
        print("SAE FEATURE ANALYSIS PIPELINE")
        print("="*80)
        print(f"Start time: {start_time.strftime('%Y-%m-%d %H:%M:%S')}")

        # Filter and sort steps
        enabled_steps = [s for s in PIPELINE_STEPS if s["enabled"]]

        # If specific steps requested, filter further
        if self.steps_to_run:
            print(f"\nRunning specific steps: {', '.join(self.steps_to_run)}")
            # Also include dependencies
            steps_with_deps = set(self.steps_to_run)
            for step_name in list(steps_with_deps):
                step = next((s for s in PIPELINE_STEPS if s["name"] == step_name), None)
                if step:
                    steps_with_deps.update(step.get("depends_on", []))
            enabled_steps = [s for s in enabled_steps if s["name"] in steps_with_deps]

        print(f"\nTotal steps to process: {len(enabled_steps)}")

        # Run steps in order
        for i, step in enumerate(enabled_steps, 1):
            should_run, reason = self.should_run_step(step)

            if not should_run:
                print(f"\n[{i}/{len(enabled_steps)}] SKIPPED: {step['name']} - {reason}")
                self.skipped_steps.append((step['name'], reason))
                continue

            print(f"\n[{i}/{len(enabled_steps)}] STARTING: {step['name']}")

            success = self.run_step(step)

            if success:
                self.completed_steps.add(step['name'])
            else:
                self.failed_steps.append(step['name'])
                print(f"\n{'='*80}")
                print(f"PIPELINE FAILED at step: {step['name']}")
                print(f"{'='*80}")
                return False

        # Print summary
        end_time = datetime.now()
        duration = end_time - start_time

        print("\n" + "="*80)
        print("PIPELINE SUMMARY")
        print("="*80)
        print(f"Start time: {start_time.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"End time: {end_time.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"Duration: {duration}")
        print(f"\nCompleted steps: {len(self.completed_steps)}")
        for step_name in self.completed_steps:
            print(f"  ✓ {step_name}")

        if self.skipped_steps:
            print(f"\nSkipped steps: {len(self.skipped_steps)}")
            for step_name, reason in self.skipped_steps:
                print(f"  - {step_name}: {reason}")

        if self.failed_steps:
            print(f"\nFailed steps: {len(self.failed_steps)}")
            for step_name in self.failed_steps:
                print(f"  ✗ {step_name}")
            print("\n" + "="*80)
            return False

        print("\n✓ PIPELINE COMPLETED SUCCESSFULLY!")
        print("="*80 + "\n")
        return True

    def list_steps(self):
        """List all available pipeline steps."""
        print("\n" + "="*80)
        print("AVAILABLE PIPELINE STEPS")
        print("="*80 + "\n")

        for step in PIPELINE_STEPS:
            status = "ENABLED" if step["enabled"] else "DISABLED"
            print(f"{step['name']:25} [{status:8}]")
            print(f"  Script: {step['script']}")
            print(f"  Config: {step['config']}")
            print(f"  Description: {step['description']}")

            if step.get("depends_on"):
                print(f"  Depends on: {', '.join(step['depends_on'])}")
            if step.get("required_for"):
                print(f"  Required for: {', '.join(step['required_for'])}")
            print()


def main():
    """Main entry point for the pipeline runner."""
    parser = argparse.ArgumentParser(
        description="Run the SAE feature analysis data preprocessing pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Run full pipeline
  python run_pipeline.py

  # List all available steps
  python run_pipeline.py --list

  # Run only specific steps (dependencies will be included automatically)
  python run_pipeline.py --steps scores_llama,embeddings_llama,detailed_json

  # Run final consolidation steps only
  python run_pipeline.py --steps detailed_json,master_parquet
        """
    )

    parser.add_argument(
        "--steps",
        help="Comma-separated list of specific steps to run (e.g., 'scores,embeddings,distances')",
        type=str
    )

    parser.add_argument(
        "--list",
        action="store_true",
        help="List all available pipeline steps and exit"
    )

    args = parser.parse_args()

    # Parse steps if provided
    steps_to_run = None
    if args.steps:
        steps_to_run = [s.strip() for s in args.steps.split(",")]

    # Create runner
    runner = PipelineRunner(steps_to_run)

    # List steps if requested
    if args.list:
        runner.list_steps()
        return 0

    # Run pipeline
    success = runner.run_pipeline()
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
