"""API endpoint for filter options."""

from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
import logging

from ..models.filters import FilterOptionsResponse
from ..services.data_service import DataService

logger = logging.getLogger(__name__)
router = APIRouter()

_data_service: Optional[DataService] = None


def set_data_service(service: DataService) -> None:
    """Set the data service instance."""
    global _data_service
    _data_service = service


def get_data_service() -> DataService:
    """Dependency to get the data service instance."""
    if _data_service is None:
        raise HTTPException(status_code=503, detail="DataService not initialized")
    return _data_service


@router.get("/filter-options", response_model=FilterOptionsResponse)
async def get_filter_options(
    service: DataService = Depends(get_data_service)
):
    """
    Get all available filter options for the UI controls.

    Returns the unique values for each filterable field:
    - sae_id: Available SAE model identifiers
    - explanation_method: Available explanation methods
    - llm_explainer: Available LLM explainer models
    - llm_scorer: Available LLM scorer models
    """
    try:
        return await service.get_filter_options()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_filter_options: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve filter options: {str(e)}"
        )
