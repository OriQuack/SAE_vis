#!/usr/bin/env python3
"""
Thematic-LM Coding Stage: Generate semantic codes from SAE feature explanations.

This script implements the coding stage of the Thematic-LM paper, using multiple
LLM agents with different identity perspectives to generate semantic codes for
SAE feature explanations and build an adaptive codebook.

Architecture (following the paper):
1. Multiple Coder Agents (with different identities) → generate codes independently
2. Aggregator Agent → merges similar codes from multiple coders
3. Reviewer Agent → compares with codebook, decides merge/update/new
4. Codebook Manager → maintains adaptive codebook with embedding similarity

Reference: Qiao et al. "Thematic-LM: A LLM-based Multi-agent System for Large-scale
Thematic Analysis" (WWW '25)
"""

import argparse
import json
import logging
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any

# Add script directory to path for imports
script_dir = Path(__file__).parent.resolve()
if str(script_dir) not in sys.path:
    sys.path.insert(0, str(script_dir))

import polars as pl
from tqdm import tqdm

from providers import create_provider
from codebook_manager import CodebookManager
from agents import CoderAgent, AggregatorAgent, ReviewerAgent

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


def create_coders(llm, config: Dict) -> List[CoderAgent]:
    """Create multiple coder agents with different identities.

    Following the paper, we assign different identity perspectives to simulate
    coders with varied backgrounds to foster diverse interpretations.
    """
    coder_configs = config.get("coder_config", {}).get("coders", [])

    if not coder_configs:
        # Default: single coder without identity
        return [CoderAgent(
            llm=llm,
            coder_id="coder_default",
            max_codes=config.get("processing_config", {}).get("max_codes_per_explanation", 3)
        )]

    coders = []
    for coder_cfg in coder_configs:
        coder = CoderAgent(
            llm=llm,
            coder_id=coder_cfg.get("id", f"coder_{len(coders)}"),
            identity=coder_cfg.get("identity"),
            custom_identity=coder_cfg.get("custom_identity"),
            max_codes=config.get("processing_config", {}).get("max_codes_per_explanation", 3)
        )
        coders.append(coder)
        if coder.identity_name:
            logger.info(f"Created coder '{coder.coder_id}' with identity: {coder.identity_name}")
        else:
            logger.info(f"Created coder '{coder.coder_id}' (no identity)")

    return coders


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
    df = pl.DataFrame(results)

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
        "config_used": config
    }

    metadata_path = output_path.with_suffix('.parquet.metadata.json')
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)

    logger.info(f"Saved {len(df)} rows to {output_path}")


def process_single_explanation(
    explanation_text: str,
    quote_id: str,
    coders: List[CoderAgent],
    aggregator: AggregatorAgent,
    reviewer: ReviewerAgent,
    codebook: CodebookManager,
    config: Dict,
    stats: Dict
) -> List[Dict]:
    """Process a single explanation through the full pipeline.

    Flow: Coders → Aggregator → Reviewer → Codebook
    """
    existing_codes = codebook.get_top_codes(k=20)
    codebook_config = config.get("codebook_config", {})
    review_threshold = codebook_config.get("similarity_threshold", 0.85)
    auto_merge_threshold = codebook_config.get("auto_merge_threshold", 0.90)
    top_k = codebook_config.get("top_k_retrieval", 5)

    # Step 1: Multiple coders generate codes independently
    codes_from_coders = []
    for coder in coders:
        codes = coder.code(
            explanation_text=explanation_text,
            quote_id=quote_id,
            existing_codes=existing_codes
        )
        codes_from_coders.append({
            "coder_id": coder.coder_id,
            "codes": [
                {"code": c.code_text, "quote": c.quote, "quote_id": c.quote_id}
                for c in codes
            ]
        })

    # Step 2: Aggregator merges codes from multiple coders
    aggregated_codes = aggregator.aggregate(codes_from_coders)

    # Step 3: Reviewer processes each aggregated code against codebook
    final_codes = []
    for agg_code in aggregated_codes:
        code_text = agg_code.code_text
        quotes = agg_code.quotes

        # Find similar codes in codebook
        similar = codebook.find_similar(code_text, top_k=top_k)

        if similar:
            best_match, similarity = similar[0]

            if similarity >= auto_merge_threshold:
                # Auto-merge with high confidence
                code_id = codebook.merge_code(code_text, quotes[0].get("quote", "") if quotes else "", best_match.code_id)
                final_code_text = codebook.entries[code_id].code_text
                stats["merged_codes"] += 1

            elif similarity >= review_threshold:
                # Review ambiguous case
                decision = reviewer.review(code_text, quotes, similar)
                stats["reviewed_codes"] += 1

                # Paper format: merge_codes empty = new code, non-empty = merge
                if decision.merge_codes:
                    # Merge with existing code(s)
                    target_id = decision.merge_codes[0]
                    code_id = codebook.merge_code(
                        decision.updated_code,
                        quotes[0].get("quote", "") if quotes else "",
                        target_id
                    )
                    final_code_text = codebook.entries[code_id].code_text
                    stats["merged_codes"] += 1
                else:
                    # merge_codes empty - add as new code
                    code_id, _, _ = codebook.add_or_merge(
                        decision.updated_code,
                        quotes[0].get("quote", "") if quotes else ""
                    )
                    final_code_text = decision.updated_code
                    stats["new_codes"] += 1
            else:
                # Low similarity - add as new code
                code_id, is_new, _ = codebook.add_or_merge(
                    code_text,
                    quotes[0].get("quote", "") if quotes else ""
                )
                final_code_text = codebook.entries[code_id].code_text
                if is_new:
                    stats["new_codes"] += 1
                else:
                    stats["merged_codes"] += 1
        else:
            # No similar codes - add as new
            code_id, _, _ = codebook.add_or_merge(
                code_text,
                quotes[0].get("quote", "") if quotes else ""
            )
            final_code_text = code_text
            stats["new_codes"] += 1

        final_codes.append({
            "code_id": code_id,
            "code_text": final_code_text,
            "quotes": quotes[:5],
            "original_codes": agg_code.original_codes,
            "confidence": agg_code.confidence
        })

    return final_codes


def main():
    """Main entry point for thematic coding."""
    parser = argparse.ArgumentParser(
        description="Generate semantic codes from SAE feature explanations (Thematic-LM)"
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
    parser.add_argument(
        "--no-reviewer",
        action="store_true",
        help="Disable reviewer agent (faster but less consistent)"
    )
    parser.add_argument(
        "--single-coder",
        action="store_true",
        help="Use single coder instead of multiple identities"
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

    # Initialize LLM Provider
    llm = create_provider(config["llm_config"])
    logger.info(f"Using LLM: {config['llm_config']['provider']} / {config['llm_config']['model']}")

    # Initialize Codebook Manager
    embedding_config = config.get("embedding_config", {})
    codebook_config = config.get("codebook_config", {})

    codebook = CodebookManager(
        embedding_model=embedding_config.get("model", "google/embeddinggemma-300m"),
        device=embedding_config.get("device", "cuda"),
        similarity_threshold=codebook_config.get("similarity_threshold", 0.85),
        auto_merge_threshold=codebook_config.get("auto_merge_threshold", 0.90)
    )

    # Create Agents
    if args.single_coder:
        coders = [CoderAgent(
            llm=llm,
            coder_id="coder_single",
            max_codes=config.get("processing_config", {}).get("max_codes_per_explanation", 3)
        )]
        logger.info("Using single coder (no identities)")
    else:
        coders = create_coders(llm, config)
        logger.info(f"Created {len(coders)} coder agent(s)")

    aggregator = AggregatorAgent(
        llm=llm,
        max_quotes_per_code=config.get("processing_config", {}).get("max_quotes_per_code", 5)
    )

    reviewer = ReviewerAgent(llm) if not args.no_reviewer else None
    if reviewer:
        logger.info("Reviewer agent enabled")
    else:
        logger.info("Reviewer agent disabled")

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
    checkpoint_every = config["processing_config"].get("checkpoint_every", 500)

    # Statistics
    stats = {
        "total_processed": 0,
        "new_codes": 0,
        "merged_codes": 0,
        "reviewed_codes": 0,
        "failed": 0
    }

    # Process explanations
    logger.info(f"Processing {len(df)} explanations with {len(coders)} coder(s)...")
    print("=" * 80)
    print(f"Thematic-LM Coding Stage")
    print(f"  Coders: {len(coders)} ({', '.join(c.coder_id for c in coders)})")
    print(f"  Reviewer: {'enabled' if reviewer else 'disabled'}")
    print(f"  Total explanations: {len(df)}")
    print("=" * 80)

    for row in tqdm(df.iter_rows(named=True), total=len(df), desc="Coding"):
        feature_id = row["feature_id"]
        llm_explainer = row["llm_explainer"]
        explanation_text = row["explanation_text"]
        quote_id = f"f{feature_id}_{llm_explainer}"

        try:
            # Process through pipeline: Coders → Aggregator → Reviewer → Codebook
            final_codes = process_single_explanation(
                explanation_text=explanation_text,
                quote_id=quote_id,
                coders=coders,
                aggregator=aggregator,
                reviewer=reviewer if reviewer else ReviewerAgent(llm),  # Fallback
                codebook=codebook,
                config=config,
                stats=stats
            )

            # Add result
            results.append({
                "feature_id": feature_id,
                "llm_explainer": llm_explainer,
                "explanation_text": explanation_text,
                "codes": final_codes,
                "coding_metadata": {
                    "coder_model": config["llm_config"]["model"],
                    "num_coders": len(coders),
                    "coder_ids": [c.coder_id for c in coders],
                    "timestamp": datetime.now().isoformat(),
                    "codebook_version": codebook.version
                }
            })

            stats["total_processed"] += 1

            # Checkpoint periodically
            if stats["total_processed"] % checkpoint_every == 0:
                checkpoint_num = stats["total_processed"] // checkpoint_every
                save_checkpoint(results, codebook, checkpoint_dir, checkpoint_num)

        except Exception as e:
            logger.error(f"Failed to process feature {feature_id}: {e}")
            stats["failed"] += 1

    # Save final outputs
    print("=" * 80)
    logger.info("Saving final outputs...")

    output_parquet = project_root / config["output_paths"]["thematic_codes_parquet"]
    save_parquet(results, output_parquet, config)

    output_codebook = project_root / config["output_paths"]["codebook_json"]
    output_codebook.parent.mkdir(parents=True, exist_ok=True)
    codebook.save(output_codebook)

    # Print statistics
    print("=" * 80)
    print("Processing Complete!")
    print("=" * 80)
    print(f"Total explanations processed: {stats['total_processed']}")
    print(f"New codes created: {stats['new_codes']}")
    print(f"Codes merged: {stats['merged_codes']}")
    print(f"Codes reviewed: {stats['reviewed_codes']}")
    print(f"Failed: {stats['failed']}")
    print(f"Final codebook size: {len(codebook)} codes")
    print(f"\nOutputs:")
    print(f"  Parquet: {output_parquet}")
    print(f"  Codebook: {output_codebook}")


if __name__ == "__main__":
    main()
