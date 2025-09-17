from pydantic import BaseModel, Field, validator
from typing import Optional
from .common import Filters, Thresholds, MetricType

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
        default=20,
        ge=5,
        le=100,
        description="Number of histogram bins"
    )

class SankeyRequest(BaseModel):
    """Request model for Sankey diagram data endpoint"""
    filters: Filters = Field(
        ...,
        description="Filter criteria for data subset"
    )
    thresholds: Thresholds = Field(
        ...,
        description="Threshold values for categorization"
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

    @validator('sankey_right')
    def validate_different_configs(cls, v, values):
        """Ensure the two Sankey configurations are actually different"""
        if 'sankey_left' in values:
            left_config = values['sankey_left']
            if left_config.filters == v.filters and left_config.thresholds == v.thresholds:
                raise ValueError("Left and right Sankey configurations must be different")
        return v