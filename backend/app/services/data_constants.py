"""
Essential constants for data processing and visualization.

This module contains the core constants used throughout the data service.
"""

# Column names
COL_FEATURE_ID = "feature_id"
COL_SAE_ID = "sae_id"
COL_EXPLANATION_METHOD = "explanation_method"
COL_LLM_EXPLAINER = "llm_explainer"
COL_LLM_SCORER = "llm_scorer"
COL_EXPLANATION_TEXT = "explanation_text"
COL_DECODER_SIMILARITY = "decoder_similarity"
COL_DECODER_SIMILARITY_MERGE_THRESHOLD = "decoder_similarity_merge_threshold"
COL_SEMSIM_MEAN = "semsim_mean"
COL_SEMSIM_MAX = "semsim_max"
COL_SCORE_FUZZ = "score_fuzz"
COL_SCORE_SIMULATION = "score_simulation"
COL_SCORE_DETECTION = "score_detection"
COL_SCORE_EMBEDDING = "score_embedding"
COL_DETAILS_PATH = "details_path"

# ============================================================================
# DECODER SIMILARITY METRIC CONFIGURATION
# ============================================================================
# Master switch: Change this constant to toggle between decoder similarity metrics
# Options:
#   - "decoder_similarity": Use max value from list structure (original)
#   - "decoder_similarity_merge_threshold": Use merge threshold column (new)
DECODER_METRIC_FOR_AGGREGATION = "decoder_similarity_merge_threshold"

# Filter columns
FILTER_COLUMNS = [COL_SAE_ID, COL_EXPLANATION_METHOD, COL_LLM_EXPLAINER, COL_LLM_SCORER]

# ============================================================================
# SVM TRAINING CONSTANTS
# ============================================================================

# Sample weights for SVM training
# 'click' (direct user clicks) get full weight
# 'threshold' (batch Apply Tags) get reduced weight due to potential errors
CLICK_WEIGHT = 1.0
THRESHOLD_WEIGHT = 0.2

# Softmax temperature for decision margin normalization (Stage 3)
# T=1.0 is standard softmax; higher T → more uniform probabilities
SOFTMAX_TEMPERATURE = 1.0

# 11D feature metrics for SVM (used by similarity_sort + cause)
SVM_FEATURE_METRICS = [
    # Activation coherence (4) — answers "is it noisy?"
    'intra_ngram_jaccard',       # Lexical consistency across activations
    'intra_semantic_sim',        # Semantic consistency across activations
    'intra_ngram_jaccard_std',   # Lexical variability (high = noisy)
    'intra_semantic_sim_std',    # Semantic variability (high = noisy)
    # Explanation quality (3) — answers "do explanations capture the pattern?"
    'score_fuzz',                # Lexical matching (mean across explainers) — Missed Syntax indicator
    'score_embedding',           # Semantic matching (mean across explainers) — Missed Context indicator
    'score_detection',           # Detection quality (mean across explainers) — Missed Context indicator
    # Cross-explainer agreement (3)
    'explanation_semantic_sim',      # Direct pairwise explainer agreement
    'explanation_semantic_sim_std',  # Cross-explainer semantic disagreement
    'consensus_score',               # Phrase-level clustering agreement
    # Sparsity (1)
    'log_frac_nonzero',          # Activation sparsity — context for all diagnostics
]

# 4D intra-feature metrics for pair SVM (used with min/max aggregation → 4 dims)
SVM_PAIR_INTRA_METRICS = [
    'intra_ngram_jaccard',       # min(A,B): worst lexical consistency
    'intra_ngram_jaccard_std',   # max(A,B): worst lexical variability
    'intra_semantic_sim',        # min(A,B): worst semantic consistency
    'intra_semantic_sim_std',    # max(A,B): worst semantic variability
]

# 4D pair-specific inter-feature metrics for pair SVM
SVM_PAIR_INTER_METRICS = [
    'inter_ngram_jaccard',       # Pair: max(char_jaccard, word_jaccard)
    'inter_semantic_sim',        # Pair: semantic similarity between activations
    'decoder_sim',               # Pair: decoder weight cosine similarity
    'feature_correlation',       # Pair: activation correlation between features
]

# Stage 3 cause categories
CAUSE_CATEGORIES = [
    'noisy-activation',
    'missed-N-gram',
    'missed-context',
]
