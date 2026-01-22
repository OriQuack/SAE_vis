#!/usr/bin/env python3
"""
Step 4: Generate Explanation Embeddings

This step generates embedding vectors for explanation texts using
sentence-transformers.

Input:
- Raw explanation data from data sources

Output:
- explanation_embeddings.parquet: Pre-computed embeddings for explanations

Features:
- Loads explanation texts from multiple data sources
- Generates embeddings using configurable model
- Batch processing for efficiency
"""

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional
import re

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


class ExplanationEmbeddingsProcessor(BaseProcessor):
    """Generate embeddings for explanation texts."""

    @property
    def step_name(self) -> str:
        return "Step 4: Explanation Embeddings"

    @property
    def version(self) -> str:
        return "2.0"

    def _init_paths(self) -> None:
        """Initialize paths from configuration."""
        super()._init_paths()

        global_config = self.config.get("global", {})
        paths = global_config.get("paths", {})
        inputs = self.config.get("inputs", {})
        params = self.config.get("parameters", {})

        # Input: input data directory
        self.input_path = self._resolve_path(
            inputs.get("raw_dir", paths.get("input", "data/input"))
        )

        # Data sources from global config
        self.data_sources = global_config.get("data_sources", [])

        # LLM explainer mapping from global config
        self.llm_explainer_mapping = global_config.get("llm_explainer_mapping", {
            "llama_e": "hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4",
            "gemini_e": "google/gemini-flash-2.5",
            "openai_e": "openai/gpt-4o-mini"
        })

        # Output path
        outputs = self.config.get("outputs", {})
        intermediate_dir = paths.get("intermediate", "data/intermediate")
        self.output_path = self._resolve_path(
            outputs.get("main", f"{intermediate_dir}/explanation_embeddings.parquet")
        )

        # Processing parameters
        embedding_config = global_config.get("processing", {}).get("embedding", {})

        self.proc_params = {
            "file_pattern": params.get("file_pattern", "layers.30_latent*.txt"),
            "model": embedding_config.get("model", "google/embeddinggemma-300m"),
            "batch_size": embedding_config.get("batch_size", 256),
            "device": embedding_config.get("device", "cuda"),
        }

        # Statistics tracking
        self.stats = {
            "sources_processed": 0,
            "features_processed": 0,
            "explanations_embedded": 0,
            "missing_explanations": 0
        }

        # Model holder
        self.embedding_model = None

    def _get_llm_explainer(self, data_source: str) -> str:
        """Extract LLM explainer name from data source.

        Args:
            data_source: Data source name (e.g., "llama_e-llama_s-16k-v2")

        Returns:
            Full LLM explainer name
        """
        # Extract explainer prefix (e.g., "llama_e" from "llama_e-llama_s-16k-v2")
        if "_e-" in data_source:
            prefix = data_source.split("_e-")[0] + "_e"
        else:
            prefix = data_source.split("-")[0]

        return self.llm_explainer_mapping.get(prefix, data_source)

    def _load_model(self):
        """Load sentence-transformers model."""
        lazy_import_dependencies()

        if self.embedding_model is None:
            model_name = self.proc_params["model"]
            logger.info(f"Loading sentence-transformers model: {model_name}")
            self.embedding_model = sentence_transformers.SentenceTransformer(model_name)

            try:
                import torch
                device = self.proc_params.get("device", "cuda")
                if device == "cuda" and not torch.cuda.is_available():
                    logger.warning("CUDA not available, using CPU")
                    device = "cpu"
                self.embedding_model = self.embedding_model.to(device)
                logger.info(f"Model loaded on device: {device}")
            except Exception as e:
                logger.warning(f"Could not set device: {e}")

    def _load_explanations_from_source(self, data_source: str) -> List[Dict[str, Any]]:
        """Load explanation texts from a data source.

        Args:
            data_source: Name of the data source

        Returns:
            List of explanation dictionaries
        """
        source_path = self.input_path / data_source / "explanations"
        if not source_path.exists():
            logger.warning(f"Source path not found: {source_path}")
            return []

        explanations = []
        pattern = self.proc_params["file_pattern"]
        llm_explainer = self._get_llm_explainer(data_source)

        # Find matching files
        import glob
        files = list(source_path.glob(pattern))
        if not files:
            # Try alternative path structure
            alt_path = self.input_path / data_source
            files = list(alt_path.glob(f"**/{pattern}"))

        logger.info(f"Found {len(files)} explanation files for {data_source}")

        for file_path in files:
            try:
                # Extract feature_id from filename (e.g., layers.30_latent877.txt -> 877)
                import re
                match = re.search(r'latent(\d+)\.txt$', str(file_path))
                if not match:
                    continue
                feature_id = int(match.group(1))

                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read().strip()
                    if not content:
                        continue

                    # Try to decode JSON string (removes quotes from "text")
                    try:
                        explanation_text = json.loads(content)
                        if isinstance(explanation_text, dict):
                            # Handle dict format: {"explanation": "text"}
                            explanation_text = explanation_text.get("explanation", explanation_text.get("text", ""))
                    except json.JSONDecodeError:
                        # Use raw content if not valid JSON
                        explanation_text = content

                    if explanation_text:
                        explanations.append({
                            "feature_id": feature_id,
                            "sae_id": self.sae_id,
                            "data_source": data_source,
                            "llm_explainer": llm_explainer,
                            "explanation_text": str(explanation_text),
                        })

            except Exception as e:
                logger.warning(f"Error reading {file_path}: {e}")

        return explanations

    def process(self) -> pl.DataFrame:
        """Execute the main processing logic.

        Returns:
            Processed DataFrame
        """
        self._load_model()

        all_explanations = []

        for data_source in self.data_sources:
            logger.info(f"Loading explanations from {data_source}")
            explanations = self._load_explanations_from_source(data_source)
            all_explanations.extend(explanations)
            self.stats["sources_processed"] += 1
            logger.info(f"Loaded {len(explanations)} explanations from {data_source}")

        if not all_explanations:
            logger.warning("No explanations loaded")
            return self._create_empty_dataframe()

        # Apply feature limit
        if self.feature_limit is not None:
            all_explanations = [
                e for e in all_explanations
                if e["feature_id"] < self.feature_limit
            ]
            logger.info(f"Limited to {len(all_explanations)} explanations")

        self.stats["features_processed"] = len(set(e["feature_id"] for e in all_explanations))

        # Generate embeddings in batches
        logger.info(f"Generating embeddings for {len(all_explanations)} explanations")
        texts = [e["explanation_text"] for e in all_explanations]
        batch_size = self.proc_params["batch_size"]

        embeddings = self.embedding_model.encode(
            texts,
            batch_size=batch_size,
            show_progress_bar=True,
            convert_to_numpy=True
        )

        # Add embeddings to results
        for i, explanation in enumerate(all_explanations):
            explanation["embedding"] = embeddings[i].astype(np.float32).tolist()

        self.stats["explanations_embedded"] = len(all_explanations)
        logger.info(f"Generated {len(all_explanations)} embeddings")

        return self._create_dataframe(all_explanations)

    def _create_dataframe(self, rows: List[Dict]) -> pl.DataFrame:
        """Create Polars DataFrame with proper schema.

        Args:
            rows: List of result dictionaries

        Returns:
            Polars DataFrame with typed columns
        """
        logger.info("Creating DataFrame with proper schema")

        if not rows:
            logger.warning("No results to convert to DataFrame")
            return self._create_empty_dataframe()

        df = pl.DataFrame(rows)

        # Cast types
        df = df.with_columns([
            pl.col("feature_id").cast(pl.UInt32),
            pl.col("sae_id").cast(pl.Categorical),
            pl.col("data_source").cast(pl.Categorical),
            pl.col("llm_explainer").cast(pl.Categorical),
            pl.col("embedding").cast(pl.List(pl.Float32))
        ])

        logger.info(f"Created DataFrame with {len(df)} rows and {len(df.columns)} columns")
        return df

    def _create_empty_dataframe(self) -> pl.DataFrame:
        """Create empty DataFrame with correct schema."""
        schema = {
            "feature_id": pl.UInt32,
            "sae_id": pl.Categorical,
            "data_source": pl.Categorical,
            "llm_explainer": pl.Categorical,
            "explanation_text": pl.Utf8,
            "embedding": pl.List(pl.Float32)
        }
        return pl.DataFrame(schema=schema)


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Generate explanation embeddings")
    parser.add_argument("--config", type=str, help="Path to configuration file")
    parser.add_argument("--limit", type=int, help="Limit number of features (for testing)")

    args = parser.parse_args()

    setup_logging()

    if args.config:
        full_config = load_yaml_config(args.config)
        # Extract step-specific config if present
        config = full_config.get("steps", {}).get("step_04_explanation_embeddings", {})
        if not config:
            # Fallback: treat entire config as step config (legacy format)
            config = full_config
        config["sae_id"] = full_config.get("global", {}).get("sae_id_sanitized", "")
        config["global"] = full_config.get("global", {})
    else:
        config_path = Path(__file__).parent.parent / "config.yaml"
        if config_path.exists():
            full_config = load_yaml_config(config_path)
            config = full_config.get("steps", {}).get("step_04_explanation_embeddings", {})
            config["sae_id"] = full_config.get("global", {}).get("sae_id_sanitized", "")
            config["global"] = full_config.get("global", {})
        else:
            config = {}

    processor = ExplanationEmbeddingsProcessor(config, feature_limit=args.limit)
    processor.run()


if __name__ == "__main__":
    main()
