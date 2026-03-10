"""
Consensus API endpoint for feature explanation consensus data.

Returns clustered phrases with activation similarity ranking.
Supports both single-feature and bulk (all features) modes.
"""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from typing import Optional
import logging

from ..models.consensus import FeatureConsensusRequest, FeatureConsensusResponse
from ..services.consensus_service import ConsensusService

logger = logging.getLogger(__name__)
router = APIRouter()

_consensus_service: Optional[ConsensusService] = None


def set_consensus_service(service: ConsensusService) -> None:
    """Set the consensus service instance."""
    global _consensus_service
    _consensus_service = service


def get_consensus_service() -> ConsensusService:
    """Dependency to get the consensus service instance."""
    if _consensus_service is None:
        raise HTTPException(status_code=503, detail="ConsensusService not initialized")
    return _consensus_service


@router.post("/feature-consensus")
async def get_feature_consensus(
    request: FeatureConsensusRequest,
    service: ConsensusService = Depends(get_consensus_service)
):
    """Get consensus data for a specific feature or all features.

    - If feature_id is provided: returns single FeatureConsensusResponse
    - If feature_id is omitted: returns dict of {feature_id: consensus_data} for all features
    """
    try:
        if not service.is_ready:
            raise HTTPException(status_code=503, detail="Consensus service not available")

        if request.feature_id is not None:
            # Single feature mode
            result = service.get_feature_consensus(request.feature_id)
            if result is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"Feature {request.feature_id} not found in consensus data"
                )
            return FeatureConsensusResponse(**result)
        else:
            # Bulk mode: return all features
            all_data = service.get_all_consensus()
            return JSONResponse(content=all_data)

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error in get_feature_consensus: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )
