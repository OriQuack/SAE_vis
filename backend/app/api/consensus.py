"""
Consensus API endpoint for feature explanation consensus data.

Returns clustered phrases with activation similarity ranking.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter()

# Service instance (set by main.py during startup)
_consensus_service = None


def set_consensus_service(service):
    """Set the consensus service instance."""
    global _consensus_service
    _consensus_service = service


# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================

class FeatureConsensusRequest(BaseModel):
    """Request for feature consensus data."""
    feature_id: int


class ClusterPhrase(BaseModel):
    """Single phrase within a cluster."""
    text: str
    explainer: str
    phrase_weight: float  # Weight of this phrase (1/n where n = phrases from same explainer)
    weighted_quality_score: Optional[float] = None  # avg(detection, fuzz, embedding) * phrase_weight
    distance_to_medoid: float
    activation_similarity: float


class ConsensusItem(BaseModel):
    """Single item in consensus results (medoid or outlier)."""
    cluster_id: int  # -1 for outliers
    phrase: str
    explainer: str
    activation_similarity: float
    weighted_quality_score: Optional[float] = None  # Sum of weighted_quality_scores for cluster, or single for outlier
    is_outlier: bool
    phrase_weight: Optional[float] = None  # Only for outliers (individual phrase weight)
    cluster_size: Optional[int] = None  # Only for clusters
    cluster_score: Optional[float] = None  # Sum of phrase weights in cluster
    cluster_coherence: Optional[float] = None  # Only for clusters
    cluster_phrases: Optional[List[ClusterPhrase]] = None  # Only for clusters


class FeatureConsensusResponse(BaseModel):
    """Response containing consensus data for a feature."""
    feature_id: int
    consensus_score: float
    num_clusters: int
    num_outliers: int
    items: List[ConsensusItem]


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.post("/feature-consensus", response_model=FeatureConsensusResponse)
async def get_feature_consensus(request: FeatureConsensusRequest):
    """Get consensus data for a specific feature.

    Returns clustered explanation phrases ranked by activation similarity,
    with medoids representing clusters and outliers shown individually.

    Args:
        request: Request containing feature_id

    Returns:
        Consensus data with items sorted by activation_similarity (descending)
    """
    if _consensus_service is None or not _consensus_service.is_ready:
        raise HTTPException(
            status_code=503,
            detail="Consensus service not available"
        )

    result = _consensus_service.get_feature_consensus(request.feature_id)

    if result is None:
        raise HTTPException(
            status_code=404,
            detail=f"Feature {request.feature_id} not found in consensus data"
        )

    return FeatureConsensusResponse(**result)
