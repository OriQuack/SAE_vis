from pydantic import BaseModel, Field
from typing import Optional, Union, Dict, Any, List
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
    averageBy: Optional[Union[str, List[str]]] = Field(
        default=None,
        description="Optional field(s) to average values by before creating histogram. Can be a single field (e.g., 'llm_explainer') or list of fields (e.g., ['llm_explainer', 'llm_scorer']) to average over multiple dimensions"
    )
    fixedDomain: Optional[tuple[float, float]] = Field(
        default=None,
        description="Optional fixed domain [min, max] for histogram bins (e.g., [0.0, 1.0] for score metrics)"
    )
    selectedLLMExplainers: Optional[List[str]] = Field(
        default=None,
        description="Optional list of selected LLM explainers (1 or 2) for filtered histogram computation. When provided, computes LLM-specific metrics using pairwise similarity data."
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
    selectedLLMExplainers: Optional[List[str]] = Field(
        default=None,
        description="Optional list of selected LLM explainers (1 or 2) for filtered feature ID retrieval"
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
    selectedLLMExplainers: Optional[List[str]] = Field(
        default=None,
        description="Optional list of selected LLM explainers (1 or 2) for filtered histogram computation"
    )

class LLMComparisonRequest(BaseModel):
    """Request model for LLM comparison endpoint"""
    filters: Filters = Field(
        default_factory=lambda: Filters(),
        description="Optional filter criteria for data subset"
    )

class UMAPDataRequest(BaseModel):
    """Request model for UMAP visualization data endpoint"""
    filters: Filters = Field(
        default_factory=lambda: Filters(),
        description="Optional filter criteria for data subset"
    )
    umap_type: Optional[str] = Field(
        default="both",
        description="Type of UMAP data to return: 'feature', 'explanation', or 'both'"
    )
    feature_ids: Optional[List[int]] = Field(
        default=None,
        description="Optional list of specific feature IDs to include (for Sankey linking)"
    )
    include_noise: bool = Field(
        default=True,
        description="Whether to include noise points in the response"
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