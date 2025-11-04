from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any, Union, Set
from enum import Enum

# Import category constants for single source of truth
from ..services.data_constants import (
    CATEGORY_ROOT,
    CATEGORY_FEATURE_SPLITTING,
    CATEGORY_SEMANTIC_SIMILARITY
)

class MetricType(str, Enum):
    """Supported metric types for histogram analysis"""
    # Standard metrics
    DECODER_SIMILARITY = "decoder_similarity"
    SEMSIM_MEAN = "semsim_mean"
    SCORE_FUZZ = "score_fuzz"
    SCORE_DETECTION = "score_detection"
    SCORE_EMBEDDING = "score_embedding"
    OVERALL_SCORE = "overall_score"

class CategoryType(str, Enum):
    """Node category types for Sankey diagrams and visualization"""
    ROOT = CATEGORY_ROOT
    FEATURE_SPLITTING = CATEGORY_FEATURE_SPLITTING
    SEMANTIC_SIMILARITY = CATEGORY_SEMANTIC_SIMILARITY
    # Can be extended with new categories without code changes

class ErrorResponse(BaseModel):
    """Standard error response format"""
    error: Dict[str, Any] = Field(
        ...,
        description="Error information",
        example={
            "code": "INVALID_FILTERS",
            "message": "One or more filter values are invalid",
            "details": {"invalid_fields": ["sae_id"]}
        }
    )

class ThresholdPathConstraint(BaseModel):
    """
    Threshold path constraint for filtering features by parent node ranges.
    Represents one step in the path from root to node.
    """
    metric: str = Field(
        ...,
        description="Metric name (e.g., 'semsim_mean', 'overall_score')",
        example="semsim_mean"
    )
    range_label: str = Field(
        ...,
        description="Range label (e.g., '[0, 0.3)', '>= 0.5', '< 0.5')",
        example="[0, 0.3)"
    )

class Filters(BaseModel):
    """Common filter structure used across endpoints"""
    sae_id: Optional[List[str]] = Field(
        default=None,
        description="SAE model identifiers to filter by",
        example=["gemma-scope-9b-pt-res/layer_30/width16k/average_l0_120"]
    )
    explanation_method: Optional[List[str]] = Field(
        default=None,
        description="Explanation methods to filter by",
        example=["quantiles", "top-act"]
    )
    llm_explainer: Optional[List[str]] = Field(
        default=None,
        description="LLM explainer models to filter by",
        example=["claude-3-opus"]
    )
    llm_scorer: Optional[List[str]] = Field(
        default=None,
        description="LLM scorer models to filter by",
        example=["gpt-4-turbo"]
    )