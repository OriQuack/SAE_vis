"""
Feature Groups API endpoint.

This endpoint provides a simplified threshold system where the backend
returns feature IDs grouped by threshold ranges. The frontend performs
local intersections for fast updates.
"""

import logging
from fastapi import APIRouter, HTTPException

from ..models.requests import FeatureGroupRequest
from ..models.responses import FeatureGroupResponse
from ..services.feature_group_service import FeatureGroupService

router = APIRouter()
logger = logging.getLogger(__name__)

# Global service instance (initialized on app startup)
_service: FeatureGroupService | None = None


def initialize_service():
    """Initialize the feature group service"""
    global _service
    if _service is None:
        _service = FeatureGroupService()
        logger.info("FeatureGroupService initialized")


def get_service() -> FeatureGroupService:
    """Get the initialized service instance"""
    if _service is None:
        raise RuntimeError("FeatureGroupService not initialized")
    return _service


@router.post("/feature-groups", response_model=FeatureGroupResponse)
async def get_feature_groups(request: FeatureGroupRequest) -> FeatureGroupResponse:
    """
    Get feature IDs grouped by threshold ranges for a single metric.

    This is the core endpoint for the new simplified threshold system.
    The frontend uses these groups to compute intersections and build Sankey diagrams locally.

    Supported metrics:
    - Standard: decoder_similarity, semdist_mean, score_fuzz, score_detection, score_embedding
    - Computed: overall_score

    Args:
        request: FeatureGroupRequest with filters, metric, and thresholds

    Returns:
        FeatureGroupResponse with groups containing feature IDs

    Raises:
        HTTPException: 400 for invalid metric or thresholds
        HTTPException: 500 for internal server errors
    """
    try:
        service = get_service()
        response = await service.get_feature_groups(
            filters=request.filters,
            metric=request.metric,
            thresholds=request.thresholds
        )
        return response

    except ValueError as e:
        logger.error(f"Validation error in feature groups: {e}")
        raise HTTPException(status_code=400, detail=str(e))

    except Exception as e:
        logger.error(f"Failed to get feature groups: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )
