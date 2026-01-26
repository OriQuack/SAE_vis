#!/usr/bin/env python3
"""
Step 14: Explanation Consensus (Phrase Clustering)

This step analyzes consensus of explanations across LLM explainers using
HDBSCAN clustering and semantic similarity with activation centroids.

Algorithm:
1. Divide explanations into phrases (reuse core/phrases.py)
2. Embed each phrase with sentence transformer model
3. Cluster phrases per feature with HDBSCAN
4. Identify cluster medoid + outliers
5. Compute semantic similarity with activation centroid
6. Rank phrases and save results

Input:
- features.parquet: Feature data with explanation texts
- activation_embeddings.parquet: Pre-computed activation embeddings

Output:
- explanation_consensus.parquet: Clustered phrases with consensus scores

Features:
- HDBSCAN clustering for robust phrase grouping
- Medoid identification per cluster
- Activation centroid similarity scoring
- Outlier detection and flagging
"""

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import polars as pl
from tqdm import tqdm

# Enable string cache for categorical operations
pl.enable_string_cache()

# Add parent directory to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.base import BaseProcessor, load_yaml_config, resolve_variables
from core.logging import setup_logging
from core.phrases import chunk_text, extract_all_phrases

# Lazy imports for heavy dependencies
sentence_transformers = None
hdbscan = None

logger = logging.getLogger(__name__)


def lazy_import_dependencies():
    """Lazy import heavy dependencies."""
    global sentence_transformers, hdbscan

    if sentence_transformers is None:
        logger.info("Importing sentence-transformers...")
        import sentence_transformers as st
        sentence_transformers = st

    if hdbscan is None:
        logger.info("Importing hdbscan...")
        import hdbscan as hdb
        hdbscan = hdb


class ExplanationConsensusProcessor(BaseProcessor):
    """Analyze explanation consensus using phrase clustering."""

    @property
    def step_name(self) -> str:
        return "Step 14: Explanation Consensus"

    @property
    def version(self) -> str:
        return "1.1"  # Updated to use token_embeddings + mean pooling for activation alignment

    def _init_paths(self) -> None:
        """Initialize paths from configuration."""
        super()._init_paths()

        global_config = self.config.get("global", {})
        paths = global_config.get("paths", {})
        output_dir = paths.get("output", "data/output")
        intermediate_dir = paths.get("intermediate", "data/intermediate")

        # Input paths
        inputs = self.config.get("inputs", {})
        self.features_path = self._resolve_path(
            inputs.get("features", f"{output_dir}/features.parquet")
        )
        self.activation_embeddings_path = self._resolve_path(
            inputs.get("activation_embeddings", f"{intermediate_dir}/activation_embeddings.parquet")
        )

        # Output path
        outputs = self.config.get("outputs", {})
        self.output_path = self._resolve_path(
            outputs.get("explanation_consensus", f"{output_dir}/explanation_consensus.parquet")
        )

        # Processing parameters
        params = self.config.get("parameters", {})

        # Get embedding model: step params > global config > default
        global_embedding = global_config.get("processing", {}).get("embedding", {})
        embedding_model = params.get(
            "embedding_model",
            global_embedding.get("model", "google/embeddinggemma-300m")
        )

        self.proc_params = {
            "min_cluster_size": params.get("min_cluster_size", 2),
            "min_samples": params.get("min_samples", 1),
            "chunk_method": params.get("chunk_method", "smart"),
            "embedding_model": embedding_model,
        }

        # Statistics tracking
        self.stats = {
            "features_processed": 0,
            "features_with_clusters": 0,
            "features_with_outliers_only": 0,
            "total_clusters": 0,
            "total_outliers": 0,
            "total_phrases": 0,
        }

        # Data holders
        self.features_df: Optional[pl.DataFrame] = None
        self.activation_embeddings_df: Optional[pl.DataFrame] = None
        self.embedding_model = None

    def _load_model(self):
        """Lazy load embedding model."""
        lazy_import_dependencies()

        if self.embedding_model is None:
            model_name = self.proc_params["embedding_model"]
            logger.info(f"Loading sentence embedding model ({model_name})...")
            self.embedding_model = sentence_transformers.SentenceTransformer(model_name)

    def _embed_phrases_aligned(self, texts: List[str]) -> np.ndarray:
        """Embed phrases using token_embeddings + mean pooling.

        This matches the embedding space used by activation embeddings (step_05),
        which use token_embeddings + weighted pooling. Using the same base
        (token_embeddings) ensures phrase-activation similarity is meaningful.

        The standard model.encode() uses a different projection that produces
        embeddings in an incompatible space.

        Args:
            texts: List of phrase texts to embed

        Returns:
            Array of shape (len(texts), embedding_dim) with L2-normalized embeddings
        """
        # Get token-level embeddings (same as step_05)
        token_embeddings_batch = self.embedding_model.encode(
            texts,
            output_value="token_embeddings",
            convert_to_tensor=True,
            show_progress_bar=False
        )

        embeddings = []
        for token_emb in token_embeddings_batch:
            # Convert to numpy
            if hasattr(token_emb, 'cpu'):
                token_emb = token_emb.cpu().numpy()
            else:
                token_emb = np.array(token_emb)

            # Mean pooling (step_05 uses weighted pooling, but mean is appropriate
            # for phrases since we don't have activation weights)
            pooled = np.mean(token_emb, axis=0)

            # L2 normalize (same as step_05)
            norm = np.linalg.norm(pooled)
            if norm > 0:
                pooled = pooled / norm

            embeddings.append(pooled.astype(np.float32))

        return np.array(embeddings)

    def _load_data(self) -> None:
        """Load input data files."""
        logger.info(f"Loading features from {self.features_path}")
        if not self.features_path.exists():
            raise FileNotFoundError(f"Features file not found: {self.features_path}")
        self.features_df = pl.read_parquet(self.features_path)
        logger.info(f"Loaded {len(self.features_df):,} feature rows")

        logger.info(f"Loading activation embeddings from {self.activation_embeddings_path}")
        if not self.activation_embeddings_path.exists():
            raise FileNotFoundError(f"Activation embeddings not found: {self.activation_embeddings_path}")
        self.activation_embeddings_df = pl.read_parquet(self.activation_embeddings_path)
        logger.info(f"Loaded {len(self.activation_embeddings_df):,} activation embedding rows")

    def _get_activation_centroid(self, feature_id: int) -> Optional[np.ndarray]:
        """Get activation centroid embedding for a feature.

        Args:
            feature_id: Feature ID

        Returns:
            Mean embedding vector or None if not available
        """
        feature_row = self.activation_embeddings_df.filter(
            pl.col("feature_id") == feature_id
        )

        if len(feature_row) == 0:
            return None

        embeddings = feature_row["embeddings"].to_list()[0]
        if not embeddings:
            return None

        # Compute centroid (mean of all embeddings)
        embeddings_array = np.array(embeddings)
        centroid = np.mean(embeddings_array, axis=0)

        # Normalize
        norm = np.linalg.norm(centroid)
        if norm > 0:
            centroid = centroid / norm

        return centroid

    def _compute_cosine_similarity(self, vec_a: np.ndarray, vec_b: np.ndarray) -> float:
        """Compute cosine similarity between two vectors."""
        norm_a = np.linalg.norm(vec_a)
        norm_b = np.linalg.norm(vec_b)
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return float(np.dot(vec_a, vec_b) / (norm_a * norm_b))

    def _find_medoid(self, embeddings: np.ndarray) -> int:
        """Find medoid index (point closest to centroid).

        Args:
            embeddings: Array of shape (n_points, embedding_dim)

        Returns:
            Index of medoid point
        """
        if len(embeddings) == 0:
            return 0

        centroid = np.mean(embeddings, axis=0)
        distances = np.linalg.norm(embeddings - centroid, axis=1)
        return int(np.argmin(distances))

    def _process_feature(self, feature_id: int) -> Dict[str, Any]:
        """Process a single feature's explanations.

        Args:
            feature_id: Feature ID

        Returns:
            Dictionary with consensus results
        """
        # Get all explanations for this feature
        feature_rows = self.features_df.filter(
            pl.col("feature_id") == feature_id
        ).to_dicts()

        if not feature_rows:
            return self._create_empty_result(feature_id)

        # Collect explanations and explainer names
        explanations = []
        explainer_names = []
        for row in feature_rows:
            explanations.append(row["explanation_text"])
            explainer_names.append(row["llm_explainer"])

        # Extract phrases
        phrases = extract_all_phrases(explanations, self.proc_params["chunk_method"])
        self.stats["total_phrases"] += len(phrases)

        # Calculate phrase weights: each explanation contributes 1.0 total
        # Each phrase gets 1/n weight where n = number of phrases from that explanation
        phrases_per_explainer: Dict[int, int] = {}
        for text, exp_idx, phrase_idx in phrases:
            if exp_idx not in phrases_per_explainer:
                phrases_per_explainer[exp_idx] = 0
            phrases_per_explainer[exp_idx] += 1

        phrase_weights = []
        for text, exp_idx, phrase_idx in phrases:
            weight = 1.0 / phrases_per_explainer[exp_idx]
            phrase_weights.append(weight)

        if len(phrases) < 2:
            # Not enough phrases to cluster
            return self._create_single_phrase_result(
                feature_id, phrases, explainer_names, phrase_weights
            )

        # Embed phrases using token_embeddings + mean pooling
        # This matches the activation embedding space from step_05
        phrase_texts = [p[0] for p in phrases]
        phrase_embeddings_normalized = self._embed_phrases_aligned(phrase_texts)

        # Cluster with HDBSCAN
        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=self.proc_params["min_cluster_size"],
            min_samples=self.proc_params["min_samples"],
            metric='euclidean'
        )
        cluster_labels = clusterer.fit_predict(phrase_embeddings_normalized)

        # Get activation centroid
        activation_centroid = self._get_activation_centroid(feature_id)

        # Build cluster results
        clusters = []
        unique_labels = set(cluster_labels)

        for cluster_id in sorted(unique_labels):
            cluster_mask = cluster_labels == cluster_id
            cluster_indices = np.where(cluster_mask)[0]
            cluster_embeddings = phrase_embeddings_normalized[cluster_mask]

            is_outlier = (cluster_id == -1)

            if is_outlier:
                self.stats["total_outliers"] += len(cluster_indices)
            else:
                self.stats["total_clusters"] += 1

            # Find medoid
            if len(cluster_embeddings) > 0:
                medoid_local_idx = self._find_medoid(cluster_embeddings)
                medoid_global_idx = cluster_indices[medoid_local_idx]
            else:
                medoid_global_idx = cluster_indices[0] if len(cluster_indices) > 0 else 0

            medoid_phrase_text, medoid_exp_idx, medoid_phrase_idx = phrases[medoid_global_idx]
            medoid_explainer = explainer_names[medoid_exp_idx]
            medoid_embedding = phrase_embeddings_normalized[medoid_global_idx]

            # Compute medoid activation similarity
            if activation_centroid is not None:
                medoid_activation_sim = self._compute_cosine_similarity(
                    medoid_embedding, activation_centroid
                )
            else:
                medoid_activation_sim = 0.0

            # Compute cluster coherence (avg pairwise similarity)
            if len(cluster_embeddings) > 1:
                sim_matrix = np.dot(cluster_embeddings, cluster_embeddings.T)
                # Get upper triangle without diagonal
                upper_tri = np.triu_indices(len(cluster_embeddings), k=1)
                coherence = float(np.mean(sim_matrix[upper_tri]))
            else:
                coherence = 1.0

            # Calculate cluster score: sum of phrase weights in this cluster
            cluster_score = sum(phrase_weights[i] for i in cluster_indices)

            # Build phrase details
            phrase_details = []
            for local_idx, global_idx in enumerate(cluster_indices):
                phrase_text, exp_idx, phrase_idx = phrases[global_idx]
                phrase_embedding = phrase_embeddings_normalized[global_idx]

                # Distance to medoid
                distance_to_medoid = float(np.linalg.norm(
                    phrase_embedding - medoid_embedding
                ))

                # Activation similarity
                if activation_centroid is not None:
                    activation_sim = self._compute_cosine_similarity(
                        phrase_embedding, activation_centroid
                    )
                else:
                    activation_sim = 0.0

                phrase_details.append({
                    "text": phrase_text,
                    "explainer": explainer_names[exp_idx],
                    "phrase_weight": phrase_weights[global_idx],
                    "distance_to_medoid": distance_to_medoid,
                    "activation_similarity": activation_sim,
                    "is_outlier": is_outlier,
                })

            clusters.append({
                "cluster_id": int(cluster_id),
                "medoid_phrase": medoid_phrase_text,
                "medoid_explainer": medoid_explainer,
                "medoid_activation_similarity": medoid_activation_sim,
                "cluster_score": float(cluster_score),
                "cluster_coherence": coherence,
                "phrases": phrase_details,
            })

        # Compute consensus score: sum of all cluster scores (including outliers)
        # Maximum possible = number of explainers (e.g., 3.0 for 3 LLMs)
        num_clusters = len([c for c in clusters if c["cluster_id"] != -1])
        num_outliers = len([c for c in clusters if c["cluster_id"] == -1])

        # New scoring: sum all cluster scores (phrase weights already sum to 1 per explainer)
        consensus_score = sum(c["cluster_score"] for c in clusters)

        if num_clusters > 0:
            self.stats["features_with_clusters"] += 1
        else:
            self.stats["features_with_outliers_only"] += 1

        return {
            "feature_id": feature_id,
            "sae_id": self.sae_id,
            "consensus_score": float(consensus_score),
            "num_clusters": num_clusters,
            "num_outliers": sum(len(c["phrases"]) for c in clusters if c["cluster_id"] == -1),
            "clusters": clusters,
        }

    def _create_empty_result(self, feature_id: int) -> Dict[str, Any]:
        """Create empty result for features with no explanations."""
        return {
            "feature_id": feature_id,
            "sae_id": self.sae_id,
            "consensus_score": 0.0,
            "num_clusters": 0,
            "num_outliers": 0,
            "clusters": [],
        }

    def _create_single_phrase_result(
        self,
        feature_id: int,
        phrases: List[tuple],
        explainer_names: List[str],
        phrase_weights: List[float]
    ) -> Dict[str, Any]:
        """Create result for features with 0-1 phrases."""
        if not phrases:
            return self._create_empty_result(feature_id)

        # Single phrase is treated as outlier
        phrase_text, exp_idx, phrase_idx = phrases[0]
        phrase_weight = phrase_weights[0] if phrase_weights else 1.0

        activation_centroid = self._get_activation_centroid(feature_id)
        if activation_centroid is not None:
            # Use aligned embedding method for consistency
            phrase_embedding = self._embed_phrases_aligned([phrase_text])[0]
            activation_sim = self._compute_cosine_similarity(
                phrase_embedding, activation_centroid
            )
        else:
            activation_sim = 0.0

        self.stats["total_outliers"] += 1

        # Single phrase outlier: cluster_score = its phrase_weight
        cluster_score = phrase_weight

        return {
            "feature_id": feature_id,
            "sae_id": self.sae_id,
            "consensus_score": cluster_score,  # Single phrase contributes its weight
            "num_clusters": 0,
            "num_outliers": 1,
            "clusters": [{
                "cluster_id": -1,
                "medoid_phrase": phrase_text,
                "medoid_explainer": explainer_names[exp_idx],
                "medoid_activation_similarity": activation_sim,
                "cluster_score": cluster_score,
                "cluster_coherence": 1.0,
                "phrases": [{
                    "text": phrase_text,
                    "explainer": explainer_names[exp_idx],
                    "phrase_weight": phrase_weight,
                    "distance_to_medoid": 0.0,
                    "activation_similarity": activation_sim,
                    "is_outlier": True,
                }],
            }],
        }

    def process(self) -> pl.DataFrame:
        """Execute the main processing logic.

        Returns:
            Processed DataFrame
        """
        self._load_data()
        self._load_model()

        assert self.features_df is not None, "Features data not loaded"
        unique_features = sorted(self.features_df["feature_id"].unique().to_list())

        if self.feature_limit is not None:
            unique_features = unique_features[:self.feature_limit]
            logger.info(f"Processing limited to {self.feature_limit} features")

        logger.info(f"Processing {len(unique_features):,} features")

        results = []
        for feature_id in tqdm(unique_features, desc="Processing features"):
            result = self._process_feature(feature_id)
            results.append(result)
            self.stats["features_processed"] += 1

        logger.info(f"Processed {self.stats['features_processed']:,} features")

        return self._create_dataframe(results)

    def _create_dataframe(self, rows: List[Dict]) -> pl.DataFrame:
        """Create Polars DataFrame with proper schema.

        Args:
            rows: List of result dictionaries

        Returns:
            Polars DataFrame with typed columns
        """
        logger.info("Creating DataFrame with proper schema")

        if not rows:
            return self._create_empty_dataframe()

        df = pl.DataFrame(rows)

        df = df.with_columns([
            pl.col("feature_id").cast(pl.UInt32),
            pl.col("sae_id").cast(pl.Categorical),
            pl.col("consensus_score").cast(pl.Float32),
            pl.col("num_clusters").cast(pl.UInt16),
            pl.col("num_outliers").cast(pl.UInt16),
        ])

        logger.info(f"Created DataFrame with {len(df)} rows")
        return df

    def _create_empty_dataframe(self) -> pl.DataFrame:
        """Create empty DataFrame with correct schema."""
        # Define nested schema for phrases
        phrase_struct = pl.Struct([
            pl.Field("text", pl.Utf8),
            pl.Field("explainer", pl.Utf8),
            pl.Field("phrase_weight", pl.Float32),
            pl.Field("distance_to_medoid", pl.Float32),
            pl.Field("activation_similarity", pl.Float32),
            pl.Field("is_outlier", pl.Boolean),
        ])

        cluster_struct = pl.Struct([
            pl.Field("cluster_id", pl.Int16),
            pl.Field("medoid_phrase", pl.Utf8),
            pl.Field("medoid_explainer", pl.Utf8),
            pl.Field("medoid_activation_similarity", pl.Float32),
            pl.Field("cluster_score", pl.Float32),
            pl.Field("cluster_coherence", pl.Float32),
            pl.Field("phrases", pl.List(phrase_struct)),
        ])

        schema = {
            "feature_id": pl.UInt32,
            "sae_id": pl.Categorical,
            "consensus_score": pl.Float32,
            "num_clusters": pl.UInt16,
            "num_outliers": pl.UInt16,
            "clusters": pl.List(cluster_struct),
        }
        return pl.DataFrame(schema=schema)


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Analyze explanation consensus")
    parser.add_argument("--config", type=str, help="Path to configuration file")
    parser.add_argument("--limit", type=int, help="Limit number of features (for testing)")

    args = parser.parse_args()

    setup_logging()

    if args.config:
        full_config = load_yaml_config(args.config)
        full_config = resolve_variables(full_config)
        # Extract step-specific config if present
        config = full_config.get("steps", {}).get("step_14_explanation_consensus", {})
        if not config:
            # Fallback: treat entire config as step config (legacy format)
            config = full_config
        config["sae_id"] = full_config.get("global", {}).get("sae_id_sanitized", "")
        config["global"] = full_config.get("global", {})
    else:
        config_path = Path(__file__).parent.parent / "config.yaml"
        if config_path.exists():
            full_config = load_yaml_config(config_path)
            full_config = resolve_variables(full_config)
            config = full_config.get("steps", {}).get("step_14_explanation_consensus", {})
            config["sae_id"] = full_config.get("global", {}).get("sae_id_sanitized", "")
            config["global"] = full_config.get("global", {})
        else:
            config = {}

    processor = ExplanationConsensusProcessor(config, feature_limit=args.limit)
    processor.run()


if __name__ == "__main__":
    main()
