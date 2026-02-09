"""
API endpoint for cause classification.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
import logging

from ..models.similarity_sort import (
    CauseClassificationRequest,
    CauseClassificationResponse
)
from ..services.cause_service import CauseService

logger = logging.getLogger(__name__)
router = APIRouter()

_cause_service: Optional[CauseService] = None


def set_cause_service(service: CauseService) -> None:
    """Set the Cause service instance."""
    global _cause_service
    _cause_service = service


def get_cause_service() -> CauseService:
    """Dependency to get Cause service."""
    if _cause_service is None:
        raise HTTPException(status_code=503, detail="CauseService not initialized")
    return _cause_service


@router.post("/cause-classification", response_model=CauseClassificationResponse)
async def cause_classification(
    request: CauseClassificationRequest,
    service: CauseService = Depends(get_cause_service)
) -> CauseClassificationResponse:
    """
    Classify features into cause categories using OvR SVMs.

    Trains One-vs-Rest SVMs for each category using mean metric vectors
    per feature (averaged across 3 explainers). Returns predicted category
    and decision scores for each feature.

    Requires at least one manually tagged feature per category.

    Args:
        request: Request with feature_ids and cause_selections
        service: Injected Cause service

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
