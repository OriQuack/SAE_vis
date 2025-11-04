#!/usr/bin/env python3
"""
Preprocessing Script: Explanation Alignment Preprocessing

This script analyzes explanations across LLM explainers to find semantically
aligned phrases using embedding-based similarity. For each feature with multiple
explanations, it identifies phrases that convey similar meaning across different
LLM explainers.

Input:
- features.parquet: Feature data with explanation texts

Output:
- explanation_alignment.parquet: Aligned phrases with similarity scores
- explanation_alignment.parquet.metadata.json: Processing metadata

Features:
- Embedding-based semantic alignment
- Configurable similarity threshold
- Text chunking (sentence or phrase level)
- Native Polars nested types for structured data
- Comprehensive metadata tracking

Usage:
    python 7_explanation_alignment.py [--config CONFIG_PATH] [--limit N]

Example:
    python 7_explanation_alignment.py
    python 7_explanation_alignment.py --limit 10  # Test on 10 features
"""

import json
import logging
import re
import argparse
from pathlib import Path
from typing import Dict, List, Optional, Any
from datetime import datetime
import numpy as np
import polars as pl
from tqdm import tqdm

# Lazy import for sentence transformers
try:
    from sentence_transformers import SentenceTransformer
    SEMANTIC_AVAILABLE = True
except ImportError:
    SEMANTIC_AVAILABLE = False

# Enable string cache for categorical operations
pl.enable_string_cache()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def find_project_root() -> Path:
    """Find project root by looking for 'interface' directory."""
    project_root = Path.cwd()
    while project_root.name != "interface" and project_root.parent != project_root:
        project_root = project_root.parent

    if project_root.name == "interface":
        return project_root
    else:
        raise RuntimeError("Could not find interface project root")


def load_config(config_path: Optional[str] = None) -> Dict:
    """Load configuration from file or use defaults."""
    default_config = {
        "features_path": "data/master/features.parquet",
        "output_path": "data/master/explanation_alignment.parquet",
        "sae_id": "google--gemma-scope-9b-pt-res--layer_30--width_16k--average_l0_120",
        "processing_parameters": {
            "similarity_threshold": 0.7,
            "chunk_method": "phrase",
            "embedding_model": "all-MiniLM-L6-v2",
            "min_aligned_explainers": 2
        }
    }

    if config_path and Path(config_path).exists():
        logger.info(f"Loading config from {config_path}")
        with open(config_path, 'r') as f:
            file_config = json.load(f)
        # Merge configs deeply
        for key in file_config:
            if isinstance(file_config[key], dict) and key in default_config:
                default_config[key].update(file_config[key])
            else:
                default_config[key] = file_config[key]
    else:
        logger.info("Using default configuration")

    return default_config


class ExplanationAlignmentProcessor:
    """Process explanations to find semantically aligned phrases."""

    def __init__(self, config: Dict, feature_limit: Optional[int] = None):
        """Initialize processor with configuration.

        Args:
            config: Configuration dictionary
            feature_limit: Optional limit on number of features to process
        """
        self.config = config
        self.feature_limit = feature_limit
        self.project_root = find_project_root()

        # Resolve paths
        self.features_path = self._resolve_path(config["features_path"])
        self.output_path = self._resolve_path(config["output_path"])

        # Configuration
        self.sae_id = config["sae_id"]
        self.proc_params = config["processing_parameters"]

        # Statistics tracking
        self.stats = {
            "features_processed": 0,
            "features_with_alignments": 0,
            "total_aligned_groups": 0,
            "features_with_single_explanation": 0,
            "features_with_no_alignments": 0
        }

        # Embedding model (lazy loaded)
        self.embedding_model = None
        self.features_df = None

    def _resolve_path(self, path_str: str) -> Path:
        """Resolve path relative to project root if not absolute."""
        path = Path(path_str)
        if not path.is_absolute():
            return self.project_root / path
        return path

    def _load_data(self):
        """Load features parquet."""
        if self.features_df is None:
            logger.info(f"Loading features from {self.features_path}")
            if not self.features_path.exists():
                raise FileNotFoundError(f"Features file not found: {self.features_path}")
            self.features_df = pl.read_parquet(self.features_path)
            logger.info(f"Loaded {len(self.features_df):,} feature rows")

    def _get_embedding_model(self):
        """Lazy load embedding model."""
        if self.embedding_model is None:
            if not SEMANTIC_AVAILABLE:
                raise ImportError(
                    "sentence-transformers not installed. "
                    "Run: pip install sentence-transformers"
                )
            model_name = self.proc_params["embedding_model"]
            logger.info(f"Loading sentence embedding model ({model_name})...")
            self.embedding_model = SentenceTransformer(model_name)
        return self.embedding_model

    @staticmethod
    def _chunk_text(text: str, method: str = "phrase") -> List[str]:
        """Split text into chunks for alignment.

        Args:
            text: Input text
            method: "sentence" (split by punctuation) or "phrase" (split by commas/conjunctions)

        Returns:
            List of text chunks
        """
        if method == "sentence":
            # Simple sentence splitting
            chunks = [s.strip() for s in re.split(r'[.!?;]', text) if s.strip()]
        else:  # phrase
            # Split by commas and conjunctions
            chunks = [c.strip() for c in re.split(r',|\band\b|\bor\b|\bbut\b', text) if c.strip()]

        return chunks

    def _compute_semantic_alignment(
        self,
        explanations: List[str],
        llm_explainers: List[str]
    ) -> Dict[str, Any]:
        """Find semantically aligned chunks across explanations.

        Args:
            explanations: List of explanation texts (one per LLM explainer)
            llm_explainers: List of LLM explainer names

        Returns:
            Dictionary with aligned groups and metadata
        """
        model = self._get_embedding_model()
        threshold = self.proc_params["similarity_threshold"]
        chunk_method = self.proc_params["chunk_method"]

        # 1. Split each explanation into chunks
        all_chunks = []
        chunk_to_exp = []  # (explainer_idx, chunk_idx_in_exp)
        exp_chunks = []  # Store chunks per explanation

        for exp_idx, text in enumerate(explanations):
            chunks = self._chunk_text(text, chunk_method)
            exp_chunks.append(chunks)
            all_chunks.extend(chunks)
            chunk_to_exp.extend([(exp_idx, i) for i in range(len(chunks))])

        if len(all_chunks) == 0:
            return {
                "aligned_groups": [],
                "num_groups": 0
            }

        # 2. Compute embeddings for all chunks
        embeddings = model.encode(all_chunks, show_progress_bar=False)

        # 3. Compute similarity matrix (cosine similarity)
        embeddings_normalized = embeddings / np.linalg.norm(embeddings, axis=1, keepdims=True)
        similarity_matrix = np.dot(embeddings_normalized, embeddings_normalized.T)

        # 4. Find aligned groups (threshold-based clustering)
        aligned_groups = []
        used_chunks = set()

        for i in range(len(all_chunks)):
            if i in used_chunks:
                continue

            exp_i, chunk_i = chunk_to_exp[i]
            # Start a new group with this chunk
            group = {exp_i: [(i, all_chunks[i], chunk_i, 1.0)]}  # (chunk_idx, text, position, similarity)

            # Find similar chunks from other explanations
            for j in range(i + 1, len(all_chunks)):
                if j in used_chunks:
                    continue

                exp_j, chunk_j = chunk_to_exp[j]

                # Only match across different explainers
                if exp_i != exp_j and similarity_matrix[i][j] >= threshold:
                    if exp_j not in group:
                        group[exp_j] = []
                    group[exp_j].append((j, all_chunks[j], chunk_j, float(similarity_matrix[i][j])))
                    used_chunks.add(j)

            # Only keep groups with at least min_aligned_explainers
            min_explainers = self.proc_params["min_aligned_explainers"]
            if len(group) >= min_explainers:
                # Compute average similarity for the initiating chunk
                if len(group) > 1:
                    other_sims = []
                    for other_exp_idx in group:
                        if other_exp_idx != exp_i:
                            for _, _, _, sim in group[other_exp_idx]:
                                other_sims.append(sim)

                    if other_sims:
                        avg_sim = sum(other_sims) / len(other_sims)
                        # Update the initiating chunk's similarity
                        group[exp_i] = [(i, all_chunks[i], chunk_i, float(avg_sim))]

                aligned_groups.append(group)
                used_chunks.add(i)

        # 5. Format aligned groups for output
        formatted_groups = []
        for group_id, group in enumerate(aligned_groups):
            # Calculate group average similarity
            all_sims = []
            for phrases in group.values():
                for _, _, _, sim in phrases:
                    all_sims.append(sim)
            group_similarity = float(np.mean(all_sims)) if all_sims else 0.0

            # Format phrases
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

        return {
            "aligned_groups": formatted_groups,
            "num_groups": len(formatted_groups)
        }

    def process_feature(self, feature_id: int) -> Dict[str, Any]:
        """Process a single feature's explanations.

        Args:
            feature_id: Feature ID

        Returns:
            Dictionary with alignment results
        """
        # Get all explanation rows for this feature
        feature_rows = self.features_df.filter(pl.col("feature_id") == feature_id).to_dicts()

        if not feature_rows:
            logger.warning(f"Feature {feature_id} not found")
            return {
                "feature_id": feature_id,
                "sae_id": self.sae_id,
                "llm_explainers": [],
                "num_aligned_groups": 0,
                "aligned_groups": []
            }

        # Extract explanations and explainer names
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

        # Compute alignment
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

    def process_all_features(self) -> pl.DataFrame:
        """Process all features and create DataFrame.

        Returns:
            Polars DataFrame with alignment results
        """
        # Load data
        self._load_data()

        # Get unique feature IDs
        unique_features = sorted(self.features_df["feature_id"].unique().to_list())

        # Apply feature limit for testing
        if self.feature_limit is not None:
            unique_features = unique_features[:self.feature_limit]
            logger.info(f"Processing limited to {self.feature_limit} features")

        logger.info(f"Processing {len(unique_features):,} features")

        # Process features
        results = []
        for feature_id in tqdm(unique_features, desc="Processing features"):
            result = self.process_feature(feature_id)
            results.append(result)
            self.stats["features_processed"] += 1

        logger.info(f"Processed {self.stats['features_processed']:,} features")

        return self._create_dataframe(results)

    def _create_dataframe(self, rows: List[Dict]) -> pl.DataFrame:
        """Create Polars DataFrame with proper schema and native types.

        Args:
            rows: List of result dictionaries

        Returns:
            Polars DataFrame with typed columns
        """
        logger.info("Creating DataFrame with proper schema")

        if not rows:
            logger.warning("No results to convert to DataFrame")
            return self._create_empty_dataframe()

        # Create DataFrame from rows
        df = pl.DataFrame(rows)

        # Cast to proper types
        df = df.with_columns([
            pl.col("feature_id").cast(pl.UInt32),
            pl.col("sae_id").cast(pl.Categorical),
            pl.col("num_aligned_groups").cast(pl.UInt16),
        ])

        logger.info(f"Created DataFrame with {len(df)} rows and {len(df.columns)} columns")
        return df

    def _create_empty_dataframe(self) -> pl.DataFrame:
        """Create empty DataFrame with correct schema.

        Returns:
            Empty Polars DataFrame with proper schema
        """
        logger.info("Creating empty DataFrame with schema")

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

    def save_parquet(self, df: pl.DataFrame) -> None:
        """Save DataFrame as parquet with metadata.

        Args:
            df: DataFrame to save
        """
        # Ensure output directory exists
        self.output_path.parent.mkdir(parents=True, exist_ok=True)

        logger.info(f"Saving parquet to {self.output_path}")
        df.write_parquet(self.output_path)

        # Calculate statistics
        if len(df) > 0:
            # Flatten all similarity scores
            all_similarities = []
            for row in df.iter_rows(named=True):
                groups = row.get("aligned_groups", [])
                if groups:
                    for group in groups:
                        sim = group.get("similarity_score")
                        if sim is not None:
                            all_similarities.append(sim)

            result_stats = {
                "features_with_alignments": int((df["num_aligned_groups"] > 0).sum()),
                "total_aligned_groups": int(df["num_aligned_groups"].sum()),
                "mean_groups_per_feature": float(df["num_aligned_groups"].mean()),
                "mean_similarity_score": float(np.mean(all_similarities)) if all_similarities else None,
                "alignment_coverage": float((df["num_aligned_groups"] > 0).sum() / len(df))
            }
        else:
            result_stats = {}

        # Save metadata
        metadata = {
            "created_at": datetime.now().isoformat(),
            "script_version": "1.0",
            "sae_id": self.sae_id,
            "total_rows": len(df),
            "schema": {col: str(df[col].dtype) for col in df.columns},
            "processing_stats": self.stats,
            "result_stats": result_stats,
            "config_used": self.config
        }

        metadata_path = self.output_path.with_suffix('.parquet.metadata.json')
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)

        logger.info(f"Saved metadata to {metadata_path}")
        logger.info(f"Successfully created parquet with {len(df):,} rows")


def main():
    """Main execution function."""
    parser = argparse.ArgumentParser(
        description='Calculate semantic alignment across LLM explanations'
    )
    parser.add_argument(
        '--config',
        type=str,
        default='data/preprocessing/config/7_explanation_alignment.json',
        help='Path to configuration file'
    )
    parser.add_argument(
        '--limit',
        type=int,
        default=None,
        help='Limit number of features to process (for testing)'
    )

    args = parser.parse_args()

    # Load configuration
    config = load_config(args.config)

    # Initialize processor
    processor = ExplanationAlignmentProcessor(config, feature_limit=args.limit)

    # Process data
    logger.info("=" * 80)
    logger.info("Starting Explanation Alignment Processing")
    logger.info("=" * 80)

    df = processor.process_all_features()

    # Save parquet
    processor.save_parquet(df)

    logger.info("=" * 80)
    logger.info("Processing Complete!")
    logger.info(f"Statistics:")
    logger.info(f"  Features processed: {processor.stats['features_processed']:,}")
    logger.info(f"  Features with alignments: {processor.stats['features_with_alignments']:,}")
    logger.info(f"  Total aligned groups: {processor.stats['total_aligned_groups']:,}")
    logger.info(f"  Features with single explanation: {processor.stats['features_with_single_explanation']:,}")
    logger.info(f"  Features with no alignments: {processor.stats['features_with_no_alignments']:,}")
    logger.info("=" * 80)


if __name__ == "__main__":
    main()
