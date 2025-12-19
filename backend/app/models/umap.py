"""
Pydantic models for UMAP projection API.
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any


class UmapProjectionRequest(BaseModel):
    """Request model for UMAP projection."""

    feature_ids: List[int] = Field(
        ...,
        description="Feature IDs to project",
        min_length=3
    )
    n_neighbors: int = Field(
        default=15,
        description="UMAP n_neighbors parameter (local neighborhood size)",
        ge=2,
        le=200
    )
    min_dist: float = Field(
        default=0.1,
        description="UMAP min_dist parameter (minimum distance between points)",
        ge=0.0,
        le=1.0
    )
    random_state: Optional[int] = Field(
        default=42,
        description="Random seed for reproducibility"
    )


class UmapPoint(BaseModel):
    """Single point in UMAP projection."""

    feature_id: int = Field(..., description="Feature ID")
    x: float = Field(..., description="X coordinate in UMAP space")
    y: float = Field(..., description="Y coordinate in UMAP space")
    decision_margin: Optional[float] = Field(
        default=None,
        description="Min distance to decision boundary (only for SVM Space UMAP)"
    )
    nearest_anchor: Optional[str] = Field(
        default=None,
        description="Nearest anchor point: missed_ngram, missed_context, or noisy_activation"
    )


class UmapProjectionResponse(BaseModel):
    """Response model for UMAP projection."""

    points: List[UmapPoint] = Field(
        ...,
        description="UMAP projected points with feature IDs"
    )
    total_features: int = Field(
        ...,
        description="Total number of features projected"
    )
    params_used: Dict[str, Any] = Field(
        default_factory=dict,
        description="UMAP parameters used for this projection"
    )
