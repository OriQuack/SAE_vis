"""
Constants for data processing and visualization.

This module contains all magic strings, numbers, and configuration values
used throughout the data service to improve maintainability and consistency.
"""

# Score agreement categories
AGREE_ALL = "agree_all"
AGREE_2OF3 = "agree_2of3"
AGREE_1OF3 = "agree_1of3"
AGREE_NONE = "agree_none"

# Score agreement display names
AGREEMENT_NAMES = {
    AGREE_ALL: "All 3 Scores High",
    AGREE_2OF3: "2 of 3 Scores High",
    AGREE_1OF3: "1 of 3 Scores High",
    AGREE_NONE: "All 3 Scores Low"
}

# Category types
CATEGORY_ROOT = "root"
CATEGORY_FEATURE_SPLITTING = "feature_splitting"
CATEGORY_SEMANTIC_DISTANCE = "semantic_distance"
CATEGORY_SCORE_AGREEMENT = "score_agreement"

# Classification categories
SPLITTING_TRUE = "true"
SPLITTING_FALSE = "false"
SEMDIST_HIGH = "high"
SEMDIST_LOW = "low"

# Node ID prefixes
NODE_ROOT = "root"
NODE_SPLIT_PREFIX = "split_"
NODE_SEMDIST_SUFFIX = "_semdist_"
NODE_AGREE_SUFFIX = "_agree_"

# Column names used throughout the service
COL_FEATURE_ID = "feature_id"
COL_SAE_ID = "sae_id"
COL_EXPLANATION_METHOD = "explanation_method"
COL_LLM_EXPLAINER = "llm_explainer"
COL_LLM_SCORER = "llm_scorer"
COL_FEATURE_SPLITTING = "feature_splitting"
COL_SEMDIST_MEAN = "semdist_mean"
COL_SEMDIST_MAX = "semdist_max"
COL_SCORE_FUZZ = "score_fuzz"
COL_SCORE_SIMULATION = "score_simulation"
COL_SCORE_DETECTION = "score_detection"
COL_SCORE_EMBEDDING = "score_embedding"
COL_DETAILS_PATH = "details_path"

# Computed column names
COL_SPLITTING_CATEGORY = "splitting_category"
COL_SEMDIST_CATEGORY = "semdist_category"
COL_SCORE_AGREEMENT = "score_agreement"
COL_HIGH_SCORE_COUNT = "high_score_count"

# Threshold column names (temporary columns used during classification)
COL_THRESHOLD_FUZZ = "threshold_fuzz"
COL_THRESHOLD_SIMULATION = "threshold_simulation"
COL_THRESHOLD_DETECTION = "threshold_detection"
COL_PARENT_NODE_ID = "parent_node_id"
COL_SEMDIST_THRESHOLD = "semdist_threshold"

# Default values
DEFAULT_HISTOGRAM_BINS = 20
DEFAULT_FEATURE_SPLITTING_THRESHOLD = 0.00002  # Cosine similarity scale

# Stage definitions for Sankey diagram
STAGE_ROOT = 0
STAGE_SPLITTING = 1
STAGE_SEMANTIC = 2
STAGE_AGREEMENT = 3

# Stage names for display
STAGE_NAMES = {
    STAGE_ROOT: "All Features",
    STAGE_SPLITTING: "Feature Splitting",
    STAGE_SEMANTIC: "Semantic Distance",
    STAGE_AGREEMENT: "Score Agreement"
}

# Filter columns for caching unique values
FILTER_COLUMNS = [COL_SAE_ID, COL_EXPLANATION_METHOD, COL_LLM_EXPLAINER, COL_LLM_SCORER]

# Score columns for threshold operations
SCORE_COLUMNS = [COL_SCORE_FUZZ, COL_SCORE_SIMULATION, COL_SCORE_DETECTION]

# Required score count thresholds for agreement classification
AGREEMENT_THRESHOLDS = {
    AGREE_ALL: 3,      # All 3 scores high
    AGREE_2OF3: 2,     # Exactly 2 scores high
    AGREE_1OF3: 1,     # Exactly 1 score high
    AGREE_NONE: 0      # All scores low
}