"""
Highlight service for per-token syntax scoring and span-based context highlighting.

Loads activation_highlights.parquet, gates weak signals using fixed global
thresholds, and returns per-component [position, score] pairs for syntax,
plus context_spans for span-based context highlighting. No aggregation
— frontend receives individual component data for hover grouping.

Context highlighting uses span sets (char_span=3, word_span=11) found via
tree-search cross-example matching. The backend filters to the top N span
sets by span_size (longest first).
"""

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Global gating thresholds (from distribution analysis)
GATE_THRESHOLDS = {
    # Syntax: fixed at 0.1 (~2% of tokens survive)
    "s_word_ngram": 0.1,
    "s_char_ngram": 0.1,
    "s_dep_parse": 0.1,
    "s_ast_parse": 0.1,
    # c_discriminative and c_token_idf used only as disc_idf product
}

# Global max for disc*idf product, used to scale into [0, 1]
DISC_IDF_GLOBAL_MAX = 3.12

# Syntax components (per-token scores)
SYNTAX_COMPONENTS = ["s_word_ngram", "s_char_ngram", "s_dep_parse", "s_ast_parse"]

# Context span filtering: top N word_span (size 11) sets with avg_sim >= threshold
TOP_N_CONTEXT_SPANS = 3
CONTEXT_SPAN_MIN_SIM = 0.4

# Highlight data type: {component: [[position, score], ...], context_spans: [...]}
HighlightData = Dict[str, Any]


class HighlightService:
    """Service for loading and scoring per-token highlights + context span sets."""

    def __init__(self, highlights_path: Path):
        self.highlights_path = highlights_path
        # {feature_id: {prompt_id: {"highlights": {comp: [[pos, score], ...], context_spans: [...]}}}}
        self._data: Dict[int, Dict[int, Dict[str, Any]]] = {}

    def initialize(self) -> None:
        """Load highlights parquet and pre-compute per-component scores."""
        import polars as pl

        if not self.highlights_path.exists():
            logger.warning(f"Highlights file not found: {self.highlights_path}")
            return

        logger.info(f"Loading highlights from {self.highlights_path}")
        df = pl.read_parquet(self.highlights_path)
        logger.info(f"Loaded {len(df):,} highlight rows")

        has_span_sets = "context_span_sets" in df.columns

        # Build feature-level span set lookup
        # context_span_sets is per-feature (same value for all prompts of a feature)
        feature_span_sets: Dict[int, list] = {}
        if has_span_sets:
            # Get unique feature_id -> context_span_sets mapping
            span_df = df.select(["feature_id", "context_span_sets"]).unique("feature_id")
            for row in span_df.to_dicts():
                fid = row["feature_id"]
                raw_sets = row.get("context_span_sets") or []
                # Only use word_span (size 11), filter by min avg_sim, top N
                word_spans = [s for s in raw_sets
                              if s.get("span_size") == 11 and s.get("avg_sim", 0) >= CONTEXT_SPAN_MIN_SIM]
                sorted_sets = sorted(word_spans, key=lambda s: s.get("avg_sim", 0), reverse=True)
                feature_span_sets[fid] = sorted_sets[:TOP_N_CONTEXT_SPANS]

        # Group rows by feature_id
        feature_groups: Dict[int, List[dict]] = {}
        for row in df.to_dicts():
            fid = row["feature_id"]
            if fid not in feature_groups:
                feature_groups[fid] = []
            feature_groups[fid].append(row)

        for fid, rows in feature_groups.items():
            span_sets = feature_span_sets.get(fid, [])
            self._data[fid] = self._score_feature(rows, span_sets)

        logger.info(f"Pre-computed highlight data for {len(self._data):,} features")

    def _score_feature(
        self, rows: List[dict], span_sets: list
    ) -> Dict[int, Dict[str, Any]]:
        """Gate weak signals and return per-component [position, score] pairs + context spans.

        Returns:
            {prompt_id: {"highlights": {comp: [[pos, score], ...], "context_spans": [...]}}}
        """
        result: Dict[int, Dict[str, Any]] = {}

        # Build prompt_id -> context_spans lookup from span sets
        prompt_context_spans: Dict[int, List[Dict]] = {}
        for set_index, span_set in enumerate(span_sets):
            avg_sim = span_set.get("avg_sim", 0.0)
            span_size = span_set.get("span_size", 0)
            for span in span_set.get("spans", []):
                pid = span.get("prompt_id")
                if pid is None:
                    continue
                entry = {
                    "start": span["start"],
                    "end": span["end"],
                    "score": round(avg_sim, 4),
                    "span_size": span_size,
                    "set_index": set_index,
                }
                if pid not in prompt_context_spans:
                    prompt_context_spans[pid] = []
                prompt_context_spans[pid].append(entry)

        for row in rows:
            prompt_id = row["prompt_id"]
            num_tokens = len(row.get("s_word_ngram", []))
            if num_tokens == 0:
                result[prompt_id] = {"highlights": {}}
                continue

            highlights: HighlightData = {}

            # Gate syntax components (per-token)
            for comp in SYNTAX_COMPONENTS:
                raw = row.get(comp, [0.0] * num_tokens)
                thr = GATE_THRESHOLDS[comp]
                entries = []
                for j, v in enumerate(raw):
                    if v > thr:
                        entries.append([j, round(v, 4)])
                if entries:
                    highlights[comp] = entries

            # Compute disc × idf, gate by > 0, scale to [0, 1]
            disc_raw = row.get("c_discriminative", [0.0] * num_tokens)
            idf_raw = row.get("c_token_idf", [0.0] * num_tokens)
            disc_idf_entries = []
            for j in range(num_tokens):
                product = disc_raw[j] * idf_raw[j]
                if product > 0:
                    scaled = min(product / DISC_IDF_GLOBAL_MAX, 1.0)
                    disc_idf_entries.append([j, round(scaled, 4)])
            if disc_idf_entries:
                highlights["disc_idf"] = disc_idf_entries

            # Context span regions
            ctx_spans = prompt_context_spans.get(prompt_id, [])
            if ctx_spans:
                highlights["context_spans"] = ctx_spans

            result[prompt_id] = {"highlights": highlights}

        return result

    def get_scores(
        self, feature_id: int, prompt_id: int
    ) -> Optional[Dict[str, Any]]:
        """Get pre-computed highlight data for a specific example.

        Returns:
            {"highlights": {comp: [[pos, score], ...], "context_spans": [...]}} or None
        """
        feature_data = self._data.get(feature_id)
        if feature_data is None:
            return None
        return feature_data.get(prompt_id)

    def get_feature_scores(
        self, feature_id: int
    ) -> Optional[Dict[int, Dict[str, Any]]]:
        """Get all pre-computed highlight data for a feature.

        Returns:
            {prompt_id: {"highlights": {comp: [[pos, score], ...], "context_spans": [...]}}} or None
        """
        return self._data.get(feature_id)
