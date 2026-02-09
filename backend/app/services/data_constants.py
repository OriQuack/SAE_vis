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
