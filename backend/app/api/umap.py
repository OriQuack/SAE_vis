"""
API endpoint for UMAP projection.
"""

from fastapi import APIRouter, HTTPException, Depends
import logging
from typing import TYPE_CHECKING

from ..models.umap import (
    UmapProjectionRequest,
    UmapProjectionResponse
)
from ..models.similarity_sort import (
    CauseClassificationRequest,
    CauseClassificationResponse
)

if TYPE_CHECKING:
    from ..services.umap_service import UMAPService

logger = logging.getLogger(__name__)

router = APIRouter()

# Service instance will be injected
_umap_service: "UMAPService" = None


def set_umap_service(service: "UMAPService"):
    """Set the UMAP service instance."""
    global _umap_service
    _umap_service = service


def get_umap_service() -> "UMAPService":
    """Dependency to get UMAP service."""
    if _umap_service is None:
        raise HTTPException(
            status_code=500,
            detail="UMAP service not initialized"
        )
    return _umap_service


@router.post("/umap-projection", response_model=UmapProjectionResponse)
async def umap_projection(
    request: UmapProjectionRequest,
    service: "UMAPService" = Depends(get_umap_service)
) -> UmapProjectionResponse:
    """
    Compute UMAP 2D projection for features.

    Projects features into 2D space using cause-related metrics:
    - semantic_similarity (semsim_mean)
    - score_detection
    - score_embedding
    - score_fuzz

    This endpoint is designed for Stage 3 (CauseView) to visualize
    "Need Revision" features in a scatter plot for cause analysis.

    Args:
        request: Request with feature_ids and optional UMAP parameters
        service: Injected UMAP service

    Returns:
        Response with 2D coordinates for each feature
    """
    try:
        logger.info(
            f"UMAP projection request: {len(request.feature_ids)} features, "
            f"n_neighbors={request.n_neighbors}, min_dist={request.min_dist}"
        )

        # Validate minimum features (UMAP requirement)
        if len(request.feature_ids) < 3:
            raise HTTPException(
                status_code=400,
                detail="UMAP requires at least 3 features"
            )

        # Call service to compute projection
        response = await service.get_umap_projection(request)

        logger.info(f"UMAP projection completed: {response.total_features} features projected")
        return response

    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error in UMAP projection: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error during UMAP projection: {str(e)}"
        )


@router.post("/cause-classification", response_model=CauseClassificationResponse)
async def cause_classification(
    request: CauseClassificationRequest,
    service: "UMAPService" = Depends(get_umap_service)
) -> CauseClassificationResponse:
    """
    Classify features into cause categories using OvR SVMs.

    Trains One-vs-Rest SVMs for each category using mean metric vectors
    per feature (averaged across 3 explainers). Returns predicted category
    and decision scores for each feature.

    Requires at least one manually tagged feature per category.

    Args:
        request: Request with feature_ids and cause_selections
        service: Injected UMAP service

    Returns:
        Response with predicted category and decision scores for each feature
    """
    try:
        logger.info(
            f"Cause classification request: {len(request.feature_ids)} features, "
            f"{len(request.cause_selections)} manual tags"
        )

        # Call service to classify features
        response = await service.get_cause_classification(request)

        logger.info(
            f"Cause classification completed: {response.total_features} features, "
            f"counts: {response.category_counts}"
        )
        return response

    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error in cause classification: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error during cause classification: {str(e)}"
        )
