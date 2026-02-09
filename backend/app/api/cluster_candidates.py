"""
API endpoints for hierarchical clustering-based candidate feature selection.

Provides endpoint to get filtered cluster-based pairs using pre-computed
agglomerative clustering.
"""

from fastapi import APIRouter, Depends, HTTPException
from typing import TYPE_CHECKING

from app.models.requests import FilteredClusterPairsRequest
from app.models.responses import FilteredClusterPairsResponse

if TYPE_CHECKING:
    from app.services.hierarchical_cluster_candidate_service import HierarchicalClusterCandidateService

router = APIRouter()

# Module-level service instance
_cluster_candidate_service: "HierarchicalClusterCandidateService" = None


def set_cluster_candidate_service(service: "HierarchicalClusterCandidateService"):
    """Set the cluster candidate service instance."""
    global _cluster_candidate_service
    _cluster_candidate_service = service


def get_cluster_candidate_service() -> "HierarchicalClusterCandidateService":
    """Dependency to get the cluster candidate service instance."""
    if _cluster_candidate_service is None:
        raise RuntimeError("Cluster candidate service not initialized")
    return _cluster_candidate_service


@router.post("/filtered-cluster-pairs", response_model=FilteredClusterPairsResponse)
async def get_filtered_cluster_pairs(
    request: FilteredClusterPairsRequest,
    service: "HierarchicalClusterCandidateService" = Depends(get_cluster_candidate_service)
) -> FilteredClusterPairsResponse:
    """
    Get cluster-based pairs filtered by decoder similarity and ranking criteria.

    This endpoint applies a more selective filtering algorithm compared to
    /segment-cluster-pairs:

    For each cluster:
      1. Generate all pairs within cluster
      2. Filter by decoder_similarity > (1 - threshold)
      3. Keep pairs where A is in B's Top 20 semantic OR B's Top 10 decoder (or vice versa)
      4. Fallback: If no pairs pass, keep best decoder and best semantic pair

    This significantly reduces the number of pairs while preserving the most
    meaningful relationships.

    Args:
        request: Request containing feature_ids and threshold

    Returns:
        FilteredClusterPairsResponse with filtered pairs and statistics

    Raises:
        HTTPException: 400 for invalid inputs, 500 for server errors
    """
    try:
        result = await service.get_filtered_cluster_pairs(
            feature_ids=request.feature_ids,
            threshold=request.threshold or 0.5
        )
        return FilteredClusterPairsResponse(**result)

    except ValueError as e:
        # Client error - invalid inputs
        raise HTTPException(status_code=400, detail=str(e))

    except Exception as e:
        # Server error - unexpected failure
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error while getting filtered cluster pairs: {str(e)}"
        )
