#!/usr/bin/env python3
"""
Create Master Parquet Directly from Preprocessed Files

This script combines the functionality of 4_detailed_json.py and 5_master_parquet.py
to create the master parquet file directly from preprocessed data files without
creating intermediate detailed JSON files.

Input: Embeddings, Scores, Semantic Similarities (JSON), Feature Similarities (JSON)
Output: Master parquet file with identical schema to existing features.parquet

Usage:
    python 5_master_parquet_direct.py [--config CONFIG_FILE] [--test-features N]
"""

import json
import logging
import numpy as np
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import argparse
from datetime import datetime
from collections import defaultdict

import polars as pl


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class DirectMasterParquetCreator:
    """Creates master parquet file directly from preprocessed data without JSON intermediate."""

    def __init__(self, config: Dict):
        self.config = config
        self.sae_id = config["sae_id"]

        # Resolve paths relative to project root
        self.project_root = self._find_project_root()
        logger.info(f"Project root: {self.project_root}")

        # Setup input directories
        input_paths = config["input_paths"]
        self.embeddings_dir = self.project_root / input_paths["embeddings_dir"]
        self.scores_dir = self.project_root / input_paths["scores_dir"]
        self.similarities_dir = self.project_root / input_paths["semantic_similarities_dir"]
        self.feature_similarity_dir = self.project_root / input_paths["feature_similarity_dir"]

        # Setup output paths
        output_paths = config["output_paths"]
        self.output_path = self.project_root / output_paths["master_parquet"]
        self.metadata_path = self.project_root / output_paths["metadata"]

        # Ensure output directory exists
        self.output_path.parent.mkdir(parents=True, exist_ok=True)

        # Processing options
        self.batch_size = config.get("processing_options", {}).get("batch_size", 500)
        self.log_interval = config.get("processing_options", {}).get("log_interval", 100)

        # Load all data at initialization
        logger.info("Loading all preprocessed data...")
        self.embeddings_data = self._load_embeddings_data()
        self.scores_data = self._load_scores_data()
        self.similarities_data = self._load_semantic_similarities_data()
        self.feature_similarities = self._load_feature_similarities()

        # Generate explanation ID mapping
        self.explanation_mapping = self._generate_explanation_ids()

        # Calculate global statistics for z-score normalization
        logger.info("Calculating global statistics for z-score normalization...")
        self.global_stats = self._calculate_global_statistics()

    def _find_project_root(self) -> Path:
        """Find the project root directory (interface)."""
        current = Path.cwd()
        while current.name != "interface" and current.parent != current:
            current = current.parent

        if current.name == "interface":
            return current
        else:
            # Fallback to current directory
            logger.warning("Could not find 'interface' directory, using current directory")
            return Path.cwd()

    def _sanitize_sae_id_for_path(self, sae_id: str) -> str:
        """Convert SAE ID to filesystem-safe directory name."""
        return sae_id.replace("/", "--")

    def _load_embeddings_data(self) -> Dict[str, Dict]:
        """Load all embedding files that match the given SAE ID."""
        embeddings_data = {}

        if not self.embeddings_dir.exists():
            logger.warning(f"Embeddings directory not found: {self.embeddings_dir}")
            return embeddings_data

        for data_source_dir in self.embeddings_dir.iterdir():
            if not data_source_dir.is_dir():
                continue

            embeddings_file = data_source_dir / "embeddings.json"
            if not embeddings_file.exists():
                continue

            try:
                with open(embeddings_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)

                # Check if this embedding file matches our SAE ID
                file_sae_id = data.get("metadata", {}).get("sae_id", "")
                if file_sae_id == self.sae_id:
                    embeddings_data[data_source_dir.name] = data
                    logger.info(f"Loaded embeddings from: {data_source_dir.name}")

            except (json.JSONDecodeError, FileNotFoundError) as e:
                logger.error(f"Error loading embeddings from {embeddings_file}: {e}")

        return embeddings_data

    def _load_scores_data(self) -> Dict[str, Dict]:
        """Load all score files that match the given SAE ID."""
        scores_data = {}

        if not self.scores_dir.exists():
            logger.warning(f"Scores directory not found: {self.scores_dir}")
            return scores_data

        for data_source_dir in self.scores_dir.iterdir():
            if not data_source_dir.is_dir():
                continue

            scores_file = data_source_dir / "scores.json"
            if not scores_file.exists():
                continue

            try:
                with open(scores_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)

                # Check if this score file matches our SAE ID
                file_sae_id = data.get("metadata", {}).get("sae_id", "")
                if file_sae_id == self.sae_id:
                    scores_data[data_source_dir.name] = data
                    logger.info(f"Loaded scores from: {data_source_dir.name}")

            except (json.JSONDecodeError, FileNotFoundError) as e:
                logger.error(f"Error loading scores from {scores_file}: {e}")

        return scores_data

    def _load_semantic_similarities_data(self) -> Dict[str, Dict]:
        """Load all semantic similarity files that match the given SAE ID."""
        similarities_data = {}

        if not self.similarities_dir.exists():
            logger.warning(f"Semantic similarities directory not found: {self.similarities_dir}")
            return similarities_data

        for comparison_dir in self.similarities_dir.iterdir():
            if not comparison_dir.is_dir():
                continue

            similarities_file = comparison_dir / "semantic_similarities.json"
            if not similarities_file.exists():
                continue

            try:
                with open(similarities_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)

                # Check if this similarity file matches our SAE ID
                metadata = data.get("metadata", {})
                file_sae_id_1 = metadata.get("sae_id_1", "")
                file_sae_id_2 = metadata.get("sae_id_2", "")
                file_sae_id_3 = metadata.get("sae_id_3", "")

                # Match if all SAE IDs present match our target SAE ID
                sae_ids = [file_sae_id_1, file_sae_id_2, file_sae_id_3]
                sae_ids = [sid for sid in sae_ids if sid]  # Remove empty strings

                if sae_ids and all(sid == self.sae_id for sid in sae_ids):
                    similarities_data[comparison_dir.name] = data
                    logger.info(f"Loaded semantic similarities from: {comparison_dir.name}")

            except (json.JSONDecodeError, FileNotFoundError) as e:
                logger.error(f"Error loading similarities from {similarities_file}: {e}")

        return similarities_data

    def _load_feature_similarities(self) -> Dict[int, float]:
        """Load feature similarities data and return mapping of feature_id to cosine_similarity."""
        similarities = {}

        # Convert slashes to double dashes for directory name
        sae_dir_name = self._sanitize_sae_id_for_path(self.sae_id)
        similarity_dir = self.feature_similarity_dir / sae_dir_name
        similarity_file = similarity_dir / "feature_similarities.json"

        if similarity_file.exists():
            try:
                with open(similarity_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)

                # Extract feature mappings
                for mapping in data.get("feature_mappings", []):
                    feature_id = mapping.get("source_feature_id")
                    cosine_sim = mapping.get("cosine_similarity")
                    if feature_id is not None and cosine_sim is not None:
                        similarities[feature_id] = abs(float(cosine_sim))

                logger.info(f"Loaded {len(similarities)} feature similarities from {similarity_file}")

            except Exception as e:
                logger.warning(f"Error loading feature similarities from {similarity_file}: {e}")
        else:
            logger.warning(f"Feature similarity file not found: {similarity_file}")

        # Warn if no similarities were loaded
        if not similarities:
            logger.warning("No feature similarities loaded - all features will use fallback value 0.0")

        return similarities

    def _generate_explanation_ids(self) -> Dict[str, Dict[str, str]]:
        """Generate unique explanation IDs for all explanations."""
        explanation_mapping = {}  # {data_source: {latent_id: explanation_id}}
        explanation_counter = 1

        # Sort data sources for consistent ID assignment
        for data_source in sorted(self.embeddings_data.keys()):
            explanation_mapping[data_source] = {}
            embeddings = self.embeddings_data[data_source].get("embeddings", {})

            # Sort latent IDs for consistent ordering
            for latent_id in sorted(embeddings.keys(), key=int):
                exp_id = f"exp_{explanation_counter:03d}"
                explanation_mapping[data_source][latent_id] = exp_id
                explanation_counter += 1

        return explanation_mapping

    def _get_explainer_from_data_source(self, data_source: str) -> str:
        """Extract explainer prefix from data_source name."""
        # Format: "{explainer}_e-{scorer}_s" -> extract "{explainer}_e"
        if "_e-" in data_source:
            return data_source.split("_e-")[0] + "_e"
        return data_source

    def _calculate_global_statistics(self) -> Dict[str, Dict[str, float]]:
        """
        Calculate global statistics (mean, std) for each metric across all features.

        Returns:
            Dict with structure: {"embedding": {"mean": X, "std": Y}, "fuzz": {...}, "detection": {...}}
        """
        # Collect all scores grouped by feature and explainer
        # Structure: {latent_id: {explainer: {"embedding": X, "fuzz": [scores], "detection": [scores]}}}
        feature_explainer_scores = defaultdict(lambda: defaultdict(lambda: {
            "embedding": None,
            "fuzz": [],
            "detection": []
        }))

        # Get explainer full names from embeddings data
        explainer_names = {}  # {explainer_prefix: full_llm_name}
        for data_source, data in self.embeddings_data.items():
            explainer_prefix = self._get_explainer_from_data_source(data_source)
            config = data.get("metadata", {}).get("config_used", {})
            llm_explainer = config.get("llm_explainer", "unknown")
            explainer_names[explainer_prefix] = llm_explainer

        # Iterate through all scores data
        for data_source, data in self.scores_data.items():
            explainer_prefix = self._get_explainer_from_data_source(data_source)
            latent_scores = data.get("latent_scores", {})

            for latent_id, score_info in latent_scores.items():
                # Add fuzz score
                fuzz_score = score_info.get("fuzz", {}).get("average_score")
                if fuzz_score is not None:
                    feature_explainer_scores[latent_id][explainer_prefix]["fuzz"].append(fuzz_score)

                # Add detection score
                detection_score = score_info.get("detection", {}).get("average_score")
                if detection_score is not None:
                    feature_explainer_scores[latent_id][explainer_prefix]["detection"].append(detection_score)

                # Add embedding score (only set once per explainer)
                embedding_score = score_info.get("embedding", {}).get("average_score")
                if embedding_score is not None and feature_explainer_scores[latent_id][explainer_prefix]["embedding"] is None:
                    feature_explainer_scores[latent_id][explainer_prefix]["embedding"] = embedding_score

        # Now collect all values for global statistics
        all_embeddings = []
        all_fuzz_avgs = []
        all_detection_avgs = []

        for latent_id, explainers in feature_explainer_scores.items():
            for explainer_prefix, scores in explainers.items():
                # Embedding score (single value per explainer)
                if scores["embedding"] is not None:
                    all_embeddings.append(scores["embedding"])

                # Average fuzz scores across scorers
                if scores["fuzz"]:
                    avg_fuzz = np.mean(scores["fuzz"])
                    all_fuzz_avgs.append(avg_fuzz)

                # Average detection scores across scorers
                if scores["detection"]:
                    avg_detection = np.mean(scores["detection"])
                    all_detection_avgs.append(avg_detection)

        # Calculate global statistics
        global_stats = {}

        if all_embeddings:
            global_stats["embedding"] = {
                "mean": float(np.mean(all_embeddings)),
                "std": float(np.std(all_embeddings, ddof=1))
            }

        if all_fuzz_avgs:
            global_stats["fuzz"] = {
                "mean": float(np.mean(all_fuzz_avgs)),
                "std": float(np.std(all_fuzz_avgs, ddof=1))
            }

        if all_detection_avgs:
            global_stats["detection"] = {
                "mean": float(np.mean(all_detection_avgs)),
                "std": float(np.std(all_detection_avgs, ddof=1))
            }

        logger.info(f"Global Statistics:")
        for metric, stats in global_stats.items():
            logger.info(f"  {metric}: mean={stats['mean']:.4f}, std={stats['std']:.4f}")

        return global_stats

    def _get_all_feature_ids(self) -> List[str]:
        """Get all unique feature IDs from embeddings data."""
        all_feature_ids = set()
        for data_source, data in self.embeddings_data.items():
            embeddings = data.get("embeddings", {})
            all_feature_ids.update(embeddings.keys())

        return sorted(all_feature_ids, key=int)

    def _process_single_feature(self, feature_id: str) -> List[Dict]:
        """
        Process a single feature and return rows for master table.

        This combines the logic from:
        - Script 4's consolidate_latent_data()
        - Script 5's _process_single_feature()
        """
        rows = []

        try:
            # Build explanations for this feature
            explanations = self._build_explanations_for_feature(feature_id)
            if not explanations:
                logger.warning(f"No explanations found for feature {feature_id}")
                return []

            # Build semantic similarities
            semantic_similarities = self._build_semantic_similarities_for_feature(feature_id)

            # Build scores
            scores = self._build_scores_for_feature(feature_id)

            # Propagate embedding scores across scorers
            self._propagate_embedding_scores(scores)

            # Calculate normalized z-scores per explainer
            normalized_scores_map = self._calculate_normalized_scores(scores)

            # Calculate overall scores per explainer
            overall_scores_map = self._calculate_overall_scores(normalized_scores_map)

            # Calculate feature-level metrics
            feature_splitting = self.feature_similarities.get(int(feature_id), 0.0)
            semsim_mean, semsim_max = self._calculate_semantic_similarity_stats(semantic_similarities)

            # Create a row for each explanation-scorer combination
            for explanation in explanations:
                # Find ALL scores matching this explainer
                matching_scores = self._find_all_matching_scores(
                    explanation["data_source"],
                    scores
                )

                if not matching_scores:
                    logger.debug(f"No matching scores for explanation in feature {feature_id}")
                    continue

                # Create a row for each scorer that evaluated this explanation
                for matching_score in matching_scores:
                    # Get normalized scores and overall score for this explainer
                    llm_explainer = explanation["llm_explainer"]
                    norm_scores = normalized_scores_map.get(llm_explainer, {})
                    overall_score = overall_scores_map.get(llm_explainer)

                    row = {
                        "feature_id": int(feature_id),
                        "sae_id": self.sae_id,
                        "explanation_method": explanation["explanation_method"],
                        "llm_explainer": llm_explainer,
                        "llm_scorer": matching_score["llm_scorer"],
                        "feature_splitting": feature_splitting,
                        "semsim_mean": semsim_mean,
                        "semsim_max": semsim_max,
                        "score_fuzz": matching_score.get("score_fuzz"),
                        "score_simulation": matching_score.get("score_simulation"),
                        "score_detection": matching_score.get("score_detection"),
                        "score_embedding": matching_score.get("score_embedding"),
                        "z_score_embedding": norm_scores.get("z_score_embedding"),
                        "z_score_fuzz": norm_scores.get("z_score_fuzz"),
                        "z_score_detection": norm_scores.get("z_score_detection"),
                        "overall_score": overall_score,
                        "details_path": None  # No detailed JSON in direct mode
                    }
                    rows.append(row)

        except Exception as e:
            logger.error(f"Error processing feature {feature_id}: {e}")

        return rows

    def _build_explanations_for_feature(self, feature_id: str) -> List[Dict]:
        """Build explanations array for a specific feature."""
        explanations = []

        for data_source, data in self.embeddings_data.items():
            embeddings = data.get("embeddings", {})
            if feature_id not in embeddings:
                continue

            embedding_info = embeddings[feature_id]
            config = data.get("metadata", {}).get("config_used", {})

            explanation = {
                "explanation_id": self.explanation_mapping[data_source][feature_id],
                "text": embedding_info.get("explanation", ""),
                "explanation_method": config.get("explanation_method", "unknown"),
                "llm_explainer": config.get("llm_explainer", "unknown"),
                "data_source": data_source
            }
            explanations.append(explanation)

        return explanations

    def _build_semantic_similarities_for_feature(self, feature_id: str) -> List[Dict]:
        """Build semantic similarity pairs for a specific feature."""
        similarity_pairs = []

        for comparison_name, data in self.similarities_data.items():
            # Check for both old format (semantic_similarities) and new format (pairwise_similarities)
            pairwise_similarities = data.get("pairwise_similarities", {})
            old_format_similarities = data.get("semantic_similarities", {})

            # Handle new 3-way pairwise format
            if pairwise_similarities:
                for pair_name, pair_data in pairwise_similarities.items():
                    # Extract similarities for this specific feature
                    pair_similarities = pair_data.get("similarities", {})
                    if feature_id not in pair_similarities:
                        continue

                    similarity_info = pair_similarities[feature_id]
                    similarities_dict = similarity_info.get("similarities", {})

                    # Get data sources for this pair
                    source_1 = pair_data.get("data_source_1", "")
                    source_2 = pair_data.get("data_source_2", "")

                    # Get explanation IDs
                    exp_id_1 = self.explanation_mapping.get(source_1, {}).get(feature_id)
                    exp_id_2 = self.explanation_mapping.get(source_2, {}).get(feature_id)

                    if exp_id_1 and exp_id_2:
                        pair_info = {
                            "pair": [exp_id_1, exp_id_2],
                            "cosine_similarity": similarities_dict.get("cosine"),
                            "euclidean_similarity": similarities_dict.get("euclidean")
                        }
                        similarity_pairs.append(pair_info)

            # Handle old 2-way format for backward compatibility
            elif old_format_similarities:
                if feature_id not in old_format_similarities:
                    continue

                similarity_info = old_format_similarities[feature_id]
                similarities_dict = similarity_info.get("similarities", {})

                # Get data sources from metadata
                metadata = data.get("metadata", {})
                source_1 = metadata.get("data_source_1", "")
                source_2 = metadata.get("data_source_2", "")

                # Get explanation IDs
                exp_id_1 = self.explanation_mapping.get(source_1, {}).get(feature_id)
                exp_id_2 = self.explanation_mapping.get(source_2, {}).get(feature_id)

                if exp_id_1 and exp_id_2:
                    pair_info = {
                        "pair": [exp_id_1, exp_id_2],
                        "cosine_similarity": similarities_dict.get("cosine"),
                        "euclidean_similarity": similarities_dict.get("euclidean")
                    }
                    similarity_pairs.append(pair_info)

        return similarity_pairs

    def _build_scores_for_feature(self, feature_id: str) -> List[Dict]:
        """Build scores array for a specific feature."""
        scores = []

        for data_source, data in self.scores_data.items():
            latent_scores = data.get("latent_scores", {})
            if feature_id not in latent_scores:
                continue

            score_info = latent_scores[feature_id]
            metadata = data.get("metadata", {})

            score_entry = {
                "data_source": data_source,
                "llm_scorer": metadata.get("llm_scorer", "unknown"),
                "score_fuzz": score_info.get("fuzz", {}).get("average_score"),
                "score_detection": score_info.get("detection", {}).get("average_score"),
                "score_simulation": score_info.get("simulation", {}).get("average_score"),
                "score_embedding": score_info.get("embedding", {}).get("average_score")
            }
            scores.append(score_entry)

        return scores

    def _propagate_embedding_scores(self, scores: List[Dict]) -> None:
        """
        Propagate embedding scores across all scorers for the same explainer.

        Modifies the scores list in-place.
        """
        # Group scores by explainer prefix
        explainer_groups = defaultdict(list)

        for score in scores:
            data_source = score.get("data_source", "")
            # Extract explainer prefix (everything before the last hyphen + hyphen)
            if "-" in data_source:
                explainer_prefix = data_source.rsplit("-", 1)[0] + "-"
                explainer_groups[explainer_prefix].append(score)

        # For each explainer group, find and propagate the embedding score
        for explainer_prefix, group_scores in explainer_groups.items():
            # Find the non-null embedding score in this group
            embedding_score = None
            for score in group_scores:
                if score.get("score_embedding") is not None:
                    embedding_score = score["score_embedding"]
                    break

            # If we found an embedding score, propagate it to all scores in this group
            if embedding_score is not None:
                for score in group_scores:
                    score["score_embedding"] = embedding_score

    def _calculate_normalized_scores(self, scores: List[Dict]) -> Dict[str, Dict]:
        """
        Calculate z-scores for each metric per explainer.

        Returns:
            Dict mapping llm_explainer to z-scores:
            {
                "llm_name": {
                    "z_score_embedding": 0.5,
                    "z_score_fuzz": 0.3,
                    "z_score_detection": 0.4
                }
            }
        """
        # Get explainer full names from embeddings data
        explainer_names = {}
        for data_source, data in self.embeddings_data.items():
            explainer_prefix = self._get_explainer_from_data_source(data_source)
            config = data.get("metadata", {}).get("config_used", {})
            llm_explainer = config.get("llm_explainer", "unknown")
            explainer_names[explainer_prefix] = llm_explainer

        # Group scores by explainer
        explainer_scores = defaultdict(lambda: {
            "embedding": None,
            "fuzz": [],
            "detection": []
        })

        for score in scores:
            data_source = score.get("data_source", "")
            explainer_prefix = self._get_explainer_from_data_source(data_source)

            # Collect embedding score
            if score.get("score_embedding") is not None:
                explainer_scores[explainer_prefix]["embedding"] = score["score_embedding"]

            # Collect fuzz scores
            if score.get("score_fuzz") is not None:
                explainer_scores[explainer_prefix]["fuzz"].append(score["score_fuzz"])

            # Collect detection scores
            if score.get("score_detection") is not None:
                explainer_scores[explainer_prefix]["detection"].append(score["score_detection"])

        # Calculate z-scores for each explainer
        normalized_scores_map = {}

        for explainer_prefix, scores_dict in explainer_scores.items():
            llm_explainer = explainer_names.get(explainer_prefix, "unknown")

            norm_score = {
                "z_score_embedding": None,
                "z_score_fuzz": None,
                "z_score_detection": None
            }

            # Z-score for embedding
            if scores_dict["embedding"] is not None and "embedding" in self.global_stats:
                stats = self.global_stats["embedding"]
                if stats["std"] > 0:
                    norm_score["z_score_embedding"] = (scores_dict["embedding"] - stats["mean"]) / stats["std"]

            # Z-score for fuzz (average across scorers first)
            if scores_dict["fuzz"] and "fuzz" in self.global_stats:
                avg_fuzz = np.mean(scores_dict["fuzz"])
                stats = self.global_stats["fuzz"]
                if stats["std"] > 0:
                    norm_score["z_score_fuzz"] = (avg_fuzz - stats["mean"]) / stats["std"]

            # Z-score for detection (average across scorers first)
            if scores_dict["detection"] and "detection" in self.global_stats:
                avg_detection = np.mean(scores_dict["detection"])
                stats = self.global_stats["detection"]
                if stats["std"] > 0:
                    norm_score["z_score_detection"] = (avg_detection - stats["mean"]) / stats["std"]

            normalized_scores_map[llm_explainer] = norm_score

        return normalized_scores_map

    def _calculate_overall_scores(self, normalized_scores_map: Dict[str, Dict]) -> Dict[str, float]:
        """
        Calculate overall score per explainer as average of z-scores.

        Returns:
            Dict mapping llm_explainer to overall_score:
            {"llm_name": 0.4, ...}
        """
        overall_scores_map = {}

        for llm_explainer, norm_scores in normalized_scores_map.items():
            z_scores = []

            # Collect non-null z-scores
            if norm_scores["z_score_embedding"] is not None:
                z_scores.append(norm_scores["z_score_embedding"])
            if norm_scores["z_score_fuzz"] is not None:
                z_scores.append(norm_scores["z_score_fuzz"])
            if norm_scores["z_score_detection"] is not None:
                z_scores.append(norm_scores["z_score_detection"])

            # Calculate average (require at least 2 metrics)
            overall_score = None
            if len(z_scores) >= 2:
                overall_score = float(np.mean(z_scores))

            overall_scores_map[llm_explainer] = overall_score

        return overall_scores_map

    def _calculate_semantic_similarity_stats(self, similarity_pairs: List[Dict]) -> Tuple[Optional[float], Optional[float]]:
        """Calculate mean and max semantic similarities from similarity pairs."""
        if not similarity_pairs:
            return None, None

        # Extract cosine similarities (using cosine as primary metric)
        similarities = [
            pair.get("cosine_similarity")
            for pair in similarity_pairs
            if pair.get("cosine_similarity") is not None
        ]

        if not similarities:
            return None, None

        return float(sum(similarities) / len(similarities)), float(max(similarities))

    def _find_all_matching_scores(self, explanation_data_source: str, scores: List[Dict]) -> List[Dict]:
        """
        Find ALL scores matching this explanation's explainer.

        Data source format: "{explainer}_e-{scorer}_s"
        """
        # Extract explainer prefix (everything up to and including "_e-")
        explainer_prefix = explanation_data_source.rsplit("-", 1)[0] + "-"

        matching_scores = []
        for score in scores:
            score_data_source = score.get("data_source", "")
            if score_data_source.startswith(explainer_prefix):
                matching_scores.append(score)

        return matching_scores

    def process_all_features(self, test_features: Optional[int] = None) -> pl.DataFrame:
        """
        Process all features and return consolidated DataFrame.

        Args:
            test_features: If specified, only process this many features (for testing)
        """
        all_rows = []
        processed_count = 0
        error_count = 0

        # Get all feature IDs
        feature_ids = self._get_all_feature_ids()

        # Limit for testing
        if test_features:
            feature_ids = feature_ids[:test_features]
            logger.info(f"TEST MODE: Processing only {test_features} features")

        total_features = len(feature_ids)
        logger.info(f"Processing {total_features} features...")

        for feature_id in feature_ids:
            try:
                rows = self._process_single_feature(feature_id)
                all_rows.extend(rows)
                processed_count += 1

                if processed_count % self.log_interval == 0:
                    logger.info(f"Processed {processed_count}/{total_features} features, {len(all_rows)} rows generated")

            except Exception as e:
                logger.error(f"Error processing feature {feature_id}: {e}")
                error_count += 1

        logger.info(f"Processing complete: {processed_count} features processed, "
                   f"{error_count} errors, {len(all_rows)} total rows")

        # Convert to DataFrame with proper schema
        return self._create_dataframe(all_rows)

    def _create_dataframe(self, rows: List[Dict]) -> pl.DataFrame:
        """Create Polars DataFrame with proper schema."""
        if not rows:
            logger.warning("No rows to process, creating empty DataFrame")
            return self._create_empty_dataframe()

        # Create DataFrame
        df = pl.DataFrame(rows)

        # Apply proper data types according to schema
        df = df.with_columns([
            pl.col("feature_id").cast(pl.UInt32),
            pl.col("sae_id").cast(pl.Categorical),
            pl.col("explanation_method").cast(pl.Categorical),
            pl.col("llm_explainer").cast(pl.Categorical),
            pl.col("llm_scorer").cast(pl.Categorical),
            pl.col("feature_splitting").cast(pl.Float32),
            pl.col("semsim_mean").cast(pl.Float32),
            pl.col("semsim_max").cast(pl.Float32),
            pl.col("score_fuzz").cast(pl.Float32),
            pl.col("score_simulation").cast(pl.Float32),
            pl.col("score_detection").cast(pl.Float32),
            pl.col("score_embedding").cast(pl.Float32),
            pl.col("z_score_embedding").cast(pl.Float32),
            pl.col("z_score_fuzz").cast(pl.Float32),
            pl.col("z_score_detection").cast(pl.Float32),
            pl.col("overall_score").cast(pl.Float32),
            pl.col("details_path").cast(pl.Utf8)
        ])

        return df

    def _create_empty_dataframe(self) -> pl.DataFrame:
        """Create empty DataFrame with correct schema."""
        return pl.DataFrame(
            schema={
                "feature_id": pl.UInt32,
                "sae_id": pl.Categorical,
                "explanation_method": pl.Categorical,
                "llm_explainer": pl.Categorical,
                "llm_scorer": pl.Categorical,
                "feature_splitting": pl.Float32,
                "semsim_mean": pl.Float32,
                "semsim_max": pl.Float32,
                "score_fuzz": pl.Float32,
                "score_simulation": pl.Float32,
                "score_detection": pl.Float32,
                "score_embedding": pl.Float32,
                "z_score_embedding": pl.Float32,
                "z_score_fuzz": pl.Float32,
                "z_score_detection": pl.Float32,
                "overall_score": pl.Float32,
                "details_path": pl.Utf8
            }
        )

    def validate_output(self, df: pl.DataFrame) -> bool:
        """Validate the output DataFrame."""
        logger.info("Validating output DataFrame...")

        # Check basic constraints
        total_rows = len(df)
        unique_combinations = len(df.select([
            "feature_id", "sae_id", "explanation_method", "llm_explainer", "llm_scorer"
        ]).unique())

        logger.info(f"Total rows: {total_rows}")
        logger.info(f"Unique primary key combinations: {unique_combinations}")

        if total_rows != unique_combinations:
            logger.error(f"Primary key constraint violated: {total_rows} rows but "
                        f"{unique_combinations} unique combinations")
            return False

        # Check for expected row count (3 explainers × 1 scorer = 3 rows per feature for current data)
        unique_features = len(df.select("feature_id").unique())
        logger.info(f"Unique features: {unique_features}")

        # Log value distributions
        logger.info("Value distributions:")
        logger.info(f"  SAE IDs: {df['sae_id'].n_unique()} unique")
        logger.info(f"  Explanation methods: {df['explanation_method'].n_unique()} unique")
        logger.info(f"  LLM explainers: {df['llm_explainer'].n_unique()} unique")
        logger.info(f"  LLM scorers: {df['llm_scorer'].n_unique()} unique")

        # Check for nulls in critical columns
        null_counts = {
            "feature_id": df["feature_id"].null_count(),
            "sae_id": df["sae_id"].null_count(),
            "llm_explainer": df["llm_explainer"].null_count(),
            "llm_scorer": df["llm_scorer"].null_count()
        }

        for col, count in null_counts.items():
            if count > 0:
                logger.error(f"Critical column '{col}' has {count} null values")
                return False

        return True

    def save_parquet(self, df: pl.DataFrame) -> None:
        """Save DataFrame as parquet file."""
        logger.info(f"Saving parquet file to {self.output_path}")
        df.write_parquet(self.output_path)

        # Save metadata
        metadata = {
            "created_at": datetime.now().isoformat(),
            "script_version": "1.0",
            "processing_mode": "direct",
            "total_rows": len(df),
            "total_features": len(df.select("feature_id").unique()),
            "schema_version": "1.0",
            "sae_id": self.sae_id,
            "config": self.config,
            "global_statistics": self.global_stats
        }

        with open(self.metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)

        logger.info(f"Metadata saved to {self.metadata_path}")
        logger.info(f"Master parquet creation complete: {len(df)} rows saved")


def load_config(config_path: Optional[str] = None) -> Dict:
    """Load configuration from file."""
    if config_path and Path(config_path).exists():
        logger.info(f"Loading config from {config_path}")
        with open(config_path, 'r') as f:
            return json.load(f)
    else:
        logger.error(f"Config file not found: {config_path}")
        raise FileNotFoundError(f"Config file not found: {config_path}")


def main():
    """Main execution function."""
    parser = argparse.ArgumentParser(description="Create master parquet directly from preprocessed files")
    parser.add_argument("--config",
                       default="../config/5_master_parquet_direct_config.json",
                       help="Path to configuration file")
    parser.add_argument("--test-features", type=int,
                       help="Process only N features for testing")
    parser.add_argument("--validate-only", action="store_true",
                       help="Only validate existing parquet file")
    args = parser.parse_args()

    # Resolve config path
    script_dir = Path(__file__).parent
    config_path = script_dir / args.config

    config = load_config(config_path)
    creator = DirectMasterParquetCreator(config)

    if args.validate_only:
        # Load and validate existing file
        if not creator.output_path.exists():
            logger.error(f"Parquet file does not exist: {creator.output_path}")
            return 1

        logger.info(f"Loading existing parquet file: {creator.output_path}")
        df = pl.read_parquet(creator.output_path)
        creator.validate_output(df)
        return 0

    # Process all features
    logger.info("Starting direct master parquet creation...")
    df = creator.process_all_features(test_features=args.test_features)

    if len(df) == 0:
        logger.error("No data to save")
        return 1

    # Validate output
    if not creator.validate_output(df):
        logger.error("Validation failed")
        return 1

    # Save parquet file
    creator.save_parquet(df)

    logger.info("Direct master parquet creation completed successfully")
    return 0


if __name__ == "__main__":
    exit(main())
