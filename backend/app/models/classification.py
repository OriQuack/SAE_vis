"""
Pydantic models for SVM-based classification (binary + multi-class).
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Literal

from .common import HistogramData


# ============================================================================
# WEIGHTED ITEM TYPES (for SVM sample weighting)
# ============================================================================

class WeightedFeatureId(BaseModel):
    """Feature ID with source for SVM sample weighting."""
    id: int
    source: Literal['click', 'threshold']


class WeightedPairKey(BaseModel):
    """Pair key with source for SVM sample weighting."""
    key: str
    source: Literal['click', 'threshold']


class CauseSelectionItem(BaseModel):
    """Cause selection with source for SVM sample weighting."""
    category: str
    source: Literal['click', 'threshold']


class SimilaritySortRequest(BaseModel):
    """Request model for similarity-based sorting."""

    selected_items: List[WeightedFeatureId] = Field(
        ...,
        description="Feature IDs with sources marked as selected/positive (✓)",
        min_length=0
    )
    rejected_items: List[WeightedFeatureId] = Field(
        ...,
        description="Feature IDs with sources marked as rejected/negative (✗)",
        min_length=0
    )
    feature_ids: List[int] = Field(
        ...,
        description="All feature IDs in the current table view",
        min_length=1
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

    selected_items: List[WeightedPairKey] = Field(
        ...,
        description="Pair keys with sources marked as selected/positive (✓), format: 'main_id-similar_id'",
        min_length=0
    )
    rejected_items: List[WeightedPairKey] = Field(
        ...,
        description="Pair keys with sources marked as rejected/negative (✗), format: 'main_id-similar_id'",
        min_length=0
    )
    pair_keys: List[str] = Field(
        ...,
        description="All pair keys in the current table view",
        min_length=1
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

    selected_items: List[WeightedFeatureId] = Field(
        ...,
        description="Feature IDs with sources marked as selected/positive (✓)",
        min_length=1
    )
    rejected_items: List[WeightedFeatureId] = Field(
        ...,
        description="Feature IDs with sources marked as rejected/negative (✗)",
        min_length=1
    )
    feature_ids: List[int] = Field(
        ...,
        description="All feature IDs to compute scores for",
        min_length=1
    )


class PairSimilarityHistogramRequest(BaseModel):
    """Request model for similarity score histogram (pairs).

    Simplified Flow (recommended):
        - Provide feature_ids + threshold to generate pairs via clustering
        - Pairs are automatically generated using hierarchical clustering

    Legacy Flow (backward compatibility):
        - Provide pair_keys directly (explicit list of pairs to score)
    """

    selected_items: List[WeightedPairKey] = Field(
        ...,
        description="Pair keys with sources marked as selected/positive (✓), format: 'main_id-similar_id'",
        min_length=1
    )
    rejected_items: List[WeightedPairKey] = Field(
        ...,
        description="Pair keys with sources marked as rejected/negative (✗), format: 'main_id-similar_id'",
        min_length=1
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
        min_length=1
    )


class HistogramStatistics(BaseModel):
    """Statistical summary of histogram data."""

    min: float = Field(..., description="Minimum score")
    max: float = Field(..., description="Maximum score")
    mean: float = Field(..., description="Mean score")
    median: float = Field(..., description="Median score")


class CommitteeVoteInfo(BaseModel):
    """Vote information from Query by Committee (QBC) approach."""

    svm_prediction: int = Field(..., description="SVM prediction (0 or 1)")
    rf_prediction: int = Field(..., description="Random Forest prediction (0 or 1)")
    mlp_prediction: int = Field(..., description="MLP prediction (0 or 1)")


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
    committee_votes: Optional[Dict[str, CommitteeVoteInfo]] = Field(
        default=None,
        description="Vote information from RF/MLP committee (QBC approach)"
    )


# ============================================================================
# CAUSE CLASSIFICATION MODELS (SVM-based category prediction)
# ============================================================================

class CauseClassificationRequest(BaseModel):
    """Request model for SVM-based cause classification."""

    feature_ids: List[int] = Field(
        ...,
        description="Feature IDs to classify",
        min_length=1
    )
    cause_selections: Dict[int, CauseSelectionItem] = Field(
        ...,
        description="Map of feature_id to cause category with source (manual tags for training)"
    )


class CauseClassificationResult(BaseModel):
    """Classification result for a single feature."""

    feature_id: int = Field(..., description="Feature ID")
    predicted_category: str = Field(
        ...,
        description="Predicted cause category based on SVM argmax"
    )
    decision_margin: float = Field(
        ...,
        description="Gap between top two category scores (higher = more confident prediction)"
    )
    decision_scores: Dict[str, float] = Field(
        ...,
        description="SVM decision function values per category"
    )


class CauseCommitteeVoteInfo(BaseModel):
    """Committee vote information for cause classification (multi-class)."""

    svm_category: str = Field(..., description="SVM predicted category")
    rf_category: str = Field(..., description="Random Forest predicted category")
    mlp_category: str = Field(..., description="MLP predicted category")


class CauseClassificationResponse(BaseModel):
    """Response model for cause classification."""

    results: List[CauseClassificationResult] = Field(
        ...,
        description="Classification results for each feature"
    )
    total_features: int = Field(..., description="Total number of features classified")
    category_counts: Dict[str, int] = Field(
        default_factory=dict,
        description="Count of features predicted in each category"
    )
    committee_votes: Optional[Dict[int, CauseCommitteeVoteInfo]] = Field(
        default=None,
        description="Committee vote info (SVM/RF/MLP predictions) per feature for disagreement highlighting"
    )


