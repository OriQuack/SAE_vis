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

class FilteredHistogramPanelResponse(BaseModel):
    """Response model for filtered histogram panel data endpoint"""
    histograms: Dict[str, HistogramResponse] = Field(
        ...,
        description="Dictionary mapping metric names to histogram data"
    )
    filtered_feature_count: int = Field(
        ...,
        ge=0,
        description="Total number of features after filtering"
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
    feature_ids: Optional[List[int]] = Field(
        default=None,
        description="List of feature IDs in this node (included only for leaf nodes to enable alluvial diagrams)"
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
    feature_splitting: float = Field(
        ...,
        description="Feature splitting cosine similarity score"
    )
    semsim_mean: float = Field(
        ...,
        description="Average semantic similarity"
    )
    semsim_max: float = Field(
        ...,
        description="Maximum semantic similarity"
    )
    scores: FeatureScores = Field(
        ...,
        description="Feature scores"
    )
    details_path: str = Field(
        ...,
        description="Path to detailed JSON file"
    )

class ThresholdFeatureResponse(BaseModel):
    """Response model for threshold feature IDs endpoint"""
    feature_ids: List[int] = Field(
        ...,
        description="List of unique feature IDs within the threshold range"
    )
    total_count: int = Field(
        ...,
        description="Total number of features in the threshold range"
    )
    metric: str = Field(
        ...,
        description="The metric used for filtering"
    )
    threshold_range: Dict[str, float] = Field(
        ...,
        description="The threshold range used (min and max values)"
    )

class LLMModel(BaseModel):
    """LLM model information"""
    id: str = Field(
        ...,
        description="Model identifier"
    )
    name: str = Field(
        ...,
        description="Display name for the model"
    )

class LLMScorerModel(BaseModel):
    """LLM scorer model information"""
    id: str = Field(
        ...,
        description="Model identifier"
    )
    name: str = Field(
        ...,
        description="Display name for the model"
    )
    explainerSource: str = Field(
        ...,
        description="Associated explainer source ID"
    )

class ConsistencyScore(BaseModel):
    """Consistency score data"""
    value: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Consistency score value (0-1)"
    )
    method: str = Field(
        ...,
        description="Method used for calculation (e.g., 'cosine_similarity', 'rv_coefficient')"
    )

class LLMComparisonResponse(BaseModel):
    """Response model for LLM comparison endpoint"""
    explainers: List[LLMModel] = Field(
        ...,
        min_items=3,
        max_items=3,
        description="Three LLM explainer models"
    )
    scorersForExplainer1: List[LLMScorerModel] = Field(
        ...,
        min_items=3,
        max_items=3,
        description="Three scorer models for first explainer"
    )
    scorersForExplainer2: List[LLMScorerModel] = Field(
        ...,
        min_items=3,
        max_items=3,
        description="Three scorer models for second explainer"
    )
    scorersForExplainer3: List[LLMScorerModel] = Field(
        ...,
        min_items=3,
        max_items=3,
        description="Three scorer models for third explainer"
    )
    explainerConsistencies: Dict[str, ConsistencyScore] = Field(
        ...,
        description="Consistency scores between explainer pairs (left-1, left-3, left-4)"
    )
    scorerConsistencies: Dict[str, ConsistencyScore] = Field(
        ...,
        description="Consistency scores between scorer pairs for each explainer"
    )

class UMAPPoint(BaseModel):
    """Individual UMAP point"""
    umap_id: int = Field(..., description="Unique UMAP point identifier")
    feature_id: int = Field(..., description="Feature ID for linking with other visualizations")
    umap_x: float = Field(..., description="X coordinate in UMAP space")
    umap_y: float = Field(..., description="Y coordinate in UMAP space")
    source: str = Field(..., description="Data source (decoder, llama_e-llama_s, etc.)")
    llm_explainer: Optional[str] = Field(None, description="LLM explainer (null for features)")
    cluster_id: str = Field(..., description="Cluster assignment (includes noise clusters)")
    cluster_label: Optional[str] = Field(None, description="Human-readable cluster label")
    cluster_level: int = Field(..., description="Hierarchical clustering level")

class ClusterNode(BaseModel):
    """Cluster hierarchy node information"""
    cluster_id: str = Field(..., description="Cluster identifier")
    level: int = Field(..., description="Hierarchical level (0=root)")
    parent_id: Optional[str] = Field(None, description="Parent cluster ID (null for root)")
    children_ids: List[str] = Field(..., description="List of child cluster IDs (empty for leaf)")
    point_count: int = Field(..., ge=0, description="Number of points in this cluster")
    is_noise: bool = Field(..., description="Whether this is a noise cluster")

class UMAPMetadata(BaseModel):
    """Metadata for UMAP visualization"""
    total_points: int = Field(..., ge=0, description="Total number of points returned")
    feature_points: int = Field(..., ge=0, description="Number of feature points")
    explanation_points: int = Field(..., ge=0, description="Number of explanation points")
    noise_points: int = Field(..., ge=0, description="Number of noise points")
    applied_filters: Dict[str, List[str]] = Field(..., description="Filters applied to data")
    cluster_hierarchy: Dict[str, Dict[str, ClusterNode]] = Field(
        ...,
        description="Separate hierarchies for features and explanations: {'features': {...}, 'explanations': {...}}"
    )

class UMAPDataResponse(BaseModel):
    """Response model for UMAP visualization data"""
    features: List[UMAPPoint] = Field(..., description="Feature UMAP points")
    explanations: List[UMAPPoint] = Field(..., description="Explanation UMAP points")
    metadata: UMAPMetadata = Field(..., description="Response metadata")

class ScorerScoreSet(BaseModel):
    """Score set for each scorer (s1, s2, s3)"""
    s1: Optional[float] = Field(None, description="Score for scorer 1")
    s2: Optional[float] = Field(None, description="Score for scorer 2")
    s3: Optional[float] = Field(None, description="Score for scorer 3")

class ExplainerScoreData(BaseModel):
    """Scores for a single explainer (embedding + fuzz/detection per scorer)"""
    embedding: Optional[float] = Field(None, description="Embedding score for this explainer")
    fuzz: ScorerScoreSet = Field(..., description="Fuzz scores for each scorer (s1, s2, s3)")
    detection: ScorerScoreSet = Field(..., description="Detection scores for each scorer (s1, s2, s3)")
    explanation_text: Optional[str] = Field(None, description="Explanation text for this explainer")
    scorer_consistency: Optional[Dict[str, ConsistencyScore]] = Field(
        None,
        description="Consistency across scorers for each metric (coefficient of variation): {embedding, fuzz, detection}"
    )
    metric_consistency: Optional[ConsistencyScore] = Field(
        None,
        description="Consistency across metrics (normalized standard deviation)"
    )
    explainer_consistency: Optional[ConsistencyScore] = Field(
        None,
        description="Semantic consistency between LLM explainers (average pairwise cosine similarity)"
    )
    cross_explainer_metric_consistency: Optional[Dict[str, ConsistencyScore]] = Field(
        None,
        description="Consistency of each metric across LLM explainers (inverse coefficient of variation): {embedding, fuzz, detection}"
    )

class FeatureTableRow(BaseModel):
    """Single feature row with scores for all explainers"""
    feature_id: int = Field(..., ge=0, description="Feature ID")
    explainers: Dict[str, ExplainerScoreData] = Field(
        ...,
        description="Scores for each explainer (llama, qwen, openai)"
    )

class MetricNormalizationStats(BaseModel):
    """Global normalization statistics for a metric (used for z-score color mapping)"""
    mean: float = Field(..., description="Global mean across all features")
    std: float = Field(..., description="Global standard deviation")
    min: float = Field(..., description="Global minimum value")
    max: float = Field(..., description="Global maximum value")

class FeatureTableDataResponse(BaseModel):
    """Response model for feature-level table visualization data (824 rows)"""
    features: List[FeatureTableRow] = Field(..., description="Feature-level rows (one per feature_id)")
    total_features: int = Field(..., ge=0, description="Total number of features")
    explainer_ids: List[str] = Field(..., description="List of explainer IDs present in data")
    scorer_ids: List[str] = Field(..., description="List of scorer IDs present in data (for S1, S2, S3 labels)")
    is_averaged: bool = Field(default=False, description="Whether scores are averaged across scorers (when multiple explainers selected)")
    global_stats: Dict[str, MetricNormalizationStats] = Field(..., description="Global normalization statistics for each metric (embedding, fuzz, detection)")