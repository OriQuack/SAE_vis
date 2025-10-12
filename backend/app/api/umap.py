from fastapi import APIRouter, HTTPException, Depends
import logging
from ..services.visualization_service import DataService
from ..models.requests import UMAPDataRequest
from ..models.responses import UMAPDataResponse
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
    "/umap-data",
    response_model=UMAPDataResponse,
    responses={
        200: {"description": "UMAP data retrieved successfully"},
        400: {"model": ErrorResponse, "description": "Invalid request parameters"},
        500: {"model": ErrorResponse, "description": "Server error"}
    },
    summary="Get UMAP Visualization Data",
    description="Returns UMAP projection points with cluster hierarchy for interactive zoom functionality."
)
async def get_umap_data(
    request: UMAPDataRequest,
    data_service: DataService = Depends(get_data_service)
):
    """
    Get UMAP visualization data with cluster hierarchy.

    This endpoint returns UMAP projection points for features and explanations,
    along with cluster hierarchy information to enable interactive zoom functionality.

    The cluster hierarchy allows the frontend to:
    - Display points at different hierarchical levels
    - Zoom into specific clusters by filtering to child clusters
    - Navigate through cluster hierarchy with breadcrumb navigation

    Args:
        request: UMAP data request with optional filters and type selection
        data_service: Data service dependency

    Returns:
        UMAPDataResponse: Feature points, explanation points, and cluster hierarchy

    Raises:
        HTTPException: For various error conditions including invalid filters,
                      insufficient data, or server errors
    """
    logger.info("📡 === UMAP API REQUEST ===")
    logger.info(f"🔍 Filters: {request.filters}")
    logger.info(f"📊 UMAP Type: {request.umap_type}")
    logger.info(f"🔢 Feature IDs filter: {request.feature_ids}")
    logger.info(f"🔇 Include noise: {request.include_noise}")

    try:
        return await data_service.get_umap_data(
            filters=request.filters,
            umap_type=request.umap_type,
            feature_ids=request.feature_ids,
            include_noise=request.include_noise
        )

    except ValueError as e:
        error_msg = str(e)
        if "No data available" in error_msg:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": {
                        "code": "INSUFFICIENT_DATA",
                        "message": "No UMAP data available after applying filters",
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
        logger.error(f"Error generating UMAP data: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "Failed to generate UMAP data",
                    "details": {"error": str(e)}
                }
            }
        )
