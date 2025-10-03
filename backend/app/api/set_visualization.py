from fastapi import APIRouter, HTTPException, Depends
import logging
from ..services.visualization_service import DataService
from ..models.requests import SetVisualizationRequest
from ..models.responses import SetVisualizationResponse
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
    "/set-visualization-data",
    response_model=SetVisualizationResponse,
    responses={
        200: {"description": "Set visualization data generated successfully"},
        400: {"model": ErrorResponse, "description": "Invalid request parameters"},
        500: {"model": ErrorResponse, "description": "Server error"}
    },
    summary="Get Set Visualization Data",
    description="Returns set membership counts for linear diagram visualization based on pattern rule evaluation."
)
async def get_set_visualization_data(
    request: SetVisualizationRequest,
    data_service: DataService = Depends(get_data_service)
):
    """
    Generate set visualization data by evaluating pattern rule on filtered features.

    This endpoint takes a PatternSplitRule from the frontend and evaluates it
    against all filtered features, returning counts for each set category (child_id).

    The pattern rule defines:
    - Conditions: Thresholds for each scoring metric
    - Patterns: Which combinations of metric states (high/low) map to which child_id

    For example, with 3 metrics, this creates 2^3 = 8 possible set categories.

    Args:
        request: SetVisualizationRequest containing filters and pattern_rule
        data_service: Data service dependency

    Returns:
        SetVisualizationResponse: Dictionary mapping child_id to feature count

    Raises:
        HTTPException: For various error conditions including invalid filters,
                      insufficient data, or server errors
    """
    logger.info("📡 === SET VISUALIZATION API REQUEST ===")
    logger.info(f"🔍 Filters: {request.filters}")
    logger.info(f"📊 Pattern rule: {request.pattern_rule}")

    try:
        result = await data_service.get_set_visualization_data(
            filters=request.filters,
            pattern_rule=request.pattern_rule
        )

        return SetVisualizationResponse(
            set_counts=result["set_counts"],
            total_features=result["total_features"]
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

    except HTTPException:
        # Re-raise HTTP exceptions (like validation errors)
        raise

    except Exception as e:
        logger.error(f"Error generating set visualization data: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "Failed to generate set visualization data",
                    "details": {"error": str(e)}
                }
            }
        )
