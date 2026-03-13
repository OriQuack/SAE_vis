"""
Core utilities for the SAE preprocessing pipeline.

This module provides shared functionality for all preprocessing steps:
- Path resolution and project root detection
- Logging configuration
- Base processor class with common methods
- Metadata generation
- Token processing utilities
- N-gram extraction utilities
- Quantile-based sampling
- Embedding utilities
"""

from .paths import find_project_root, resolve_path, ensure_dir, get_pipeline_paths
from .logging import setup_logging, get_logger
from .base import BaseProcessor, load_config, load_yaml_config, resolve_variables
from .metadata import save_metadata, generate_metadata

# Token utilities
from .tokens import (
    normalize_token,
    extract_token_window,
    calculate_window_offset,
    reconstruct_words,
    reconstruct_words_with_positions,
    process_tokens_for_display,
    join_tokens_to_text,
)

# N-gram utilities
from .ngrams import (
    extract_character_ngrams,
    extract_token_char_ngrams,
    extract_token_char_ngrams_simple,
    extract_word_ngrams,
    compute_jaccard_similarity,
    compute_per_k_jaccard,
    find_top_ngram,
    select_longest_ngram_above_threshold,
    select_best_ngram,
)

# Sampling utilities
from .sampling import (
    select_top_k_per_quantile,
    select_top_k_per_quantile_tuples,
    get_quantile_boundaries,
    assign_quantile_index,
    stratified_sample,
)

# Embedding utilities
from .embeddings import (
    load_embeddings_for_feature,
    create_embedding_map,
    compute_pairwise_cosine_similarity,
    compute_intra_feature_semantic_similarity,
    compute_cross_feature_semantic_similarity,
    get_embeddings_for_prompts,
)

# Phrase utilities
from .phrases import (
    chunk_text,
    extract_all_phrases,
)

__all__ = [
    # Paths
    'find_project_root',
    'resolve_path',
    'ensure_dir',
    'get_pipeline_paths',
    # Logging
    'setup_logging',
    'get_logger',
    # Base
    'BaseProcessor',
    'load_config',
    'load_yaml_config',
    'resolve_variables',
    # Metadata
    'save_metadata',
    'generate_metadata',
    # Tokens
    'normalize_token',
    'extract_token_window',
    'calculate_window_offset',
    'reconstruct_words',
    'reconstruct_words_with_positions',
    'process_tokens_for_display',
    'join_tokens_to_text',
    # N-grams
    'extract_character_ngrams',
    'extract_token_char_ngrams',
    'extract_token_char_ngrams_simple',
    'extract_word_ngrams',
    'compute_jaccard_similarity',
    'compute_per_k_jaccard',
    'find_top_ngram',
    'select_longest_ngram_above_threshold',
    'select_best_ngram',
    # Sampling
    'select_top_k_per_quantile',
    'select_top_k_per_quantile_tuples',
    'get_quantile_boundaries',
    'assign_quantile_index',
    'stratified_sample',
    # Embeddings
    'load_embeddings_for_feature',
    'create_embedding_map',
    'compute_pairwise_cosine_similarity',
    'compute_intra_feature_semantic_similarity',
    'compute_cross_feature_semantic_similarity',
    'get_embeddings_for_prompts',
    # Phrases
    'chunk_text',
    'extract_all_phrases',
]
