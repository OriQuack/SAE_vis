from pydantic import BaseModel, Field
from typing import Optional
from .common import Filters, MetricType, ThresholdTree

class HistogramRequest(BaseModel):
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
    thresholdTree: Optional[ThresholdTree] = Field(
        default=None,
        description="Optional threshold tree for node-specific histogram filtering"
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
    thresholdTree: ThresholdTree = Field(
        ...,
        description="Threshold tree structure for hierarchical classification"
    )
    version: Optional[int] = Field(
        default=None,
        ge=1,
        le=2,
        description="Threshold system version (1=legacy, 2=new flexible system, None=auto-detect)"
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