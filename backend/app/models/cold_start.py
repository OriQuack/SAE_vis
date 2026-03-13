"""
Pydantic models for cold-start suggestions feature.

Provides diverse sample suggestions using Kennard-Stone algorithm to bootstrap
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
        default=20,
        description="Number of diverse suggestions to return",
        ge=6,
        le=50
    )
    threshold: Optional[float] = Field(
        default=None,
        description="Clustering threshold for pair generation (required for pair mode)",
        ge=0.0,
        le=1.0
    )
    random_seed: Optional[int] = Field(
        default=None,
        description="If provided, use random sampling with this seed instead of Kennard-Stone"
    )
    method: Literal['kennard-stone', 'typiclust', 'typiclust_odal'] = Field(
        default='kennard-stone',
        description="Sampling method: 'kennard-stone' (max diversity), 'typiclust' (cluster typicality), or 'typiclust_odal' (typicality + anomaly detection)"
    )
    anomaly_ratio: float = Field(
        default=0.25,
        description="Fraction of suggestions allocated to anomaly detection (typiclust_odal only)",
        ge=0.0,
        le=0.5
    )


class ColdStartSuggestion(BaseModel):
    """Single suggestion item."""

    id: str = Field(
        ...,
        description="Item ID (feature_id as string for features, 'main-similar' for pairs)"
    )
    cluster_id: int = Field(
        ...,
        description="Selection index from Kennard-Stone"
    )
    is_medoid: bool = Field(
        default=True,
        description="Whether this item was selected by Kennard-Stone"
    )
    diversity_reason: str = Field(
        ...,
        description="Human-readable reason (e.g., 'Kennard-Stone sample 3')"
    )
    metrics: Optional[Dict[str, float]] = Field(
        default=None,
        description="Optional metric values for the item"
    )


class ColdStartSuggestionsResponse(BaseModel):
    """Response model for cold-start suggestions."""

    suggestions: List[ColdStartSuggestion] = Field(
        ...,
        description="List of diverse suggestions selected via Kennard-Stone"
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
        description="Number of samples selected"
    )
    cache_hit: bool = Field(
        default=False,
        description="Whether result was served from cache"
    )
