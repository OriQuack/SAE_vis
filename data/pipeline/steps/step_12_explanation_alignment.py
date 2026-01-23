#!/usr/bin/env python3
"""
Step 12: Explanation Alignment (Phrase Matching)

This step analyzes explanations across LLM explainers to find semantically
aligned phrases using embedding-based similarity.

Input:
- features.parquet: Feature data with explanation texts

Output:
- explanation_alignment.parquet: Aligned phrases with similarity scores

Features:
- Embedding-based semantic alignment
- Configurable similarity threshold
- Text chunking (sentence or phrase level)
- Native Polars nested types
"""

import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import polars as pl
from tqdm import tqdm

# Enable string cache for categorical operations
pl.enable_string_cache()

# Add parent directory to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.base import BaseProcessor, load_yaml_config
from core.logging import setup_logging

# Lazy imports for heavy dependencies
sentence_transformers = None

logger = logging.getLogger(__name__)


def lazy_import_dependencies():
    """Lazy import heavy dependencies."""
    global sentence_transformers

    if sentence_transformers is None:
        logger.info("Importing sentence-transformers...")
        import sentence_transformers as st
        sentence_transformers = st


class ExplanationAlignmentProcessor(BaseProcessor):
    """Find semantically aligned phrases across LLM explainers."""

    @property
    def step_name(self) -> str:
        return "Step 12: Explanation Alignment"

    @property
    def version(self) -> str:
        return "2.0"

    def _init_paths(self) -> None:
        """Initialize paths from configuration."""
        super()._init_paths()

        global_config = self.config.get("global", {})
        paths = global_config.get("paths", {})
        output_dir = paths.get("output", "data/output")

        # Input paths - build from global paths config
        self.features_path = self._resolve_path(f"{output_dir}/features.parquet")

        # Output path
        self.output_path = self._resolve_path(f"{output_dir}/explanation_alignment.parquet")

        # Processing parameters
        params = self.config.get("parameters", {})

        # Get embedding model: step params > global config > default
        global_embedding = global_config.get("processing", {}).get("embedding", {})
        embedding_model = params.get(
            "embedding_model",
            global_embedding.get("model", "google/embeddinggemma-300m")
        )

        self.proc_params = {
            "similarity_threshold": params.get("similarity_threshold", 0.7),
            "chunk_method": params.get("chunk_method", "phrase"),
            "embedding_model": embedding_model,
            "min_aligned_explainers": params.get("min_aligned_explainers", 2),
        }

        # Statistics tracking
        self.stats = {
            "features_processed": 0,
            "features_with_alignments": 0,
            "total_aligned_groups": 0,
            "features_with_single_explanation": 0,
            "features_with_no_alignments": 0
        }

        # Data holders
        self.features_df = None
        self.embedding_model = None

    def _load_model(self):
        """Lazy load embedding model."""
        lazy_import_dependencies()

        if self.embedding_model is None:
            model_name = self.proc_params["embedding_model"]
            logger.info(f"Loading sentence embedding model ({model_name})...")
            self.embedding_model = sentence_transformers.SentenceTransformer(model_name)

    def _load_data(self) -> None:
        """Load features parquet."""
        logger.info(f"Loading features from {self.features_path}")
        if not self.features_path.exists():
            raise FileNotFoundError(f"Features file not found: {self.features_path}")
        self.features_df = pl.read_parquet(self.features_path)
        logger.info(f"Loaded {len(self.features_df):,} feature rows")

    @staticmethod
    def _chunk_text(text: str, method: str = "phrase") -> List[str]:
        """Split text into chunks for alignment.

        Args:
            text: Input text
            method: "sentence" or "phrase"

        Returns:
            List of text chunks
        """
        if method == "sentence":
            chunks = [s.strip() for s in re.split(r'[.!?;]', text) if s.strip()]
        else:
            chunks = [c.strip() for c in re.split(r',|\band\b|\bor\b|\bbut\b', text) if c.strip()]
        return chunks

    def _compute_semantic_alignment(
        self,
        explanations: List[str],
        llm_explainers: List[str]
    ) -> Dict[str, Any]:
        """Find semantically aligned chunks across explanations.

        Args:
            explanations: List of explanation texts
            llm_explainers: List of LLM explainer names

        Returns:
            Dictionary with aligned groups and metadata
        """
        threshold = self.proc_params["similarity_threshold"]
        chunk_method = self.proc_params["chunk_method"]

        # Split each explanation into chunks
        all_chunks = []
        chunk_to_exp = []

        for exp_idx, text in enumerate(explanations):
            chunks = self._chunk_text(text, chunk_method)
            all_chunks.extend(chunks)
            chunk_to_exp.extend([(exp_idx, i) for i in range(len(chunks))])

        if len(all_chunks) == 0:
            return {"aligned_groups": [], "num_groups": 0}

        # Compute embeddings
        embeddings = self.embedding_model.encode(all_chunks, show_progress_bar=False)

        # Normalize and compute similarity
        embeddings_normalized = embeddings / np.linalg.norm(embeddings, axis=1, keepdims=True)
        similarity_matrix = np.dot(embeddings_normalized, embeddings_normalized.T)

        # Find aligned groups
        aligned_groups = []
        used_chunks = set()

        for i in range(len(all_chunks)):
            if i in used_chunks:
                continue

            exp_i, chunk_i = chunk_to_exp[i]
            group = {exp_i: [(i, all_chunks[i], chunk_i, 1.0)]}

            for j in range(i + 1, len(all_chunks)):
                if j in used_chunks:
                    continue

                exp_j, chunk_j = chunk_to_exp[j]

                if exp_i != exp_j and similarity_matrix[i][j] >= threshold:
                    if exp_j not in group:
                        group[exp_j] = []
                    group[exp_j].append((j, all_chunks[j], chunk_j, float(similarity_matrix[i][j])))
                    used_chunks.add(j)

            min_explainers = self.proc_params["min_aligned_explainers"]
            if len(group) >= min_explainers:
                if len(group) > 1:
                    other_sims = []
                    for other_exp_idx in group:
                        if other_exp_idx != exp_i:
                            for _, _, _, sim in group[other_exp_idx]:
                                other_sims.append(sim)

                    if other_sims:
                        avg_sim = sum(other_sims) / len(other_sims)
                        group[exp_i] = [(i, all_chunks[i], chunk_i, float(avg_sim))]

                aligned_groups.append(group)
                used_chunks.add(i)

        # Format aligned groups
        formatted_groups = []
        for group_id, group in enumerate(aligned_groups):
            all_sims = []
            for phrases in group.values():
                for _, _, _, sim in phrases:
                    all_sims.append(sim)
            group_similarity = float(np.mean(all_sims)) if all_sims else 0.0

            phrases = []
            for exp_idx in sorted(group.keys()):
                for _, text, chunk_idx, _ in group[exp_idx]:
                    phrases.append({
                        "explainer_name": llm_explainers[exp_idx],
                        "text": text,
                        "chunk_index": chunk_idx
                    })

            formatted_groups.append({
                "aligned_group_id": group_id,
                "similarity_score": group_similarity,
                "phrases": phrases
            })

        return {"aligned_groups": formatted_groups, "num_groups": len(formatted_groups)}

    def _process_feature(self, feature_id: int) -> Dict[str, Any]:
        """Process a single feature's explanations.

        Args:
            feature_id: Feature ID

        Returns:
            Dictionary with alignment results
        """
        feature_rows = self.features_df.filter(pl.col("feature_id") == feature_id).to_dicts()

        if not feature_rows:
            return {
                "feature_id": feature_id,
                "sae_id": self.sae_id,
                "llm_explainers": [],
                "num_aligned_groups": 0,
                "aligned_groups": []
            }

        explanations = []
        llm_explainers = []
        for row in feature_rows:
            explanations.append(row["explanation_text"])
            llm_explainers.append(row["llm_explainer"])

        if len(explanations) < 2:
            self.stats["features_with_single_explanation"] += 1
            return {
                "feature_id": feature_id,
                "sae_id": self.sae_id,
                "llm_explainers": llm_explainers,
                "num_aligned_groups": 0,
                "aligned_groups": []
            }

        alignment_result = self._compute_semantic_alignment(explanations, llm_explainers)

        if alignment_result["num_groups"] > 0:
            self.stats["features_with_alignments"] += 1
            self.stats["total_aligned_groups"] += alignment_result["num_groups"]
        else:
            self.stats["features_with_no_alignments"] += 1

        return {
            "feature_id": feature_id,
            "sae_id": self.sae_id,
            "llm_explainers": llm_explainers,
            "num_aligned_groups": alignment_result["num_groups"],
            "aligned_groups": alignment_result["aligned_groups"]
        }

    def process(self) -> pl.DataFrame:
        """Execute the main processing logic.

        Returns:
            Processed DataFrame
        """
        self._load_data()
        self._load_model()

        unique_features = sorted(self.features_df["feature_id"].unique().to_list())

        if self.feature_limit is not None:
            unique_features = unique_features[:self.feature_limit]
            logger.info(f"Processing limited to {self.feature_limit} features")

        logger.info(f"Processing {len(unique_features):,} features")

        results = []
        for feature_id in tqdm(unique_features, desc="Processing features"):
            result = self._process_feature(feature_id)
            results.append(result)
            self.stats["features_processed"] += 1

        logger.info(f"Processed {self.stats['features_processed']:,} features")

        return self._create_dataframe(results)

    def _create_dataframe(self, rows: List[Dict]) -> pl.DataFrame:
        """Create Polars DataFrame with proper schema.

        Args:
            rows: List of result dictionaries

        Returns:
            Polars DataFrame with typed columns
        """
        logger.info("Creating DataFrame with proper schema")

        if not rows:
            return self._create_empty_dataframe()

        df = pl.DataFrame(rows)

        df = df.with_columns([
            pl.col("feature_id").cast(pl.UInt32),
            pl.col("sae_id").cast(pl.Categorical),
            pl.col("num_aligned_groups").cast(pl.UInt16),
        ])

        logger.info(f"Created DataFrame with {len(df)} rows")
        return df

    def _create_empty_dataframe(self) -> pl.DataFrame:
        """Create empty DataFrame with correct schema."""
        schema = {
            "feature_id": pl.UInt32,
            "sae_id": pl.Categorical,
            "llm_explainers": pl.List(pl.Utf8),
            "num_aligned_groups": pl.UInt16,
            "aligned_groups": pl.List(pl.Struct([
                pl.Field("aligned_group_id", pl.UInt16),
                pl.Field("similarity_score", pl.Float32),
                pl.Field("phrases", pl.List(pl.Struct([
                    pl.Field("explainer_name", pl.Utf8),
                    pl.Field("text", pl.Utf8),
                    pl.Field("chunk_index", pl.UInt16)
                ])))
            ]))
        }
        return pl.DataFrame(schema=schema)


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Calculate explanation alignment")
    parser.add_argument("--config", type=str, help="Path to configuration file")
    parser.add_argument("--limit", type=int, help="Limit number of features (for testing)")

    args = parser.parse_args()

    setup_logging()

    if args.config:
        full_config = load_yaml_config(args.config)
        # Extract step-specific config if present
        config = full_config.get("steps", {}).get("step_12_explanation_alignment", {})
        if not config:
            # Fallback: treat entire config as step config (legacy format)
            config = full_config
        config["sae_id"] = full_config.get("global", {}).get("sae_id_sanitized", "")
        config["global"] = full_config.get("global", {})
    else:
        config_path = Path(__file__).parent.parent / "config.yaml"
        if config_path.exists():
            full_config = load_yaml_config(config_path)
            config = full_config.get("steps", {}).get("step_12_explanation_alignment", {})
            config["sae_id"] = full_config.get("global", {}).get("sae_id_sanitized", "")
            config["global"] = full_config.get("global", {})
        else:
            config = {}

    processor = ExplanationAlignmentProcessor(config, feature_limit=args.limit)
    processor.run()


if __name__ == "__main__":
    main()
