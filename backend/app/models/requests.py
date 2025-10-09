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
    groupBy: Optional[str] = Field(
        default=None,
        description="Optional field to group histogram data by (e.g., 'llm_explainer')"
    )
    averageBy: Optional[str] = Field(
        default=None,
        description="Optional field to average values by before creating histogram (e.g., 'llm_explainer', 'llm_scorer')"
    )
    fixedDomain: Optional[tuple[float, float]] = Field(
        default=None,
        description="Optional fixed domain [min, max] for histogram bins (e.g., [0.0, 1.0] for score metrics)"
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

class ThresholdFeatureRequest(BaseModel):
    """Request model for retrieving feature IDs within a threshold range"""
    filters: Filters = Field(
        ...,
        description="Filter criteria for data subset"
    )
    metric: MetricType = Field(
        ...,
        description="Metric to check against threshold range"
    )
    min_value: float = Field(
        ...,
        description="Minimum threshold value (inclusive)"
    )
    max_value: float = Field(
        ...,
        description="Maximum threshold value (inclusive)"
    )

class FilteredHistogramPanelRequest(BaseModel):
    """Request model for filtered histogram panel data endpoint"""
    featureIds: list[int] = Field(
        ...,
        description="List of feature IDs to filter histograms by"
    )
    bins: Optional[int] = Field(
        default=20,
        ge=5,
        le=100,
        description="Number of histogram bins"
    )

class LLMComparisonRequest(BaseModel):
    """Request model for LLM comparison endpoint"""
    filters: Filters = Field(
        default_factory=lambda: Filters(),
        description="Optional filter criteria for data subset"
    )