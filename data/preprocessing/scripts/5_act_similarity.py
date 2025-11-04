#!/usr/bin/env python3
"""
Preprocessing Script: Calculate Activation Example Similarity Metrics

This script analyzes activation examples to compute similarity metrics based on
quantile-sampled prompts for each SAE feature. It calculates two key metrics:
1. Pairwise semantic similarity across 32-token windows
2. Character n-gram patterns in 5-token windows

Input:
- activation_examples.parquet: Structured parquet with activation data

Output:
- activation_example_similarity.parquet: Similarity metrics per feature
- activation_example_similarity.parquet.metadata.json: Processing metadata

Features:
- Quantile-based sampling (4 quantiles, 2 examples each)
- Native Polars nested types for structured data
- Batch processing for efficiency
- Comprehensive progress tracking

Usage:
    python 9_activation_example_similarity.py [--config CONFIG_PATH] [--limit N]

Example:
    python 9_activation_example_similarity.py
    python 9_activation_example_similarity.py --limit 100  # Test on 100 features
"""

import json
import logging
import argparse
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime
import numpy as np
import polars as pl
from tqdm import tqdm

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
        "activation_examples_path": "data/master/activation_examples.parquet",
        "activation_embeddings_path": "data/master/activation_embeddings.parquet",
        "output_path": "data/master/activation_example_similarity.parquet",
        "sae_id": "google--gemma-scope-9b-pt-res--layer_30--width_16k--average_l0_120",
        "processing_parameters": {
            "num_quantiles": 4,
            "examples_per_quantile": 2,
            "target_examples_per_feature": 8,
            "token_window_size": 32,
            "ngram_window_size": 5,
            "ngram_sizes": [2, 3, 4],
            "min_ngram_occurrences": 2
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


class ActivationSimilarityProcessor:
    """Process activation examples to compute similarity metrics."""

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
        self.activation_path = self._resolve_path(config["activation_examples_path"])
        self.embeddings_path = self._resolve_path(config["activation_embeddings_path"])
        self.output_path = self._resolve_path(config["output_path"])

        # Configuration
        self.sae_id = config["sae_id"]
        self.proc_params = config["processing_parameters"]

        # Statistics tracking
        self.stats = {
            "features_processed": 0,
            "features_with_no_activations": 0,
            "features_with_insufficient_examples": 0,
            "total_examples_analyzed": 0,
            "semantic_similarity_computed": 0,
            "ngram_analysis_computed": 0,
            "ngram_jaccard_computed": 0
        }

        # Load embeddings
        self.embeddings_df = None

    def _resolve_path(self, path_str: str) -> Path:
        """Resolve path relative to project root if not absolute."""
        path = Path(path_str)
        if not path.is_absolute():
            return self.project_root / path
        return path

    def _load_embeddings(self):
        """Load pre-computed embeddings."""
        if self.embeddings_df is None:
            logger.info(f"Loading pre-computed embeddings from {self.embeddings_path}")
            if not self.embeddings_path.exists():
                raise FileNotFoundError(
                    f"Pre-computed embeddings not found: {self.embeddings_path}\n"
                    f"Please run: python 4_act_embeddings.py"
                )
            self.embeddings_df = pl.read_parquet(self.embeddings_path)
            logger.info(f"Loaded embeddings for {len(self.embeddings_df):,} features")

    def _select_quantile_examples(self, feature_df: pl.DataFrame) -> List[Tuple[int, float, List[str], int]]:
        """Select examples from quantiles based on max_activation.

        Args:
            feature_df: DataFrame with activation examples for a single feature

        Returns:
            List of tuples: (prompt_id, max_activation, prompt_tokens, max_token_pos)
        """
        # Filter out rows with no activations
        feature_df = feature_df.filter(pl.col("num_activations") > 0)

        if len(feature_df) == 0:
            return []

        num_examples = len(feature_df)
        target_per_quantile = self.proc_params["examples_per_quantile"]
        num_quantiles = self.proc_params["num_quantiles"]

        if num_examples < num_quantiles:
            # Not enough examples for quantiles, return all
            selected = feature_df.select([
                "prompt_id",
                "max_activation",
                "prompt_tokens",
                "activation_pairs"
            ]).to_dicts()
        else:
            # Calculate quantile boundaries
            quantiles = [i / num_quantiles for i in range(1, num_quantiles)]
            # Compute quantiles one at a time to avoid duplicate column names
            q_values = [
                feature_df.select(
                    pl.col("max_activation").quantile(q, interpolation="linear")
                ).item()
                for q in quantiles
            ]

            # Assign quantile groups
            conditions = []
            for i, q_val in enumerate(q_values):
                if i == 0:
                    conditions.append(pl.col("max_activation") <= q_val)
                else:
                    conditions.append(
                        (pl.col("max_activation") > q_values[i-1]) &
                        (pl.col("max_activation") <= q_val)
                    )
            # Last quantile
            conditions.append(pl.col("max_activation") > q_values[-1])

            # Select top examples from each quantile
            selected = []
            for i, condition in enumerate(conditions):
                quantile_df = feature_df.filter(condition).sort("max_activation", descending=True)
                top_n = quantile_df.head(target_per_quantile).select([
                    "prompt_id",
                    "max_activation",
                    "prompt_tokens",
                    "activation_pairs"
                ]).to_dicts()
                selected.extend(top_n)

        # Extract max token position from activation_pairs
        result = []
        for row in selected:
            activation_pairs = row["activation_pairs"]
            if activation_pairs:
                # Find position with max activation
                max_pair = max(activation_pairs, key=lambda x: x["activation_value"])
                max_token_pos = max_pair["token_position"]
            else:
                max_token_pos = 0

            result.append((
                row["prompt_id"],
                row["max_activation"],
                row["prompt_tokens"],
                max_token_pos
            ))

        return result

    def _extract_token_window(self, tokens: List[str], center_pos: int, window_size: int) -> List[str]:
        """Extract symmetric window around center position.

        Args:
            tokens: List of token strings
            center_pos: Center token position
            window_size: Total window size

        Returns:
            List of tokens in window (may be shorter if near edges)
        """
        half_window = window_size // 2
        start = max(0, center_pos - half_window)
        end = min(len(tokens), center_pos + half_window)
        return tokens[start:end]

    def _compute_pairwise_semantic_similarity(self, feature_id: int, examples: List[Tuple]) -> Optional[float]:
        """Compute average pairwise cosine similarity using pre-computed embeddings.

        Args:
            feature_id: Feature ID to look up embeddings
            examples: List of (prompt_id, max_activation, prompt_tokens, max_token_pos)

        Returns:
            Average pairwise similarity or None if <2 examples
        """
        if len(examples) < 2:
            return None

        # Get prompt IDs from examples
        prompt_ids = [ex[0] for ex in examples]

        # Look up pre-computed embeddings for this feature
        feature_embeddings = self.embeddings_df.filter(pl.col("feature_id") == feature_id)

        if len(feature_embeddings) == 0:
            logger.warning(f"No pre-computed embeddings found for feature {feature_id}")
            return None

        # Extract embeddings and prompt_ids lists
        stored_prompt_ids = feature_embeddings["prompt_ids"][0]
        stored_embeddings = feature_embeddings["embeddings"][0]

        # Create mapping from prompt_id to embedding
        embedding_map = {pid: emb for pid, emb in zip(stored_prompt_ids, stored_embeddings)}

        # Get embeddings for the selected examples
        embeddings = []
        for prompt_id in prompt_ids:
            if prompt_id in embedding_map:
                embeddings.append(embedding_map[prompt_id])
            else:
                logger.warning(f"Prompt {prompt_id} not found in pre-computed embeddings for feature {feature_id}")
                return None

        if len(embeddings) < 2:
            return None

        # Convert to numpy array
        embeddings = np.array(embeddings)

        # Compute pairwise cosine similarities
        from sklearn.metrics.pairwise import cosine_similarity
        sim_matrix = cosine_similarity(embeddings)

        # Extract upper triangle (excluding diagonal)
        n = len(embeddings)
        pairwise_sims = []
        for i in range(n):
            for j in range(i + 1, n):
                pairwise_sims.append(sim_matrix[i, j])

        if not pairwise_sims:
            return None

        return float(np.mean(pairwise_sims))

    def _extract_character_ngrams(self, text: str, n: int) -> List[str]:
        """Extract character n-grams from text.

        Args:
            text: Input text
            n: N-gram size

        Returns:
            List of n-grams
        """
        if len(text) < n:
            return []
        return [text[i:i+n] for i in range(len(text) - n + 1)]

    def _compute_jaccard_ngram_similarity(self, examples: List[Tuple], ngram_size: int) -> Optional[float]:
        """Compute average pairwise Jaccard similarity for n-grams.

        Args:
            examples: List of (prompt_id, max_activation, prompt_tokens, max_token_pos)
            ngram_size: Size of n-grams (2, 3, or 4)

        Returns:
            Average Jaccard similarity or None if <2 examples
        """
        if len(examples) < 2:
            return None

        ngram_window = self.proc_params["ngram_window_size"]

        # Extract n-grams for each example
        example_ngrams = []
        for _, _, tokens, max_pos in examples:
            window_tokens = self._extract_token_window(tokens, max_pos, ngram_window)
            window_text = "".join(window_tokens)
            ngrams = set(self._extract_character_ngrams(window_text, ngram_size))
            example_ngrams.append(ngrams)

        # Compute pairwise Jaccard similarities
        n = len(example_ngrams)
        pairwise_jaccards = []
        for i in range(n):
            for j in range(i + 1, n):
                set_a = example_ngrams[i]
                set_b = example_ngrams[j]

                if len(set_a) == 0 and len(set_b) == 0:
                    # Both empty, consider as perfect similarity
                    jaccard = 1.0
                elif len(set_a) == 0 or len(set_b) == 0:
                    # One empty, one not, zero similarity
                    jaccard = 0.0
                else:
                    intersection = len(set_a & set_b)
                    union = len(set_a | set_b)
                    jaccard = intersection / union if union > 0 else 0.0

                pairwise_jaccards.append(jaccard)

        if not pairwise_jaccards:
            return None

        return float(np.mean(pairwise_jaccards))

    def _compute_ngram_analysis(self, examples: List[Tuple]) -> List[Dict]:
        """Compute TOP n-gram per size with per-prompt positions.

        Args:
            examples: List of (prompt_id, max_activation, prompt_tokens, max_token_pos)

        Returns:
            List of dicts with top n-gram per size
        """
        if len(examples) == 0:
            return []

        ngram_window = self.proc_params["ngram_window_size"]
        ngram_sizes = self.proc_params["ngram_sizes"]

        result = []

        for ngram_size in ngram_sizes:
            # Collect n-grams with (prompt_id, position) metadata
            from collections import defaultdict
            ngram_occurrences = defaultdict(list)

            for prompt_id, _, tokens, max_pos in examples:
                window_tokens = self._extract_token_window(tokens, max_pos, ngram_window)
                window_text = "".join(window_tokens)
                ngrams = self._extract_character_ngrams(window_text, ngram_size)

                for ngram in ngrams:
                    ngram_occurrences[ngram].append((prompt_id, max_pos))

            # Find most frequent n-gram
            if ngram_occurrences:
                top_ngram_str, occurrences = max(ngram_occurrences.items(), key=lambda x: len(x[1]))

                # Group by prompt_id
                per_prompt = defaultdict(list)
                for pid, pos in occurrences:
                    per_prompt[pid].append(pos)

                result.append({
                    "ngram": top_ngram_str,
                    "ngram_size": ngram_size,
                    "count": len(occurrences),
                    "occurrences": [
                        {"prompt_id": int(pid), "positions": [int(p) for p in positions]}
                        for pid, positions in per_prompt.items()
                    ]
                })

        return result

    def process_feature(self, feature_id: int, feature_df: pl.DataFrame) -> Dict[str, Any]:
        """Process a single feature to compute all similarity metrics.

        Args:
            feature_id: Feature ID
            feature_df: DataFrame with activation examples for this feature

        Returns:
            Dictionary with computed metrics
        """
        # Select examples from quantiles
        examples = self._select_quantile_examples(feature_df)

        num_total_activations = int(feature_df.filter(pl.col("num_activations") > 0).shape[0])
        prompt_ids = [ex[0] for ex in examples]

        if len(examples) == 0:
            self.stats["features_with_no_activations"] += 1
            return {
                "feature_id": feature_id,
                "sae_id": self.sae_id,
                "prompt_ids_analyzed": prompt_ids,
                "num_total_activations": num_total_activations,
                "avg_pairwise_semantic_similarity": None,
                "top_common_ngrams": [],
                "quantile_boundaries": [],
                "ngram_jaccard_similarity": [None, None, None]
            }

        if len(examples) < self.proc_params["target_examples_per_feature"]:
            self.stats["features_with_insufficient_examples"] += 1

        self.stats["total_examples_analyzed"] += len(examples)

        # Compute metrics
        semantic_sim = self._compute_pairwise_semantic_similarity(feature_id, examples)
        if semantic_sim is not None:
            self.stats["semantic_similarity_computed"] += 1

        # Compute Jaccard similarity for each n-gram size
        ngram_jaccard_list = [
            self._compute_jaccard_ngram_similarity(examples, 2),
            self._compute_jaccard_ngram_similarity(examples, 3),
            self._compute_jaccard_ngram_similarity(examples, 4)
        ]
        if any(j is not None for j in ngram_jaccard_list):
            self.stats["ngram_jaccard_computed"] += 1

        # Get top common n-grams (simplified)
        top_ngrams = self._compute_ngram_analysis(examples)
        if len(top_ngrams) > 0:
            self.stats["ngram_analysis_computed"] += 1

        # Calculate quantile boundaries
        activations = [ex[1] for ex in examples]
        if len(activations) >= self.proc_params["num_quantiles"]:
            num_q = self.proc_params["num_quantiles"]
            quantiles = [i / num_q for i in range(1, num_q)]
            q_boundaries = [float(np.quantile(activations, q)) for q in quantiles]
        else:
            q_boundaries = []

        return {
            "feature_id": feature_id,
            "sae_id": self.sae_id,
            "prompt_ids_analyzed": prompt_ids,
            "num_total_activations": num_total_activations,
            "avg_pairwise_semantic_similarity": semantic_sim,
            "top_common_ngrams": top_ngrams,
            "quantile_boundaries": q_boundaries,
            "ngram_jaccard_similarity": ngram_jaccard_list
        }

    def process_all_features(self) -> pl.DataFrame:
        """Process all features and create DataFrame.

        Returns:
            Polars DataFrame with similarity metrics
        """
        logger.info(f"Loading activation examples from {self.activation_path}")

        if not self.activation_path.exists():
            raise FileNotFoundError(f"Activation examples not found: {self.activation_path}")

        # Load activation data
        df = pl.read_parquet(self.activation_path)
        logger.info(f"Loaded {len(df):,} activation examples")

        # Load embeddings
        self._load_embeddings()

        # Get unique features
        unique_features = sorted(df["feature_id"].unique().to_list())

        # Apply feature limit for testing
        if self.feature_limit is not None:
            unique_features = unique_features[:self.feature_limit]
            logger.info(f"Processing limited to {self.feature_limit} features")

        logger.info(f"Processing {len(unique_features):,} features")

        # Process features
        results = []
        for feature_id in tqdm(unique_features, desc="Processing features"):
            feature_df = df.filter(pl.col("feature_id") == feature_id)
            result = self.process_feature(feature_id, feature_df)
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
            pl.col("num_total_activations").cast(pl.UInt32),
            pl.col("avg_pairwise_semantic_similarity").cast(pl.Float32),
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
            "prompt_ids_analyzed": pl.List(pl.UInt32),
            "num_total_activations": pl.UInt32,
            "avg_pairwise_semantic_similarity": pl.Float32,
            "top_common_ngrams": pl.List(pl.Struct([
                pl.Field("ngram", pl.Utf8),
                pl.Field("ngram_size", pl.UInt8),
                pl.Field("count", pl.UInt16),
                pl.Field("occurrences", pl.List(pl.Struct([
                    pl.Field("prompt_id", pl.UInt32),
                    pl.Field("positions", pl.List(pl.UInt16))
                ])))
            ])),
            "quantile_boundaries": pl.List(pl.Float32),
            "ngram_jaccard_similarity": pl.List(pl.Float32)
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
            # Calculate mean Jaccard similarity across all features and n-gram sizes
            # First, flatten the ngram_jaccard_similarity lists and filter out nulls
            all_jaccard_values = []
            for jaccard_list in df["ngram_jaccard_similarity"].to_list():
                if jaccard_list:
                    all_jaccard_values.extend([j for j in jaccard_list if j is not None])

            mean_jaccard = float(np.mean(all_jaccard_values)) if all_jaccard_values else None

            result_stats = {
                "features_with_similarity": int((~df["avg_pairwise_semantic_similarity"].is_null()).sum()),
                "mean_semantic_similarity": float(df["avg_pairwise_semantic_similarity"].mean()) if df["avg_pairwise_semantic_similarity"].is_not_null().any() else None,
                "mean_jaccard_similarity": mean_jaccard,
                "mean_examples_per_feature": float(df["prompt_ids_analyzed"].list.len().mean())
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
        description='Calculate activation example similarity metrics'
    )
    parser.add_argument(
        '--config',
        type=str,
        default='data/preprocessing/config/9_activation_similarity_config.json',
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
    processor = ActivationSimilarityProcessor(config, feature_limit=args.limit)

    # Process data
    logger.info("=" * 80)
    logger.info("Starting Activation Example Similarity Processing")
    logger.info("=" * 80)

    df = processor.process_all_features()

    # Save parquet
    processor.save_parquet(df)

    logger.info("=" * 80)
    logger.info("Processing Complete!")
    logger.info(f"Statistics:")
    logger.info(f"  Features processed: {processor.stats['features_processed']:,}")
    logger.info(f"  Total examples analyzed: {processor.stats['total_examples_analyzed']:,}")
    logger.info(f"  Semantic similarity computed: {processor.stats['semantic_similarity_computed']:,}")
    logger.info(f"  N-gram analysis computed: {processor.stats['ngram_analysis_computed']:,}")
    logger.info(f"  N-gram Jaccard computed: {processor.stats['ngram_jaccard_computed']:,}")
    logger.info("=" * 80)


if __name__ == "__main__":
    main()
