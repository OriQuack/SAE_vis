"""
API endpoint for cold-start suggestions.

Provides diverse sample suggestions to bootstrap SVM-based tagging
when users haven't tagged enough items yet.
"""

from fastapi import APIRouter, HTTPException, Depends
import logging
from typing import TYPE_CHECKING

from ..models.cold_start import (
    ColdStartSuggestionRequest,
    ColdStartSuggestionsResponse
)

if TYPE_CHECKING:
    from ..services.cold_start_service import ColdStartService

logger = logging.getLogger(__name__)

router = APIRouter()

# Service instance will be injected
_cold_start_service: "ColdStartService" = None


def set_cold_start_service(service: "ColdStartService"):
    """Set the cold-start service instance."""
    global _cold_start_service
    _cold_start_service = service


def get_cold_start_service() -> "ColdStartService":
    """Dependency to get cold-start service."""
    if _cold_start_service is None:
        raise HTTPException(
            status_code=500,
            detail="Cold-start service not initialized"
        )
    return _cold_start_service


@router.post("/cold-start-suggestions", response_model=ColdStartSuggestionsResponse)
async def cold_start_suggestions(
    request: ColdStartSuggestionRequest,
    service: "ColdStartService" = Depends(get_cold_start_service)
) -> ColdStartSuggestionsResponse:
    """
    Get diverse suggestions for cold-start tagging.

    Uses k-medoids clustering to select representative items from the metric space.
    Returns suggestions that maximize diversity for effective SVM training.

    For Stage 1 (pair mode):
        - Clusters pairs in 11D space (5 sum + 5 diff + 1 decoder_sim)
        - Requires threshold parameter for pair generation

    For Stage 2 (feature mode):
        - Clusters features in 6D metric space
        - Same metrics as SVM similarity scoring

    Args:
        request: Request with mode, feature_ids, num_suggestions, and optional threshold
        service: Injected cold-start service

    Returns:
        List of diverse suggestions with cluster information
    """
    try:
        logger.info(
            f"Cold-start suggestions request: mode={request.mode}, "
            f"features={len(request.feature_ids)}, suggestions={request.num_suggestions}"
        )

        # Validate pair mode requirements
        if request.mode == 'pair' and request.threshold is None:
            raise HTTPException(
                status_code=400,
                detail="threshold is required for pair mode"
            )

        response = await service.get_suggestions(request)

        logger.info(
            f"Cold-start suggestions completed: {response.total_suggestions} suggestions, "
            f"cache_hit={response.cache_hit}"
        )
        return response

    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error in cold-start suggestions: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error in cold-start suggestions: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )
