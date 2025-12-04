from pydantic import BaseModel, Field
from typing import Optional, List
from .common import Filters, MetricType, ThresholdPathConstraint

class  HistogramRequest(BaseModel):
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

class TableDataRequest(BaseModel):
    """Request model for table visualization data endpoint"""
    filters: Filters = Field(
        default_factory=lambda: Filters(),
        description="Filter criteria for data subset"
    )

class FeatureGroupRequest(BaseModel):
    """Request model for feature groups endpoint"""
    filters: Filters = Field(
        default_factory=lambda: Filters(),
        description="Filter criteria for data subset"
    )
    metric: str = Field(
        ...,
        description="Metric name to group by (e.g., 'score_fuzz', 'consistency_llm_scorer')"
    )
    thresholds: List[float] = Field(
        ...,
        min_items=0,
        description="List of threshold values (N thresholds create N+1 groups). Empty list returns all features as single group (root node)."
    )

class ClusterCandidatesRequest(BaseModel):
    """Request model for hierarchical clustering-based cluster selection"""
    feature_ids: List[int] = Field(
        ...,
        description="List of feature IDs to sample from"
    )
    n: int = Field(
        ...,
        gt=0,
        description="Number of clusters to select (only clusters with 2+ features)"
    )
    threshold: Optional[float] = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Distance threshold for cutting dendrogram (0-1, higher=fewer clusters)"
    )

class SegmentClusterPairsRequest(BaseModel):
    """Request model for getting ALL cluster-based pairs from a segment"""
    feature_ids: List[int] = Field(
        ...,
        description="List of feature IDs from selected segment"
    )
    threshold: Optional[float] = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Distance threshold for cutting dendrogram (0-1, higher=fewer clusters)"
    )