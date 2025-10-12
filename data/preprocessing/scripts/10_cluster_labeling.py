#!/usr/bin/env python3
"""
Automatic Cluster Labeling using c-TF-IDF and LLM

This script generates human-readable labels for explanation clusters by:
1. Extracting distinctive terms using class-based TF-IDF (c-TF-IDF)
2. Generating descriptive labels via LLM based on terms and sample explanations

The c-TF-IDF approach treats each cluster as a single document, emphasizing
terms that are distinctive to that cluster compared to others.
"""

import json
import os
import sys
import argparse
import logging
from pathlib import Path
from typing import Dict, List, Tuple, Optional, Any
from datetime import datetime
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
import openai
from collections import defaultdict
from dotenv import load_dotenv

# Add project root to path
# Script is at: /home/dohyun/interface/data/preprocessing/scripts/10_cluster_labeling.py
# parents[0] = scripts, parents[1] = preprocessing, parents[2] = data, parents[3] = interface (project root)
project_root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(project_root))


class ClusterLabelingProcessor:
    """Process explanation clusters to generate human-readable labels using c-TF-IDF and LLM."""

    def __init__(self, config: Dict):
        """
        Initialize the cluster labeling processor.

        Args:
            config: Configuration dictionary containing all settings
        """
        self.config = config
        self.logger = logging.getLogger(__name__)

        # Setup paths
        self.project_root = Path(__file__).resolve().parents[3]
        self.clustering_path = self.project_root / config["recursive_clustering_path"]
        self.raw_data_dir = self.project_root / config["raw_data_directory"]
        self.output_dir = self.project_root / config["output_directory"]
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Source directories
        self.source_directories = config.get("source_directories", [])
        if not self.source_directories:
            raise ValueError("source_directories must be specified in config")

        self.layer_name = config["layer_name"]

        # LLM settings
        llm_config = config["llm_settings"]
        self.llm_enabled = llm_config.get("enabled", True)
        self.llm_provider = llm_config.get("provider", "openai")
        self.llm_model = llm_config.get("model", "gpt-5-mini")
        self.temperature = llm_config.get("temperature", 0.3)
        self.max_tokens = llm_config.get("max_tokens", 1000)
        self.system_prompt = llm_config.get("system_prompt", "")

        # Initialize LLM client only if enabled
        self.llm_client = None
        if self.llm_enabled:
            api_key = os.getenv(llm_config["api_key_env"])
            if not api_key:
                raise ValueError(f"Environment variable {llm_config['api_key_env']} not set")

            from openai import OpenAI
            self.llm_client = OpenAI(api_key=api_key)
        else:
            self.logger.info("LLM is disabled, will use c-TF-IDF terms for labels")

        # c-TF-IDF settings
        self.ctfidf_config = config["ctfidf_settings"]
        self.top_n_terms = self.ctfidf_config["top_n_terms"]
        self.label_n_terms = self.ctfidf_config.get("label_n_terms", 3)

        # Labeling settings
        self.labeling_config = config["labeling_settings"]
        self.n_sample_explanations = self.labeling_config["n_sample_explanations"]
        self.label_max_words = self.labeling_config["label_max_words"]
        self.include_ctfidf = self.labeling_config["include_ctfidf_in_prompt"]

        # Cache for loaded explanation texts
        self.explanation_cache = {}

        # Cache for loaded embeddings
        self.embeddings_cache = {}
        self.embeddings_dir = self.project_root / config.get("embeddings_directory", "data/embeddings")

        self.logger.info("ClusterLabelingProcessor initialized")
        self.logger.info(f"Clustering results path: {self.clustering_path}")
        self.logger.info(f"Raw data directory: {self.raw_data_dir}")
        self.logger.info(f"Embeddings directory: {self.embeddings_dir}")
        self.logger.info(f"Output directory: {self.output_dir}")
        self.logger.info(f"Source directories: {', '.join(self.source_directories)}")
        if self.llm_enabled:
            self.logger.info(f"LLM: {self.llm_provider}/{self.llm_model}")
        else:
            self.logger.info(f"LLM: Disabled (using top {self.label_n_terms} c-TF-IDF terms)")

    def load_clustering_results(self) -> Dict:
        """
        Load the recursive clustering results from JSON file.

        Returns:
            Dictionary containing the cluster tree and metadata
        """
        self.logger.info(f"Loading clustering results from {self.clustering_path}")

        if not self.clustering_path.exists():
            raise FileNotFoundError(f"Clustering results not found: {self.clustering_path}")

        with open(self.clustering_path, 'r', encoding='utf-8') as f:
            results = json.load(f)

        # Extract relevant information
        metadata = results.get("metadata", {})
        n_total_features = metadata.get("n_explanations", 0)
        cluster_tree = results.get("cluster_tree", {})

        # Store the explanation ID mapping for converting indices to IDs
        self.explanation_id_mapping = results.get("explanation_id_mapping", [])

        self.logger.info(f"Loaded clustering results with {n_total_features} total explanations")
        self.logger.info(f"Loaded {len(self.explanation_id_mapping)} explanation ID mappings")

        return results

    def get_explanation_ids_from_indices(self, member_indices: List[int]) -> List[str]:
        """
        Convert member indices to explanation IDs using the mapping.

        Args:
            member_indices: List of integer indices

        Returns:
            List of explanation ID strings
        """
        explanation_ids = []
        for idx in member_indices:
            idx_str = str(idx)
            if idx_str in self.explanation_id_mapping:
                explanation_ids.append(self.explanation_id_mapping[idx_str])
            else:
                self.logger.warning(f"Index {idx} not found in explanation_id_mapping")

        return explanation_ids

    def parse_explanation_id(self, explanation_id: str) -> Tuple[int, str]:
        """
        Parse explanation ID to extract feature number and source.

        Args:
            explanation_id: ID string like "feature_0_llama_e-llama_s"

        Returns:
            Tuple of (feature_number, source_name)
        """
        # Expected format: "feature_{number}_{source}"
        parts = explanation_id.split('_')

        if len(parts) < 3 or parts[0] != 'feature':
            raise ValueError(f"Invalid explanation ID format: {explanation_id}")

        feature_num = int(parts[1])
        source = '_'.join(parts[2:])  # Rejoin in case source has underscores

        # Validate source against configured source directories
        if source not in self.source_directories:
            self.logger.warning(f"Source '{source}' from ID '{explanation_id}' not in configured source_directories: {self.source_directories}")

        return feature_num, source

    def load_explanation_text(self, explanation_id: str) -> str:
        """
        Load explanation text from file based on explanation ID.

        Args:
            explanation_id: ID string identifying the explanation

        Returns:
            The explanation text content
        """
        # Check cache first
        if explanation_id in self.explanation_cache:
            return self.explanation_cache[explanation_id]

        try:
            feature_num, source = self.parse_explanation_id(explanation_id)

            # Build file path: data/raw/{source}/explanations/layers.30_latent{feature_num}.txt
            file_path = self.raw_data_dir / source / "explanations" / f"{self.layer_name}_latent{feature_num}.txt"

            if not file_path.exists():
                self.logger.warning(f"Explanation file not found: {file_path}")
                return f"[Missing explanation for {explanation_id}]"

            with open(file_path, 'r', encoding='utf-8') as f:
                text = f.read().strip()

            # Cache the result
            self.explanation_cache[explanation_id] = text

            return text

        except Exception as e:
            self.logger.error(f"Error loading explanation {explanation_id}: {e}")
            return f"[Error loading {explanation_id}]"

    def load_embeddings(self, source: str) -> Dict:
        """
        Load embeddings for a given data source.

        Args:
            source: Data source name (e.g., "llama_e-llama_s")

        Returns:
            Dictionary mapping feature numbers to embedding vectors
        """
        # Check cache first
        if source in self.embeddings_cache:
            return self.embeddings_cache[source]

        embeddings_file = self.embeddings_dir / source / "embeddings.json"

        if not embeddings_file.exists():
            self.logger.warning(f"Embeddings file not found: {embeddings_file}")
            return {}

        try:
            with open(embeddings_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # Convert to dictionary mapping feature number to embedding vector
            # Structure: { "0": {"explanation": "...", "embedding": [...], "embedding_dim": 768}, ... }
            embeddings_dict = {}
            embeddings_data = data.get("embeddings", {})

            for latent_id_str, item in embeddings_data.items():
                if isinstance(item, dict) and "embedding" in item:
                    # Convert string ID to integer
                    latent_id = int(latent_id_str)
                    embedding = item["embedding"]
                    embeddings_dict[latent_id] = np.array(embedding, dtype=np.float32)

            self.embeddings_cache[source] = embeddings_dict
            self.logger.info(f"Loaded {len(embeddings_dict)} embeddings from {source}")

            return embeddings_dict

        except Exception as e:
            self.logger.error(f"Error loading embeddings from {source}: {e}")
            return {}

    def get_embedding(self, explanation_id: str) -> Optional[np.ndarray]:
        """
        Get embedding vector for a specific explanation ID.

        Args:
            explanation_id: ID string like "feature_0_llama_e-llama_s"

        Returns:
            Numpy array of embedding vector, or None if not found
        """
        try:
            feature_num, source = self.parse_explanation_id(explanation_id)
            embeddings = self.load_embeddings(source)

            return embeddings.get(feature_num)

        except Exception as e:
            self.logger.error(f"Error getting embedding for {explanation_id}: {e}")
            return None

    def select_representative_samples(self, explanation_ids: List[str], n_samples: int) -> List[str]:
        """
        Select representative samples from a cluster using embedding-based centroid sampling.

        This method:
        1. Loads embeddings for all explanations in the cluster
        2. Computes the cluster centroid (mean embedding)
        3. Selects the N explanations closest to the centroid

        Args:
            explanation_ids: List of explanation IDs in the cluster
            n_samples: Number of samples to select

        Returns:
            List of selected explanation IDs (most representative)
        """
        if len(explanation_ids) <= n_samples:
            # If cluster is small, return all IDs
            return explanation_ids

        # Load embeddings for all explanations
        embeddings_list = []
        valid_ids = []

        for exp_id in explanation_ids:
            embedding = self.get_embedding(exp_id)
            if embedding is not None:
                embeddings_list.append(embedding)
                valid_ids.append(exp_id)
            else:
                self.logger.warning(f"No embedding found for {exp_id}, excluding from sampling")

        if len(embeddings_list) == 0:
            self.logger.warning("No embeddings found, falling back to sequential sampling")
            return explanation_ids[:n_samples]

        if len(embeddings_list) <= n_samples:
            return valid_ids

        # Convert to numpy array for efficient computation
        embeddings_array = np.stack(embeddings_list, axis=0)

        # Compute cluster centroid (mean embedding)
        centroid = np.mean(embeddings_array, axis=0)

        # Compute distances from centroid to each embedding
        distances = np.linalg.norm(embeddings_array - centroid, axis=1)

        # Select N closest samples to centroid
        closest_indices = np.argsort(distances)[:n_samples]

        selected_ids = [valid_ids[idx] for idx in closest_indices]

        self.logger.info(f"Selected {len(selected_ids)} representative samples from {len(explanation_ids)} using centroid-based sampling")

        return selected_ids

    def collect_cluster_texts(self, node: Dict) -> List[List[str]]:
        """
        Collect all explanation texts grouped by cluster.

        Args:
            node: Current node in the cluster tree

        Returns:
            List of text lists, where each inner list contains all texts for one cluster
        """
        cluster_texts = []

        # Process children (each child is a cluster)
        for child in node.get("children", []):
            texts = []

            # Collect all explanation IDs in this cluster
            explanation_ids = child.get("explanation_ids", [])

            for exp_id in explanation_ids:
                text = self.load_explanation_text(exp_id)
                texts.append(text)

            if texts:
                cluster_texts.append(texts)

        return cluster_texts

    def compute_ctfidf(self, cluster_texts: List[List[str]]) -> Dict[int, List[Tuple[str, float]]]:
        """
        Compute class-based TF-IDF (c-TF-IDF) for each cluster.

        c-TF-IDF treats each cluster as a single document by concatenating all texts,
        emphasizing terms that are distinctive to each cluster.

        Args:
            cluster_texts: List of text lists, one per cluster

        Returns:
            Dictionary mapping cluster index to list of (term, score) tuples
        """
        self.logger.info(f"Computing c-TF-IDF for {len(cluster_texts)} clusters")

        if len(cluster_texts) < 2:
            self.logger.warning("Less than 2 clusters, c-TF-IDF may not be meaningful")

        # Concatenate all texts within each cluster to form cluster documents
        cluster_documents = []
        for texts in cluster_texts:
            cluster_doc = " ".join(texts)
            cluster_documents.append(cluster_doc)

        # Apply TF-IDF
        vectorizer = TfidfVectorizer(
            ngram_range=tuple(self.ctfidf_config["ngram_range"]),
            min_df=self.ctfidf_config["min_df"],
            max_df=self.ctfidf_config["max_df"],
            stop_words=self.ctfidf_config["stop_words"]
        )

        try:
            tfidf_matrix = vectorizer.fit_transform(cluster_documents)
            feature_names = vectorizer.get_feature_names_out()

            # Extract top N terms for each cluster
            cluster_top_terms = {}

            for cluster_idx in range(len(cluster_documents)):
                # Get TF-IDF scores for this cluster
                scores = tfidf_matrix[cluster_idx].toarray().flatten()

                # Get top N term indices
                top_indices = np.argsort(scores)[-self.top_n_terms:][::-1]

                # Extract terms and scores
                top_terms = [(feature_names[idx], scores[idx]) for idx in top_indices if scores[idx] > 0]

                cluster_top_terms[cluster_idx] = top_terms

                terms_str = ", ".join([f"{term}({score:.3f})" for term, score in top_terms[:5]])
                self.logger.info(f"Cluster {cluster_idx} top terms: {terms_str}")

            return cluster_top_terms

        except Exception as e:
            self.logger.error(f"Error computing c-TF-IDF: {e}")
            return {}

    def generate_ctfidf_label(self, cluster_idx: int, ctfidf_terms: List[Tuple[str, float]]) -> str:
        """
        Generate a label using only c-TF-IDF terms.

        Args:
            cluster_idx: Index of the cluster
            ctfidf_terms: List of (term, score) tuples from c-TF-IDF

        Returns:
            Label string based on top terms
        """
        if not ctfidf_terms:
            return f"Cluster {cluster_idx}"

        # Take top N terms for label
        top_terms = [term for term, _ in ctfidf_terms[:self.label_n_terms]]
        label = ", ".join(top_terms)

        self.logger.info(f"Generated c-TF-IDF label for cluster {cluster_idx}: {label}")

        return label

    def generate_llm_label(self, cluster_idx: int, ctfidf_terms: List[Tuple[str, float]],
                          sample_texts: List[str], cluster_size: int) -> str:
        """
        Generate a descriptive label for a cluster using LLM.

        Args:
            cluster_idx: Index of the cluster
            ctfidf_terms: List of (term, score) tuples from c-TF-IDF
            sample_texts: Sample explanation texts from the cluster
            cluster_size: Total number of items in the cluster

        Returns:
            Generated label string
        """
        # If LLM is disabled, use c-TF-IDF label
        if not self.llm_enabled:
            return self.generate_ctfidf_label(cluster_idx, ctfidf_terms)

        self.logger.info(f"Generating LLM label for cluster {cluster_idx} (size: {cluster_size})")

        # Build prompt
        prompt_parts = [f"Generate a concise, descriptive label (max {self.label_max_words} words) for this cluster of SAE feature explanations."]
        prompt_parts.append(f"\nThis cluster contains {cluster_size} feature explanations.")

        # Add c-TF-IDF terms if enabled
        if self.include_ctfidf and ctfidf_terms:
            terms_str = ", ".join([term for term, _ in ctfidf_terms[:self.top_n_terms]])
            prompt_parts.append(f"\nDistinctive terms for this cluster: {terms_str}")

        # Add sample explanations
        prompt_parts.append("\nSample explanations from this cluster:")
        for i, text in enumerate(sample_texts[:self.n_sample_explanations], 1):
            # Truncate very long explanations
            truncated_text = text[:300] + "..." if len(text) > 300 else text
            prompt_parts.append(f"\n{i}. {truncated_text}")

        prompt_parts.append(f"\n\nGenerate a label (max {self.label_max_words} words) that captures the common theme:")

        prompt = "\n".join(prompt_parts)

        try:
            # Call OpenAI API (v1.0+ interface)
            # Note: GPT-5 models use max_completion_tokens instead of max_tokens
            # Note: GPT-5 models only support temperature=1 (default), so we omit it
            response = self.llm_client.chat.completions.create(
                model=self.llm_model,
                messages=[
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user", "content": prompt}
                ],
                max_completion_tokens=self.max_tokens
            )

            label = response.choices[0].message.content.strip()

            # Clean up label (remove quotes, extra whitespace)
            label = label.strip('"\'').strip()

            self.logger.info(f"Generated LLM label for cluster {cluster_idx}: {label}")

            return label

        except Exception as e:
            self.logger.error(f"Error calling LLM API: {e}")
            # Fallback to c-TF-IDF label
            fallback_label = self.generate_ctfidf_label(cluster_idx, ctfidf_terms)
            self.logger.warning(f"Using fallback label: {fallback_label}")
            return fallback_label

    def traverse_and_label(self, node: Dict, level: int = 0, parent_path: str = "") -> Dict:
        """
        Recursively traverse the cluster tree and add labels to each node.

        Args:
            node: Current node in the cluster tree
            level: Current recursion level
            parent_path: Path from root for logging

        Returns:
            Node dictionary with added labels
        """
        cluster_id = node.get("cluster_id", "root")
        current_path = f"{parent_path}/{cluster_id}" if parent_path else cluster_id

        self.logger.info(f"Processing node: {current_path} (level {level})")

        # Process children if they exist
        children = node.get("children", [])

        if not children:
            self.logger.info(f"Leaf node {current_path}, no children to label")
            return node

        # Collect texts for all children clusters
        cluster_texts = []
        cluster_metadata = []  # Store cluster info for later labeling

        for child in children:
            # Convert member_indices to explanation_ids
            member_indices = child.get("member_indices", [])
            explanation_ids = self.get_explanation_ids_from_indices(member_indices)

            # Select representative samples using embedding-based centroid sampling
            selected_ids = self.select_representative_samples(explanation_ids, self.n_sample_explanations)

            # Load texts for ALL explanations (for c-TF-IDF computation)
            all_texts = []
            for exp_id in explanation_ids:
                text = self.load_explanation_text(exp_id)
                all_texts.append(text)

            # Load texts for SELECTED samples (for LLM prompt)
            sample_texts = []
            for exp_id in selected_ids:
                text = self.load_explanation_text(exp_id)
                sample_texts.append(text)

            if all_texts:
                cluster_texts.append(all_texts)  # Use all texts for c-TF-IDF
                cluster_metadata.append({
                    "child": child,
                    "selected_ids": selected_ids,  # IDs that were sampled
                    "sample_texts": sample_texts,  # Use selected samples for LLM
                    "size": len(explanation_ids)
                })

        # Compute c-TF-IDF if we have multiple clusters
        ctfidf_terms = {}
        if len(cluster_texts) >= 2:
            ctfidf_terms = self.compute_ctfidf(cluster_texts)
        else:
            self.logger.warning(f"Only {len(cluster_texts)} cluster(s) at {current_path}, skipping c-TF-IDF")

        # Generate labels for each child cluster
        for idx, meta in enumerate(cluster_metadata):
            child = meta["child"]
            sample_texts = meta["sample_texts"]
            size = meta["size"]

            # Get c-TF-IDF terms for this cluster
            terms = ctfidf_terms.get(idx, [])

            # Generate label using representative samples
            label = self.generate_llm_label(idx, terms, sample_texts, size)

            # Add label to child node
            child["label"] = label

            # Add labeling metadata (c-TF-IDF terms and sampled explanations)
            if not "labeling_metadata" in child:
                child["labeling_metadata"] = {}

            # Store c-TF-IDF terms
            if terms:
                child["labeling_metadata"]["ctfidf_terms"] = [
                    {"term": term, "score": float(score)} for term, score in terms
                ]

            # Store sampled explanation IDs that were used for LLM prompt
            selected_ids = meta["selected_ids"]
            child["labeling_metadata"]["sampled_explanation_ids"] = selected_ids

            # Store sampled explanation texts (for transparency and debugging)
            child["labeling_metadata"]["sampled_explanations"] = [
                {"explanation_id": exp_id, "text": text}
                for exp_id, text in zip(selected_ids, sample_texts)
            ]

            # Recursively process child
            self.traverse_and_label(child, level + 1, current_path)

        return node

    def extract_labels_only(self, node: Dict, labels_dict: Dict = None) -> Dict:
        """
        Extract only labels and labeling metadata from tree, without duplicating structure.

        Args:
            node: Current node in the cluster tree
            labels_dict: Dictionary to accumulate labels

        Returns:
            Dictionary mapping cluster_id to label and metadata
        """
        if labels_dict is None:
            labels_dict = {}

        cluster_id = node.get("cluster_id")

        # Store label and metadata for this node
        if "label" in node:
            labels_dict[cluster_id] = {
                "label": node["label"]
            }

            # Add labeling metadata if present
            if "labeling_metadata" in node:
                labels_dict[cluster_id]["labeling_metadata"] = node["labeling_metadata"]

        # Recursively process children
        for child in node.get("children", []):
            self.extract_labels_only(child, labels_dict)

        return labels_dict

    def save_results(self, labeled_tree: Dict, original_results: Dict) -> None:
        """
        Save the cluster labels and metadata to output file.
        Does NOT duplicate the tree structure from original clustering file.

        Args:
            labeled_tree: Cluster tree with added labels
            original_results: Original clustering results for metadata
        """
        output_file = self.output_dir / "cluster_labels.json"

        # Extract only labels and metadata, not the full tree structure
        labels_only = self.extract_labels_only(labeled_tree)

        # Prepare lightweight output structure
        output = {
            "description": "Cluster labels and metadata generated using c-TF-IDF and LLM. Reference the original clustering file for full tree structure.",
            "original_clustering_file": str(self.clustering_path.relative_to(self.project_root)),
            "generated_at": datetime.now().isoformat(),
            "labeling_config": {
                "llm_model": self.llm_model,
                "source_directories": self.source_directories,
                "ctfidf_top_n_terms": self.top_n_terms,
                "n_sample_explanations": self.n_sample_explanations,
                "label_max_words": self.label_max_words,
                "sampling_method": "embedding_based_centroid"
            },
            "cluster_labels": labels_only
        }

        self.logger.info(f"Saving cluster labels to {output_file}")

        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(output, f, indent=2, ensure_ascii=False)

        self.logger.info(f"Results saved successfully to {output_file}")

        # Also save a summary statistics file
        summary_file = self.output_dir / "labeling_summary.txt"
        self._save_summary(summary_file, labeled_tree)

    def _save_summary(self, summary_file: Path, labeled_tree: Dict) -> None:
        """
        Save a human-readable summary of the labeling process.

        Args:
            summary_file: Path to save summary
            labeled_tree: Labeled cluster tree
        """
        def count_labels(node, counts=None, level=0):
            if counts is None:
                counts = defaultdict(int)

            for child in node.get("children", []):
                if "label" in child:
                    counts[level] += 1
                count_labels(child, counts, level + 1)

            return counts

        label_counts = count_labels(labeled_tree)

        with open(summary_file, 'w', encoding='utf-8') as f:
            f.write("=" * 80 + "\n")
            f.write("CLUSTER LABELING SUMMARY\n")
            f.write("=" * 80 + "\n\n")
            f.write(f"Generated at: {datetime.now().isoformat()}\n")
            f.write(f"LLM Model: {self.llm_model}\n")
            f.write(f"c-TF-IDF top terms: {self.top_n_terms}\n")
            f.write(f"Sample explanations per cluster: {self.n_sample_explanations}\n")
            f.write(f"Max label words: {self.label_max_words}\n\n")

            f.write("Labels generated by level:\n")
            total_labels = 0
            for level in sorted(label_counts.keys()):
                count = label_counts[level]
                total_labels += count
                f.write(f"  Level {level}: {count} labels\n")

            f.write(f"\nTotal labels generated: {total_labels}\n")

        self.logger.info(f"Summary saved to {summary_file}")

    def run(self) -> None:
        """
        Run the complete cluster labeling pipeline.
        """
        self.logger.info("Starting cluster labeling pipeline")

        try:
            # Load clustering results
            results = self.load_clustering_results()
            cluster_tree = results.get("cluster_tree", {})

            if not cluster_tree:
                raise ValueError("No cluster tree found in clustering results")

            # Traverse and label the tree
            self.logger.info("Traversing cluster tree and generating labels")
            labeled_tree = self.traverse_and_label(cluster_tree)

            # Save results
            self.save_results(labeled_tree, results)

            self.logger.info("Cluster labeling pipeline completed successfully")

        except Exception as e:
            self.logger.error(f"Error in cluster labeling pipeline: {e}", exc_info=True)
            raise


def setup_logging(log_level: str = "INFO") -> None:
    """Setup logging configuration."""
    logging.basicConfig(
        level=getattr(logging, log_level.upper()),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(sys.stdout)
        ]
    )


def load_config(config_path: Path) -> Dict:
    """Load configuration from JSON file."""
    if not config_path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")

    with open(config_path, 'r', encoding='utf-8') as f:
        config = json.load(f)

    return config


def main():
    """Main entry point for the cluster labeling script."""
    parser = argparse.ArgumentParser(
        description="Automatic cluster labeling using c-TF-IDF and LLM",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Run with default config
  python 10_cluster_labeling.py

  # Run with custom config
  python 10_cluster_labeling.py --config path/to/config.json

  # Run with debug logging
  python 10_cluster_labeling.py --log-level DEBUG
        """
    )

    parser.add_argument(
        '--config',
        type=str,
        default='data/preprocessing/config/cluster_labeling_config.json',
        help='Path to configuration file (default: data/preprocessing/config/cluster_labeling_config.json)'
    )

    parser.add_argument(
        '--log-level',
        type=str,
        default='INFO',
        choices=['DEBUG', 'INFO', 'WARNING', 'ERROR'],
        help='Logging level (default: INFO)'
    )

    args = parser.parse_args()

    # Get project root first
    project_root = Path(__file__).resolve().parents[3]

    # Load environment variables from .env file in project root
    dotenv_path = project_root / '.env'
    load_dotenv(dotenv_path)

    # Setup logging
    setup_logging(args.log_level)
    logger = logging.getLogger(__name__)

    try:
        # Resolve config path
        config_path = project_root / args.config

        logger.info(f"Loading configuration from {config_path}")
        config = load_config(config_path)

        # Initialize processor and run
        processor = ClusterLabelingProcessor(config)
        processor.run()

        logger.info("Cluster labeling completed successfully!")

    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
