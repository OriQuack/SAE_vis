"""
Activation Cache Service - Pre-computed MessagePack cache for fast activation data loading.

This service pre-computes all activation data at startup, serializes it to MessagePack,
and compresses with gzip. This reduces loading time from ~100s to ~15-25s.

Version 2.0: Now uses pre-computed best n-gram fields from step_10 (activation_display.parquet).
No longer requires pattern_utils.py.
"""

import gzip
import logging
import time
from pathlib import Path
from typing import Optional

import msgpack
import polars as pl

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
            # pattern_type is pre-computed in parquet (since step_10 v3.0)
            # First check which columns exist (backward compatibility)
            # Load only the columns we need (all pre-computed in step_10 v4.0+)
            all_columns = pl.read_parquet_schema(self.activation_display_file)
            columns_to_load = [
                "feature_id",
                "quantile_examples",
                "semantic_similarity",
                "pattern_type",  # Pre-computed in step_10
                "best_ngram_type",  # Pre-computed in step_10 v4.0
                "best_ngram_text",  # Pre-computed in step_10 v4.0
                "best_ngram_size",  # Pre-computed in step_10 v4.0
            ]

            # Filter to only columns that exist (backward compatibility)
            columns_to_load = [c for c in columns_to_load if c in all_columns]

            df = pl.read_parquet(
                self.activation_display_file,
                columns=columns_to_load
            )

            load_time = time.time() - start_time
            logger.info(f"[ActivationCacheService] Loaded {len(df)} features in {load_time:.2f}s")
            logger.info(f"[ActivationCacheService] Columns loaded: {columns_to_load}")

            # Convert to dictionary format expected by frontend
            serialize_start = time.time()
            examples_dict = {}

            # ⚡ OPTIMIZATION: Use to_dicts() for faster bulk conversion
            rows = df.to_dicts()
            logger.info(f"[ActivationCacheService] Converted to dicts in {time.time() - serialize_start:.2f}s")

            process_start = time.time()
            has_best_ngram = "best_ngram_type" in columns_to_load
            logger.info(f"[ActivationCacheService] Using pre-computed best_ngram: {has_best_ngram}")

            for row in rows:
                feature_id = row["feature_id"]

                # Use pre-computed pattern_type (required in step_10 v4.0+)
                pattern_type = row.get("pattern_type") or "None"

                # Use pre-computed best n-gram fields (step_10 v4.0+)
                ngram_type = row.get("best_ngram_type")
                ngram_text = row.get("best_ngram_text")
                ngram_size = row.get("best_ngram_size") or 0

                # Compute ngram_length from ngram_text
                ngram_length = 0
                if ngram_text:
                    if ngram_type == "word":
                        ngram_length = len(ngram_text.split())
                    else:  # char
                        ngram_length = len(ngram_text)

                # quantile_examples already has ngram_positions pre-computed in step_10 v4.0+
                quantile_examples = row["quantile_examples"]

                examples_dict[feature_id] = {
                    "quantile_examples": quantile_examples,
                    "semantic_similarity": row["semantic_similarity"],
                    "pattern_type": pattern_type,
                    # Pre-computed n-gram fields
                    "ngram_type": ngram_type,
                    "ngram_text": ngram_text,
                    "ngram_length": ngram_length,
                    "ngram_size": ngram_size,
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
