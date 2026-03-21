"""
Highlight service for per-token context scoring and set-based syntax highlighting.

Loads activation_highlights.parquet and returns:
- Syntax: set-based (syntax_ngram_sets, syntax_dep_sets, syntax_ast_sets)
  with cross-example hover via set_index
- Context: span-based (context_spans) + per-token (disc_idf)
"""

import logging
import pickle
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Thresholds
NGRAM_JACCARD_MIN = 0.1       # Gate n-gram sets by Jaccard
CONTEXT_SPAN_MIN_SIM = 0.45  # Gate context span sets by avg_sim
DISC_IDF_GLOBAL_MAX = 3.12   # Scale disc*idf into [0, 1]
DISC_IDF_MIN = 0.1           # Gate scaled disc*idf

HighlightData = Dict[str, Any]


class HighlightService:
    """Service for loading and scoring highlights."""

    def __init__(self, highlights_path: Path):
        self.highlights_path = highlights_path
        self._data: Dict[int, Dict[int, Dict[str, Any]]] = {}

    def initialize(self) -> None:
        """Load highlights parquet and pre-compute per-feature data.

        Uses a pickle cache to avoid recomputing on subsequent startups.
        The cache is invalidated when the source parquet file changes.
        """
        import polars as pl

        if not self.highlights_path.exists():
            logger.warning(f"Highlights file not found: {self.highlights_path}")
            return

        start_time = time.time()

        # Try loading from pickle cache (keyed on source file mtime)
        cache_dir = self.highlights_path.parent.parent / "cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        cache_path = cache_dir / "highlights.cache.pkl"
        source_mtime = self.highlights_path.stat().st_mtime

        if cache_path.exists() and cache_path.stat().st_mtime >= source_mtime:
            try:
                with open(cache_path, "rb") as f:
                    self._data = pickle.load(f)
                logger.info(
                    f"Loaded highlight cache: {len(self._data):,} features in {time.time() - start_time:.2f}s"
                )
                return
            except Exception as e:
                logger.warning(f"Failed to load highlight cache, recomputing: {e}")

        logger.info(f"Loading highlights from {self.highlights_path}")
        df = pl.read_parquet(self.highlights_path)
        logger.info(f"Loaded {len(df):,} highlight rows, columns: {df.columns}")

        # Detect available feature-level columns
        feature_cols = ["feature_id"]
        set_columns = ["context_span_sets", "syntax_ngram_sets", "syntax_dep_sets", "syntax_ast_sets"]
        available_set_cols = [c for c in set_columns if c in df.columns]
        feature_cols.extend(available_set_cols)

        # Build feature-level lookups
        feature_sets: Dict[int, Dict[str, list]] = {}
        if available_set_cols:
            feat_df = df.select(feature_cols).unique("feature_id")
            for row in feat_df.to_dicts():
                fid = row["feature_id"]
                sets: Dict[str, list] = {}

                # Context spans: gate by avg_sim
                raw_ctx = row.get("context_span_sets") or []
                sets["context_span_sets"] = [
                    s for s in raw_ctx if s.get("avg_sim", 0) >= CONTEXT_SPAN_MIN_SIM
                ]

                # Syntax ngrams: gate by Jaccard
                raw_ngrams = row.get("syntax_ngram_sets") or []
                sets["syntax_ngram_sets"] = [
                    n for n in raw_ngrams if n.get("jaccard", 0) >= NGRAM_JACCARD_MIN
                ]

                # Dep/AST parse: pass through (already gated at rate >= 0.5 in pipeline)
                sets["syntax_dep_sets"] = row.get("syntax_dep_sets") or []
                sets["syntax_ast_sets"] = row.get("syntax_ast_sets") or []

                feature_sets[fid] = sets

        # Group rows by feature_id
        feature_groups: Dict[int, List[dict]] = {}
        for row in df.to_dicts():
            fid = row["feature_id"]
            if fid not in feature_groups:
                feature_groups[fid] = []
            feature_groups[fid].append(row)

        for fid, rows in feature_groups.items():
            sets = feature_sets.get(fid, {})
            self._data[fid] = self._score_feature(rows, sets)

        logger.info(f"Pre-computed highlight data for {len(self._data):,} features in {time.time() - start_time:.2f}s")

        # Save cache for next startup
        try:
            with open(cache_path, "wb") as f:
                pickle.dump(self._data, f, protocol=pickle.HIGHEST_PROTOCOL)
            cache_mb = cache_path.stat().st_size / 1024 / 1024
            logger.info(f"Saved highlight cache: {cache_mb:.1f} MB to {cache_path.name}")
        except Exception as e:
            logger.warning(f"Failed to save highlight cache: {e}")

    def _score_feature(
        self, rows: List[dict], sets: Dict[str, list]
    ) -> Dict[int, Dict[str, Any]]:
        """Build per-prompt highlight data from feature-level sets + per-row context scores.

        Returns:
            {prompt_id: {"highlights": {...}}}
        """
        result: Dict[int, Dict[str, Any]] = {}

        # Build prompt_id -> context_spans from context_span_sets
        prompt_context_spans: Dict[int, List[Dict]] = {}
        for set_index, span_set in enumerate(sets.get("context_span_sets", [])):
            avg_sim = span_set.get("avg_sim", 0.0)
            span_size = span_set.get("span_size", 0)
            for span in span_set.get("spans", []):
                pid = span.get("prompt_id")
                if pid is None:
                    continue
                entry = {
                    "start": span["start"], "end": span["end"],
                    "score": round(avg_sim, 4), "span_size": span_size,
                    "set_index": set_index,
                }
                if pid not in prompt_context_spans:
                    prompt_context_spans[pid] = []
                prompt_context_spans[pid].append(entry)

        for row in rows:
            prompt_id = row["prompt_id"]
            highlights: HighlightData = {}

            # Collect n-gram token positions first (to exclude from disc_idf)
            ngram_positions: set = set()
            for s in sets.get("syntax_ngram_sets", []):
                for sp in s.get("spans", []):
                    if sp.get("prompt_id") == prompt_id:
                        for pos in range(sp["start"], sp["end"]):
                            ngram_positions.add(pos)

            # Disc × IDF (per-token context scoring, excluding n-gram positions)
            disc_raw = row.get("c_discriminative", [])
            idf_raw = row.get("c_token_idf", [])
            num_tokens = max(len(disc_raw), len(idf_raw))
            if num_tokens > 0:
                disc_idf_entries = []
                for j in range(min(len(disc_raw), len(idf_raw))):
                    if j in ngram_positions:
                        continue  # already highlighted as syntax n-gram
                    product = disc_raw[j] * idf_raw[j]
                    scaled = min(product / DISC_IDF_GLOBAL_MAX, 1.0)
                    if scaled > DISC_IDF_MIN:
                        disc_idf_entries.append([j, round(scaled, 4)])
                if disc_idf_entries:
                    highlights["disc_idf"] = disc_idf_entries

            # Context spans (per-prompt from feature-level sets)
            ctx_spans = prompt_context_spans.get(prompt_id, [])
            if ctx_spans:
                highlights["context_spans"] = ctx_spans

            # Syntax sets: filter spans to this prompt_id
            for set_key in ["syntax_ngram_sets", "syntax_dep_sets", "syntax_ast_sets"]:
                prompt_sets = []
                for s in sets.get(set_key, []):
                    matching = [sp for sp in s.get("spans", []) if sp.get("prompt_id") == prompt_id]
                    if matching:
                        entry = {k: v for k, v in s.items() if k != "spans"}
                        entry["spans"] = matching
                        prompt_sets.append(entry)
                if prompt_sets:
                    highlights[set_key] = prompt_sets

            result[prompt_id] = {"highlights": highlights}

        return result

    def get_scores(
        self, feature_id: int, prompt_id: int
    ) -> Optional[Dict[str, Any]]:
        """Get pre-computed highlight data for a specific example."""
        feature_data = self._data.get(feature_id)
        if feature_data is None:
            return None
        return feature_data.get(prompt_id)

    def get_feature_scores(
        self, feature_id: int
    ) -> Optional[Dict[int, Dict[str, Any]]]:
        """Get all pre-computed highlight data for a feature."""
        return self._data.get(feature_id)
