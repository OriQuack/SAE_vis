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
    compute_per_k_max_jaccard,
    compute_per_k_jaccard_all,
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

        # Pre-built lookup indices for performance
        self._embedding_prompt_ids: Dict[int, List[int]] = {}
        self._activation_index: Dict[int, Dict[int, Dict]] = {}

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

        # Vectorized: extract feature_ids and embeddings as arrays
        feature_ids = self.embeddings_df["feature_id"].to_numpy()
        embeddings_col = self.embeddings_df["embeddings"].to_list()

        # Compute mean for each feature (still need loop but optimized extraction)
        for fid, embs in zip(feature_ids, embeddings_col):
            if embs and len(embs) > 0:
                self.mean_embeddings[fid] = np.mean(embs, axis=0)

        # L2 normalize (handle zero vectors) - already vectorized
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

        # Build lookup indices for fast O(1) access
        self._build_lookup_indices()

        # Compute mean embeddings for semantic similarity (on-the-fly)
        self._compute_mean_embeddings()

    def _build_lookup_indices(self) -> None:
        """Build pre-computed lookup indices for fast O(1) access.

        Creates:
        - _embedding_prompt_ids: feature_id → list of prompt_ids
        - _activation_index: feature_id → {prompt_id → row_dict}

        This eliminates expensive DataFrame.filter() operations in _get_examples_from_embeddings().
        """
        logger.info("Building lookup indices for fast access...")

        # Build embedding prompt_ids lookup
        for row in self.embeddings_df.iter_rows(named=True):
            feature_id = row["feature_id"]
            prompt_ids = row["prompt_ids"]
            if hasattr(prompt_ids, 'to_list'):
                prompt_ids = prompt_ids.to_list()
            self._embedding_prompt_ids[feature_id] = prompt_ids or []

        # Build activation data lookup (nested dict: feature_id -> prompt_id -> row)
        for row in self.activation_df.iter_rows(named=True):
            fid = row["feature_id"]
            pid = row["prompt_id"]
            if fid not in self._activation_index:
                self._activation_index[fid] = {}
            self._activation_index[fid][pid] = row

        logger.info(f"Built indices: {len(self._embedding_prompt_ids):,} embedding lookups, "
                   f"{len(self._activation_index):,} activation lookups")

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
        """Get activation examples using pre-built lookup indices.

        Uses O(1) dictionary lookups instead of O(n) DataFrame.filter() operations.
        """
        # O(1) lookup instead of O(n) filter
        stored_prompt_ids = self._embedding_prompt_ids.get(feature_id, [])
        if not stored_prompt_ids:
            return []

        activation_data = self._activation_index.get(feature_id, {})
        if not activation_data:
            return []

        examples = []
        for prompt_id in stored_prompt_ids:
            row = activation_data.get(prompt_id)
            if row is None:
                continue

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
        """Compute character and word Jaccard similarities with position tracking.

        Uses per-k-size max Jaccard: computes Jaccard separately for each n-gram size,
        then takes the maximum. This avoids set cardinality explosion from pooling all
        sizes together, resulting in more meaningful similarity scores.

        Also returns per-k Jaccard values and per-k top n-grams for "longest above threshold"
        selection in the frontend.
        """
        if len(main_examples) < 1 or len(selected_examples) < 1:
            return None, None, None, None, [], [], [], [], {}, {}, [], []

        char_window_size = self.proc_params["char_ngram_window_size"]
        word_window_size = self.proc_params["word_ngram_window_size"]
        char_ngram_sizes = self.proc_params["char_ngram_sizes"]
        word_ngram_sizes = self.proc_params["word_ngram_sizes"]

        # Compute per-k-max Jaccard for character n-grams
        char_ngram_max_jaccard = compute_per_k_max_jaccard(
            main_examples, selected_examples,
            char_ngram_sizes, char_window_size, is_word=False
        )

        # Compute per-k-max Jaccard for word n-grams
        word_ngram_max_jaccard = compute_per_k_max_jaccard(
            main_examples, selected_examples,
            word_ngram_sizes, word_window_size, is_word=True
        )

        # NEW: Compute per-k Jaccard values (for longest n-gram selection)
        # Convert int keys to string keys (e.g., {2: 0.3} -> {"k2": 0.3}) for Polars compatibility
        char_per_k_raw = compute_per_k_jaccard_all(
            main_examples, selected_examples,
            char_ngram_sizes, char_window_size, is_word=False
        )
        char_per_k = {f"k{k}": v for k, v in char_per_k_raw.items()}

        word_per_k_raw = compute_per_k_jaccard_all(
            main_examples, selected_examples,
            word_ngram_sizes, word_window_size, is_word=True
        )
        word_per_k = {f"k{k}": v for k, v in word_per_k_raw.items()}

        # Extract n-grams for finding top n-gram (used for position highlighting)
        # Also track counts per k-size for per-k top n-gram selection
        char_ngram_counts_per_k = {k: Counter() for k in char_ngram_sizes}
        all_char_ngrams = []
        for _, _, tokens, max_pos in main_examples:
            window_tokens = extract_token_window(tokens, max_pos, char_window_size)
            char_ngram_map = extract_token_char_ngrams_simple(window_tokens, char_ngram_sizes)
            for ngram in char_ngram_map.keys():
                all_char_ngrams.append(ngram)
                char_ngram_counts_per_k[len(ngram)][ngram] += 1

        for _, _, tokens, max_pos in selected_examples:
            window_tokens = extract_token_window(tokens, max_pos, char_window_size)
            char_ngram_map = extract_token_char_ngrams_simple(window_tokens, char_ngram_sizes)
            for ngram in char_ngram_map.keys():
                all_char_ngrams.append(ngram)
                char_ngram_counts_per_k[len(ngram)][ngram] += 1

        # Find most frequent char n-gram overall
        max_char_ngram = None
        if all_char_ngrams:
            char_counter = Counter(all_char_ngrams)
            max_char_ngram = find_top_ngram(dict(char_counter))

        # NEW: Find top char n-gram per k-size WITH positions for highlighting
        top_char_ngrams_per_k = []
        for k in char_ngram_sizes:
            if char_ngram_counts_per_k[k]:
                top_ng = find_top_ngram(dict(char_ngram_counts_per_k[k]))
                if top_ng:
                    # Find positions for this specific n-gram in both main and similar examples
                    main_occ = self._find_char_ngram_positions_in_examples(
                        main_examples, top_ng, char_window_size
                    )
                    similar_occ = self._find_char_ngram_positions_in_examples(
                        selected_examples, top_ng, char_window_size
                    )
                    top_char_ngrams_per_k.append({
                        "k": k,
                        "ngram": top_ng,
                        "main_occurrences": main_occ,
                        "similar_occurrences": similar_occ
                    })

        # Extract word n-grams for finding top n-gram
        word_ngram_counts_per_k = {k: Counter() for k in word_ngram_sizes}
        all_word_ngrams = []
        for _, _, tokens, max_pos in main_examples:
            window_tokens = extract_token_window(tokens, max_pos, word_window_size)
            word_ngram_map = extract_word_ngrams(window_tokens, word_ngram_sizes)
            for ngram in word_ngram_map.keys():
                word_count = len(ngram.split())
                all_word_ngrams.append(ngram)
                word_ngram_counts_per_k[word_count][ngram] += 1

        for _, _, tokens, max_pos in selected_examples:
            window_tokens = extract_token_window(tokens, max_pos, word_window_size)
            word_ngram_map = extract_word_ngrams(window_tokens, word_ngram_sizes)
            for ngram in word_ngram_map.keys():
                word_count = len(ngram.split())
                all_word_ngrams.append(ngram)
                word_ngram_counts_per_k[word_count][ngram] += 1

        # Find most frequent word n-gram overall
        max_word_ngram = None
        if all_word_ngrams:
            word_counter = Counter(all_word_ngrams)
            max_word_ngram = find_top_ngram(dict(word_counter))

        # NEW: Find top word n-gram per k-size WITH positions for highlighting
        top_word_ngrams_per_k = []
        for k in word_ngram_sizes:
            if word_ngram_counts_per_k[k]:
                top_ng = find_top_ngram(dict(word_ngram_counts_per_k[k]))
                if top_ng:
                    # Find positions for this specific n-gram in both main and similar examples
                    main_occ = self._find_word_ngram_positions_in_examples(
                        main_examples, top_ng, word_window_size
                    )
                    similar_occ = self._find_word_ngram_positions_in_examples(
                        selected_examples, top_ng, word_window_size
                    )
                    top_word_ngrams_per_k.append({
                        "k": k,
                        "ngram": top_ng,
                        "main_occurrences": main_occ,
                        "similar_occurrences": similar_occ
                    })

        # Extract position data for all examples (for visualization highlighting)
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

        return (char_ngram_max_jaccard, word_ngram_max_jaccard, max_char_ngram, max_word_ngram,
                main_char_positions, similar_char_positions,
                main_word_positions, similar_word_positions,
                char_per_k, word_per_k, top_char_ngrams_per_k, top_word_ngrams_per_k)

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

            # Compute dual Jaccard similarity (per-k-max approach) with per-k values
            (char_ngram_max_jaccard, word_ngram_max_jaccard, max_char_ngram, max_word_ngram,
             main_char_pos, similar_char_pos, main_word_pos, similar_word_pos,
             char_per_k, word_per_k, top_char_ngrams_per_k, top_word_ngrams_per_k
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
                # EXISTING: per-k-max Jaccard (keep for SVM and backward compat)
                "char_ngram_max_jaccard": float(char_ngram_max_jaccard) if char_ngram_max_jaccard is not None else None,
                "word_ngram_max_jaccard": float(word_ngram_max_jaccard) if word_ngram_max_jaccard is not None else None,
                "main_prompt_ids": [int(pid) for pid in main_prompt_ids],
                "similar_prompt_ids": [int(pid) for pid in selected_prompt_ids],
                "num_comparisons": int(len(main_examples) * len(selected_examples)),
                # EXISTING: overall top n-grams
                "max_char_ngram": max_char_ngram,
                "max_word_ngram": max_word_ngram,
                "main_char_ngram_positions": main_char_pos,
                "similar_char_ngram_positions": similar_char_pos,
                "main_word_ngram_positions": main_word_pos,
                "similar_word_ngram_positions": similar_word_pos,
                # NEW: per-k Jaccard values (for longest n-gram selection)
                "char_ngram_per_k_jaccard": char_per_k,
                "word_ngram_per_k_jaccard": word_per_k,
                # NEW: per-k top n-grams (text only, positions computed lazily)
                "top_char_ngrams_per_k": top_char_ngrams_per_k,
                "top_word_ngrams_per_k": top_word_ngrams_per_k,
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

        # NEW: Per-k Jaccard as struct
        char_per_k_jaccard_struct = pl.Struct([
            pl.Field("k2", pl.Float32),
            pl.Field("k3", pl.Float32),
            pl.Field("k4", pl.Float32),
            pl.Field("k5", pl.Float32),
        ])
        word_per_k_jaccard_struct = pl.Struct([
            pl.Field("k1", pl.Float32),
            pl.Field("k2", pl.Float32),
            pl.Field("k3", pl.Float32),
        ])

        # NEW: Per-k top n-gram struct WITH occurrences for highlighting
        per_k_char_ngram_struct = pl.Struct([
            pl.Field("k", pl.UInt8),
            pl.Field("ngram", pl.Utf8),
            pl.Field("main_occurrences", pl.List(char_ngram_positions_struct)),
            pl.Field("similar_occurrences", pl.List(char_ngram_positions_struct)),
        ])
        per_k_word_ngram_struct = pl.Struct([
            pl.Field("k", pl.UInt8),
            pl.Field("ngram", pl.Utf8),
            pl.Field("main_occurrences", pl.List(word_ngram_positions_struct)),
            pl.Field("similar_occurrences", pl.List(word_ngram_positions_struct)),
        ])

        pair_struct = pl.Struct([
            pl.Field("similar_feature_id", pl.UInt32),
            pl.Field("decoder_similarity", pl.Float32),
            pl.Field("similarity_source", pl.Utf8),
            pl.Field("semantic_similarity", pl.Float32),
            # EXISTING: per-k-max Jaccard
            pl.Field("char_ngram_max_jaccard", pl.Float32),
            pl.Field("word_ngram_max_jaccard", pl.Float32),
            pl.Field("main_prompt_ids", pl.List(pl.UInt32)),
            pl.Field("similar_prompt_ids", pl.List(pl.UInt32)),
            pl.Field("num_comparisons", pl.UInt32),
            # EXISTING: overall top n-grams
            pl.Field("max_char_ngram", pl.Utf8),
            pl.Field("max_word_ngram", pl.Utf8),
            pl.Field("main_char_ngram_positions", pl.List(char_ngram_positions_struct)),
            pl.Field("similar_char_ngram_positions", pl.List(char_ngram_positions_struct)),
            pl.Field("main_word_ngram_positions", pl.List(word_ngram_positions_struct)),
            pl.Field("similar_word_ngram_positions", pl.List(word_ngram_positions_struct)),
            # NEW: per-k Jaccard values (stored as dict, will be converted)
            pl.Field("char_ngram_per_k_jaccard", char_per_k_jaccard_struct),
            pl.Field("word_ngram_per_k_jaccard", word_per_k_jaccard_struct),
            # NEW: per-k top n-grams WITH occurrences for highlighting
            pl.Field("top_char_ngrams_per_k", pl.List(per_k_char_ngram_struct)),
            pl.Field("top_word_ngrams_per_k", pl.List(per_k_word_ngram_struct)),
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
