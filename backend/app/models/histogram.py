from pydantic import BaseModel, Field
from typing import List, Optional

from .common import MetricType, Filters, ThresholdPathConstraint, HistogramData, StatisticsData


class HistogramRequest(BaseModel):
    """Simplified request model for histogram data endpoint with threshold path filtering"""
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
    nodeId: Optional[str] = Field(
        default=None,
        description="Optional node ID for reference (not used for filtering)"
    )
    fixedDomain: Optional[tuple[float, float]] = Field(
        default=None,
        description="Optional fixed domain [min, max] for histogram bins (e.g., [0.0, 1.0] for score metrics)"
    )
    thresholdPath: Optional[List[ThresholdPathConstraint]] = Field(
        default=None,
        description="Optional threshold path constraints from root to node for filtering features by parent ranges"
    )


class GroupedHistogramData(BaseModel):
    """Grouped histogram data for a specific group value"""
    group_value: str = Field(
        ...,
        description="The value for this group (e.g., specific LLM explainer name)"
    )
    histogram: HistogramData = Field(
        ...,
        description="Histogram data for this group"
    )
    statistics: StatisticsData = Field(
        ...,
        description="Statistical summary for this group"
    )
    total_features: int = Field(
        ...,
        description="Total number of features in this group"
    )


class HistogramResponse(BaseModel):
    """Response model for histogram data endpoint"""
    metric: str = Field(
        ...,
        description="The metric analyzed"
    )
    histogram: HistogramData = Field(
        ...,
        description="Histogram data (when not grouped)"
    )
    statistics: StatisticsData = Field(
        ...,
        description="Statistical summary (when not grouped)"
    )
    total_features: int = Field(
        ...,
        description="Total number of features in the filtered dataset"
    )
    grouped_data: Optional[List[GroupedHistogramData]] = Field(
        default=None,
        description="Grouped histogram data when groupBy is specified"
    )
