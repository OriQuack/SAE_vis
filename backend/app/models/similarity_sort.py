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
