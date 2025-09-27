from fastapi import APIRouter, HTTPException, Depends
import logging
from ..services.data_service import DataService
from ..models.responses import FilterOptionsResponse
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

@router.get(
    "/filter-options",
    response_model=FilterOptionsResponse,
    responses={
        200: {"description": "Filter options retrieved successfully"},
        500: {"model": ErrorResponse, "description": "Server error"}
    },
    summary="Get Filter Options",
    description="Returns all unique values for each filterable field to populate UI dropdown controls."
)
async def get_filter_options(data_service: DataService = Depends(get_data_service)):
    """
    Get all available filter options for the UI controls.

    This endpoint returns the unique values for each filterable field:
    - sae_id: Available SAE model identifiers
    - explanation_method: Available explanation methods
    - llm_explainer: Available LLM explainer models
    - llm_scorer: Available LLM scorer models

    The response is cached for performance and refreshed periodically.
    """
    try:
        return await data_service.get_filter_options()

    except Exception as e:
        logger.error(f"Error retrieving filter options: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "Failed to retrieve filter options",
                    "details": {"error": str(e)}
                }
            }
        )