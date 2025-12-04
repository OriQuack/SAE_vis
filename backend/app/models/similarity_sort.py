"""
Pydantic models for similarity-based sorting feature.
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Optional


class SimilaritySortRequest(BaseModel):
    """Request model for similarity-based sorting."""

    selected_ids: List[int] = Field(
        ...,
        description="Feature IDs marked as selected/positive (✓)",
        min_items=0
    )
    rejected_ids: List[int] = Field(
        ...,
        description="Feature IDs marked as rejected/negative (✗)",
        min_items=0
    )
    feature_ids: List[int] = Field(
        ...,
        description="All feature IDs in the current table view",
        min_items=1
    )


class FeatureScore(BaseModel):
    """Feature ID with its similarity score."""

    feature_id: int = Field(..., description="Feature ID")
    score: float = Field(..., description="Similarity score (higher = more similar to selected, less similar to rejected)")


class SimilaritySortResponse(BaseModel):
    """Response model for similarity-based sorting."""

    sorted_features: List[FeatureScore] = Field(
        ...,
        description="Features sorted by similarity score (descending)"
    )
    total_features: int = Field(..., description="Total number of features scored")
    weights_used: List[float] = Field(
        default=[],
        description="Normalized weights used for each metric"
    )


class PairSimilaritySortRequest(BaseModel):
    """Request model for pair similarity-based sorting."""

    selected_pair_keys: List[str] = Field(
        ...,
        description="Pair keys marked as selected/positive (✓), format: 'main_id-similar_id'",
        min_items=0
    )
    rejected_pair_keys: List[str] = Field(
        ...,
        description="Pair keys marked as rejected/negative (✗), format: 'main_id-similar_id'",
        min_items=0
    )
    pair_keys: List[str] = Field(
        ...,
        description="All pair keys in the current table view",
        min_items=1
    )


class PairScore(BaseModel):
    """Pair key with its similarity score."""

    pair_key: str = Field(..., description="Pair key in format 'main_id-similar_id'")
    score: float = Field(..., description="Similarity score (higher = more similar to selected, less similar to rejected)")


class PairSimilaritySortResponse(BaseModel):
    """Response model for pair similarity-based sorting."""

    sorted_pairs: List[PairScore] = Field(
        ...,
        description="Pairs sorted by similarity score (descending)"
    )
    total_pairs: int = Field(..., description="Total number of pairs scored")
    weights_used: List[float] = Field(
        default=[],
        description="Normalized weights used for each metric (10 total: 9 feature metrics + 1 pair metric)"
    )


# ============================================================================
# SIMILARITY HISTOGRAM MODELS (for automatic tagging)
# ============================================================================

class SimilarityHistogramRequest(BaseModel):
    """Request model for similarity score histogram (features)."""

    selected_ids: List[int] = Field(
        ...,
        description="Feature IDs marked as selected/positive (✓)",
        min_items=1
    )
    rejected_ids: List[int] = Field(
        ...,
        description="Feature IDs marked as rejected/negative (✗)",
        min_items=1
    )
    feature_ids: List[int] = Field(
        ...,
        description="All feature IDs to compute scores for",
        min_items=1
    )


class PairSimilarityHistogramRequest(BaseModel):
    """Request model for similarity score histogram (pairs).

    Simplified Flow (recommended):
        - Provide feature_ids + threshold to generate pairs via clustering
        - Pairs are automatically generated using hierarchical clustering

    Legacy Flow (backward compatibility):
        - Provide pair_keys directly (explicit list of pairs to score)
    """

    selected_pair_keys: List[str] = Field(
        ...,
        description="Pair keys marked as selected/positive (✓), format: 'main_id-similar_id'",
        min_items=1
    )
    rejected_pair_keys: List[str] = Field(
        ...,
        description="Pair keys marked as rejected/negative (✗), format: 'main_id-similar_id'",
        min_items=1
    )

    # Simplified flow: feature_ids + threshold (generate pairs via clustering)
    feature_ids: Optional[List[int]] = Field(
        default=None,
        description="Feature IDs to cluster and generate pairs from (simplified flow)"
    )
    threshold: Optional[float] = Field(
        default=None,
        description="Clustering threshold (0-1) for pair generation (simplified flow)",
        ge=0.0,
        le=1.0
    )

    # Legacy flow: explicit pair_keys
    pair_keys: Optional[List[str]] = Field(
        default=None,
        description="All pair keys to compute scores for (legacy flow, optional if feature_ids+threshold provided)",
        min_items=1
    )


class HistogramData(BaseModel):
    """Histogram data structure."""

    bins: List[float] = Field(..., description="Bin centers")
    counts: List[int] = Field(..., description="Count in each bin")
    bin_edges: List[float] = Field(..., description="Bin edge values (length = bins + 1)")


class HistogramStatistics(BaseModel):
    """Statistical summary of histogram data."""

    min: float = Field(..., description="Minimum score")
    max: float = Field(..., description="Maximum score")
    mean: float = Field(..., description="Mean score")
    median: float = Field(..., description="Median score")


class GMMComponentInfo(BaseModel):
    """GMM component parameters."""

    mean: float = Field(..., description="Component mean")
    variance: float = Field(..., description="Component variance")
    weight: float = Field(..., description="Component weight (0-1)")


class BimodalityInfo(BaseModel):
    """Raw bimodality detection data - state determined by frontend."""

    dip_pvalue: float = Field(..., description="P-value from Hartigan's Dip test")
    bic_k1: float = Field(..., description="BIC for 1-component GMM")
    bic_k2: float = Field(..., description="BIC for 2-component GMM")
    gmm_components: List[GMMComponentInfo] = Field(
        ...,
        description="2 GMM components sorted by mean (ascending): [{mean, variance, weight}, ...]"
    )
    sample_size: int = Field(..., description="Number of data points used in analysis")


class SimilarityHistogramResponse(BaseModel):
    """Response model for similarity score histogram (shared by features and pairs)."""

    scores: Dict[str, float] = Field(
        ...,
        description="Map of feature_id/pair_key to similarity score"
    )
    histogram: HistogramData = Field(
        ...,
        description="Histogram distribution of similarity scores"
    )
    statistics: HistogramStatistics = Field(
        ...,
        description="Statistical summary of scores"
    )
    total_items: int = Field(..., description="Total number of items (features or pairs)")
    bimodality: Optional[BimodalityInfo] = Field(
        default=None,
        description="Bimodality detection results (Dip Test + GMM BIC)"
    )


# ============================================================================
# CAUSE SIMILARITY MODELS (Multi-class One-vs-Rest SVM)
# ============================================================================

class CauseSimilaritySortRequest(BaseModel):
    """Request model for cause similarity sorting (multi-class OvR)."""

    cause_selections: Dict[int, str] = Field(
        ...,
        description="Map of feature_id to cause category ('noisy-activation', 'missed-lexicon', 'missed-context')",
        min_length=1
    )
    feature_ids: List[int] = Field(
        ...,
        description="All feature IDs in the current table view",
        min_length=1
    )


class CauseFeatureScore(BaseModel):
    """Feature ID with per-category confidence scores."""

    feature_id: int = Field(..., description="Feature ID")
    category_confidences: Dict[str, float] = Field(
        ...,
        description="Confidence scores for each category (signed distances from SVM decision boundaries). "
                    "Keys: 'noisy-activation', 'missed-lexicon', 'missed-context'"
    )


class CauseSimilaritySortResponse(BaseModel):
    """Response model for cause similarity sorting."""

    sorted_features: List[CauseFeatureScore] = Field(
        ...,
        description="Features with per-category confidence scores"
    )
    total_features: int = Field(..., description="Total number of features scored")


class CauseSimilarityHistogramRequest(BaseModel):
    """Request model for cause similarity histogram (multi-class OvR)."""

    cause_selections: Dict[int, str] = Field(
        ...,
        description="Map of feature_id to cause category ('noisy-activation', 'missed-lexicon', 'missed-context')",
        min_length=1
    )
    feature_ids: List[int] = Field(
        ...,
        description="All feature IDs to compute scores for",
        min_length=1
    )


class CauseSimilarityHistogramResponse(BaseModel):
    """Response model for cause similarity histogram (multi-class)."""

    scores: Dict[str, Dict[str, float]] = Field(
        ...,
        description="Map of feature_id (as string) to {category: confidence} dict"
    )
    histograms: Dict[str, HistogramData] = Field(
        ...,
        description="Histogram per category. Keys: 'noisy-activation', 'missed-lexicon', 'missed-context'"
    )
    statistics: Dict[str, HistogramStatistics] = Field(
        ...,
        description="Statistics per category. Keys: 'noisy-activation', 'missed-lexicon', 'missed-context'"
    )
    total_items: int = Field(..., description="Total number of features")


# ============================================================================
# DECISION FUNCTION UMAP MODELS
# ============================================================================

class DecisionFunctionUmapRequest(BaseModel):
    """Request model for UMAP projection in SVM decision function space."""

    feature_ids: List[int] = Field(
        ...,
        description="Feature IDs to project",
        min_length=3
    )
    cause_selections: Dict[int, str] = Field(
        ...,
        description="Map of feature_id to cause category (manual tags only)"
    )
    n_neighbors: int = Field(
        default=15,
        description="UMAP n_neighbors parameter",
        ge=2,
        le=200
    )
    min_dist: float = Field(
        default=0.1,
        description="UMAP min_dist parameter",
        ge=0.0,
        le=1.0
    )
    random_state: Optional[int] = Field(
        default=42,
        description="Random seed for reproducibility"
    )
