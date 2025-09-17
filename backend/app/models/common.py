from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from enum import Enum

class MetricType(str, Enum):
    """Supported metric types for histogram analysis"""
    SEMDIST_MEAN = "semdist_mean"
    SEMDIST_MAX = "semdist_max"
    SCORE_FUZZ = "score_fuzz"
    SCORE_SIMULATION = "score_simulation"
    SCORE_DETECTION = "score_detection"
    SCORE_EMBEDDING = "score_embedding"

class CategoryType(str, Enum):
    """Node category types for Sankey diagrams"""
    ROOT = "root"
    FEATURE_SPLITTING = "feature_splitting"
    SEMANTIC_DISTANCE = "semantic_distance"
    SCORE_AGREEMENT = "score_agreement"

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

class Thresholds(BaseModel):
    """Threshold configuration for Sankey diagram generation"""
    semdist_mean: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Threshold for semantic distance classification",
        example=0.15
    )
    score_high: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Threshold for 'high' score classification",
        example=0.8
    )