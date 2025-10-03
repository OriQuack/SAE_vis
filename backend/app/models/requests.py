from pydantic import BaseModel, Field
from typing import Optional, Union, Dict, Any
from .common import Filters, MetricType
from .threshold import ThresholdStructure

class  HistogramRequest(BaseModel):
    """Request model for histogram data endpoint"""
    filters: Filters = Field(
        ...,
        description="Filter criteria for data subset"
    )
    metric: MetricType = Field(
        ...,
        description="Metric name to analyze for histogram"
    )
    bins: Optional[int] = Field(
        default=None,
        ge=5,
        le=100,
        description="Number of histogram bins (auto-calculated if not provided)"
    )
    thresholdTree: Optional[ThresholdStructure] = Field(
        default=None,
        description="Optional threshold tree for node-specific histogram filtering (v2 format only)"
    )
    nodeId: Optional[str] = Field(
        default=None,
        description="Optional node ID to filter features for specific node in threshold tree"
    )

class SankeyRequest(BaseModel):
    """Request model for Sankey diagram data endpoint"""
    filters: Filters = Field(
        ...,
        description="Filter criteria for data subset"
    )
    thresholdTree: ThresholdStructure = Field(
        ...,
        description="Threshold tree structure for hierarchical classification (v2 format only)"
    )

class ComparisonRequest(BaseModel):
    """Request model for comparison/alluvial diagram data endpoint"""
    sankey_left: SankeyRequest = Field(
        ...,
        description="Configuration for left Sankey diagram"
    )
    sankey_right: SankeyRequest = Field(
        ...,
        description="Configuration for right Sankey diagram"
    )

class SetVisualizationRequest(BaseModel):
    """Request model for set visualization data endpoint"""
    filters: Filters = Field(
        default_factory=lambda: Filters(),
        description="Filter criteria for data subset (defaults to empty = all data)"
    )
    pattern_rule: "PatternSplitRule" = Field(
        ...,
        description="Pattern split rule defining set membership conditions and categories"
    )

# Import PatternSplitRule for type hint
from .threshold import PatternSplitRule
SetVisualizationRequest.model_rebuild()