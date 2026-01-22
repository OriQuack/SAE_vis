#!/usr/bin/env python3
"""
Step 9: Calculate Inter-Feature Activation Similarity Metrics

This step analyzes activation examples of decoder-similar features to compute
similarity metrics between their activation patterns using dual n-gram architecture
with position tracking for frontend visualization.

For each feature, it:
1. Gets top-N decoder-similar and semantic-similar features from precomputed matrices
2. Samples activation examples (max 2 per quantile = 8 examples per feature)
3. Computes cross-feature semantic and lexical similarities
4. Tracks n-gram positions for visualization highlighting
5. Classifies patterns as Semantic and/or Lexical
6. Outputs all pairs (filtering done in step_11)

Input:
- activation_examples.parquet: Structured parquet with activation data
- activation_embeddings.parquet: Pre-computed embeddings
- decoder_similarity_matrix.npz: Pre-computed decoder similarity matrix
- Semantic similarity is computed on-the-fly from activation_embeddings

Output:
- interfeature_similarity.parquet: Inter-feature similarity metrics
"""

import logging
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import polars as pl
from tqdm import tqdm

# Enable string cache for categorical operations
pl.enable_string_cache()

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.base import BaseProcessor, load_yaml_config
from core.logging import setup_logging
from core.tokens import extract_token_window, normalize_token, calculate_window_offset
from core.ngrams import (
    extract_token_char_ngrams_simple,
    extract_word_ngrams,
    compute_jaccard_similarity,
    compute_cross_feature_specific_ngram_jaccard,
    find_top_ngram,
)


logger = logging.getLogger(__name__)


class InterFeatureSimilarityProcessor(BaseProcessor):
    """Process activation examples to compute inter-feature similarity metrics."""

    @property
    def step_name(self) -> str:
        return "Step 9: InterFeature Similarity"

    @property
    def version(self) -> str:
        return "2.0"

    def _init_paths(self) -> None:
        """Initialize paths from configuration."""
        super()._init_paths()

        # Get paths from global config
        global_config = self.config.get("global", {})
        paths = global_config.get("paths", {})
        intermediate_dir = paths.get("intermediate", "data/intermediate")

        # Input paths
        self.activation_path = self._resolve_path(f"{intermediate_dir}/activation_examples.parquet")
        self.embeddings_path = self._resolve_path(f"{intermediate_dir}/activation_embeddings.parquet")

        # Decoder similarity matrix (required)
        self.decoder_sim_path = self._resolve_path(f"{intermediate_dir}/decoder_similarity_matrix.npz")

        # Output path
        self.output_path = self._resolve_path(f"{intermediate_dir}/interfeature_similarity.parquet")

        # Processing parameters from step config
        params = self.config.get("parameters", {})

        self.proc_params = {
            # Feature similarity settings
            "top_n_decoder_similar": params.get("top_n_decoder_similar", 4),
            "top_n_semantic_similar": params.get("top_n_semantic_similar", 10),
            # Window sizes
            "embedding_window_size": params.get("embedding_window_size", 32),
            "char_ngram_window_size": params.get("char_ngram_window_size", 3),
            "word_ngram_window_size": params.get("word_ngram_window_size", 11),
            # N-gram settings
            "char_ngram_sizes": params.get("char_ngram_sizes", [2, 3, 4, 5]),
            "word_ngram_sizes": params.get("word_ngram_sizes", [1, 2, 3]),
        }

        # Statistics tracking
        self.stats = {
            "features_processed": 0,
            "total_pairs_compared": 0,
            "total_pairs_saved": 0,
            "pairs_from_decoder": 0,
            "pairs_from_semantic": 0,
            "pairs_from_both": 0,
            "features_with_no_activations": 0
        }

        # Data holders
        self.activation_df: Optional[pl.DataFrame] = None
        self.embeddings_df: Optional[pl.DataFrame] = None
        self.decoder_sim_matrix: Optional[np.ndarray] = None
        self.mean_embeddings: Optional[np.ndarray] = None  # Computed from activation_embeddings
        self.num_features: int = 0

    def _load_decoder_similarity_matrix(self) -> None:
        """Load precomputed decoder similarity matrix."""
        if not self.decoder_sim_path.exists():
            raise FileNotFoundError(f"Decoder similarity matrix not found: {self.decoder_sim_path}")
        logger.info(f"Loading decoder similarity matrix from {self.decoder_sim_path}")
        data = np.load(self.decoder_sim_path)
        self.decoder_sim_matrix = data['cosine_similarity']
        self.num_features = self.decoder_sim_matrix.shape[0]
        logger.info(f"Loaded decoder matrix shape: {self.decoder_sim_matrix.shape}")

    def _compute_mean_embeddings(self) -> None:
        """Compute aggregated normalized embeddings from activation_embeddings.parquet.

        Creates mean embeddings per feature from the 16 sampled activation embeddings.
        Result is L2 normalized for efficient cosine similarity via dot product.
        """
        logger.info("Computing mean embeddings for semantic similarity...")

        # Get embedding dimension from first non-empty row
        embedding_dim = 768  # Default
        for row in self.embeddings_df.iter_rows(named=True):
            embs = row["embeddings"]
            if embs and len(embs) > 0:
                embedding_dim = len(embs[0])
                break

        # Initialize array
        self.mean_embeddings = np.zeros((self.num_features, embedding_dim), dtype=np.float32)

        # Aggregate embeddings per feature
        for row in self.embeddings_df.iter_rows(named=True):
            feature_id = row["feature_id"]
            embs = row["embeddings"]
            if embs and len(embs) > 0:
                self.mean_embeddings[feature_id] = np.mean(embs, axis=0)

        # L2 normalize (handle zero vectors)
        norms = np.linalg.norm(self.mean_embeddings, axis=1, keepdims=True)
        norms[norms == 0] = 1.0  # Avoid division by zero
        self.mean_embeddings = self.mean_embeddings / norms

        logger.info(f"Computed normalized mean embeddings: {self.mean_embeddings.shape}")

    def _load_data(self) -> None:
        """Load all required data files."""
        # Load decoder similarity matrix first (sets num_features)
        self._load_decoder_similarity_matrix()

        logger.info(f"Loading activation examples from {self.activation_path}")
        if not self.activation_path.exists():
            raise FileNotFoundError(f"Activation examples not found: {self.activation_path}")
        self.activation_df = pl.read_parquet(self.activation_path)
        logger.info(f"Loaded {len(self.activation_df):,} activation examples")

        logger.info(f"Loading pre-computed embeddings from {self.embeddings_path}")
        if not self.embeddings_path.exists():
            raise FileNotFoundError(f"Pre-computed embeddings not found: {self.embeddings_path}")
        self.embeddings_df = pl.read_parquet(self.embeddings_path)
        logger.info(f"Loaded embeddings for {len(self.embeddings_df):,} features")

        # Compute mean embeddings for semantic similarity (on-the-fly)
        self._compute_mean_embeddings()

    def _get_top_decoder_similar_from_matrix(self, feature_id: int) -> List[Tuple[int, float]]:
        """Get top N decoder-similar features directly from precomputed matrix."""
        if self.decoder_sim_matrix is None:
            return []

        top_n = self.proc_params["top_n_decoder_similar"]
        sim_row = self.decoder_sim_matrix[feature_id].copy()

        # Exclude self by setting diagonal to -inf
        sim_row[feature_id] = -np.inf

        # Get top N indices
        top_indices = np.argsort(sim_row)[::-1][:top_n]
        return [(int(idx), float(self.decoder_sim_matrix[feature_id, idx])) for idx in top_indices]

    def _get_top_semantic_similar_features(self, feature_id: int) -> List[Tuple[int, float]]:
        """Get top N semantically similar features using computed mean embeddings.

        Semantic similarity is computed as dot product of L2-normalized embeddings,
        which equals cosine similarity.
        """
        if self.mean_embeddings is None:
            return []

        top_n = self.proc_params.get("top_n_semantic_similar", 20)
        if top_n == 0:
            return []

        if feature_id < 0 or feature_id >= self.mean_embeddings.shape[0]:
            return []

        # Compute similarity with all features (dot product of normalized vectors = cosine sim)
        query_emb = self.mean_embeddings[feature_id]
        similarities = self.mean_embeddings @ query_emb  # (num_features,)

        # Exclude self
        similarities[feature_id] = -np.inf

        # Get top N
        top_indices = np.argsort(similarities)[::-1][:top_n]
        return [(int(idx), float(similarities[idx])) for idx in top_indices]

    def _get_examples_from_embeddings(self, feature_id: int) -> List[Tuple]:
        """Get activation examples using prompt IDs from pre-computed embeddings."""
        feature_embeddings = self.embeddings_df.filter(pl.col("feature_id") == feature_id)

        if len(feature_embeddings) == 0:
            return []

        stored_prompt_ids = feature_embeddings["prompt_ids"][0]
        if hasattr(stored_prompt_ids, 'to_list'):
            stored_prompt_ids = stored_prompt_ids.to_list()

        if not stored_prompt_ids:
            return []

        feature_df = self.activation_df.filter(
            (pl.col("feature_id") == feature_id) &
            (pl.col("prompt_id").is_in(stored_prompt_ids))
        )

        if len(feature_df) == 0:
            return []

        examples = []
        for row in feature_df.to_dicts():
            prompt_id = row["prompt_id"]
            max_activation = row.get("max_activation", 0.0)
            prompt_tokens = row.get("prompt_tokens", [])
            activation_pairs = row.get("activation_pairs", [])

            if activation_pairs:
                max_pair = max(activation_pairs, key=lambda x: x["activation_value"])
                max_token_pos = max_pair["token_position"]
            else:
                max_token_pos = 0

            examples.append((prompt_id, max_activation, prompt_tokens, max_token_pos))

        return sorted(examples, key=lambda x: x[1], reverse=True)

    def _find_char_ngram_positions_in_examples(
        self,
        examples: List[Tuple],
        char_ngram: str,
        window_size: int
    ) -> List[Dict]:
        """Find all positions where a character n-gram appears in examples."""
        if not char_ngram:
            return []

        result = []
        for prompt_id, _, tokens, max_pos in examples:
            window_tokens = extract_token_window(tokens, max_pos, window_size)
            window_offset = calculate_window_offset(max_pos, window_size)

            positions = []
            for token_idx, token in enumerate(window_tokens):
                token_normalized = normalize_token(token).lower()

                for char_offset in range(len(token_normalized) - len(char_ngram) + 1):
                    if token_normalized[char_offset:char_offset + len(char_ngram)] == char_ngram:
                        positions.append({
                            'token_position': int(window_offset + token_idx),
                            'char_offset': int(char_offset)
                        })

            if positions:
                result.append({
                    'prompt_id': int(prompt_id),
                    'positions': positions
                })

        return result

    def _find_word_ngram_positions_in_examples(
        self,
        examples: List[Tuple],
        word_ngram: str,
        window_size: int
    ) -> List[Dict]:
        """Find all positions where a word n-gram appears in examples."""
        if not word_ngram:
            return []

        result = []
        word_ngram_sizes = self.proc_params["word_ngram_sizes"]

        for prompt_id, _, tokens, max_pos in examples:
            window_tokens = extract_token_window(tokens, max_pos, window_size)
            word_ngram_map = extract_word_ngrams(window_tokens, word_ngram_sizes)
            positions = word_ngram_map.get(word_ngram, [])

            if positions:
                window_offset = calculate_window_offset(max_pos, window_size)
                result.append({
                    'prompt_id': int(prompt_id),
                    'positions': [int(window_offset + p) for p in positions]
                })

        return result

    def _compute_dual_jaccard_similarity(
        self,
        main_examples: List[Tuple],
        selected_examples: List[Tuple]
    ) -> Tuple:
        """Compute character and word Jaccard similarities with position tracking."""
        if len(main_examples) < 1 or len(selected_examples) < 1:
            return None, None, None, None, None, None, [], [], [], []

        char_window_size = self.proc_params["char_ngram_window_size"]
        word_window_size = self.proc_params["word_ngram_window_size"]
        char_ngram_sizes = self.proc_params["char_ngram_sizes"]
        word_ngram_sizes = self.proc_params["word_ngram_sizes"]

        # Extract character n-grams from all examples
        all_char_ngrams = []
        main_char_ngram_sets = []
        selected_char_ngram_sets = []

        for _, _, tokens, max_pos in main_examples:
            window_tokens = extract_token_window(tokens, max_pos, char_window_size)
            char_ngram_map = extract_token_char_ngrams_simple(window_tokens, char_ngram_sizes)
            ngram_set = set(char_ngram_map.keys())
            main_char_ngram_sets.append(ngram_set)
            all_char_ngrams.extend(list(ngram_set))

        for _, _, tokens, max_pos in selected_examples:
            window_tokens = extract_token_window(tokens, max_pos, char_window_size)
            char_ngram_map = extract_token_char_ngrams_simple(window_tokens, char_ngram_sizes)
            ngram_set = set(char_ngram_map.keys())
            selected_char_ngram_sets.append(ngram_set)
            all_char_ngrams.extend(list(ngram_set))

        # Find most frequent char n-gram
        max_char_ngram = None
        if all_char_ngrams:
            char_counter = Counter(all_char_ngrams)
            max_char_ngram = find_top_ngram(dict(char_counter))

        # Compute pairwise Jaccard for char n-grams
        char_pairwise_jaccards = []
        for main_set in main_char_ngram_sets:
            for selected_set in selected_char_ngram_sets:
                jaccard = compute_jaccard_similarity(main_set, selected_set)
                char_pairwise_jaccards.append(jaccard)

        char_jaccard = float(np.mean(char_pairwise_jaccards)) if char_pairwise_jaccards else None

        # Extract word n-grams from all examples
        all_word_ngrams = []
        main_word_ngram_sets = []
        selected_word_ngram_sets = []

        for _, _, tokens, max_pos in main_examples:
            window_tokens = extract_token_window(tokens, max_pos, word_window_size)
            word_ngram_map = extract_word_ngrams(window_tokens, word_ngram_sizes)
            ngram_set = set(word_ngram_map.keys())
            main_word_ngram_sets.append(ngram_set)
            all_word_ngrams.extend(list(ngram_set))

        for _, _, tokens, max_pos in selected_examples:
            window_tokens = extract_token_window(tokens, max_pos, word_window_size)
            word_ngram_map = extract_word_ngrams(window_tokens, word_ngram_sizes)
            ngram_set = set(word_ngram_map.keys())
            selected_word_ngram_sets.append(ngram_set)
            all_word_ngrams.extend(list(ngram_set))

        # Find most frequent word n-gram
        max_word_ngram = None
        if all_word_ngrams:
            word_counter = Counter(all_word_ngrams)
            max_word_ngram = find_top_ngram(dict(word_counter))

        # Compute pairwise Jaccard for word n-grams
        word_pairwise_jaccards = []
        for main_set in main_word_ngram_sets:
            for selected_set in selected_word_ngram_sets:
                jaccard = compute_jaccard_similarity(main_set, selected_set)
                word_pairwise_jaccards.append(jaccard)

        word_jaccard = float(np.mean(word_pairwise_jaccards)) if word_pairwise_jaccards else None

        # Extract position data for all examples
        main_char_positions = self._find_char_ngram_positions_in_examples(
            main_examples, max_char_ngram, char_window_size
        ) if max_char_ngram else []

        similar_char_positions = self._find_char_ngram_positions_in_examples(
            selected_examples, max_char_ngram, char_window_size
        ) if max_char_ngram else []

        main_word_positions = self._find_word_ngram_positions_in_examples(
            main_examples, max_word_ngram, word_window_size
        ) if max_word_ngram else []

        similar_word_positions = self._find_word_ngram_positions_in_examples(
            selected_examples, max_word_ngram, word_window_size
        ) if max_word_ngram else []

        # Compute specific Jaccard for max n-grams
        max_char_ngram_jaccard = compute_cross_feature_specific_ngram_jaccard(
            main_examples, selected_examples, max_char_ngram,
            char_window_size, is_word=False
        ) if max_char_ngram else None

        max_word_ngram_jaccard = compute_cross_feature_specific_ngram_jaccard(
            main_examples, selected_examples, max_word_ngram,
            word_window_size, is_word=True
        ) if max_word_ngram else None

        return (char_jaccard, word_jaccard, max_char_ngram, max_word_ngram,
                max_char_ngram_jaccard, max_word_ngram_jaccard,
                main_char_positions, similar_char_positions,
                main_word_positions, similar_word_positions)

    def _process_feature(self, feature_id: int) -> Dict[str, Any]:
        """Process a single feature to compute inter-feature similarity metrics."""
        # Get similar features from both precomputed matrices
        decoder_similar = self._get_top_decoder_similar_from_matrix(feature_id)
        semantic_similar = self._get_top_semantic_similar_features(feature_id)

        # Merge pairs from both sources
        pair_sources: Dict[int, Dict[str, Any]] = {}

        for feat_id, dec_sim in decoder_similar:
            pair_sources[feat_id] = {
                "decoder_sim": dec_sim,
                "precomputed_semantic_sim": None,
                "source": "decoder"
            }

        for feat_id, sem_sim in semantic_similar:
            if feat_id in pair_sources:
                pair_sources[feat_id]["precomputed_semantic_sim"] = sem_sim
                pair_sources[feat_id]["source"] = "both"
            else:
                pair_sources[feat_id] = {
                    "decoder_sim": None,
                    "precomputed_semantic_sim": sem_sim,
                    "source": "semantic"
                }

        # Get main feature examples
        main_examples = self._get_examples_from_embeddings(feature_id)
        if len(main_examples) == 0:
            self.stats["features_with_no_activations"] += 1
            return {"feature_id": feature_id, "sae_id": self.sae_id, "all_pairs": []}

        main_prompt_ids = [ex[0] for ex in main_examples]

        # Process each similar feature
        all_pairs = []
        for selected_feature_id, pair_info in pair_sources.items():
            selected_examples = self._get_examples_from_embeddings(selected_feature_id)
            if len(selected_examples) == 0:
                continue

            selected_prompt_ids = [ex[0] for ex in selected_examples]

            # Compute semantic similarity on-the-fly (dot product of normalized embeddings)
            if self.mean_embeddings is not None:
                semantic_sim = float(
                    self.mean_embeddings[feature_id] @ self.mean_embeddings[selected_feature_id]
                )
            else:
                semantic_sim = None

            # Compute dual Jaccard similarity
            (char_jaccard, word_jaccard, max_char_ngram, max_word_ngram,
             max_char_ngram_jaccard, max_word_ngram_jaccard,
             main_char_pos, similar_char_pos, main_word_pos, similar_word_pos
            ) = self._compute_dual_jaccard_similarity(main_examples, selected_examples)

            self.stats["total_pairs_compared"] += 1

            # Track source statistics
            source = pair_info["source"]
            if source == "decoder":
                self.stats["pairs_from_decoder"] += 1
            elif source == "semantic":
                self.stats["pairs_from_semantic"] += 1
            else:
                self.stats["pairs_from_both"] += 1

            # Get decoder similarity
            if self.decoder_sim_matrix is not None:
                decoder_sim = float(self.decoder_sim_matrix[feature_id, selected_feature_id])
            else:
                decoder_sim = float(pair_info["decoder_sim"]) if pair_info["decoder_sim"] is not None else None

            pair_dict = {
                "similar_feature_id": int(selected_feature_id),
                "decoder_similarity": decoder_sim,
                "similarity_source": source,
                "semantic_similarity": float(semantic_sim) if semantic_sim is not None else None,
                "char_jaccard": float(char_jaccard) if char_jaccard is not None else None,
                "word_jaccard": float(word_jaccard) if word_jaccard is not None else None,
                "main_prompt_ids": [int(pid) for pid in main_prompt_ids],
                "similar_prompt_ids": [int(pid) for pid in selected_prompt_ids],
                "num_comparisons": int(len(main_examples) * len(selected_examples)),
                "max_char_ngram": max_char_ngram,
                "max_char_ngram_size": int(len(max_char_ngram)) if max_char_ngram else None,
                "max_char_ngram_jaccard": float(max_char_ngram_jaccard) if max_char_ngram_jaccard is not None else None,
                "max_word_ngram": max_word_ngram,
                "max_word_ngram_size": int(len(max_word_ngram.split())) if max_word_ngram else None,
                "max_word_ngram_jaccard": float(max_word_ngram_jaccard) if max_word_ngram_jaccard is not None else None,
                "main_char_ngram_positions": main_char_pos,
                "similar_char_ngram_positions": similar_char_pos,
                "main_word_ngram_positions": main_word_pos,
                "similar_word_ngram_positions": similar_word_pos
            }

            all_pairs.append(pair_dict)
            self.stats["total_pairs_saved"] += 1

        return {
            "feature_id": feature_id,
            "sae_id": self.sae_id,
            "all_pairs": all_pairs
        }

    def process(self) -> pl.DataFrame:
        """Execute the main processing logic."""
        self._load_data()

        # Get feature IDs from the matrix dimensions (0 to num_features-1)
        all_feature_ids = list(range(self.num_features))

        if self.feature_limit is not None:
            all_feature_ids = all_feature_ids[:self.feature_limit]
            logger.info(f"Processing limited to {self.feature_limit} features")

        logger.info(f"Processing {len(all_feature_ids):,} features")

        results = []
        for feature_id in tqdm(all_feature_ids, desc="Processing features"):
            result = self._process_feature(feature_id)
            results.append(result)
            self.stats["features_processed"] += 1

        logger.info(f"Processed {self.stats['features_processed']:,} features")

        return self._create_dataframe(results)

    def _create_dataframe(self, rows: List[Dict]) -> pl.DataFrame:
        """Create Polars DataFrame with proper schema."""
        logger.info("Creating DataFrame with proper schema")

        if not rows:
            logger.warning("No results to convert to DataFrame")
            target_schema = self._get_target_schema()
            return pl.DataFrame(schema=target_schema)

        df = pl.DataFrame(rows)

        # Get target schema for casting
        target_schema = self._get_target_schema()

        df = df.with_columns([
            pl.col("feature_id").cast(pl.UInt32),
            pl.col("sae_id").cast(pl.Categorical),
            pl.col("all_pairs").cast(target_schema["all_pairs"])
        ])

        logger.info(f"Created DataFrame with {len(df)} rows and {len(df.columns)} columns")
        return df

    def _get_target_schema(self) -> Dict:
        """Get the target schema with proper types."""
        char_position_struct = pl.Struct([
            pl.Field("token_position", pl.UInt16),
            pl.Field("char_offset", pl.UInt8)
        ])

        char_ngram_positions_struct = pl.Struct([
            pl.Field("prompt_id", pl.UInt32),
            pl.Field("positions", pl.List(char_position_struct))
        ])

        word_ngram_positions_struct = pl.Struct([
            pl.Field("prompt_id", pl.UInt32),
            pl.Field("positions", pl.List(pl.UInt16))
        ])

        pair_struct = pl.Struct([
            pl.Field("similar_feature_id", pl.UInt32),
            pl.Field("decoder_similarity", pl.Float32),
            pl.Field("similarity_source", pl.Utf8),
            pl.Field("semantic_similarity", pl.Float32),
            pl.Field("char_jaccard", pl.Float32),
            pl.Field("word_jaccard", pl.Float32),
            pl.Field("main_prompt_ids", pl.List(pl.UInt32)),
            pl.Field("similar_prompt_ids", pl.List(pl.UInt32)),
            pl.Field("num_comparisons", pl.UInt32),
            pl.Field("max_char_ngram", pl.Utf8),
            pl.Field("max_char_ngram_size", pl.UInt8),
            pl.Field("max_char_ngram_jaccard", pl.Float32),
            pl.Field("max_word_ngram", pl.Utf8),
            pl.Field("max_word_ngram_size", pl.UInt8),
            pl.Field("max_word_ngram_jaccard", pl.Float32),
            pl.Field("main_char_ngram_positions", pl.List(char_ngram_positions_struct)),
            pl.Field("similar_char_ngram_positions", pl.List(char_ngram_positions_struct)),
            pl.Field("main_word_ngram_positions", pl.List(word_ngram_positions_struct)),
            pl.Field("similar_word_ngram_positions", pl.List(word_ngram_positions_struct))
        ])

        return {
            "feature_id": pl.UInt32,
            "sae_id": pl.Categorical,
            "all_pairs": pl.List(pair_struct)
        }


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Calculate inter-feature activation similarity")
    parser.add_argument("--config", type=str, help="Path to configuration file")
    parser.add_argument("--limit", type=int, help="Limit number of features (for testing)")

    args = parser.parse_args()

    # Setup logging
    setup_logging()

    # Load config
    if args.config:
        full_config = load_yaml_config(args.config)
        # Extract step-specific config if present
        config = full_config.get("steps", {}).get("step_09_interfeature_similarity", {})
        if not config:
            # Fallback: treat entire config as step config (legacy format)
            config = full_config
        config["sae_id"] = full_config.get("global", {}).get("sae_id_sanitized", "")
        config["global"] = full_config.get("global", {})
    else:
        config_path = Path(__file__).parent.parent / "config.yaml"
        if config_path.exists():
            full_config = load_yaml_config(config_path)
            config = full_config.get("steps", {}).get("step_09_interfeature_similarity", {})
            config["sae_id"] = full_config.get("global", {}).get("sae_id_sanitized", "")
            config["global"] = full_config.get("global", {})
        else:
            config = {}

    # Run processor
    processor = InterFeatureSimilarityProcessor(config, feature_limit=args.limit)
    processor.run()


if __name__ == "__main__":
    main()
