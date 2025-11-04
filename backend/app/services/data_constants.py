"""
Essential constants for data processing and visualization.

This module contains the core constants used throughout the data service.
"""

# Category types
CATEGORY_ROOT = "root"
CATEGORY_FEATURE_SPLITTING = "feature_splitting"
CATEGORY_SEMANTIC_SIMILARITY = "semantic_similarity"

# Classification categories
SPLITTING_TRUE = "true"
SPLITTING_FALSE = "false"
SEMDIST_HIGH = "high"
SEMDIST_LOW = "low"

# Node ID patterns
NODE_ROOT = "root"
NODE_SPLIT_PREFIX = "split_"
NODE_SEMSIM_SUFFIX = "_semsim_"

# Column names
COL_FEATURE_ID = "feature_id"
COL_SAE_ID = "sae_id"
COL_EXPLANATION_METHOD = "explanation_method"
COL_LLM_EXPLAINER = "llm_explainer"
COL_LLM_SCORER = "llm_scorer"
COL_EXPLANATION_TEXT = "explanation_text"
COL_FEATURE_SPLITTING = "feature_splitting"  # Legacy - removed from new parquet
COL_DECODER_SIMILARITY = "decoder_similarity"
COL_SEMSIM_MEAN = "semsim_mean"
COL_SEMSIM_MAX = "semsim_max"
COL_SCORE_FUZZ = "score_fuzz"
COL_SCORE_SIMULATION = "score_simulation"
COL_SCORE_DETECTION = "score_detection"
COL_SCORE_EMBEDDING = "score_embedding"
COL_DETAILS_PATH = "details_path"

# Computed column names
COL_SPLITTING_CATEGORY = "splitting_category"
COL_SEMSIM_CATEGORY = "semsim_category"

# Default values
DEFAULT_HISTOGRAM_BINS = 20

# Stage definitions
STAGE_ROOT = 0
STAGE_SPLITTING = 1
STAGE_SEMANTIC = 2

# Stage names
STAGE_NAMES = {
    STAGE_ROOT: "All Features",
    STAGE_SPLITTING: "Feature Splitting",
    STAGE_SEMANTIC: "Semantic Distance"
}

# Filter columns
FILTER_COLUMNS = [COL_SAE_ID, COL_EXPLANATION_METHOD, COL_LLM_EXPLAINER, COL_LLM_SCORER]

# Custom ordering for Sankey nodes
SPLITTING_ORDER = [SPLITTING_FALSE, SPLITTING_TRUE]  # false at the top
SEMDIST_ORDER = [SEMDIST_HIGH, SEMDIST_LOW]  # high at the top

# Default threshold values
DEFAULT_THRESHOLDS = {
    "feature_splitting": 0.5,
    "semsim_mean": 0.2,
    "score_fuzz": 0.5,
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
SCORE_NAME_DETECTION = "detection"
SCORE_NAME_EMBEDDING = "embedding"

# Score column mappings for flexible score handling
SCORE_COLUMNS_MAPPING = {
    SCORE_NAME_FUZZ: COL_SCORE_FUZZ,
    SCORE_NAME_DETECTION: COL_SCORE_DETECTION,
    SCORE_NAME_EMBEDDING: COL_SCORE_EMBEDDING
}