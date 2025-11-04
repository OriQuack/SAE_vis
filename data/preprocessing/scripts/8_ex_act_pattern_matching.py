#!/usr/bin/env python3
"""
Preprocessing Script: Explanation-Activation Pattern Matching

This script verifies if semantically aligned explanation phrases match the common
patterns found in activation examples. It uses semantic embedding similarity to
match character n-grams from activations with explanation phrases, tracking
positions for visualization of matches and mismatches.

Input:
- activation_example_similarity.parquet: Activation pattern data (script 5)
- explanation_alignment.parquet: Aligned explanation phrases (script 7)
- activation_examples.parquet: Raw activation data for context extraction

Output:
- ex_act_pattern_matching.parquet: Pattern matching results
- ex_act_pattern_matching.parquet.metadata.json: Processing metadata

Features:
- Pattern type classification (semantic/lexical/both/none)
- Best n-gram selection (maximum Jaccard similarity)
- Semantic matching across modalities (n-gram context ↔ phrase)
- Position tracking for visualization
- Match/mismatch analysis

Usage:
    python 8_ex_act_pattern_matching.py [--config CONFIG_PATH] [--limit N]

Example:
    python 8_ex_act_pattern_matching.py
    python 8_ex_act_pattern_matching.py --limit 10  # Test on 10 features
"""

import json
import logging
import argparse
from pathlib import Path
from typing import Dict, List, Optional, Any
from datetime import datetime
import numpy as np
import polars as pl
from tqdm import tqdm

# Lazy import for sentence transformers
try:
    from sentence_transformers import SentenceTransformer
    from sklearn.metrics.pairwise import cosine_similarity
    SEMANTIC_AVAILABLE = True
except ImportError:
    SEMANTIC_AVAILABLE = False

# Enable string cache for categorical operations
pl.enable_string_cache()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def find_project_root() -> Path:
    """Find project root by looking for 'interface' directory."""
    project_root = Path.cwd()
    while project_root.name != "interface" and project_root.parent != project_root:
        project_root = project_root.parent

    if project_root.name == "interface":
        return project_root
    else:
        raise RuntimeError("Could not find interface project root")


def load_config(config_path: Optional[str] = None) -> Dict:
    """Load configuration from file or use defaults."""
    default_config = {
        "activation_similarity_path": "data/master/activation_example_similarity.parquet",
        "explanation_alignment_path": "data/master/explanation_alignment.parquet",
        "activation_examples_path": "data/master/activation_examples.parquet",
        "output_path": "data/master/ex_act_pattern_matching.parquet",
        "sae_id": "google--gemma-scope-9b-pt-res--layer_30--width_16k--average_l0_120",
        "processing_parameters": {
            "semantic_consistency_threshold": 0.3,
            "jaccard_consistency_threshold": 0.3,
            "ngram_phrase_similarity_threshold": 0.6,
            "embedding_model": "all-MiniLM-L6-v2"
        }
    }

    if config_path and Path(config_path).exists():
        logger.info(f"Loading config from {config_path}")
        with open(config_path, 'r') as f:
            file_config = json.load(f)
        # Merge configs deeply
        for key in file_config:
            if isinstance(file_config[key], dict) and key in default_config:
                default_config[key].update(file_config[key])
            else:
                default_config[key] = file_config[key]
    else:
        logger.info("Using default configuration")

    return default_config


class ExActPatternMatchingProcessor:
    """Process features to match explanation phrases with activation patterns."""

    def __init__(self, config: Dict, feature_limit: Optional[int] = None):
        """Initialize processor with configuration.

        Args:
            config: Configuration dictionary
            feature_limit: Optional limit on number of features to process
        """
        self.config = config
        self.feature_limit = feature_limit
        self.project_root = find_project_root()

        # Resolve paths
        self.activation_sim_path = self._resolve_path(config["activation_similarity_path"])
        self.explanation_align_path = self._resolve_path(config["explanation_alignment_path"])
        self.activation_ex_path = self._resolve_path(config["activation_examples_path"])
        self.output_path = self._resolve_path(config["output_path"])

        # Configuration
        self.sae_id = config["sae_id"]
        self.proc_params = config["processing_parameters"]

        # Statistics tracking
        self.stats = {
            "features_processed": 0,
            "features_with_both_data": 0,
            "pattern_type_counts": {
                "semantic": 0,
                "lexical": 0,
                "both": 0,
                "none": 0
            },
            "features_with_matches": 0,
            "total_matches": 0,
            "total_mismatches": 0
        }

        # Data holders
        self.activation_sim_df = None
        self.explanation_align_df = None
        self.activation_ex_df = None
        self.embedding_model = None

    def _resolve_path(self, path_str: str) -> Path:
        """Resolve path relative to project root if not absolute."""
        path = Path(path_str)
        if not path.is_absolute():
            return self.project_root / path
        return path

    def _load_data(self):
        """Load all required parquet files."""
        if self.activation_sim_df is None:
            logger.info(f"Loading activation similarity from {self.activation_sim_path}")
            if not self.activation_sim_path.exists():
                raise FileNotFoundError(f"File not found: {self.activation_sim_path}")
            self.activation_sim_df = pl.read_parquet(self.activation_sim_path)
            logger.info(f"Loaded {len(self.activation_sim_df):,} activation similarity rows")

        if self.explanation_align_df is None:
            logger.info(f"Loading explanation alignment from {self.explanation_align_path}")
            if not self.explanation_align_path.exists():
                raise FileNotFoundError(f"File not found: {self.explanation_align_path}")
            self.explanation_align_df = pl.read_parquet(self.explanation_align_path)
            logger.info(f"Loaded {len(self.explanation_align_df):,} explanation alignment rows")

        if self.activation_ex_df is None:
            logger.info(f"Loading activation examples from {self.activation_ex_path}")
            if not self.activation_ex_path.exists():
                raise FileNotFoundError(f"File not found: {self.activation_ex_path}")
            self.activation_ex_df = pl.read_parquet(self.activation_ex_path)
            logger.info(f"Loaded {len(self.activation_ex_df):,} activation example rows")

    def _get_embedding_model(self):
        """Lazy load embedding model."""
        if self.embedding_model is None:
            if not SEMANTIC_AVAILABLE:
                raise ImportError(
                    "sentence-transformers not installed. "
                    "Run: pip install sentence-transformers scikit-learn"
                )
            model_name = self.proc_params["embedding_model"]
            logger.info(f"Loading sentence embedding model ({model_name})...")
            self.embedding_model = SentenceTransformer(model_name)
        return self.embedding_model

    def _label_pattern_type(self, semantic_sim: Optional[float], jaccard_sims: List[Optional[float]]) -> str:
        """Label activation pattern type based on consistency thresholds.

        Args:
            semantic_sim: Average pairwise semantic similarity
            jaccard_sims: List of Jaccard similarities [2-gram, 3-gram, 4-gram]

        Returns:
            Pattern type: "semantic", "lexical", "both", or "none"
        """
        sem_thresh = self.proc_params["semantic_consistency_threshold"]
        jac_thresh = self.proc_params["jaccard_consistency_threshold"]

        is_semantic = semantic_sim is not None and semantic_sim > sem_thresh

        # Check if any Jaccard similarity exceeds threshold
        is_lexical = False
        if jaccard_sims:
            valid_jaccards = [j for j in jaccard_sims if j is not None]
            if valid_jaccards:
                is_lexical = max(valid_jaccards) > jac_thresh

        if is_semantic and is_lexical:
            return "both"
        elif is_semantic:
            return "semantic"
        elif is_lexical:
            return "lexical"
        else:
            return "none"

    def _select_best_ngram(
        self,
        ngram_jaccard_sims: List[Optional[float]],
        top_common_ngrams: List[Dict]
    ) -> Optional[Dict]:
        """Select n-gram with maximum Jaccard similarity.

        Args:
            ngram_jaccard_sims: [2-gram, 3-gram, 4-gram] Jaccard scores
            top_common_ngrams: Top n-gram per size from script 5

        Returns:
            Selected n-gram dict or None
        """
        if not ngram_jaccard_sims or not top_common_ngrams:
            return None

        # Filter valid scores
        valid_scores = [(i, score) for i, score in enumerate(ngram_jaccard_sims) if score is not None]
        if not valid_scores:
            return None

        # Find index of max Jaccard
        max_idx, max_score = max(valid_scores, key=lambda x: x[1])
        target_size = max_idx + 2  # 0→2, 1→3, 2→4

        # Find corresponding n-gram
        for ngram_info in top_common_ngrams:
            if ngram_info["ngram_size"] == target_size:
                return {
                    "ngram": ngram_info["ngram"],
                    "ngram_size": target_size,
                    "jaccard_score": float(max_score),
                    "count": ngram_info["count"],
                    "activation_positions": ngram_info["occurrences"]
                }

        return None

    def _extract_ngram_contexts(
        self,
        feature_id: int,
        ngram_info: Dict,
        max_contexts: int = 5
    ) -> List[str]:
        """Extract 5-token windows where n-gram appears as context.

        Args:
            feature_id: Feature ID
            ngram_info: N-gram information with occurrences
            max_contexts: Maximum number of contexts to extract

        Returns:
            List of context strings (5-token windows)
        """
        contexts = []
        occurrences = ngram_info.get("activation_positions", [])
        ngram_window_size = 5  # Same as script 5

        for i, occurrence in enumerate(occurrences[:max_contexts]):
            prompt_id = occurrence["prompt_id"]

            # Get activation example
            example_rows = self.activation_ex_df.filter(
                (pl.col("feature_id") == feature_id) &
                (pl.col("prompt_id") == prompt_id)
            )

            if len(example_rows) == 0:
                continue

            example = example_rows.to_dicts()[0]
            prompt_tokens = example.get("prompt_tokens", [])
            activation_pairs = example.get("activation_pairs", [])

            if not activation_pairs or not prompt_tokens:
                continue

            # Find max activation position
            max_pair = max(activation_pairs, key=lambda x: x["activation_value"])
            max_token_pos = max_pair["token_position"]

            # Extract 5-token window around max activation (same as script 5)
            half_window = ngram_window_size // 2
            start = max(0, max_token_pos - half_window)
            end = min(len(prompt_tokens), max_token_pos + half_window)
            window_tokens = prompt_tokens[start:end]

            if window_tokens:
                context_text = " ".join(window_tokens)
                contexts.append(context_text)

        return contexts

    def _extract_semantic_contexts(
        self,
        feature_id: int,
        max_contexts: int = 10
    ) -> List[Dict]:
        """Extract representative activation contexts for semantic matching.

        For features with high semantic similarity (> 0.3), extract top activation
        examples with 32-token windows around max activation positions.

        Args:
            feature_id: Feature ID
            max_contexts: Maximum number of contexts to extract

        Returns:
            List of dicts with {prompt_id, context_text, max_activation}
        """
        contexts = []
        semantic_window_size = 32  # Same as script 4

        # Get all activation examples for this feature, sorted by max_activation
        examples = self.activation_ex_df.filter(
            pl.col("feature_id") == feature_id
        ).sort("max_activation", descending=True).head(max_contexts)

        if len(examples) == 0:
            return contexts

        for row in examples.to_dicts():
            prompt_id = row["prompt_id"]
            prompt_tokens = row.get("prompt_tokens", [])
            activation_pairs = row.get("activation_pairs", [])
            max_activation = row.get("max_activation", 0.0)

            if not activation_pairs or not prompt_tokens:
                continue

            # Find max activation position
            max_pair = max(activation_pairs, key=lambda x: x["activation_value"])
            max_token_pos = max_pair["token_position"]

            # Extract 32-token window around max activation
            half_window = semantic_window_size // 2
            start = max(0, max_token_pos - half_window)
            end = min(len(prompt_tokens), max_token_pos + half_window + 1)
            window_tokens = prompt_tokens[start:end]

            if window_tokens:
                context_text = " ".join(window_tokens)
                contexts.append({
                    "prompt_id": prompt_id,
                    "context_text": context_text,
                    "max_activation": max_activation,
                    "token_position": max_token_pos
                })

        return contexts

    def _compute_ngram_phrase_similarity(
        self,
        ngram_contexts: List[str],
        phrase_text: str
    ) -> float:
        """Compute semantic similarity between n-gram contexts and phrase.

        Args:
            ngram_contexts: List of token windows where n-gram appears
            phrase_text: Explanation phrase text

        Returns:
            Cosine similarity score
        """
        if not ngram_contexts:
            return 0.0

        model = self._get_embedding_model()

        # Encode contexts and phrase
        context_embeddings = model.encode(ngram_contexts, show_progress_bar=False)
        phrase_embedding = model.encode([phrase_text], show_progress_bar=False)[0]

        # Average context embeddings
        avg_context = np.mean(context_embeddings, axis=0)

        # Cosine similarity
        similarity = cosine_similarity([avg_context], [phrase_embedding])[0][0]
        return float(similarity)

    def _match_semantic_contexts_with_phrases(
        self,
        feature_id: int,
        semantic_contexts: List[Dict],
        aligned_groups: List[Dict]
    ) -> Dict:
        """Match semantic activation contexts with aligned phrases.

        Args:
            feature_id: Feature ID
            semantic_contexts: List of semantic context dicts
            aligned_groups: Aligned phrase groups from script 7

        Returns:
            Dictionary with matches and mismatches
        """
        threshold = self.proc_params["ngram_phrase_similarity_threshold"]

        if not semantic_contexts:
            logger.warning(f"No semantic contexts found for feature {feature_id}")
            return {"matches": [], "mismatches": []}

        model = self._get_embedding_model()

        # Encode all semantic contexts
        context_texts = [ctx["context_text"] for ctx in semantic_contexts]
        context_embeddings = model.encode(context_texts, show_progress_bar=False)

        # Average context embeddings for this feature
        avg_context_embedding = np.mean(context_embeddings, axis=0)

        matches = []
        mismatches = []
        matched_phrase = False

        # Check each phrase in aligned groups
        for group in aligned_groups:
            for phrase_info in group["phrases"]:
                phrase_text = phrase_info["text"]
                explainer_name = phrase_info["explainer_name"]
                chunk_index = phrase_info["chunk_index"]

                # Encode phrase
                phrase_embedding = model.encode([phrase_text], show_progress_bar=False)[0]

                # Compute similarity
                sim_score = float(cosine_similarity([avg_context_embedding], [phrase_embedding])[0][0])

                if sim_score >= threshold:
                    # MATCH
                    matches.append({
                        "phrase_text": phrase_text,
                        "explainer_name": explainer_name,
                        "phrase_chunk_index": chunk_index,
                        "semantic_similarity": sim_score,
                        "match_type": "semantic"
                    })
                    matched_phrase = True
                else:
                    # MISMATCH (phrase exists but doesn't match semantic context)
                    mismatches.append({
                        "item_text": phrase_text,
                        "item_type": "phrase",
                        "mismatch_type": "explanation_only",
                        "explainer_name": explainer_name,
                        "semantic_similarity": sim_score
                    })

        # Check if semantic contexts have no matches at all
        if not matched_phrase:
            mismatches.append({
                "item_text": f"semantic_context (n={len(semantic_contexts)})",
                "item_type": "semantic_context",
                "mismatch_type": "activation_only",
                "explainer_name": None,
                "semantic_similarity": None
            })

        return {
            "matches": matches,
            "mismatches": mismatches
        }

    def _match_ngram_with_phrases(
        self,
        feature_id: int,
        best_ngram: Dict,
        aligned_groups: List[Dict]
    ) -> Dict:
        """Match n-gram with aligned phrases and track positions.

        Args:
            feature_id: Feature ID
            best_ngram: Selected best n-gram
            aligned_groups: Aligned phrase groups from script 7

        Returns:
            Dictionary with matches and mismatches
        """
        threshold = self.proc_params["ngram_phrase_similarity_threshold"]

        # Extract n-gram contexts
        ngram_contexts = self._extract_ngram_contexts(feature_id, best_ngram)

        if not ngram_contexts:
            logger.warning(f"No contexts found for feature {feature_id}")
            return {"matches": [], "mismatches": []}

        matches = []
        mismatches = []
        matched_phrase = False

        # Check each phrase in aligned groups
        for group in aligned_groups:
            for phrase_info in group["phrases"]:
                phrase_text = phrase_info["text"]
                explainer_name = phrase_info["explainer_name"]
                chunk_index = phrase_info["chunk_index"]

                # Compute similarity
                sim_score = self._compute_ngram_phrase_similarity(ngram_contexts, phrase_text)

                if sim_score >= threshold:
                    # MATCH
                    matches.append({
                        "phrase_text": phrase_text,
                        "explainer_name": explainer_name,
                        "phrase_chunk_index": chunk_index,
                        "semantic_similarity": sim_score,
                        "match_type": "lexical"
                    })
                    matched_phrase = True
                else:
                    # MISMATCH (phrase exists but doesn't match n-gram)
                    mismatches.append({
                        "item_text": phrase_text,
                        "item_type": "phrase",
                        "mismatch_type": "explanation_only",
                        "explainer_name": explainer_name,
                        "semantic_similarity": sim_score
                    })

        # Check if n-gram has no matches at all
        if not matched_phrase:
            mismatches.append({
                "item_text": best_ngram["ngram"],
                "item_type": "ngram",
                "mismatch_type": "activation_only",
                "explainer_name": None,
                "semantic_similarity": None
            })

        return {
            "matches": matches,
            "mismatches": mismatches
        }

    def process_feature(self, feature_id: int) -> Dict[str, Any]:
        """Process a single feature to match patterns.

        Args:
            feature_id: Feature ID

        Returns:
            Dictionary with matching results
        """
        # Get activation similarity data
        act_rows = self.activation_sim_df.filter(pl.col("feature_id") == feature_id).to_dicts()
        if not act_rows:
            return None

        act_data = act_rows[0]

        # Get explanation alignment data
        exp_rows = self.explanation_align_df.filter(pl.col("feature_id") == feature_id).to_dicts()
        if not exp_rows:
            return None

        exp_data = exp_rows[0]

        self.stats["features_with_both_data"] += 1

        # Label pattern type
        pattern_type = self._label_pattern_type(
            act_data.get("avg_pairwise_semantic_similarity"),
            act_data.get("ngram_jaccard_similarity", [])
        )
        self.stats["pattern_type_counts"][pattern_type] += 1

        # Select best n-gram
        best_ngram = self._select_best_ngram(
            act_data.get("ngram_jaccard_similarity", []),
            act_data.get("top_common_ngrams", [])
        )

        # Get max Jaccard for summary
        jaccard_sims = act_data.get("ngram_jaccard_similarity", [])
        if jaccard_sims:
            valid_jacs = [j for j in jaccard_sims if j is not None]
            max_jaccard = float(max(valid_jacs)) if valid_jacs else None
        else:
            max_jaccard = None

        # Match patterns based on pattern type
        aligned_groups = exp_data.get("aligned_groups", [])
        num_aligned_phrases = sum(len(g.get("phrases", [])) for g in aligned_groups)

        all_matches = []
        all_mismatches = []

        # Lexical matching (if lexical or both pattern)
        if pattern_type in ["lexical", "both"] and best_ngram and aligned_groups:
            lexical_result = self._match_ngram_with_phrases(
                feature_id,
                best_ngram,
                aligned_groups
            )
            all_matches.extend(lexical_result["matches"])
            all_mismatches.extend(lexical_result["mismatches"])

        # Semantic matching (if semantic or both pattern)
        if pattern_type in ["semantic", "both"] and aligned_groups:
            semantic_contexts = self._extract_semantic_contexts(feature_id)
            if semantic_contexts:
                semantic_result = self._match_semantic_contexts_with_phrases(
                    feature_id,
                    semantic_contexts,
                    aligned_groups
                )
                all_matches.extend(semantic_result["matches"])
                all_mismatches.extend(semantic_result["mismatches"])

        # Deduplicate matches and mismatches (same phrase might match both lexical and semantic)
        # For matches: combine lexical and semantic into "both" if phrase matches both
        match_tracker = {}
        for match in all_matches:
            key = (match["phrase_text"], match["explainer_name"])
            if key not in match_tracker:
                match_tracker[key] = match
            else:
                # Same phrase matched both lexical and semantic - upgrade to "both"
                existing = match_tracker[key]
                if existing["match_type"] != match["match_type"]:
                    # Take higher similarity score and mark as "both"
                    if match["semantic_similarity"] > existing["semantic_similarity"]:
                        match["match_type"] = "both"
                        match_tracker[key] = match
                    else:
                        existing["match_type"] = "both"
                        match_tracker[key] = existing

        # For mismatches: only keep phrase mismatches that didn't match at all
        matched_phrases = {(m["phrase_text"], m["explainer_name"]) for m in match_tracker.values()}
        unique_mismatches = [
            m for m in all_mismatches
            if m["item_type"] != "phrase" or (m["item_text"], m["explainer_name"]) not in matched_phrases
        ]

        final_matches = list(match_tracker.values())
        final_mismatches = unique_mismatches

        # Update statistics
        if final_matches:
            self.stats["features_with_matches"] += 1
            self.stats["total_matches"] += len(final_matches)
        self.stats["total_mismatches"] += len(final_mismatches)

        num_matches = len(final_matches)
        num_mismatches = len([m for m in final_mismatches if m["item_type"] == "phrase"])
        match_rate = num_matches / (num_matches + num_mismatches) if (num_matches + num_mismatches) > 0 else 0.0

        return {
            "feature_id": feature_id,
            "sae_id": self.sae_id,
            "pattern_type": pattern_type,
            "activation_semantic_sim": act_data.get("avg_pairwise_semantic_similarity"),
            "activation_max_jaccard": max_jaccard,
            "selected_ngram": best_ngram,
            "num_aligned_phrases": num_aligned_phrases,
            "matches": final_matches,
            "mismatches": final_mismatches,
            "num_matches": num_matches,
            "num_mismatches": num_mismatches,
            "match_rate": match_rate
        }

    def process_all_features(self) -> pl.DataFrame:
        """Process all features and create DataFrame.

        Returns:
            Polars DataFrame with pattern matching results
        """
        # Load data
        self._load_data()

        # Get features that exist in both datasets (inner join)
        common_features = set(self.activation_sim_df["feature_id"].to_list()) & \
                         set(self.explanation_align_df["feature_id"].to_list())

        feature_list = sorted(list(common_features))

        # Apply feature limit for testing
        if self.feature_limit is not None:
            feature_list = feature_list[:self.feature_limit]
            logger.info(f"Processing limited to {self.feature_limit} features")

        logger.info(f"Processing {len(feature_list):,} features with both activation and explanation data")

        # Process features
        results = []
        for feature_id in tqdm(feature_list, desc="Processing features"):
            result = self.process_feature(feature_id)
            if result:
                results.append(result)
                self.stats["features_processed"] += 1

        logger.info(f"Processed {self.stats['features_processed']:,} features")

        return self._create_dataframe(results)

    def _create_dataframe(self, rows: List[Dict]) -> pl.DataFrame:
        """Create Polars DataFrame with proper schema and native types.

        Args:
            rows: List of result dictionaries

        Returns:
            Polars DataFrame with typed columns
        """
        logger.info("Creating DataFrame with proper schema")

        if not rows:
            logger.warning("No results to convert to DataFrame")
            return self._create_empty_dataframe()

        # Define full schema including nested types
        schema = {
            "feature_id": pl.UInt32,
            "sae_id": pl.Categorical,
            "pattern_type": pl.Categorical,
            "activation_semantic_sim": pl.Float32,
            "activation_max_jaccard": pl.Float32,
            "selected_ngram": pl.Struct([
                pl.Field("ngram", pl.Utf8),
                pl.Field("ngram_size", pl.UInt8),
                pl.Field("jaccard_score", pl.Float32),
                pl.Field("count", pl.UInt16),
                pl.Field("activation_positions", pl.List(pl.Struct([
                    pl.Field("prompt_id", pl.UInt32),
                    pl.Field("positions", pl.List(pl.UInt16))
                ])))
            ]),
            "num_aligned_phrases": pl.UInt16,
            "matches": pl.List(pl.Struct([
                pl.Field("phrase_text", pl.Utf8),
                pl.Field("explainer_name", pl.Utf8),
                pl.Field("phrase_chunk_index", pl.UInt16),
                pl.Field("semantic_similarity", pl.Float32),
                pl.Field("match_type", pl.Utf8)
            ])),
            "mismatches": pl.List(pl.Struct([
                pl.Field("item_text", pl.Utf8),
                pl.Field("item_type", pl.Utf8),
                pl.Field("mismatch_type", pl.Utf8),
                pl.Field("explainer_name", pl.Utf8),
                pl.Field("semantic_similarity", pl.Float32)
            ])),
            "num_matches": pl.UInt16,
            "num_mismatches": pl.UInt16,
            "match_rate": pl.Float32
        }

        # Create DataFrame with explicit schema
        df = pl.DataFrame(rows, schema=schema)

        logger.info(f"Created DataFrame with {len(df)} rows and {len(df.columns)} columns")
        return df

    def _create_empty_dataframe(self) -> pl.DataFrame:
        """Create empty DataFrame with correct schema.

        Returns:
            Empty Polars DataFrame with proper schema
        """
        logger.info("Creating empty DataFrame with schema")

        schema = {
            "feature_id": pl.UInt32,
            "sae_id": pl.Categorical,
            "pattern_type": pl.Categorical,
            "activation_semantic_sim": pl.Float32,
            "activation_max_jaccard": pl.Float32,
            "selected_ngram": pl.Struct([
                pl.Field("ngram", pl.Utf8),
                pl.Field("ngram_size", pl.UInt8),
                pl.Field("jaccard_score", pl.Float32),
                pl.Field("count", pl.UInt16),
                pl.Field("activation_positions", pl.List(pl.Struct([
                    pl.Field("prompt_id", pl.UInt32),
                    pl.Field("positions", pl.List(pl.UInt16))
                ])))
            ]),
            "num_aligned_phrases": pl.UInt16,
            "matches": pl.List(pl.Struct([
                pl.Field("phrase_text", pl.Utf8),
                pl.Field("explainer_name", pl.Utf8),
                pl.Field("phrase_chunk_index", pl.UInt16),
                pl.Field("semantic_similarity", pl.Float32),
                pl.Field("match_type", pl.Utf8)
            ])),
            "mismatches": pl.List(pl.Struct([
                pl.Field("item_text", pl.Utf8),
                pl.Field("item_type", pl.Utf8),
                pl.Field("mismatch_type", pl.Utf8),
                pl.Field("explainer_name", pl.Utf8),
                pl.Field("semantic_similarity", pl.Float32)
            ])),
            "num_matches": pl.UInt16,
            "num_mismatches": pl.UInt16,
            "match_rate": pl.Float32
        }

        return pl.DataFrame(schema=schema)

    def save_parquet(self, df: pl.DataFrame) -> None:
        """Save DataFrame as parquet with metadata.

        Args:
            df: DataFrame to save
        """
        # Ensure output directory exists
        self.output_path.parent.mkdir(parents=True, exist_ok=True)

        logger.info(f"Saving parquet to {self.output_path}")
        df.write_parquet(self.output_path)

        # Calculate statistics
        if len(df) > 0:
            result_stats = {
                "features_with_matches": int((df["num_matches"] > 0).sum()),
                "mean_match_rate": float(df["match_rate"].mean()),
                "mean_matches_per_feature": float(df["num_matches"].mean()),
                "mean_mismatches_per_feature": float(df["num_mismatches"].mean()),
                "pattern_type_distribution": {
                    ptype: int((df["pattern_type"] == ptype).sum())
                    for ptype in ["semantic", "lexical", "both", "none"]
                }
            }
        else:
            result_stats = {}

        # Save metadata
        metadata = {
            "created_at": datetime.now().isoformat(),
            "script_version": "1.0",
            "sae_id": self.sae_id,
            "total_rows": len(df),
            "schema": {col: str(df[col].dtype) for col in df.columns},
            "processing_stats": self.stats,
            "result_stats": result_stats,
            "config_used": self.config
        }

        metadata_path = self.output_path.with_suffix('.parquet.metadata.json')
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)

        logger.info(f"Saved metadata to {metadata_path}")
        logger.info(f"Successfully created parquet with {len(df):,} rows")


def main():
    """Main execution function."""
    parser = argparse.ArgumentParser(
        description='Match explanation phrases with activation patterns'
    )
    parser.add_argument(
        '--config',
        type=str,
        default='data/preprocessing/config/8_ex_act_pattern_matching.json',
        help='Path to configuration file'
    )
    parser.add_argument(
        '--limit',
        type=int,
        default=None,
        help='Limit number of features to process (for testing)'
    )

    args = parser.parse_args()

    # Load configuration
    config = load_config(args.config)

    # Initialize processor
    processor = ExActPatternMatchingProcessor(config, feature_limit=args.limit)

    # Process data
    logger.info("=" * 80)
    logger.info("Starting Explanation-Activation Pattern Matching")
    logger.info("=" * 80)

    df = processor.process_all_features()

    # Save parquet
    processor.save_parquet(df)

    logger.info("=" * 80)
    logger.info("Processing Complete!")
    logger.info(f"Statistics:")
    logger.info(f"  Features processed: {processor.stats['features_processed']:,}")
    logger.info(f"  Features with both data: {processor.stats['features_with_both_data']:,}")
    logger.info(f"  Pattern type counts:")
    for ptype, count in processor.stats['pattern_type_counts'].items():
        logger.info(f"    {ptype}: {count}")
    logger.info(f"  Features with matches: {processor.stats['features_with_matches']:,}")
    logger.info(f"  Total matches: {processor.stats['total_matches']:,}")
    logger.info(f"  Total mismatches: {processor.stats['total_mismatches']:,}")
    logger.info("=" * 80)


if __name__ == "__main__":
    main()
