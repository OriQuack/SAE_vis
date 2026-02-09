"""
API endpoints for hierarchical clustering-based candidate feature selection.

Provides endpoint to get filtered cluster-based pairs using pre-computed
agglomerative clustering.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
import logging

from ..models.cluster_candidates import FilteredClusterPairsRequest, FilteredClusterPairsResponse
from ..services.hierarchical_cluster_candidate_service import HierarchicalClusterCandidateService

logger = logging.getLogger(__name__)
router = APIRouter()

_cluster_candidate_service: Optional[HierarchicalClusterCandidateService] = None


def set_cluster_candidate_service(service: HierarchicalClusterCandidateService) -> None:
    """Set the cluster candidate service instance."""
    global _cluster_candidate_service
    _cluster_candidate_service = service


def get_cluster_candidate_service() -> HierarchicalClusterCandidateService:
    """Dependency to get the cluster candidate service instance."""
    if _cluster_candidate_service is None:
        raise HTTPException(status_code=503, detail="HierarchicalClusterCandidateService not initialized")
    return _cluster_candidate_service


@router.post("/filtered-cluster-pairs", response_model=FilteredClusterPairsResponse)
async def get_filtered_cluster_pairs(
    request: FilteredClusterPairsRequest,
    service: HierarchicalClusterCandidateService = Depends(get_cluster_candidate_service)
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

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error in get_filtered_cluster_pairs: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )
