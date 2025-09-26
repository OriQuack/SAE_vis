from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any, Union, Set
from enum import Enum

class MetricType(str, Enum):
    """Supported metric types for histogram analysis"""
    FEATURE_SPLITTING = "feature_splitting"
    SEMDIST_MEAN = "semdist_mean"
    SEMDIST_MAX = "semdist_max"
    SCORE_FUZZ = "score_fuzz"
    SCORE_SIMULATION = "score_simulation"
    SCORE_DETECTION = "score_detection"
    SCORE_EMBEDDING = "score_embedding"
    SCORE_COMBINED = "score_combined"

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



# ============================================================================
# NEW UNIFIED THRESHOLD TREE SYSTEM
# ============================================================================

class ThresholdNode(BaseModel):
    """Represents a node in the hierarchical threshold tree."""
    id: str = Field(
        ...,
        description="Unique identifier for this category/node"
    )
    metric: Optional[str] = Field(
        default=None,
        description="Optional metric name this node uses for evaluation"
    )
    split: Optional[Dict[str, Union[List[float], List['ThresholdNode']]]] = Field(
        default=None,
        description="The rule for splitting this node into children"
    )

    @validator('split')
    def validate_split(cls, v):
        """Validate split structure has both thresholds and children."""
        if v is not None:
            if 'thresholds' not in v or 'children' not in v:
                raise ValueError("Split must contain both 'thresholds' and 'children' keys")

            thresholds = v['thresholds']
            children = v['children']

            if not isinstance(thresholds, list) or not isinstance(children, list):
                raise ValueError("Both thresholds and children must be lists")

            if len(children) != len(thresholds) + 1:
                raise ValueError(f"Children length ({len(children)}) must be exactly thresholds length + 1 ({len(thresholds) + 1})")

        return v

class ThresholdTree(BaseModel):
    """Complete threshold tree structure with metadata."""
    root: ThresholdNode = Field(
        ...,
        description="Root node of the threshold tree"
    )
    metrics: List[str] = Field(
        default_factory=list,
        description="List of all metrics used in the tree"
    )

# Forward reference resolution
ThresholdNode.model_rebuild()