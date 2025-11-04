#!/usr/bin/env python3
"""
Preprocessing Script: Calculate Inter-Feature Activation Similarity Metrics

This script analyzes activation examples of decoder-similar features to compute
similarity metrics between their activation patterns. For each feature, it:
1. Selects top 4 decoder-similar features
2. Samples activation examples (top 1 per quantile = 4 examples per feature)
3. Computes cross-feature semantic and lexical similarities
4. Tracks common n-grams with positional information for visualization

Input:
- features.parquet: Feature data with decoder_similarity field
- activation_examples.parquet: Structured parquet with activation data
- activation_embeddings.parquet: Pre-computed embeddings

Output:
- interfeature_activation_similarity.parquet: Inter-feature similarity metrics
- interfeature_activation_similarity.parquet.metadata.json: Processing metadata

Features:
- Decoder-similarity-based feature pairing
- Quantile-based sampling (4 quantiles, 1 example each)
- Cross-feature pairwise similarity (4×4=16 pairs per comparison)
- Positional n-gram analysis for visualization
- Native Polars nested types for structured data

Usage:
    python 6_interfeature_similarity.py [--config CONFIG_PATH] [--limit N]

Example:
    python 6_interfeature_similarity.py
    python 6_interfeature_similarity.py --limit 10  # Test on 10 features
"""

import json
import logging
import argparse
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime
from collections import defaultdict
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
        "features_path": "data/master/features.parquet",
        "activation_examples_path": "data/master/activation_examples.parquet",
        "activation_embeddings_path": "data/master/activation_embeddings.parquet",
        "output_path": "data/master/interfeature_activation_similarity.parquet",
        "sae_id": "google--gemma-scope-9b-pt-res--layer_30--width_16k--average_l0_120",
        "processing_parameters": {
            "num_decoder_similar_features": 4,
            "num_quantiles": 4,
            "examples_per_quantile": 1,
            "target_examples_per_feature": 4,
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


class InterFeatureSimilarityProcessor:
    """Process activation examples to compute inter-feature similarity metrics."""

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
        self.activation_path = self._resolve_path(config["activation_examples_path"])
        self.embeddings_path = self._resolve_path(config["activation_embeddings_path"])
        self.output_path = self._resolve_path(config["output_path"])

        # Configuration
        self.sae_id = config["sae_id"]
        self.proc_params = config["processing_parameters"]

        # Statistics tracking
        self.stats = {
            "features_processed": 0,
            "total_pairs_analyzed": 0,
            "features_with_insufficient_decoder_similar": 0,
            "features_with_no_activations": 0,
            "semantic_similarity_computed": 0,
            "ngram_jaccard_computed": 0,
            "ngram_analysis_computed": 0
        }

        # Load data
        self.features_df = None
        self.activation_df = None
        self.embeddings_df = None

    def _resolve_path(self, path_str: str) -> Path:
        """Resolve path relative to project root if not absolute."""
        path = Path(path_str)
        if not path.is_absolute():
            return self.project_root / path
        return path

    def _load_data(self):
        """Load all required data files."""
        if self.features_df is None:
            logger.info(f"Loading features from {self.features_path}")
            if not self.features_path.exists():
                raise FileNotFoundError(f"Features file not found: {self.features_path}")
            self.features_df = pl.read_parquet(self.features_path)
            logger.info(f"Loaded {len(self.features_df):,} feature rows")

        if self.activation_df is None:
            logger.info(f"Loading activation examples from {self.activation_path}")
            if not self.activation_path.exists():
                raise FileNotFoundError(f"Activation examples not found: {self.activation_path}")
            self.activation_df = pl.read_parquet(self.activation_path)
            logger.info(f"Loaded {len(self.activation_df):,} activation examples")

        if self.embeddings_df is None:
            logger.info(f"Loading pre-computed embeddings from {self.embeddings_path}")
            if not self.embeddings_path.exists():
                raise FileNotFoundError(
                    f"Pre-computed embeddings not found: {self.embeddings_path}\n"
                    f"Please run: python 4_act_embeddings.py"
                )
            self.embeddings_df = pl.read_parquet(self.embeddings_path)
            logger.info(f"Loaded embeddings for {len(self.embeddings_df):,} features")

    def _get_top_decoder_similar_features(self, feature_row: Dict) -> List[Tuple[int, float]]:
        """Extract top N decoder-similar features.

        Args:
            feature_row: Row from features.parquet with decoder_similarity field

        Returns:
            List of (feature_id, cosine_similarity) tuples
        """
        decoder_sim = feature_row.get("decoder_similarity", [])
        if not decoder_sim:
            return []

        # Take top N features
        top_n = self.proc_params["num_decoder_similar_features"]
        return [(item["feature_id"], item["cosine_similarity"])
                for item in decoder_sim[:top_n]]

    def _select_top_quantile_examples(self, feature_df: pl.DataFrame) -> List[Tuple[int, float, List[str], int]]:
        """Select top 1 example per quantile based on max_activation.

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
            q_values = [
                feature_df.select(
                    pl.col("max_activation").quantile(q, interpolation="linear")
                ).item()
                for q in quantiles
            ]

            # Assign quantile groups and select top 1 from each
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

            # Select top 1 example from each quantile
            selected = []
            for condition in conditions:
                quantile_df = feature_df.filter(condition).sort("max_activation", descending=True)
                top_1 = quantile_df.head(1).select([
                    "prompt_id",
                    "max_activation",
                    "prompt_tokens",
                    "activation_pairs"
                ]).to_dicts()
                selected.extend(top_1)

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

    def _compute_cross_feature_semantic_similarity(
        self,
        main_feature_id: int,
        main_examples: List[Tuple],
        selected_feature_id: int,
        selected_examples: List[Tuple]
    ) -> Optional[float]:
        """Compute pairwise semantic similarity between main and selected feature examples.

        Args:
            main_feature_id: Main feature ID
            main_examples: List of (prompt_id, max_activation, prompt_tokens, max_token_pos)
            selected_feature_id: Selected feature ID
            selected_examples: List of (prompt_id, max_activation, prompt_tokens, max_token_pos)

        Returns:
            Average pairwise similarity or None if insufficient data
        """
        if len(main_examples) < 1 or len(selected_examples) < 1:
            return None

        # Get embeddings for main feature
        main_prompt_ids = [ex[0] for ex in main_examples]
        main_embeddings_row = self.embeddings_df.filter(pl.col("feature_id") == main_feature_id)

        if len(main_embeddings_row) == 0:
            logger.warning(f"No embeddings found for main feature {main_feature_id}")
            return None

        main_stored_prompt_ids = main_embeddings_row["prompt_ids"][0]
        main_stored_embeddings = main_embeddings_row["embeddings"][0]
        main_embedding_map = {pid: emb for pid, emb in zip(main_stored_prompt_ids, main_stored_embeddings)}

        # Get embeddings for selected feature
        selected_prompt_ids = [ex[0] for ex in selected_examples]
        selected_embeddings_row = self.embeddings_df.filter(pl.col("feature_id") == selected_feature_id)

        if len(selected_embeddings_row) == 0:
            logger.warning(f"No embeddings found for selected feature {selected_feature_id}")
            return None

        selected_stored_prompt_ids = selected_embeddings_row["prompt_ids"][0]
        selected_stored_embeddings = selected_embeddings_row["embeddings"][0]
        selected_embedding_map = {pid: emb for pid, emb in zip(selected_stored_prompt_ids, selected_stored_embeddings)}

        # Collect embeddings for selected prompts
        main_embs = []
        for prompt_id in main_prompt_ids:
            if prompt_id in main_embedding_map:
                main_embs.append(main_embedding_map[prompt_id])
            else:
                logger.warning(f"Prompt {prompt_id} not found in embeddings for feature {main_feature_id}")

        selected_embs = []
        for prompt_id in selected_prompt_ids:
            if prompt_id in selected_embedding_map:
                selected_embs.append(selected_embedding_map[prompt_id])
            else:
                logger.warning(f"Prompt {prompt_id} not found in embeddings for feature {selected_feature_id}")

        if len(main_embs) < 1 or len(selected_embs) < 1:
            return None

        # Convert to numpy arrays
        main_embs = np.array(main_embs)
        selected_embs = np.array(selected_embs)

        # Compute pairwise cosine similarities (all pairs between main and selected)
        from sklearn.metrics.pairwise import cosine_similarity
        sim_matrix = cosine_similarity(main_embs, selected_embs)

        # Average all pairwise similarities
        return float(np.mean(sim_matrix))

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

    def _compute_cross_feature_jaccard_similarity(
        self,
        main_examples: List[Tuple],
        selected_examples: List[Tuple],
        ngram_size: int
    ) -> Optional[float]:
        """Compute average pairwise Jaccard similarity for n-grams between features.

        Args:
            main_examples: List of (prompt_id, max_activation, prompt_tokens, max_token_pos)
            selected_examples: List of (prompt_id, max_activation, prompt_tokens, max_token_pos)
            ngram_size: Size of n-grams (2, 3, or 4)

        Returns:
            Average Jaccard similarity or None if insufficient data
        """
        if len(main_examples) < 1 or len(selected_examples) < 1:
            return None

        ngram_window = self.proc_params["ngram_window_size"]

        # Extract n-grams for main feature examples
        main_ngrams = []
        for _, _, tokens, max_pos in main_examples:
            window_tokens = self._extract_token_window(tokens, max_pos, ngram_window)
            window_text = "".join(window_tokens)
            ngrams = set(self._extract_character_ngrams(window_text, ngram_size))
            main_ngrams.append(ngrams)

        # Extract n-grams for selected feature examples
        selected_ngrams = []
        for _, _, tokens, max_pos in selected_examples:
            window_tokens = self._extract_token_window(tokens, max_pos, ngram_window)
            window_text = "".join(window_tokens)
            ngrams = set(self._extract_character_ngrams(window_text, ngram_size))
            selected_ngrams.append(ngrams)

        # Compute pairwise Jaccard similarities (all pairs)
        pairwise_jaccards = []
        for main_set in main_ngrams:
            for selected_set in selected_ngrams:
                if len(main_set) == 0 and len(selected_set) == 0:
                    jaccard = 1.0
                elif len(main_set) == 0 or len(selected_set) == 0:
                    jaccard = 0.0
                else:
                    intersection = len(main_set & selected_set)
                    union = len(main_set | selected_set)
                    jaccard = intersection / union if union > 0 else 0.0
                pairwise_jaccards.append(jaccard)

        if not pairwise_jaccards:
            return None

        return float(np.mean(pairwise_jaccards))

    def _compute_combined_ngram_analysis(
        self,
        main_feature_id: int,
        main_examples: List[Tuple],
        selected_feature_id: int,
        selected_examples: List[Tuple]
    ) -> List[Dict]:
        """Compute top common n-grams across combined examples with feature tracking.

        Args:
            main_feature_id: Main feature ID
            main_examples: List of (prompt_id, max_activation, prompt_tokens, max_token_pos)
            selected_feature_id: Selected feature ID
            selected_examples: List of (prompt_id, max_activation, prompt_tokens, max_token_pos)

        Returns:
            List of dicts with top n-gram per size, including feature_id in occurrences
        """
        ngram_window = self.proc_params["ngram_window_size"]
        ngram_sizes = self.proc_params["ngram_sizes"]

        result = []

        for ngram_size in ngram_sizes:
            # Collect n-grams with (feature_id, prompt_id, position) metadata
            ngram_occurrences = defaultdict(list)

            # Process main feature examples
            for prompt_id, _, tokens, max_pos in main_examples:
                window_tokens = self._extract_token_window(tokens, max_pos, ngram_window)
                window_text = "".join(window_tokens)
                ngrams = self._extract_character_ngrams(window_text, ngram_size)

                for ngram in ngrams:
                    ngram_occurrences[ngram].append((main_feature_id, prompt_id, max_pos))

            # Process selected feature examples
            for prompt_id, _, tokens, max_pos in selected_examples:
                window_tokens = self._extract_token_window(tokens, max_pos, ngram_window)
                window_text = "".join(window_tokens)
                ngrams = self._extract_character_ngrams(window_text, ngram_size)

                for ngram in ngrams:
                    ngram_occurrences[ngram].append((selected_feature_id, prompt_id, max_pos))

            # Find most frequent n-gram
            if ngram_occurrences:
                top_ngram_str, occurrences = max(ngram_occurrences.items(), key=lambda x: len(x[1]))

                # Group by (feature_id, prompt_id)
                per_prompt = defaultdict(lambda: {"feature_id": None, "prompt_id": None, "positions": []})
                for feat_id, pid, pos in occurrences:
                    key = (feat_id, pid)
                    if per_prompt[key]["feature_id"] is None:
                        per_prompt[key]["feature_id"] = feat_id
                        per_prompt[key]["prompt_id"] = pid
                    per_prompt[key]["positions"].append(pos)

                result.append({
                    "ngram": top_ngram_str,
                    "ngram_size": ngram_size,
                    "count": len(occurrences),
                    "occurrences": [
                        {
                            "feature_id": int(v["feature_id"]),
                            "prompt_id": int(v["prompt_id"]),
                            "positions": [int(p) for p in v["positions"]]
                        }
                        for v in per_prompt.values()
                    ]
                })

        return result

    def process_feature(self, feature_id: int) -> Dict[str, Any]:
        """Process a single feature to compute inter-feature similarity metrics.

        Args:
            feature_id: Feature ID

        Returns:
            Dictionary with computed metrics
        """
        # Get feature row with decoder_similarity
        feature_row = self.features_df.filter(pl.col("feature_id") == feature_id).to_dicts()
        if not feature_row:
            logger.warning(f"Feature {feature_id} not found in features.parquet")
            return {
                "feature_id": feature_id,
                "sae_id": self.sae_id,
                "num_similar_features_analyzed": 0,
                "similarity_pairs": []
            }

        feature_row = feature_row[0]

        # Get top decoder-similar features
        decoder_similar = self._get_top_decoder_similar_features(feature_row)

        if len(decoder_similar) < self.proc_params["num_decoder_similar_features"]:
            self.stats["features_with_insufficient_decoder_similar"] += 1

        # Get activation examples for main feature
        main_feature_df = self.activation_df.filter(pl.col("feature_id") == feature_id)
        main_examples = self._select_top_quantile_examples(main_feature_df)

        if len(main_examples) == 0:
            self.stats["features_with_no_activations"] += 1
            return {
                "feature_id": feature_id,
                "sae_id": self.sae_id,
                "num_similar_features_analyzed": 0,
                "similarity_pairs": []
            }

        main_prompt_ids = [ex[0] for ex in main_examples]

        # Process each decoder-similar feature
        similarity_pairs = []
        for selected_feature_id, decoder_sim in decoder_similar:
            # Get activation examples for selected feature
            selected_feature_df = self.activation_df.filter(pl.col("feature_id") == selected_feature_id)
            selected_examples = self._select_top_quantile_examples(selected_feature_df)

            if len(selected_examples) == 0:
                continue

            selected_prompt_ids = [ex[0] for ex in selected_examples]

            # Compute semantic similarity
            semantic_sim = self._compute_cross_feature_semantic_similarity(
                feature_id, main_examples,
                selected_feature_id, selected_examples
            )
            if semantic_sim is not None:
                self.stats["semantic_similarity_computed"] += 1

            # Compute Jaccard similarity for each n-gram size
            ngram_jaccard_list = [
                self._compute_cross_feature_jaccard_similarity(main_examples, selected_examples, 2),
                self._compute_cross_feature_jaccard_similarity(main_examples, selected_examples, 3),
                self._compute_cross_feature_jaccard_similarity(main_examples, selected_examples, 4)
            ]
            if any(j is not None for j in ngram_jaccard_list):
                self.stats["ngram_jaccard_computed"] += 1

            # Compute common n-grams with positional info
            top_ngrams = self._compute_combined_ngram_analysis(
                feature_id, main_examples,
                selected_feature_id, selected_examples
            )
            if len(top_ngrams) > 0:
                self.stats["ngram_analysis_computed"] += 1

            similarity_pairs.append({
                "selected_feature_id": selected_feature_id,
                "decoder_cosine_similarity": decoder_sim,
                "num_main_examples": len(main_examples),
                "num_selected_examples": len(selected_examples),
                "main_prompt_ids": main_prompt_ids,
                "selected_prompt_ids": selected_prompt_ids,
                "semantic_similarity": semantic_sim,
                "ngram_jaccard_similarity": ngram_jaccard_list,
                "top_common_ngrams": top_ngrams
            })

            self.stats["total_pairs_analyzed"] += 1

        return {
            "feature_id": feature_id,
            "sae_id": self.sae_id,
            "num_similar_features_analyzed": len(similarity_pairs),
            "similarity_pairs": similarity_pairs
        }

    def process_all_features(self) -> pl.DataFrame:
        """Process all features and create DataFrame.

        Returns:
            Polars DataFrame with inter-feature similarity metrics
        """
        # Load data
        self._load_data()

        # Get unique features from features.parquet
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
            pl.col("num_similar_features_analyzed").cast(pl.UInt8),
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
            "num_similar_features_analyzed": pl.UInt8,
            "similarity_pairs": pl.List(pl.Struct([
                pl.Field("selected_feature_id", pl.UInt32),
                pl.Field("decoder_cosine_similarity", pl.Float32),
                pl.Field("num_main_examples", pl.UInt8),
                pl.Field("num_selected_examples", pl.UInt8),
                pl.Field("main_prompt_ids", pl.List(pl.UInt32)),
                pl.Field("selected_prompt_ids", pl.List(pl.UInt32)),
                pl.Field("semantic_similarity", pl.Float32),
                pl.Field("ngram_jaccard_similarity", pl.List(pl.Float32)),
                pl.Field("top_common_ngrams", pl.List(pl.Struct([
                    pl.Field("ngram", pl.Utf8),
                    pl.Field("ngram_size", pl.UInt8),
                    pl.Field("count", pl.UInt16),
                    pl.Field("occurrences", pl.List(pl.Struct([
                        pl.Field("feature_id", pl.UInt32),
                        pl.Field("prompt_id", pl.UInt32),
                        pl.Field("positions", pl.List(pl.UInt16))
                    ])))
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
            # Flatten all semantic similarities
            all_semantic_sims = []
            all_jaccard_sims = []

            for row in df.iter_rows(named=True):
                pairs = row.get("similarity_pairs", [])
                if pairs:
                    for pair in pairs:
                        sem_sim = pair.get("semantic_similarity")
                        if sem_sim is not None:
                            all_semantic_sims.append(sem_sim)

                        jaccard_list = pair.get("ngram_jaccard_similarity", [])
                        if jaccard_list:
                            all_jaccard_sims.extend([j for j in jaccard_list if j is not None])

            result_stats = {
                "features_with_pairs": int((df["num_similar_features_analyzed"] > 0).sum()),
                "total_pairs": int(df["num_similar_features_analyzed"].sum()),
                "mean_pairs_per_feature": float(df["num_similar_features_analyzed"].mean()),
                "mean_semantic_similarity": float(np.mean(all_semantic_sims)) if all_semantic_sims else None,
                "mean_jaccard_similarity": float(np.mean(all_jaccard_sims)) if all_jaccard_sims else None,
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
        description='Calculate inter-feature activation similarity metrics'
    )
    parser.add_argument(
        '--config',
        type=str,
        default='data/preprocessing/config/6_interfeature_similarity.json',
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
    processor = InterFeatureSimilarityProcessor(config, feature_limit=args.limit)

    # Process data
    logger.info("=" * 80)
    logger.info("Starting Inter-Feature Activation Similarity Processing")
    logger.info("=" * 80)

    df = processor.process_all_features()

    # Save parquet
    processor.save_parquet(df)

    logger.info("=" * 80)
    logger.info("Processing Complete!")
    logger.info(f"Statistics:")
    logger.info(f"  Features processed: {processor.stats['features_processed']:,}")
    logger.info(f"  Total pairs analyzed: {processor.stats['total_pairs_analyzed']:,}")
    logger.info(f"  Features with insufficient decoder similar: {processor.stats['features_with_insufficient_decoder_similar']:,}")
    logger.info(f"  Features with no activations: {processor.stats['features_with_no_activations']:,}")
    logger.info(f"  Semantic similarity computed: {processor.stats['semantic_similarity_computed']:,}")
    logger.info(f"  N-gram Jaccard computed: {processor.stats['ngram_jaccard_computed']:,}")
    logger.info(f"  N-gram analysis computed: {processor.stats['ngram_analysis_computed']:,}")
    logger.info("=" * 80)


if __name__ == "__main__":
    main()
