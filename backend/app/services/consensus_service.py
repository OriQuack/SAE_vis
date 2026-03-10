"""
Consensus service for loading and processing explanation consensus data.

Loads explanation_consensus.parquet and returns clustered phrases with
character offsets, ranked by activation similarity for visualization.
"""

import logging
from pathlib import Path
from typing import Dict, Optional

import polars as pl

from app.services.table_data_service import MODEL_NAME_MAP

logger = logging.getLogger(__name__)


def _extract_char_offsets(phrase: dict) -> list:
    """Extract char_offsets list, with backward compat for old start_char/end_char."""
    offsets = phrase.get("char_offsets")
    if offsets is not None:
        return [{"start": int(o["start"]), "end": int(o["end"])} for o in offsets]
    sc = int(phrase.get("start_char", 0))
    ec = int(phrase.get("end_char", 0))
    return [{"start": sc, "end": ec}] if sc or ec else []


def _process_row(row_dict: dict) -> dict:
    """Process a single row from the consensus dataframe into a response dict.

    Extracts consensus score, clusters, and outliers from the raw row data.

    Args:
        row_dict: A single row from the dataframe as a dict

    Returns:
        Dict with feature_id, consensus_score, num_clusters, num_outliers, items
    """
    feature_id = int(row_dict.get("feature_id", 0))
    num_clusters = int(row_dict.get("num_clusters", 0))
    num_outliers = int(row_dict.get("num_outliers", 0))
    clusters_data = row_dict.get("clusters", [])

    # Recompute consensus_score: S = (1/E) * sum(s_k for real clusters)
    # Excludes outlier clusters (cluster_id == -1), normalizes by num explainers
    all_explainers = set()
    real_cluster_score_sum = 0.0
    for cluster in clusters_data:
        for phrase in cluster.get("phrases", []):
            explainer = MODEL_NAME_MAP.get(phrase.get("explainer", ""), phrase.get("explainer", ""))
            if explainer:
                all_explainers.add(explainer)
        if cluster.get("cluster_id", -1) != -1:
            real_cluster_score_sum += float(cluster.get("cluster_score", 0.0))

    num_explainers = len(all_explainers)
    consensus_score = real_cluster_score_sum / num_explainers if num_explainers > 0 else 0.0

    # Build flattened items list
    items = []

    for cluster in clusters_data:
        cluster_id = cluster.get("cluster_id", -1)
        is_outlier = cluster_id == -1

        if is_outlier:
            # Outlier: add each phrase as separate item
            phrases = cluster.get("phrases", [])
            for phrase in phrases:
                offsets = _extract_char_offsets(phrase)
                items.append({
                    "cluster_id": -1,
                    "phrase": phrase.get("text", ""),
                    "explainer": MODEL_NAME_MAP.get(phrase.get("explainer", ""), phrase.get("explainer", "")),
                    "activation_similarity": float(phrase.get("activation_similarity", 0.0)),
                    "quality_score": float(phrase.get("quality_score", 0.0)),
                    "is_outlier": True,
                    "phrase_weight": float(phrase.get("phrase_weight", 0.0)),
                    "start_char": offsets[0]["start"] if offsets else 0,
                    "end_char": offsets[0]["end"] if offsets else 0,
                    "char_offsets": offsets,
                })
        else:
            # Cluster: add medoid with cluster info
            medoid_phrase = cluster.get("medoid_phrase", "")
            medoid_explainer = MODEL_NAME_MAP.get(cluster.get("medoid_explainer", ""), cluster.get("medoid_explainer", ""))
            medoid_activation_sim = float(cluster.get("medoid_activation_similarity", 0.0))
            cluster_score = float(cluster.get("cluster_score", 0.0))
            cluster_coherence = float(cluster.get("cluster_coherence", 0.0))

            # Get all phrases in cluster
            cluster_phrases = []
            phrases = cluster.get("phrases", [])
            for phrase in phrases:
                offsets = _extract_char_offsets(phrase)
                cluster_phrases.append({
                    "text": phrase.get("text", ""),
                    "explainer": MODEL_NAME_MAP.get(phrase.get("explainer", ""), phrase.get("explainer", "")),
                    "phrase_weight": float(phrase.get("phrase_weight", 0.0)),
                    "quality_score": float(phrase.get("quality_score", 0.0)),
                    "distance_to_medoid": float(phrase.get("distance_to_medoid", 0.0)),
                    "activation_similarity": float(phrase.get("activation_similarity", 0.0)),
                    "start_char": offsets[0]["start"] if offsets else 0,
                    "end_char": offsets[0]["end"] if offsets else 0,
                    "char_offsets": offsets,
                })

            # Get cluster-level average quality score
            cluster_avg_quality = float(cluster.get("cluster_avg_quality_score", 0.0))

            # Get medoid offsets from its phrase data
            medoid_offsets: list = []
            for cp in cluster_phrases:
                if cp["distance_to_medoid"] == 0.0 and cp["explainer"] == medoid_explainer:
                    medoid_offsets = cp["char_offsets"]
                    break

            items.append({
                "cluster_id": cluster_id,
                "phrase": medoid_phrase,
                "explainer": medoid_explainer,
                "activation_similarity": medoid_activation_sim,
                "avg_quality_score": cluster_avg_quality,
                "is_outlier": False,
                "start_char": medoid_offsets[0]["start"] if medoid_offsets else 0,
                "end_char": medoid_offsets[0]["end"] if medoid_offsets else 0,
                "char_offsets": medoid_offsets,
                "cluster_size": len(cluster_phrases),
                "cluster_score": cluster_score,
                "cluster_coherence": cluster_coherence,
                "cluster_phrases": cluster_phrases
            })

    # Sort by consensus score (cluster_score for clusters, phrase_weight for outliers) descending
    items.sort(key=lambda x: x.get("cluster_score") or x.get("phrase_weight") or 0, reverse=True)

    return {
        "feature_id": feature_id,
        "consensus_score": consensus_score,
        "num_clusters": num_clusters,
        "num_outliers": num_outliers,
        "items": items
    }


class ConsensusService:
    """Service for loading and processing explanation consensus data."""

    def __init__(self, data_path: str = "/home/dohyun/interface/data"):
        """Initialize ConsensusService.

        Args:
            data_path: Base path to data directory
        """
        self.data_path = Path(data_path)
        self.consensus_file = self.data_path / "output" / "explanation_consensus.parquet"
        self._cache: Dict[int, dict] = {}
        self._df: Optional[pl.DataFrame] = None
        self.is_ready = False

    async def initialize(self) -> bool:
        """Load consensus data from parquet file.

        Returns:
            True if initialization successful, False otherwise
        """
        try:
            if not self.consensus_file.exists():
                logger.warning(f"Consensus file not found: {self.consensus_file}")
                return False

            logger.info(f"Loading consensus data from {self.consensus_file}...")
            self._df = pl.read_parquet(self.consensus_file)

            logger.info(
                f"Consensus service ready: {len(self._df)} features loaded"
            )
            self.is_ready = True
            return True

        except Exception as e:
            logger.error(f"Failed to initialize consensus service: {e}")
            self.is_ready = False
            return False

    def get_feature_consensus(self, feature_id: int) -> Optional[dict]:
        """Get consensus data for a specific feature.

        Returns flattened list of items (medoids + outliers) sorted by
        activation_similarity (descending).

        Args:
            feature_id: Feature ID to look up

        Returns:
            Dict with consensus_score, num_clusters, num_outliers, and items list,
            or None if not found
        """
        if not self.is_ready or self._df is None:
            return None

        # Check cache first
        if feature_id in self._cache:
            return self._cache[feature_id]

        # Look up feature in dataframe
        row = self._df.filter(pl.col("feature_id") == feature_id)
        if len(row) == 0:
            return None

        row_dict = row.row(0, named=True)
        result = _process_row(row_dict)

        # Cache result
        self._cache[feature_id] = result

        return result

    def get_all_consensus(self) -> Dict[int, dict]:
        """Get consensus data for all features in a single pass.

        Iterates over all rows in the dataframe once, processes each row,
        and populates the cache as a side effect.

        Returns:
            Dict mapping feature_id to consensus data
        """
        if not self.is_ready or self._df is None:
            return {}

        # If cache is already fully populated, return it
        if len(self._cache) == len(self._df):
            return self._cache

        logger.info(f"Processing all {len(self._df)} consensus rows...")
        result: Dict[int, dict] = {}

        for row_dict in self._df.iter_rows(named=True):
            processed = _process_row(row_dict)
            feature_id = processed["feature_id"]
            result[feature_id] = processed
            # Populate cache as side effect
            self._cache[feature_id] = processed

        logger.info(f"All consensus data processed: {len(result)} features")
        return result

    async def cleanup(self):
        """Clean up resources."""
        self._cache.clear()
        self._df = None
        self.is_ready = False
        logger.info("Consensus service cleaned up")
