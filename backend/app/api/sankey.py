from fastapi import APIRouter, HTTPException, Depends
import logging
from ..services.data_service import DataService
from ..models.requests import SankeyRequest
from ..models.responses import SankeyResponse
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
    "/sankey-data",
    response_model=SankeyResponse,
    responses={
        200: {"description": "Sankey data generated successfully"},
        400: {"model": ErrorResponse, "description": "Invalid request parameters"},
        500: {"model": ErrorResponse, "description": "Server error"}
    },
    summary="Get Sankey Diagram Data (v2 only)",
    description="Returns structured nodes and links data for rendering a Sankey diagram using the v2 threshold system only."
)
async def get_sankey_data(
    request: SankeyRequest,
    data_service: DataService = Depends(get_data_service)
):
    """
    Generate Sankey diagram data using the v2 threshold system only.

    This endpoint generates visualization data using the new flexible threshold
    system (v2) exclusively. It takes a complete configuration including filters
    and threshold structure, then returns structured nodes and links for
    rendering interactive Sankey diagrams.

    The Sankey diagram shows feature flow through multiple stages (not necessarily in this order):
    1. **Stage 0**: Root (all features)
    2. **Stage 1**: Feature splitting (true/false)
    3. **Stage 2**: Semantic distance (high/low based on threshold)
    4. **Stage 3**: Score agreement (n groups based on score thresholds)

    Args:
        request: Sankey request containing filters and v2 threshold structure
        data_service: Data service dependency

    Returns:
        SankeyResponse: Nodes, links, and metadata for the Sankey diagram

    Raises:
        HTTPException: For various error conditions including invalid filters,
                      invalid thresholds, insufficient data, or server errors
    """
    logger.info("📡 === SANKEY API REQUEST (v2 only) ===")
    logger.info(f"🔍 Filters: {request.filters}")
    logger.info(f"🌳 Threshold tree v2: {request.thresholdTree}")
    logger.info(f"📄 Version: {request.version}")

    try:
        # Use only v2 threshold system
        return await data_service.get_sankey_data(
            filters=request.filters,
            threshold_data=request.thresholdTree,
            use_v2=True
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
        logger.error(f"Error generating Sankey data: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "Failed to generate Sankey data",
                    "details": {"error": str(e)}
                }
            }
        )