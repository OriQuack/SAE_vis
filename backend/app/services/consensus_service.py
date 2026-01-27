"""
Consensus service for loading and processing explanation consensus data.

Loads explanation_consensus.parquet and returns clustered phrases
ranked by activation similarity for visualization in ExplanationPanel.
"""

import logging
from pathlib import Path
from typing import Dict, Optional

import polars as pl

logger = logging.getLogger(__name__)


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

        # Extract basic info
        consensus_score = float(row_dict.get("consensus_score", 0.0))
        num_clusters = int(row_dict.get("num_clusters", 0))
        num_outliers = int(row_dict.get("num_outliers", 0))
        clusters_data = row_dict.get("clusters", [])

        # Build flattened items list
        items = []

        for cluster in clusters_data:
            cluster_id = cluster.get("cluster_id", -1)
            is_outlier = cluster_id == -1

            if is_outlier:
                # Outlier: add each phrase as separate item
                phrases = cluster.get("phrases", [])
                for phrase in phrases:
                    items.append({
                        "cluster_id": -1,
                        "phrase": phrase.get("text", ""),
                        "explainer": phrase.get("explainer", ""),
                        "activation_similarity": float(phrase.get("activation_similarity", 0.0)),
                        "quality_score": float(phrase.get("quality_score", 0.0)),
                        "is_outlier": True,
                        "phrase_weight": float(phrase.get("phrase_weight", 0.0))
                    })
            else:
                # Cluster: add medoid with cluster info
                medoid_phrase = cluster.get("medoid_phrase", "")
                medoid_explainer = cluster.get("medoid_explainer", "")
                medoid_activation_sim = float(cluster.get("medoid_activation_similarity", 0.0))
                cluster_score = float(cluster.get("cluster_score", 0.0))
                cluster_coherence = float(cluster.get("cluster_coherence", 0.0))

                # Get all phrases in cluster
                cluster_phrases = []
                phrases = cluster.get("phrases", [])
                for phrase in phrases:
                    cluster_phrases.append({
                        "text": phrase.get("text", ""),
                        "explainer": phrase.get("explainer", ""),
                        "phrase_weight": float(phrase.get("phrase_weight", 0.0)),
                        "quality_score": float(phrase.get("quality_score", 0.0)),
                        "distance_to_medoid": float(phrase.get("distance_to_medoid", 0.0)),
                        "activation_similarity": float(phrase.get("activation_similarity", 0.0))
                    })

                # Get cluster-level average quality score
                cluster_avg_quality = float(cluster.get("cluster_avg_quality_score", 0.0))

                items.append({
                    "cluster_id": cluster_id,
                    "phrase": medoid_phrase,
                    "explainer": medoid_explainer,
                    "activation_similarity": medoid_activation_sim,
                    "avg_quality_score": cluster_avg_quality,
                    "is_outlier": False,
                    "cluster_size": len(cluster_phrases),
                    "cluster_score": cluster_score,
                    "cluster_coherence": cluster_coherence,
                    "cluster_phrases": cluster_phrases
                })

        # Sort by consensus score (cluster_score for clusters, phrase_weight for outliers) descending
        items.sort(key=lambda x: x.get("cluster_score") or x.get("phrase_weight") or 0, reverse=True)

        result = {
            "feature_id": feature_id,
            "consensus_score": consensus_score,
            "num_clusters": num_clusters,
            "num_outliers": num_outliers,
            "items": items
        }

        # Cache result
        self._cache[feature_id] = result

        return result

    async def cleanup(self):
        """Clean up resources."""
        self._cache.clear()
        self._df = None
        self.is_ready = False
        logger.info("Consensus service cleaned up")
