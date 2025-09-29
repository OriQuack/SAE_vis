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

# Custom ordering for Sankey nodes
SPLITTING_ORDER = [SPLITTING_FALSE, SPLITTING_TRUE]  # false at the top
SEMDIST_ORDER = [SEMDIST_HIGH, SEMDIST_LOW]  # high at the top
AGREEMENT_ORDER = [AGREE_ALL, AGREE_2OF3, AGREE_1OF3, AGREE_NONE]  # all high first

# Default threshold values
DEFAULT_THRESHOLDS = {
    "feature_splitting": 0.5,
    "semdist_mean": 0.2,
    "score_fuzz": 0.5,
    "score_simulation": 0.5,
    "score_detection": 0.5,
    "score_embedding": 0.5
}

# ============================================================================
# SPLIT RULE TYPES (V2 System)
# ============================================================================
SPLIT_TYPE_RANGE = "range"
SPLIT_TYPE_PATTERN = "pattern"
SPLIT_TYPE_EXPRESSION = "expression"

# ============================================================================
# PATTERN CONDITION STATES
# ============================================================================
CONDITION_STATE_HIGH = "high"
CONDITION_STATE_LOW = "low"
CONDITION_STATE_IN_RANGE = "in_range"
CONDITION_STATE_OUT_RANGE = "out_range"

# ============================================================================
# SCORE NAMES - Flexible for N Scores
# ============================================================================
SCORE_NAME_FUZZ = "fuzz"
SCORE_NAME_SIMULATION = "simulation"
SCORE_NAME_DETECTION = "detection"
SCORE_NAME_EMBEDDING = "embedding"

# Score column mappings for flexible score handling
SCORE_COLUMNS_MAPPING = {
    SCORE_NAME_FUZZ: COL_SCORE_FUZZ,
    SCORE_NAME_SIMULATION: COL_SCORE_SIMULATION,
    SCORE_NAME_DETECTION: COL_SCORE_DETECTION,
    SCORE_NAME_EMBEDDING: COL_SCORE_EMBEDDING
}

# ============================================================================
# REGEX PATTERNS - Centralized Pattern Management
# ============================================================================
PATTERN_ALL_N_HIGH = r'all_(\d+)_high'
PATTERN_ALL_N_LOW = r'all_(\d+)_low'
PATTERN_K_OF_N_HIGH = r'(\d+)_of_(\d+)_high'
PATTERN_SCORE_DETAILED = r'(\d+)_of_(\d+)_high_\w+(_\w+)?'
PATTERN_SINGLE_SCORE_DETAILED = r'(\d+)_of_(\d+)_high_\w+'
PATTERN_SEMDIST_KEYWORD = r'_semdist_'

# ============================================================================
# NODE CONTENT KEYWORDS
# ============================================================================
NODE_KEYWORD_SEMDIST = "semdist"
NODE_SPLIT_TRUE = "split_true"
NODE_SPLIT_FALSE = "split_false"

# ============================================================================
# EXPRESSION OPERATORS
# ============================================================================
EXPR_OP_AND = "&&"
EXPR_OP_OR = "||"
EXPR_OP_NOT = "!"
EXPR_OP_PYTHON_AND = " and "
EXPR_OP_PYTHON_OR = " or "
EXPR_OP_PYTHON_NOT = " not "

# ============================================================================
# DISPLAY NAMES - Centralized UI Strings
# ============================================================================
BOOLEAN_DISPLAY_NAMES = {
    SPLITTING_TRUE: "True",
    SPLITTING_FALSE: "False",
    SEMDIST_HIGH: "High",
    SEMDIST_LOW: "Low"
}

# Score agreement patterns for flexible N-score systems
SCORE_PATTERN_PREFIXES = ['2_of_3_high_fuzz_det', '2_of_3_high_fuzz_sim', '2_of_3_high_sim_det']
SINGLE_SCORE_PATTERNS = ['1_of_3_high_fuzz', '1_of_3_high_sim', '1_of_3_high_det']