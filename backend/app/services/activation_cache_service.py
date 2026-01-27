"""
Activation Cache Service - Pre-computed MessagePack cache for fast activation data loading.

This service pre-computes all activation data at startup, serializes it to MessagePack,
and compresses with gzip. This reduces loading time from ~100s to ~15-25s.
"""

import gzip
import logging
import time
from pathlib import Path
from typing import Optional

import msgpack
import polars as pl

from .pattern_utils import compute_pattern_type, get_best_ngram_text, get_best_ngram_with_positions

logger = logging.getLogger(__name__)


class ActivationCacheService:
    """
    Pre-computed cache for all activation examples.

    At startup, loads all features from activation_display.parquet,
    serializes to MessagePack, compresses with gzip, and stores in memory.
    """

    def __init__(self, data_path: str = "../data"):
        self.data_path = Path(data_path)
        self.activation_display_file = self.data_path / "output" / "activation_display.parquet"

        # Pre-computed cache (msgpack + gzip compressed)
        self._cache: Optional[bytes] = None
        self._feature_count: int = 0
        self._cache_size_bytes: int = 0
        self._ready = False

    async def initialize(self):
        """
        Initialize cache by loading all activation data from parquet,
        serializing to MessagePack, and compressing with gzip.

        Called at application startup.
        """
        start_time = time.time()

        if not self.activation_display_file.exists():
            logger.warning(f"Activation display file not found: {self.activation_display_file}")
            return

        try:
            logger.info(f"[ActivationCacheService] Loading activation data from {self.activation_display_file}")

            # Load all features from parquet
            # Note: pattern_type removed from parquet - computed at runtime
            # First check which columns exist (backward compatibility)
            all_columns = pl.read_parquet_schema(self.activation_display_file)
            columns_to_load = [
                "feature_id",
                "quantile_examples",
                "semantic_similarity",
                "char_ngram_max_jaccard",
                "word_ngram_max_jaccard",
                "top_char_ngram_text",
                "top_word_ngram_text",
            ]

            # Add per-k columns if they exist
            per_k_columns = [
                "char_ngram_per_k_jaccard",
                "word_ngram_per_k_jaccard",
                "top_char_ngrams",
                "top_word_ngrams",
            ]
            for col in per_k_columns:
                if col in all_columns:
                    columns_to_load.append(col)

            df = pl.read_parquet(
                self.activation_display_file,
                columns=columns_to_load
            )

            load_time = time.time() - start_time
            logger.info(f"[ActivationCacheService] Loaded {len(df)} features in {load_time:.2f}s")

            # Convert to dictionary format expected by frontend (OPTIMIZED v2.0)
            # Uses to_dicts() instead of iter_rows() for ~30-40% faster iteration
            serialize_start = time.time()
            examples_dict = {}

            # ⚡ OPTIMIZATION: Use to_dicts() for faster bulk conversion
            # to_dicts() converts the entire DataFrame at once, which is faster than
            # iterating with iter_rows() for 16k+ rows
            rows = df.to_dicts()
            logger.info(f"[ActivationCacheService] Converted to dicts in {time.time() - serialize_start:.2f}s")

            process_start = time.time()
            for row in rows:
                feature_id = row["feature_id"]
                # Compute pattern_type at runtime from raw similarity values
                pattern_type = compute_pattern_type(
                    row["semantic_similarity"],
                    row["char_ngram_max_jaccard"],
                    row["word_ngram_max_jaccard"]
                )
                # Get best n-gram WITH positions (longest above threshold)
                best_char_ngram = get_best_ngram_with_positions(
                    row.get("char_ngram_per_k_jaccard"),
                    row.get("top_char_ngrams"),
                    is_inter=False
                )
                best_char_ngram_text = best_char_ngram.get("ngram") if best_char_ngram else row["top_char_ngram_text"]

                best_word_ngram_text = get_best_ngram_text(
                    row.get("word_ngram_per_k_jaccard"),
                    row.get("top_word_ngrams"),
                    fallback_text=row["top_word_ngram_text"],
                    is_inter=False
                )

                # Build prompt_id -> positions lookup for best char n-gram
                char_positions_by_prompt = {}
                if best_char_ngram and best_char_ngram.get("occurrences"):
                    for occ in best_char_ngram["occurrences"]:
                        pid = occ.get("prompt_id")
                        if pid is not None:
                            if pid not in char_positions_by_prompt:
                                char_positions_by_prompt[pid] = []
                            char_positions_by_prompt[pid].append({
                                "token_position": occ.get("token_position"),
                                "char_offset": occ.get("char_offset", 0)
                            })

                # Update quantile_examples with correct positions for best n-gram
                quantile_examples = row["quantile_examples"]
                if quantile_examples and char_positions_by_prompt:
                    for qe in quantile_examples:
                        pid = qe.get("prompt_id")
                        if pid in char_positions_by_prompt:
                            qe["char_ngram_positions"] = char_positions_by_prompt[pid]
                        else:
                            # No match for this prompt in best n-gram occurrences
                            qe["char_ngram_positions"] = []

                examples_dict[feature_id] = {
                    "quantile_examples": quantile_examples,
                    "semantic_similarity": row["semantic_similarity"],
                    "char_ngram_max_jaccard": row["char_ngram_max_jaccard"],
                    "word_ngram_max_jaccard": row["word_ngram_max_jaccard"],
                    "top_char_ngram_text": row["top_char_ngram_text"],
                    "top_word_ngram_text": row["top_word_ngram_text"],
                    "pattern_type": pattern_type,
                    # Best n-gram text (longest above threshold, for display)
                    "best_char_ngram_text": best_char_ngram_text,
                    "best_word_ngram_text": best_word_ngram_text,
                }

            logger.info(f"[ActivationCacheService] Processed {len(examples_dict)} features in {time.time() - process_start:.2f}s")
            self._feature_count = len(examples_dict)

            # Wrap in response format
            data = {"examples": examples_dict}

            serialize_time = time.time() - serialize_start
            logger.info(f"[ActivationCacheService] Converted to dict in {serialize_time:.2f}s")

            # Serialize to MessagePack
            msgpack_start = time.time()
            msgpack_data = msgpack.packb(data, use_bin_type=True)
            msgpack_size = len(msgpack_data)
            msgpack_time = time.time() - msgpack_start
            logger.info(f"[ActivationCacheService] MessagePack serialized: {msgpack_size / 1024 / 1024:.2f} MB in {msgpack_time:.2f}s")

            # Compress with gzip
            gzip_start = time.time()
            self._cache = gzip.compress(msgpack_data, compresslevel=6)
            self._cache_size_bytes = len(self._cache)
            gzip_time = time.time() - gzip_start

            compression_ratio = (1 - self._cache_size_bytes / msgpack_size) * 100
            logger.info(f"[ActivationCacheService] Gzip compressed: {self._cache_size_bytes / 1024 / 1024:.2f} MB in {gzip_time:.2f}s ({compression_ratio:.1f}% reduction)")

            self._ready = True
            total_time = time.time() - start_time
            logger.info(f"[ActivationCacheService] ✅ Cache ready: {self._feature_count} features, {self._cache_size_bytes / 1024 / 1024:.2f} MB in {total_time:.2f}s")

        except Exception as e:
            logger.error(f"[ActivationCacheService] Failed to initialize cache: {e}", exc_info=True)
            self._ready = False

    def is_ready(self) -> bool:
        """Check if cache is ready."""
        return self._ready and self._cache is not None

    def get_cached_blob(self) -> Optional[bytes]:
        """
        Get the pre-computed compressed blob.

        Returns:
            Gzip-compressed MessagePack data, or None if not ready.
        """
        if not self.is_ready():
            return None
        return self._cache

    def get_stats(self) -> dict:
        """Get cache statistics."""
        return {
            "ready": self._ready,
            "feature_count": self._feature_count,
            "cache_size_mb": self._cache_size_bytes / 1024 / 1024 if self._cache_size_bytes else 0
        }


# Global singleton instance
activation_cache_service = ActivationCacheService()
