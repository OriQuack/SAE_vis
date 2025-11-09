"""
Pydantic models for similarity-based sorting feature.
"""

from pydantic import BaseModel, Field
from typing import List


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
