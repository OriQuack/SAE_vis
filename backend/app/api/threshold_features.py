from fastapi import APIRouter, HTTPException, Depends
import logging
from ..services.visualization_service import DataService
from ..models.requests import ThresholdFeatureRequest
from ..models.responses import ThresholdFeatureResponse
from ..models.common import ErrorResponse

logger = logging.getLogger(__name__)
router = APIRouter()

def get_data_service():
    """Dependency to get data service instance"""
    from ..main import data_service
    if not data_service or not data_service.is_ready():
        raise HTTPException(
            status_code=503,
            detail={
                "error": {
                    "code": "SERVICE_UNAVAILABLE",
                    "message": "Data service is not available",
                    "details": {}
                }
            }
        )
    return data_service

@router.post(
    "/features-in-threshold",
    response_model=ThresholdFeatureResponse,
    responses={
        200: {"description": "Feature IDs retrieved successfully"},
        400: {"model": ErrorResponse, "description": "Invalid request parameters"},
        500: {"model": ErrorResponse, "description": "Server error"}
    },
    summary="Get Feature IDs in Threshold Range",
    description="Returns feature IDs that fall within a specific metric threshold range."
)
async def get_features_in_threshold(
    request: ThresholdFeatureRequest,
    data_service: DataService = Depends(get_data_service)
):
    """
    Get feature IDs that fall within a specific threshold range for a given metric.

    This endpoint is used by the progress bar visualization to track which features
    belong to each threshold selection in a threshold group.

    Args:
        request: Request containing filters, metric, and threshold range
        data_service: Data service dependency

    Returns:
        ThresholdFeatureResponse: List of feature IDs and total count

    Raises:
        HTTPException: For invalid parameters or server errors
    """
    try:
        feature_ids = await data_service.get_features_in_threshold_range(
            filters=request.filters,
            metric=request.metric,
            min_value=request.min_value,
            max_value=request.max_value,
            selected_llm_explainers=request.selectedLLMExplainers
        )

        return ThresholdFeatureResponse(
            feature_ids=feature_ids,
            total_count=len(feature_ids),
            metric=request.metric.value,
            threshold_range={
                "min": request.min_value,
                "max": request.max_value
            }
        )

    except ValueError as e:
        error_msg = str(e)
        if "No data available" in error_msg:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": {
                        "code": "INSUFFICIENT_DATA",
                        "message": "No data available after applying filters",
                        "details": {"filters": request.filters.dict(exclude_none=True)}
                    }
                }
            )
        else:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": {
                        "code": "INVALID_REQUEST",
                        "message": error_msg,
                        "details": {}
                    }
                }
            )

    except Exception as e:
        logger.error(f"Error getting features in threshold range: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "An unexpected error occurred while retrieving feature IDs",
                    "details": {}
                }
            }
        )