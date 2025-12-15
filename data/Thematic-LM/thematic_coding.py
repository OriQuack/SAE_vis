#!/usr/bin/env python3
"""
Thematic-LM Coding Stage: Generate semantic codes from SAE feature explanations.

This script implements the coding stage of the Thematic-LM paper using AutoGen
framework for multi-agent orchestration.

Architecture (following paper Section 3.1):
    Text → [Coder₁ + Coder₂ + ...] → Aggregator → Reviewer → Codebook

Key paper-compliant behaviors:
- Uses AutoGen framework (paper requirement)
- ALL codes go through reviewer (no threshold-based skipping)
- Reviewer merge_codes empty → add as new
- Reviewer merge_codes non-empty → merge with existing
- Default: gpt-4o-mini, single coder, temperature=1.0, top_p=1.0

Reference: Qiao et al. "Thematic-LM: A LLM-based Multi-agent System for
Large-scale Thematic Analysis" (WWW '25)
"""

import argparse
import json
import logging
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

# Add script directory to path for imports
script_dir = Path(__file__).parent.resolve()
if str(script_dir) not in sys.path:
    sys.path.insert(0, str(script_dir))

import polars as pl
from tqdm import tqdm

from codebook_manager import CodebookManager
from autogen_pipeline import ThematicLMPipeline

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def load_config(config_path: Path) -> Dict:
    """Load configuration from JSON file."""
    with open(config_path, 'r') as f:
        return json.load(f)


def find_project_root() -> Path:
    """Find the project root directory."""
    current = Path(__file__).parent
    while current != current.parent:
        if (current / "CLAUDE.md").exists():
            return current
        current = current.parent
    return Path(__file__).parent.parent.parent


def load_explanations(config: Dict, project_root: Path, limit: Optional[int] = None) -> pl.DataFrame:
    """Load explanations from parquet file."""
    input_path = project_root / config["input_paths"]["explanation_embeddings_path"]
    logger.info(f"Loading explanations from: {input_path}")

    df = pl.read_parquet(input_path)

    if limit is not None:
        unique_features = sorted(df["feature_id"].unique().to_list())[:limit]
        df = df.filter(pl.col("feature_id").is_in(unique_features))
        logger.info(f"Limited to {limit} features ({len(df)} rows)")

    logger.info(f"Loaded {len(df)} explanations for {df['feature_id'].n_unique()} features")
    return df


def save_checkpoint(
    results: List[Dict],
    codebook: CodebookManager,
    checkpoint_dir: Path,
    checkpoint_num: int
):
    """Save checkpoint for resumability."""
    checkpoint_dir.mkdir(parents=True, exist_ok=True)

    results_path = checkpoint_dir / f"checkpoint_{checkpoint_num}_results.json"
    with open(results_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False)

    codebook_path = checkpoint_dir / f"checkpoint_{checkpoint_num}_codebook.json"
    codebook.save(codebook_path)

    logger.info(f"Saved checkpoint {checkpoint_num}: {len(results)} results, {len(codebook)} codes")


def load_checkpoint(checkpoint_path: Path, codebook: CodebookManager) -> tuple[List[Dict], set]:
    """Load checkpoint to resume processing."""
    checkpoints = sorted(checkpoint_path.glob("checkpoint_*_results.json"))
    if not checkpoints:
        return [], set()

    latest = checkpoints[-1]
    checkpoint_num = int(latest.stem.split("_")[1])

    with open(latest, 'r', encoding='utf-8') as f:
        results = json.load(f)

    codebook_path = checkpoint_path / f"checkpoint_{checkpoint_num}_codebook.json"
    if codebook_path.exists():
        codebook.load(codebook_path)

    processed_ids = {(r["feature_id"], r["llm_explainer"]) for r in results}
    logger.info(f"Loaded checkpoint {checkpoint_num}: {len(results)} results, {len(codebook)} codes")

    return results, processed_ids


def save_parquet(results: List[Dict], output_path: Path, config: Dict):
    """Save results to parquet file."""
    # Convert codes to serializable format
    serializable_results = []
    for r in results:
        result = {
            "feature_id": r["feature_id"],
            "llm_explainer": r["llm_explainer"],
            "explanation_text": r["explanation_text"],
            "codes": json.dumps([{
                "code_id": c.code_id,
                "code_text": c.code_text,
                "quotes": c.quotes,
                "is_new": c.is_new,
                "merged_with": c.merged_with,
            } for c in r["codes"]]),
            "coding_metadata": json.dumps(r["coding_metadata"]),
        }
        serializable_results.append(result)

    df = pl.DataFrame(serializable_results)

    df = df.with_columns([
        pl.col("feature_id").cast(pl.UInt32),
        pl.col("llm_explainer").cast(pl.Categorical),
    ])

    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.write_parquet(output_path)

    metadata = {
        "created_at": datetime.now().isoformat(),
        "total_rows": len(df),
        "unique_features": df["feature_id"].n_unique(),
        "unique_explainers": df["llm_explainer"].n_unique(),
        "schema": {col: str(df[col].dtype) for col in df.columns},
        "config_used": config,
        "paper": "Qiao et al. Thematic-LM (WWW '25)"
    }

    metadata_path = output_path.with_suffix('.parquet.metadata.json')
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)

    logger.info(f"Saved {len(df)} rows to {output_path}")


def main():
    """Main entry point for thematic coding."""
    parser = argparse.ArgumentParser(
        description="Generate semantic codes from SAE feature explanations (Thematic-LM with AutoGen)"
    )
    parser.add_argument(
        "--config",
        default="config.json",
        help="Path to configuration file"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit number of features to process (for testing)"
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Resume from checkpoint"
    )
    args = parser.parse_args()

    # Setup paths
    script_dir = Path(__file__).parent
    project_root = find_project_root()

    # Load configuration
    config_path = script_dir / args.config
    if not config_path.exists():
        logger.error(f"Config file not found: {config_path}")
        sys.exit(1)

    config = load_config(config_path)
    logger.info(f"Loaded config from: {config_path}")

    # Initialize Codebook Manager
    embedding_config = config.get("embedding_config", {})

    codebook = CodebookManager(
        embedding_model=embedding_config.get("model", "google/embeddinggemma-300m"),
        device=embedding_config.get("device", "cuda"),
        max_example_quotes=config.get("processing_config", {}).get("max_quotes_per_code", 20)
    )

    # Initialize AutoGen Pipeline
    pipeline = ThematicLMPipeline(config=config, codebook=codebook)
    logger.info(f"Initialized AutoGen pipeline with {len(pipeline.coders)} coder(s)")

    # Load data
    df = load_explanations(config, project_root, args.limit)

    # Resume from checkpoint if requested
    checkpoint_dir = script_dir / "checkpoints"
    results = []
    processed_ids = set()

    if args.resume:
        results, processed_ids = load_checkpoint(checkpoint_dir, codebook)

    # Filter out already processed
    if processed_ids:
        df = df.filter(
            ~pl.struct(["feature_id", "llm_explainer"]).is_in(
                [{"feature_id": fid, "llm_explainer": exp} for fid, exp in processed_ids]
            )
        )
        logger.info(f"Resuming: {len(df)} explanations remaining")

    # Processing configuration
    batch_size = config["processing_config"].get("batch_size", 10)
    checkpoint_every = config["processing_config"].get("checkpoint_every", 500)

    # Print banner
    print("=" * 80)
    print(f"Thematic-LM Coding Stage (AutoGen) - Batch Processing")
    print(f"  Paper: Qiao et al. WWW '25")
    print(f"  Model: {config['llm_config'].get('model', 'gpt-4o-mini')}")
    print(f"  Coders: {len(pipeline.coders)} ({', '.join(c.name for c in pipeline.coders)})")
    print(f"  Total explanations: {len(df)}")
    print(f"  Batch size: {batch_size}")
    print("=" * 80)

    # Process explanations in batches (per paper Section 3.1 and Figure 2)
    logger.info(f"Processing {len(df)} explanations in batches of {batch_size}...")

    failed = 0
    rows = list(df.iter_rows(named=True))
    num_batches = (len(rows) + batch_size - 1) // batch_size

    for batch_idx in tqdm(range(num_batches), desc="Batches"):
        batch_start = batch_idx * batch_size
        batch_end = min(batch_start + batch_size, len(rows))
        batch_rows = rows[batch_start:batch_end]

        # Prepare batch for pipeline
        batch = [
            {
                "explanation_text": row["explanation_text"],
                "quote_id": f"f{row['feature_id']}_{row['llm_explainer']}",
                "feature_id": row["feature_id"],
                "llm_explainer": row["llm_explainer"],
            }
            for row in batch_rows
        ]

        try:
            # Process batch through AutoGen pipeline
            # Per paper: Batch → Coders → Aggregator → Reviewer → Codebook
            batch_results = pipeline.process_batch(batch)

            # Add results
            for result, row in zip(batch_results, batch_rows):
                results.append({
                    "feature_id": result.feature_id,
                    "llm_explainer": result.llm_explainer,
                    "explanation_text": result.explanation_text,
                    "codes": result.codes,
                    "coding_metadata": {
                        "coder_model": config["llm_config"]["model"],
                        "num_coders": len(pipeline.coders),
                        "coder_ids": result.coder_ids,
                        "timestamp": datetime.now().isoformat(),
                        "codebook_version": codebook.version,
                        "framework": "autogen",
                        "batch_processing": True,
                        "batch_size": batch_size
                    }
                })

            # Checkpoint periodically
            stats = pipeline.get_stats()
            if stats["total_processed"] >= checkpoint_every and stats["total_processed"] % checkpoint_every < batch_size:
                checkpoint_num = stats["total_processed"] // checkpoint_every
                save_checkpoint(results, codebook, checkpoint_dir, checkpoint_num)

        except Exception as e:
            logger.error(f"Failed to process batch {batch_idx}: {e}")
            failed += len(batch_rows)

    # Save final outputs
    print("=" * 80)
    logger.info("Saving final outputs...")

    output_parquet = project_root / config["output_paths"]["thematic_codes_parquet"]
    save_parquet(results, output_parquet, config)

    output_codebook = project_root / config["output_paths"]["codebook_json"]
    output_codebook.parent.mkdir(parents=True, exist_ok=True)
    codebook.save(output_codebook)

    # Print statistics
    stats = pipeline.get_stats()
    print("=" * 80)
    print("Processing Complete!")
    print("=" * 80)
    print(f"Total explanations processed: {stats['total_processed']}")
    print(f"New codes created: {stats['new_codes']}")
    print(f"Codes merged: {stats['merged_codes']}")
    print(f"Codes reviewed: {stats['reviewed_codes']}")
    print(f"Failed: {failed}")
    print(f"Final codebook size: {len(codebook)} codes")
    print(f"\nOutputs:")
    print(f"  Parquet: {output_parquet}")
    print(f"  Codebook: {output_codebook}")


if __name__ == "__main__":
    main()
