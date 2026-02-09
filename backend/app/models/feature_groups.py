from pydantic import BaseModel, Field
from typing import List, Dict, Optional

from .common import Filters


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


class FeatureGroup(BaseModel):
    """Single group of features within a threshold range"""
    group_index: int = Field(..., ge=0, description="Group index (0, 1, 2, ...)")
    range_label: str = Field(..., description="Human-readable range label (e.g., '< 0.50', '0.50 - 0.80')")
    feature_ids: Optional[List[int]] = Field(
        default=None,
        description="Feature IDs in this group (used for standard metrics)"
    )
    feature_ids_by_source: Optional[Dict[str, List[int]]] = Field(
        default=None,
        description="Feature IDs grouped by source_min (used for consistency metrics). Key is explainer name or metric name."
    )
    feature_count: int = Field(..., ge=0, description="Total number of unique features in this group")


class FeatureGroupResponse(BaseModel):
    """Response model for feature groups endpoint"""
    metric: str = Field(..., description="Metric used for grouping")
    groups: List[FeatureGroup] = Field(..., description="Feature groups created by threshold ranges")
    total_features: int = Field(..., ge=0, description="Total unique features after filtering")
