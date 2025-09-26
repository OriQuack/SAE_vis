"""
Essential constants for data processing and visualization.

This module contains the core constants used throughout the data service.
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

# Node ID patterns
NODE_ROOT = "root"
NODE_SPLIT_PREFIX = "split_"
NODE_SEMDIST_SUFFIX = "_semdist_"

# Column names
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

# Threshold column names
COL_THRESHOLD_FUZZ = "threshold_fuzz"
COL_THRESHOLD_SIMULATION = "threshold_simulation"
COL_THRESHOLD_DETECTION = "threshold_detection"

# Default values
DEFAULT_HISTOGRAM_BINS = 20

# Stage definitions
STAGE_ROOT = 0
STAGE_SPLITTING = 1
STAGE_SEMANTIC = 2
STAGE_AGREEMENT = 3

# Stage names
STAGE_NAMES = {
    STAGE_ROOT: "All Features",
    STAGE_SPLITTING: "Feature Splitting",
    STAGE_SEMANTIC: "Semantic Distance",
    STAGE_AGREEMENT: "Score Agreement"
}

# Filter columns
FILTER_COLUMNS = [COL_SAE_ID, COL_EXPLANATION_METHOD, COL_LLM_EXPLAINER, COL_LLM_SCORER]

# Default threshold values
DEFAULT_THRESHOLDS = {
    "feature_splitting": 0.5,
    "semdist_mean": 0.2,
    "score_fuzz": 0.5,
    "score_simulation": 0.5,
    "score_detection": 0.5,
    "score_embedding": 0.5
}