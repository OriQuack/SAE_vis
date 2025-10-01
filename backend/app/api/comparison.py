from fastapi import APIRouter, HTTPException, Depends
import logging
from ..services.visualization_service import DataService
from ..models.requests import ComparisonRequest
from ..models.responses import ComparisonResponse
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
    "/comparison-data",
    response_model=ComparisonResponse,
    responses={
        200: {"description": "Comparison data generated successfully"},
        400: {"model": ErrorResponse, "description": "Invalid request parameters"},
        501: {"model": ErrorResponse, "description": "Feature not yet implemented"},
        500: {"model": ErrorResponse, "description": "Server error"}
    },
    summary="Get Comparison Data (Phase 2)",
    description="Returns alluvial flow data connecting the final nodes of two Sankey configurations."
)
async def get_comparison_data(
    request: ComparisonRequest,
    data_service: DataService = Depends(get_data_service)
):
    """
    Generate alluvial comparison data between two Sankey configurations.

    **Note: This endpoint is part of Phase 2 development and is not yet fully implemented.**

    This endpoint takes two complete Sankey configurations and returns
    alluvial flow data that shows how the same features are categorized
    differently under different settings. This visualization helps
    researchers understand the consistency (or inconsistency) of their
    explanation and scoring methods.

    The alluvial diagram connects the final nodes of two Sankey diagrams,
    tracking individual features by their feature_id to show how they
    flow between different categories.

    Args:
        request: Comparison request containing two Sankey configurations
        data_service: Data service dependency

    Returns:
        ComparisonResponse: Alluvial flows and consistency metrics

    Raises:
        HTTPException: For various error conditions including invalid configurations,
                      no overlapping features, or server errors
    """
    try:
        # Phase 2 feature not yet implemented - fail early
        raise NotImplementedError("Comparison data generation not yet implemented")

    except NotImplementedError:
        # Phase 2 feature not yet implemented
        raise HTTPException(
            status_code=501,
            detail={
                "error": {
                    "code": "NOT_IMPLEMENTED",
                    "message": "Comparison data generation is not yet implemented (Phase 2 feature)",
                    "details": {
                        "phase": "Phase 2",
                        "status": "In development"
                    }
                }
            }
        )

    except ValueError as e:
        error_msg = str(e)
        if "No overlapping features" in error_msg:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": {
                        "code": "NO_OVERLAPPING_FEATURES",
                        "message": "No overlapping features found between the two configurations",
                        "details": {}
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
        # Re-raise HTTP exceptions
        raise

    except Exception as e:
        logger.error(f"Error generating comparison data: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "Failed to generate comparison data",
                    "details": {"error": str(e)}
                }
            }
        )