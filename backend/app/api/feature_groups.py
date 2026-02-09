"""
Feature Groups API endpoint.

This endpoint provides a simplified threshold system where the backend
returns feature IDs grouped by threshold ranges. The frontend performs
local intersections for fast updates.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
import logging

from ..models.feature_groups import FeatureGroupRequest, FeatureGroupResponse
from ..services.feature_group_service import FeatureGroupService

logger = logging.getLogger(__name__)
router = APIRouter()

_feature_group_service: Optional[FeatureGroupService] = None


def set_feature_group_service(service: FeatureGroupService) -> None:
    """Set the feature group service instance."""
    global _feature_group_service
    _feature_group_service = service


def get_feature_group_service() -> FeatureGroupService:
    """Dependency to get the feature group service instance."""
    if _feature_group_service is None:
        raise HTTPException(status_code=503, detail="FeatureGroupService not initialized")
    return _feature_group_service


@router.post("/feature-groups", response_model=FeatureGroupResponse)
async def get_feature_groups(
    request: FeatureGroupRequest,
    service: FeatureGroupService = Depends(get_feature_group_service)
) -> FeatureGroupResponse:
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
    """
    try:
        response = await service.get_feature_groups(
            filters=request.filters,
            metric=request.metric,
            thresholds=request.thresholds
        )
        return response

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error in get_feature_groups: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )
