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

# 14D feature metrics for SVM (used by similarity_sort + cause)
SVM_FEATURE_METRICS = [
    # Mean metrics (8)
    'intra_ngram_jaccard',       # Activation-level: max(char_ngram, word_ngram) - lexical consistency
    'intra_semantic_sim',        # Activation-level: semantic_similarity - semantic consistency
    'score_embedding',           # Score: embedding-based scoring
    'score_fuzz',                # Score: fuzzy matching score
    'score_detection',           # Score: detection score
    'explanation_semantic_sim',  # Explanation-level: semantic similarity between LLM explanations
    'log_frac_nonzero',          # Neuronpedia: log(frac_nonzero + 1e-8) - sparse activation handling
    'consensus_score',           # Consensus: cross-explainer phrase clustering agreement [0, 1]
    # Std metrics (6) - captures cross-explainer disagreement and activation variability
    'intra_ngram_jaccard_std',   # Activation-level: lexical consistency std (pairwise Jaccard variability)
    'intra_semantic_sim_std',    # Activation-level: semantic consistency std (variability within feature)
    'explanation_semantic_sim_std',  # Explanation-level: cross-explainer semantic disagreement
    'score_embedding_std',
    'score_fuzz_std',
    'score_detection_std',
]

# Stage 3 cause categories
CAUSE_CATEGORIES = [
    'noisy-activation',
    'missed-N-gram',
    'missed-context',
]
