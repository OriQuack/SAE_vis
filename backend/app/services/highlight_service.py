"""
Highlight service for per-token syntax/context scoring.

Loads activation_highlights.parquet, gates weak signals using fixed global
thresholds, and returns per-component [position, score] pairs. No aggregation
— frontend receives individual component data for hover grouping.
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
    # Context: 0.4 for spans, > 0 for disc_idf
    "c_span_1": 0.4,
    "c_span_8": 0.4,
    # c_discriminative and c_token_idf used only as disc_idf product
}

# Global max for disc*idf product, used to scale into [0, 1]
DISC_IDF_GLOBAL_MAX = 3.12

# Components included in output (c_span_16, c_span_32 removed — too broad)
SYNTAX_COMPONENTS = ["s_word_ngram", "s_char_ngram", "s_dep_parse", "s_ast_parse"]
CONTEXT_SPAN_COMPONENTS = ["c_span_1", "c_span_8"]

# Highlight data type: {component: [[position, score], ...]}
HighlightData = Dict[str, List[List[float]]]


class HighlightService:
    """Service for loading and scoring per-token highlights."""

    def __init__(self, highlights_path: Path):
        self.highlights_path = highlights_path
        # {feature_id: {prompt_id: {"highlights": {comp: [[pos, score], ...]}}}}
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

        # Group rows by feature_id
        feature_groups: Dict[int, List[dict]] = {}
        for row in df.to_dicts():
            fid = row["feature_id"]
            if fid not in feature_groups:
                feature_groups[fid] = []
            feature_groups[fid].append(row)

        for fid, rows in feature_groups.items():
            self._data[fid] = self._score_feature(rows)

        logger.info(f"Pre-computed highlight data for {len(self._data):,} features")

    def _score_feature(
        self, rows: List[dict]
    ) -> Dict[int, Dict[str, Any]]:
        """Gate weak signals and return per-component [position, score] pairs.

        Returns:
            {prompt_id: {"highlights": {comp: [[pos, score], ...]}}}
        """
        result: Dict[int, Dict[str, Any]] = {}

        for row in rows:
            prompt_id = row["prompt_id"]
            num_tokens = len(row.get("s_word_ngram", []))
            if num_tokens == 0:
                result[prompt_id] = {"highlights": {}}
                continue

            highlights: HighlightData = {}

            # Gate syntax and context span components
            for comp in SYNTAX_COMPONENTS + CONTEXT_SPAN_COMPONENTS:
                raw = row.get(comp, [0.0] * num_tokens)
                thr = GATE_THRESHOLDS[comp]
                entries = []
                for j, v in enumerate(raw):
                    if v > thr:
                        entries.append([j, round(v, 4)])
                # c_span_8: keep top 2 scoring positions, then expand each to 8-token window
                if comp == "c_span_8" and entries:
                    entries.sort(key=lambda x: x[1], reverse=True)
                    top_positions = entries[:2]
                    # Expand each position to ±3 (8-token window centered on it)
                    expanded: dict[int, float] = {}
                    for pos, score in top_positions:
                        for k in range(max(0, pos - 3), min(num_tokens, pos + 5)):
                            if k not in expanded or score > expanded[k]:
                                expanded[k] = score
                    entries = [[k, round(v, 4)] for k, v in sorted(expanded.items())]
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

            result[prompt_id] = {"highlights": highlights}

        return result

    def get_scores(
        self, feature_id: int, prompt_id: int
    ) -> Optional[Dict[str, Any]]:
        """Get pre-computed highlight data for a specific example.

        Returns:
            {"highlights": {comp: [[pos, score], ...]}} or None
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
            {prompt_id: {"highlights": {comp: [[pos, score], ...]}}} or None
        """
        return self._data.get(feature_id)
