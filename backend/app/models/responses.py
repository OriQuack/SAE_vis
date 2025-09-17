from pydantic import BaseModel, Field
from typing import List, Dict, Optional
from .common import CategoryType

class FilterOptionsResponse(BaseModel):
    """Response model for filter options endpoint"""
    sae_id: List[str] = Field(
        ...,
        description="Available SAE model identifiers"
    )
    explanation_method: List[str] = Field(
        ...,
        description="Available explanation methods"
    )
    llm_explainer: List[str] = Field(
        ...,
        description="Available LLM explainer models"
    )
    llm_scorer: List[str] = Field(
        ...,
        description="Available LLM scorer models"
    )

class HistogramData(BaseModel):
    """Histogram data structure"""
    bins: List[float] = Field(
        ...,
        description="Histogram bin centers"
    )
    counts: List[int] = Field(
        ...,
        description="Count of features in each bin"
    )
    bin_edges: List[float] = Field(
        ...,
        description="Histogram bin edges (length = bins + 1)"
    )

class StatisticsData(BaseModel):
    """Statistical summary data"""
    min: float = Field(..., description="Minimum value")
    max: float = Field(..., description="Maximum value")
    mean: float = Field(..., description="Mean value")
    median: float = Field(..., description="Median value")
    std: float = Field(..., description="Standard deviation")

class HistogramResponse(BaseModel):
    """Response model for histogram data endpoint"""
    metric: str = Field(
        ...,
        description="The metric analyzed"
    )
    histogram: HistogramData = Field(
        ...,
        description="Histogram data"
    )
    statistics: StatisticsData = Field(
        ...,
        description="Statistical summary"
    )
    total_features: int = Field(
        ...,
        description="Total number of features in the filtered dataset"
    )

class SankeyNode(BaseModel):
    """Individual node in Sankey diagram"""
    id: str = Field(
        ...,
        description="Unique node identifier"
    )
    name: str = Field(
        ...,
        description="Display name for the node"
    )
    stage: int = Field(
        ...,
        ge=0,
        le=3,
        description="Stage/level of the node (0=root, 1=splitting, 2=distance, 3=agreement)"
    )
    feature_count: int = Field(
        ...,
        ge=0,
        description="Number of features in this node"
    )
    category: CategoryType = Field(
        ...,
        description="Category type of this node"
    )
    parent_path: Optional[List[str]] = Field(
        default=None,
        description="Path from root to this node"
    )

class SankeyLink(BaseModel):
    """Individual link in Sankey diagram"""
    source: str = Field(
        ...,
        description="Source node ID"
    )
    target: str = Field(
        ...,
        description="Target node ID"
    )
    value: int = Field(
        ...,
        ge=0,
        description="Flow value (number of features)"
    )

class SankeyMetadata(BaseModel):
    """Metadata for Sankey diagram"""
    total_features: int = Field(
        ...,
        description="Total number of features in the diagram"
    )
    applied_filters: Dict[str, List[str]] = Field(
        ...,
        description="Filters that were applied"
    )
    applied_thresholds: Dict[str, float] = Field(
        ...,
        description="Thresholds that were applied"
    )

class SankeyResponse(BaseModel):
    """Response model for Sankey diagram data endpoint"""
    nodes: List[SankeyNode] = Field(
        ...,
        description="Array of nodes in the Sankey diagram"
    )
    links: List[SankeyLink] = Field(
        ...,
        description="Array of links in the Sankey diagram"
    )
    metadata: SankeyMetadata = Field(
        ...,
        description="Metadata about the diagram"
    )

class AlluvialFlow(BaseModel):
    """Individual flow in alluvial diagram"""
    source_node: str = Field(
        ...,
        description="Source node ID from left Sankey"
    )
    target_node: str = Field(
        ...,
        description="Target node ID from right Sankey"
    )
    feature_count: int = Field(
        ...,
        ge=0,
        description="Number of features flowing between nodes"
    )
    feature_ids: List[int] = Field(
        ...,
        description="List of feature IDs in this flow (truncated for large flows)"
    )

class ConsistencyMetrics(BaseModel):
    """Consistency analysis metrics"""
    same_final_category: int = Field(
        ...,
        description="Number of features ending in same category"
    )
    different_final_category: int = Field(
        ...,
        description="Number of features ending in different categories"
    )
    consistency_rate: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Rate of consistency (same / total)"
    )

class ComparisonSummary(BaseModel):
    """Summary statistics for comparison"""
    total_overlapping_features: int = Field(
        ...,
        description="Total number of features present in both configurations"
    )
    total_flows: int = Field(
        ...,
        description="Total number of alluvial flows"
    )
    consistency_metrics: ConsistencyMetrics = Field(
        ...,
        description="Consistency analysis"
    )

class ComparisonResponse(BaseModel):
    """Response model for comparison/alluvial diagram data endpoint"""
    flows: List[AlluvialFlow] = Field(
        ...,
        description="Array of flows in the alluvial diagram"
    )
    summary: ComparisonSummary = Field(
        ...,
        description="Summary statistics"
    )

class FeatureScores(BaseModel):
    """Individual feature's scores"""
    fuzz: float = Field(..., description="Fuzzing score")
    simulation: float = Field(..., description="Simulation score")
    detection: float = Field(..., description="Detection score")
    embedding: float = Field(..., description="Embedding score")

class FeatureResponse(BaseModel):
    """Response model for individual feature endpoint"""
    feature_id: int = Field(
        ...,
        description="The feature ID"
    )
    sae_id: str = Field(
        ...,
        description="SAE model identifier"
    )
    explanation_method: str = Field(
        ...,
        description="Explanation method used"
    )
    llm_explainer: str = Field(
        ...,
        description="LLM explainer model"
    )
    llm_scorer: str = Field(
        ...,
        description="LLM scorer model"
    )
    feature_splitting: bool = Field(
        ...,
        description="Whether feature is candidate for splitting"
    )
    semdist_mean: float = Field(
        ...,
        description="Average semantic distance"
    )
    semdist_max: float = Field(
        ...,
        description="Maximum semantic distance"
    )
    scores: FeatureScores = Field(
        ...,
        description="Feature scores"
    )
    details_path: str = Field(
        ...,
        description="Path to detailed JSON file"
    )