"""
API endpoint for activation examples with token highlighting metadata.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Any
import logging

from ..services.data_service import DataService

logger = logging.getLogger(__name__)

router = APIRouter()

# Dependency to get data service instance
def get_data_service() -> DataService:
    """Get the global data service instance."""
    from ..main import data_service
    return data_service


class ActivationExamplesRequest(BaseModel):
    """Request model for fetching activation examples."""
    feature_ids: List[int]  # Batch request for multiple features


class ActivationExamplesResponse(BaseModel):
    """
    Response model for activation examples.

    Returns for each feature:
    - 4 quantile examples (Q1, Q2, Q3, Q4)
    - Token strings and activation values
    - Max activation position per example
    - Semantic and Jaccard similarity scores
    - Pattern type (None/Semantic/Lexical)
    """
    examples: Dict[int, Dict[str, Any]]  # feature_id → activation data


@router.post("/activation-examples", response_model=ActivationExamplesResponse)
async def get_activation_examples(
    request: ActivationExamplesRequest,
    service: DataService = Depends(get_data_service)
):
    """
    Fetch activation examples with highlighting metadata.

    This endpoint provides token-level activation data for visualizing
    which tokens activate a feature, with similarity-based pattern categorization.

    Performance:
    - Batch fetching: Load all needed prompt_ids in one query (10-100x faster)
    - Lazy evaluation: Only materialized when feature selected
    - Small data: 2.2 MB similarity file + subset of 257 MB examples file

    Args:
        request: Contains list of feature IDs to fetch
        service: Injected DataService instance

    Returns:
        ActivationExamplesResponse with examples per feature

    Raises:
        HTTPException: If data service not ready or error occurs
    """
    try:
        if not service.is_ready():
            raise HTTPException(
                status_code=503,
                detail="Data service not ready"
            )

        logger.info(f"Fetching activation examples for {len(request.feature_ids)} features")

        # Fetch activation examples using batch method
        examples = service.get_activation_examples(request.feature_ids)

        logger.info(f"Successfully fetched activation examples for {len(examples)} features")

        return ActivationExamplesResponse(examples=examples)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_activation_examples endpoint: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )
