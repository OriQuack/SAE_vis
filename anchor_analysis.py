#!/usr/bin/env python3
"""
Anchor Point Analysis for Stage 3 Root Cause Tags

Sample features for manual analysis and compute refined anchor definitions.

Usage:
    python anchor_analysis.py sample   # Generate analysis files for manual tagging
    python anchor_analysis.py refine   # Compute refined anchors from tagged data

Tags:
    - noisy-activation: Activation examples are noisy/not interpretable
    - context-miss: Explanation missed the context at which feature activates
    - pattern-miss: Explanation missed the linguistic pattern that triggers activation
    - well-explained: Feature is well explained (no issues)
"""

import argparse
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import polars as pl

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Constants
METRICS = ["intra_feature_sim", "score_embedding", "score_fuzz", "score_detection", "explanation_semantic_sim"]
ANCHOR_NAMES = ["missed_ngram", "missed_context", "noisy_activation"]
TAG_OPTIONS = ["noisy-activation", "pattern-miss", "context-miss", "well-explained"]


def find_project_root() -> Path:
    """Find project root by looking for 'interface' directory."""
    project_root = Path.cwd()
    while project_root.name != "interface" and project_root.parent != project_root:
        project_root = project_root.parent
    if project_root.name == "interface":
        return project_root
    raise RuntimeError("Could not find interface project root")


class AnchorAnalyzer:
    """Analyze features for anchor point refinement."""

    def __init__(self):
        self.project_root = find_project_root()
        self.data_dir = self.project_root / "data" / "master"

        # Output files
        self.json_output = self.project_root / "anchor_point_analysis.json"
        self.md_output = self.project_root / "anchor_point_analysis.md"
        self.refined_output = self.project_root / "refined_anchor_config.json"

        # Data
        self.barycentric_df = None
        self.features_df = None
        self.activation_df = None

    def load_data(self):
        """Load all required parquet files."""
        logger.info("Loading data...")

        self.barycentric_df = pl.read_parquet(self.data_dir / "explanation_barycentric.parquet")
        logger.info(f"  Barycentric: {len(self.barycentric_df):,} rows")

        self.features_df = pl.read_parquet(self.data_dir / "features.parquet")
        logger.info(f"  Features: {len(self.features_df):,} rows")

        self.activation_df = pl.read_parquet(self.data_dir / "activation_display.parquet")
        logger.info(f"  Activation display: {len(self.activation_df):,} rows")

    def get_feature_level_data(self) -> pl.DataFrame:
        """Aggregate barycentric data to feature level (mean across explainers)."""
        return self.barycentric_df.group_by("feature_id").agg([
            pl.col("position_x").mean().alias("mean_x"),
            pl.col("position_y").mean().alias("mean_y"),
            pl.col("intra_feature_sim").mean(),
            pl.col("score_embedding").mean(),
            pl.col("score_fuzz").mean(),
            pl.col("score_detection").mean(),
            pl.col("explanation_semantic_sim").mean(),
            pl.col("dist_missed_ngram").mean(),
            pl.col("dist_missed_context").mean(),
            pl.col("dist_noisy_activation").mean(),
            pl.col("nearest_anchor").first(),
        ]).with_columns([
            # Compute margin (distance to nearest anchor vs second nearest)
            pl.min_horizontal(
                pl.col("dist_missed_ngram"),
                pl.col("dist_missed_context"),
                pl.col("dist_noisy_activation")
            ).alias("min_dist"),
            pl.concat_list([
                pl.col("dist_missed_ngram"),
                pl.col("dist_missed_context"),
                pl.col("dist_noisy_activation")
            ]).alias("all_dists")
        ]).with_columns([
            # Margin = second_min - min
            (pl.col("all_dists").list.sort().list.get(1) - pl.col("min_dist")).alias("margin")
        ]).drop(["all_dists", "min_dist"])

    def select_diverse_features(self, df: pl.DataFrame, n: int = 10, seed: int = 42) -> pl.DataFrame:
        """Select features covering the 2D space using grid-based stratification."""
        logger.info(f"Selecting {n} diverse features...")
        rng = np.random.default_rng(seed)

        # Get position ranges
        x_min, x_max = df["mean_x"].min(), df["mean_x"].max()
        y_min, y_max = df["mean_y"].min(), df["mean_y"].max()

        # Create 4x4 grid for more coverage (16 cells)
        grid_size = 4
        x_edges = np.linspace(x_min, x_max, grid_size + 1)
        y_edges = np.linspace(y_min, y_max, grid_size + 1)

        selected = []
        for i in range(grid_size):
            for j in range(grid_size):
                cell = df.filter(
                    (pl.col("mean_x") >= x_edges[i]) &
                    (pl.col("mean_x") < x_edges[i+1]) &
                    (pl.col("mean_y") >= y_edges[j]) &
                    (pl.col("mean_y") < y_edges[j+1])
                )
                if len(cell) > 0:
                    # Randomly sample from cell (use seed for reproducibility)
                    cell_list = cell.to_dicts()
                    idx = rng.integers(0, len(cell_list))
                    sampled_row = cell_list[idx]
                    sampled_df = pl.DataFrame([sampled_row]).with_columns([
                        pl.lit(f"grid_{i}_{j}").alias("sampling_reason")
                    ])
                    selected.append(sampled_df)

        if selected:
            result = pl.concat(selected).head(n)
            logger.info(f"  Selected {len(result)} diverse features")
            return result
        return pl.DataFrame()

    def select_boundary_features(self, df: pl.DataFrame, n: int = 10, exclude_ids: List[int] = None, seed: int = 42) -> pl.DataFrame:
        """Select features near decision boundaries (smallest margins)."""
        logger.info(f"Selecting {n} boundary features...")
        rng = np.random.default_rng(seed + 1000)  # Offset seed for different randomness

        # Exclude already selected features
        if exclude_ids:
            df = df.filter(~pl.col("feature_id").is_in(exclude_ids))

        # Select features with smallest margins, ensuring coverage of different boundaries
        boundary_pairs = [
            ("missed_ngram", "missed_context"),
            ("missed_ngram", "noisy_activation"),
            ("missed_context", "noisy_activation")
        ]

        selected = []
        per_boundary = max(n // 3, 4)  # At least 4 per boundary

        for anchor1, anchor2 in boundary_pairs:
            # Find features nearest to this boundary
            boundary_df = df.filter(
                pl.col("nearest_anchor").is_in([anchor1, anchor2])
            ).sort("margin")

            if len(boundary_df) > 0:
                # Take top candidates and randomly sample from them
                candidates = boundary_df.head(per_boundary * 3).to_dicts()
                n_select = min(per_boundary, len(candidates))
                indices = rng.choice(len(candidates), size=n_select, replace=False)
                sampled = [candidates[i] for i in indices]
                sampled_df = pl.DataFrame(sampled).with_columns([
                    pl.lit(f"boundary_{anchor1}_{anchor2}").alias("sampling_reason")
                ])
                selected.append(sampled_df)

        if selected:
            result = pl.concat(selected).unique("feature_id").head(n)
            logger.info(f"  Selected {len(result)} boundary features")
            return result
        return pl.DataFrame()

    def get_best_explanation(self, feature_id: int) -> Dict:
        """Get best explanation for a feature (highest quality score)."""
        feature_data = self.features_df.filter(pl.col("feature_id") == feature_id)

        best_explainer = None
        best_score = -1
        best_text = ""

        for row in feature_data.iter_rows(named=True):
            scores = row["scores"]
            if scores and len(scores) > 0:
                score = scores[0]
                quality = (score.get("embedding", 0) + score.get("fuzz", 0) + score.get("detection", 0)) / 3
                if quality > best_score:
                    best_score = quality
                    best_explainer = row["llm_explainer"]
                    best_text = row["explanation_text"]

        return {
            "explainer": best_explainer or "unknown",
            "text": best_text or "No explanation available",
            "quality_score": round(best_score, 4)
        }

    def get_activation_examples(self, feature_id: int) -> List[Dict]:
        """Get activation examples for a feature."""
        activation_row = self.activation_df.filter(pl.col("feature_id") == feature_id)

        if len(activation_row) == 0:
            return []

        row = activation_row.row(0, named=True)
        quantile_examples = row.get("quantile_examples", [])

        examples = []
        for ex in quantile_examples:
            tokens = ex.get("prompt_tokens", [])
            activation_pairs = ex.get("activation_pairs", [])

            # Get activation positions
            positions = [ap.get("token_position", -1) for ap in activation_pairs]

            # Build context string with markers
            context_tokens = []
            for i, tok in enumerate(tokens):
                if not tok:
                    continue
                # Clean token - replace ▁ with space prefix
                if tok.startswith("▁"):
                    clean_tok = " " + tok[1:]
                else:
                    clean_tok = tok

                if i in positions:
                    context_tokens.append(f"[{clean_tok.strip()}]")
                else:
                    context_tokens.append(clean_tok)

            context = "".join(context_tokens).strip()

            examples.append({
                "quantile": ex.get("quantile_index", -1),
                "max_activation": round(ex.get("max_activation", 0), 2),
                "positions": positions[:5],  # Limit to first 5
                "context": context[:400] + "..." if len(context) > 400 else context
            })

        return examples

    def sample_command(self, seed: int = 42):
        """Execute the sample command: generate analysis files."""
        np.random.seed(seed)
        logger.info(f"Using random seed: {seed}")

        self.load_data()

        # Get feature-level data
        feature_df = self.get_feature_level_data()
        logger.info(f"Feature-level data: {len(feature_df):,} features")

        # Select diverse features
        diverse = self.select_diverse_features(feature_df, n=10, seed=seed)
        diverse = diverse.with_columns([pl.lit("diverse").alias("sampling_type")])

        # Select boundary features
        diverse_ids = diverse["feature_id"].to_list() if len(diverse) > 0 else []
        boundary = self.select_boundary_features(feature_df, n=10, exclude_ids=diverse_ids, seed=seed)
        boundary = boundary.with_columns([pl.lit("boundary").alias("sampling_type")])

        # Ensure both have sampling_reason column
        if "sampling_reason" not in diverse.columns:
            diverse = diverse.with_columns([pl.lit("diverse").alias("sampling_reason")])
        if "sampling_reason" not in boundary.columns:
            boundary = boundary.with_columns([pl.lit("boundary").alias("sampling_reason")])

        # Drop margin_diff if present (temporary column from selection)
        for col in ["margin_diff"]:
            if col in diverse.columns:
                diverse = diverse.drop(col)
            if col in boundary.columns:
                boundary = boundary.drop(col)

        # Combine
        sampled = pl.concat([diverse, boundary], how="diagonal") if len(boundary) > 0 else diverse
        logger.info(f"Total sampled: {len(sampled)} features")

        # Build output
        features_output = []
        for row in sampled.iter_rows(named=True):
            feature_id = row["feature_id"]

            # Get explanation and examples
            explanation = self.get_best_explanation(feature_id)
            examples = self.get_activation_examples(feature_id)

            feature_data = {
                "feature_id": int(feature_id),
                "sampling_type": row["sampling_type"],
                "sampling_reason": row["sampling_reason"],
                "best_explanation": explanation,
                "activation_examples": examples,
                "metrics": {
                    "intra_feature_sim": round(row["intra_feature_sim"], 4),
                    "score_embedding": round(row["score_embedding"], 4),
                    "score_fuzz": round(row["score_fuzz"], 4),
                    "score_detection": round(row["score_detection"], 4),
                    "explanation_semantic_sim": round(row["explanation_semantic_sim"], 4),
                },
                "position": {
                    "x": round(row["mean_x"], 4),
                    "y": round(row["mean_y"], 4)
                },
                "distances": {
                    "missed_ngram": round(row["dist_missed_ngram"], 4),
                    "missed_context": round(row["dist_missed_context"], 4),
                    "noisy_activation": round(row["dist_noisy_activation"], 4),
                },
                "current_prediction": {
                    "nearest_anchor": row["nearest_anchor"],
                    "margin": round(row["margin"], 4)
                },
                "user_tag": None  # To be filled by user
            }
            features_output.append(feature_data)

        # Save JSON
        output = {
            "metadata": {
                "created_at": datetime.now().isoformat(),
                "sampling_method": "stratified_diverse_10 + boundary_10",
                "total_features": len(features_output),
            },
            "tag_options": TAG_OPTIONS,
            "features": features_output
        }

        with open(self.json_output, 'w') as f:
            json.dump(output, f, indent=2)
        logger.info(f"Saved JSON to {self.json_output}")

        # Generate markdown
        self.generate_markdown(features_output)
        logger.info(f"Saved markdown to {self.md_output}")

        print(f"\n{'='*60}")
        print("Analysis files generated!")
        print(f"  JSON: {self.json_output}")
        print(f"  Markdown: {self.md_output}")
        print(f"\nNext steps:")
        print(f"  1. Review {self.md_output} to analyze each feature")
        print(f"  2. Edit {self.json_output} and fill 'user_tag' for each feature")
        print(f"  3. Run: python anchor_analysis.py refine")
        print(f"{'='*60}\n")

    def generate_markdown(self, features: List[Dict]):
        """Generate human-readable markdown file."""
        lines = [
            "# Anchor Point Analysis - Feature Samples",
            "",
            f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
            "",
            "## Tag Options",
            "- `noisy-activation`: Activation examples are noisy/not interpretable",
            "- `pattern-miss`: Explanation missed the linguistic pattern (n-grams, morphology)",
            "- `context-miss`: Explanation missed the semantic context",
            "- `well-explained`: Feature is well explained",
            "",
            "---",
            ""
        ]

        for i, f in enumerate(features, 1):
            fid = f["feature_id"]
            sampling = f["sampling_type"]
            reason = f["sampling_reason"]
            exp = f["best_explanation"]
            metrics = f["metrics"]
            pos = f["position"]
            dists = f["distances"]
            pred = f["current_prediction"]

            lines.extend([
                f"## Feature {fid} ({sampling}: {reason})",
                "",
                f"### Best Explanation ({exp['explainer'].split('/')[-1]}, Quality: {exp['quality_score']})",
                f"> {exp['text']}",
                "",
                "### Activation Examples",
            ])

            for ex in f["activation_examples"][:4]:  # Show 4 examples
                lines.append(f"**Quantile {ex['quantile']}** (max={ex['max_activation']}, pos={ex['positions']})")
                lines.append(f"```")
                lines.append(ex['context'])
                lines.append(f"```")
                lines.append("")

            lines.extend([
                "### Metrics",
                "| Metric | Value |",
                "|--------|-------|",
                f"| intra_feature_sim | {metrics['intra_feature_sim']} |",
                f"| score_embedding | {metrics['score_embedding']} |",
                f"| score_fuzz | {metrics['score_fuzz']} |",
                f"| score_detection | {metrics['score_detection']} |",
                f"| explanation_semantic_sim | {metrics['explanation_semantic_sim']} |",
                "",
                f"### Position: ({pos['x']}, {pos['y']})",
                f"### Distances: ngram={dists['missed_ngram']}, context={dists['missed_context']}, noisy={dists['noisy_activation']}",
                f"### Current: **{pred['nearest_anchor']}** (margin: {pred['margin']})",
                "",
                "### Your Tag: _____________",
                "",
                "---",
                ""
            ])

        with open(self.md_output, 'w') as f:
            f.write('\n'.join(lines))

    def refine_command(self):
        """Execute the refine command: compute refined anchors from tagged data."""
        if not self.json_output.exists():
            print(f"Error: {self.json_output} not found. Run 'sample' first.")
            return

        # Load tagged data
        with open(self.json_output) as f:
            data = json.load(f)

        features = data["features"]

        # Check tagging completeness
        tagged = [f for f in features if f["user_tag"] is not None]
        untagged = [f for f in features if f["user_tag"] is None]

        if untagged:
            print(f"Warning: {len(untagged)} features not tagged")
            print(f"  Feature IDs: {[f['feature_id'] for f in untagged]}")

        if len(tagged) < 3:
            print(f"Error: Need at least 3 tagged features. Currently have {len(tagged)}.")
            return

        print(f"\nAnalyzing {len(tagged)} tagged features...")

        # Group by tag
        by_tag = {}
        for f in tagged:
            tag = f["user_tag"]
            if tag not in by_tag:
                by_tag[tag] = []
            by_tag[tag].append(f)

        print(f"\nTag distribution:")
        for tag, items in by_tag.items():
            print(f"  {tag}: {len(items)} features")

        # Load full data for percentile computation
        self.load_data()
        feature_df = self.get_feature_level_data()

        # Compute centroids per tag
        print(f"\nComputing centroids per tag...")
        centroids = {}
        for tag, items in by_tag.items():
            if tag == "well-explained":
                continue  # Skip well-explained for anchor computation

            centroid = {}
            for metric in METRICS:
                values = [f["metrics"][metric] for f in items]
                centroid[metric] = np.mean(values)
            centroids[tag] = centroid

            print(f"\n  {tag}:")
            for m, v in centroid.items():
                print(f"    {m}: {v:.4f}")

        # Map centroids to percentiles
        print(f"\nMapping to percentiles...")
        refined_anchors = {}
        anchor_map = {
            "noisy-activation": "noisy_activation",
            "pattern-miss": "missed_ngram",
            "context-miss": "missed_context"
        }

        percentiles = [5, 10, 25, 50, 75, 90, 95]

        for tag, centroid in centroids.items():
            anchor_name = anchor_map.get(tag)
            if not anchor_name:
                continue

            anchor_def = {}
            for metric in METRICS:
                target = centroid[metric]
                col = feature_df[metric]

                # Find closest percentile
                pct_values = {p: col.quantile(p/100) for p in percentiles}
                closest_pct = min(percentiles, key=lambda p: abs(pct_values[p] - target))

                anchor_def[metric] = f"p{closest_pct}"
                print(f"  {anchor_name}.{metric}: target={target:.4f} -> p{closest_pct} ({pct_values[closest_pct]:.4f})")

            refined_anchors[anchor_name] = anchor_def

        # Save refined config
        output = {
            "metadata": {
                "created_at": datetime.now().isoformat(),
                "source_features": len(tagged),
                "tag_distribution": {tag: len(items) for tag, items in by_tag.items()}
            },
            "anchors": refined_anchors,
            "centroids_raw": {anchor_map.get(t, t): c for t, c in centroids.items()}
        }

        with open(self.refined_output, 'w') as f:
            json.dump(output, f, indent=2)

        print(f"\n{'='*60}")
        print(f"Refined anchor config saved to: {self.refined_output}")
        print(f"\nTo apply these anchors:")
        print(f"  1. Update data/preprocessing/config/9_explanation_embedding_barycentric.json")
        print(f"  2. Re-run: python data/preprocessing/scripts/9_explanation_embedding_barycentric.py")
        print(f"{'='*60}\n")


def main():
    parser = argparse.ArgumentParser(description="Anchor Point Analysis for Stage 3")
    parser.add_argument("command", choices=["sample", "refine"], help="Command to execute")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for sampling")
    args = parser.parse_args()

    analyzer = AnchorAnalyzer()

    if args.command == "sample":
        analyzer.sample_command(seed=args.seed)
    elif args.command == "refine":
        analyzer.refine_command()


if __name__ == "__main__":
    main()
