"""
API endpoints for hierarchical clustering-based candidate feature selection.

Provides endpoints to select candidate features using pre-computed agglomerative
clustering, returning both candidates and cluster membership information.
"""

from fastapi import APIRouter, Depends, HTTPException
from typing import TYPE_CHECKING

from app.models.requests import ClusterCandidatesRequest
from app.models.responses import ClusterCandidatesResponse

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


@router.post("/cluster-candidates", response_model=ClusterCandidatesResponse)
async def get_cluster_candidates(
    request: ClusterCandidatesRequest,
    service: "HierarchicalClusterCandidateService" = Depends(get_cluster_candidate_service)
) -> ClusterCandidatesResponse:
    """
    Get n clusters (each with 2+ features) using hierarchical clustering.

    This endpoint cuts a pre-computed agglomerative clustering dendrogram at
    the specified distance threshold, filters to clusters with 2+ features,
    then randomly selects n clusters and returns all their members.

    The response includes:
    - List of selected cluster groups with their feature members
    - Complete cluster membership mapping for ALL features (not just selected clusters)
    - Metadata about the clustering and selection process

    Args:
        request: Request containing feature_ids, n (number of clusters), and threshold

    Returns:
        ClusterCandidatesResponse with cluster groups and cluster information

    Raises:
        HTTPException: 400 for invalid inputs, 500 for server errors
    """
    try:
        result = await service.get_cluster_candidates(
            feature_ids=request.feature_ids,
            n=request.n,
            threshold=request.threshold or 0.5
        )
        return ClusterCandidatesResponse(**result)

    except ValueError as e:
        # Client error - invalid inputs
        raise HTTPException(status_code=400, detail=str(e))

    except Exception as e:
        # Server error - unexpected failure
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error while getting cluster candidates: {str(e)}"
        )
