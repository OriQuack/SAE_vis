"""
Essential constants for data processing and visualization.

This module contains the core constants used throughout the data service.
"""

# Category types
CATEGORY_ROOT = "root"
CATEGORY_FEATURE_SPLITTING = "feature_splitting"
CATEGORY_SEMANTIC_SIMILARITY = "semantic_similarity"

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

# Default values
DEFAULT_HISTOGRAM_BINS = 20

# Stage definitions
STAGE_ROOT = 0

# Filter columns
FILTER_COLUMNS = [COL_SAE_ID, COL_EXPLANATION_METHOD, COL_LLM_EXPLAINER, COL_LLM_SCORER]

# Default threshold values
DEFAULT_THRESHOLDS = {
    "decoder_similarity": 0.5,
    "decoder_similarity_merge_threshold": 0.4,
    "semsim_mean": 0.2,
    "score_fuzz": 0.5,
    "score_detection": 0.5,
    "score_embedding": 0.5
}

# ============================================================================
# SCORE NAMES - Flexible for N Scores
# ============================================================================
SCORE_NAME_FUZZ = "fuzz"
SCORE_NAME_DETECTION = "detection"
SCORE_NAME_EMBEDDING = "embedding"

# Score column mappings for flexible score handling
SCORE_COLUMNS_MAPPING = {
    SCORE_NAME_FUZZ: COL_SCORE_FUZZ,
    SCORE_NAME_DETECTION: COL_SCORE_DETECTION,
    SCORE_NAME_EMBEDDING: COL_SCORE_EMBEDDING
}