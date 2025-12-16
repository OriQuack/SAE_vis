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

# Suppress verbose HTTP request logs
logging.getLogger("httpx").setLevel(logging.WARNING)


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


def load_explanations(
    config: Dict,
    project_root: Path,
    limit: Optional[int] = None,
    start: Optional[int] = None,
    end: Optional[int] = None
) -> pl.DataFrame:
    """Load explanations from parquet file with optional feature range filtering."""
    input_path = project_root / config["input_paths"]["explanation_embeddings_path"]
    logger.info(f"Loading explanations from: {input_path}")

    df = pl.read_parquet(input_path)

    # Filter by feature range
    if start is not None:
        df = df.filter(pl.col("feature_id") >= start)
        logger.info(f"Filtered to features >= {start}")
    if end is not None:
        df = df.filter(pl.col("feature_id") <= end)
        logger.info(f"Filtered to features <= {end}")

    # Limit number of features (applied after range filter)
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
    checkpoint_num: int,
    output_parquet: Path,
    config: Dict
):
    """Save checkpoint for resumability (includes parquet)."""
    checkpoint_dir.mkdir(parents=True, exist_ok=True)

    results_path = checkpoint_dir / f"checkpoint_{checkpoint_num}_results.json"
    with open(results_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False)

    codebook_path = checkpoint_dir / f"checkpoint_{checkpoint_num}_codebook.json"
    codebook.save(codebook_path)

    # Save parquet at checkpoint too
    save_parquet(results, output_parquet, config)

    logger.info(f"Saved checkpoint {checkpoint_num}: {len(results)} results, {len(codebook)} codes, parquet updated")


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
    """Save results to parquet file (cumulative - appends to existing)."""
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

    new_df = pl.DataFrame(serializable_results)

    new_df = new_df.with_columns([
        pl.col("feature_id").cast(pl.UInt32),
        pl.col("llm_explainer").cast(pl.Categorical),
    ])

    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Load existing parquet and merge (cumulative)
    if output_path.exists():
        existing_df = pl.read_parquet(output_path)
        # Remove rows that will be replaced by new results
        new_keys = set(zip(new_df["feature_id"].to_list(), new_df["llm_explainer"].to_list()))
        existing_df = existing_df.filter(
            ~pl.struct(["feature_id", "llm_explainer"]).map_elements(
                lambda x: (x["feature_id"], x["llm_explainer"]) in new_keys,
                return_dtype=pl.Boolean
            )
        )
        df = pl.concat([existing_df, new_df])
        logger.info(f"Merged with existing parquet: {len(existing_df)} existing + {len(new_df)} new = {len(df)} total")
    else:
        df = new_df

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
        "--start",
        type=int,
        default=None,
        help="Starting feature ID (inclusive)"
    )
    parser.add_argument(
        "--end",
        type=int,
        default=None,
        help="Ending feature ID (inclusive)"
    )
    parser.add_argument(
        "--load-codebook",
        type=str,
        default=None,
        help="Path to existing codebook.json to continue from"
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

    # Get run_config from config.json, merge with CLI args (CLI takes precedence)
    run_cfg = config.get("run_config", {})

    start = args.start if args.start is not None else run_cfg.get("start_feature")
    end = args.end if args.end is not None else run_cfg.get("end_feature")
    limit = args.limit if args.limit is not None else run_cfg.get("limit")
    resume = args.resume or run_cfg.get("resume", False)
    mode = run_cfg.get("mode", "continue")
    load_codebook_path = args.load_codebook if args.load_codebook is not None else run_cfg.get("load_codebook")

    # Get output paths early for overwrite mode
    output_parquet = project_root / config["output_paths"]["thematic_codes_parquet"]
    output_codebook = project_root / config["output_paths"]["codebook_json"]

    # Handle overwrite mode
    if mode == "overwrite" and not resume:
        if output_parquet.exists():
            output_parquet.unlink()
            logger.info(f"Overwrite mode: deleted {output_parquet}")
        if output_codebook.exists():
            output_codebook.unlink()
            logger.info(f"Overwrite mode: deleted {output_codebook}")

    # Initialize Codebook Manager
    embedding_config = config.get("embedding_config", {})

    codebook = CodebookManager(
        embedding_model=embedding_config.get("model", "google/embeddinggemma-300m"),
        device=embedding_config.get("device", "cuda"),
        max_example_quotes=config.get("processing_config", {}).get("max_quotes_per_code", 20)
    )

    # Load existing codebook if specified (only in continue mode)
    if mode == "continue" and load_codebook_path and not resume:
        codebook_path = Path(load_codebook_path)
        if not codebook_path.is_absolute():
            codebook_path = script_dir / codebook_path
        if codebook_path.exists():
            codebook.load(codebook_path)
            logger.info(f"Loaded existing codebook with {len(codebook)} codes from: {codebook_path}")
        else:
            logger.warning(f"Codebook file not found: {codebook_path}")

    # Initialize AutoGen Pipeline
    pipeline = ThematicLMPipeline(config=config, codebook=codebook)
    logger.info(f"Initialized AutoGen pipeline with {len(pipeline.coders)} coder(s)")

    # Load data
    df = load_explanations(config, project_root, limit, start, end)

    # Resume from checkpoint if requested
    checkpoint_dir = script_dir / "checkpoints"
    results = []
    processed_ids = set()

    if resume:
        if load_codebook_path:
            logger.warning("Resume mode: ignoring LOAD_CODEBOOK, using checkpoint codebook.")
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
    checkpoint_every = config["processing_config"].get("checkpoint_every", 500)
    output_codebook.parent.mkdir(parents=True, exist_ok=True)

    # Create timestamped history directory
    run_timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    codebook_history_dir = script_dir / "codebook_history" / run_timestamp
    codebook_history_dir.mkdir(parents=True, exist_ok=True)
    history_codebook = codebook_history_dir / "codebook.json"

    # Print banner
    print("=" * 80)
    print(f"Thematic-LM Coding Stage (AutoGen) - Per-Item Processing")
    print(f"  Paper: Qiao et al. WWW '25")
    print(f"  Model: {config['llm_config'].get('model', 'gpt-4o-mini')}")
    print(f"  Mode: {mode.upper()}" + (" (resume)" if resume else ""))
    print(f"  Coders: {len(pipeline.coders)} ({', '.join(c.name for c in pipeline.coders)})")
    if start is not None or end is not None:
        range_str = f"{start or 'start'} to {end or 'end'}"
        print(f"  Feature range: {range_str}")
    if len(codebook) > 0:
        print(f"  Loaded codebook: {len(codebook)} existing codes")
    print(f"  Total explanations: {len(df)}")
    print("=" * 80)

    # Process explanations one by one (per paper: each item → Coders → Aggregator → Reviewer → Codebook)
    logger.info(f"Processing {len(df)} explanations...")

    failed = 0
    rows = list(df.iter_rows(named=True))

    for row in tqdm(rows, desc="Processing"):
        quote_id = f"f{row['feature_id']}_{row['llm_explainer']}"

        try:
            # Process single explanation through AutoGen pipeline
            # Per paper: Text → Coders → Aggregator → Reviewer → Codebook
            result = pipeline.process_explanation(
                explanation_text=row["explanation_text"],
                quote_id=quote_id,
                feature_id=row["feature_id"],
                llm_explainer=row["llm_explainer"],
            )

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
                }
            })

            # Save codebook every 10 explanations
            stats = pipeline.get_stats()
            if stats["total_processed"] > 0 and stats["total_processed"] % 10 == 0:
                codebook.save(output_codebook)

            # Checkpoint periodically
            if stats["total_processed"] > 0 and stats["total_processed"] % checkpoint_every == 0:
                checkpoint_num = stats["total_processed"] // checkpoint_every
                save_checkpoint(results, codebook, checkpoint_dir, checkpoint_num, output_parquet, config)

        except Exception as e:
            logger.error(f"Failed to process {quote_id}: {e}")
            failed += 1

    # Save final outputs
    print("=" * 80)
    logger.info("Saving final outputs...")

    save_parquet(results, output_parquet, config)
    codebook.save(output_codebook)
    codebook.save(history_codebook)
    logger.info(f"Codebook history saved to: {history_codebook}")

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
    print(f"  History: {history_codebook}")


if __name__ == "__main__":
    main()
