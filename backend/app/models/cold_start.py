"""
Pydantic models for cold-start suggestions feature.

Provides diverse sample suggestions using k-medoids clustering to bootstrap
SVM-based tagging when users haven't tagged enough items yet.
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Dict


class ColdStartSuggestionRequest(BaseModel):
    """Request model for cold-start suggestions."""

    mode: Literal['feature', 'pair'] = Field(
        ...,
        description="Mode: 'feature' for Stage 2 (Quality), 'pair' for Stage 1 (Feature Split)"
    )
    feature_ids: List[int] = Field(
        ...,
        description="Feature IDs in the current segment",
        min_length=6
    )
    num_suggestions: int = Field(
        default=8,
        description="Number of suggestions to return (should be >= 6 for 3+3 tagging)",
        ge=6,
        le=20
    )
    threshold: Optional[float] = Field(
        default=None,
        description="Clustering threshold for pair generation (required for pair mode)",
        ge=0.0,
        le=1.0
    )


class ColdStartSuggestion(BaseModel):
    """Single suggestion item."""

    id: str = Field(
        ...,
        description="Item ID (feature_id as string for features, 'main-similar' for pairs)"
    )
    cluster_id: int = Field(
        ...,
        description="Cluster ID from k-medoids"
    )
    is_medoid: bool = Field(
        default=True,
        description="Whether this item is the cluster medoid"
    )
    diversity_reason: str = Field(
        ...,
        description="Human-readable reason (e.g., 'Cluster 3 representative')"
    )
    metrics: Optional[Dict[str, float]] = Field(
        default=None,
        description="Optional metric values for the item"
    )


class ColdStartSuggestionsResponse(BaseModel):
    """Response model for cold-start suggestions."""

    suggestions: List[ColdStartSuggestion] = Field(
        ...,
        description="List of diverse suggestions (medoids from k-medoids clustering)"
    )
    total_suggestions: int = Field(
        ...,
        description="Number of suggestions returned"
    )
    mode: str = Field(
        ...,
        description="Mode used ('feature' or 'pair')"
    )
    num_clusters: int = Field(
        ...,
        description="Number of clusters formed"
    )
    cache_hit: bool = Field(
        default=False,
        description="Whether result was served from cache"
    )
