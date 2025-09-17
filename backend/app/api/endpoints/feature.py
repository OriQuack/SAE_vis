from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
import logging
from ...services.data_service import DataService
from ...models.responses import FeatureResponse
from ...models.common import ErrorResponse

logger = logging.getLogger(__name__)
router = APIRouter()

def get_data_service():
    """Dependency to get data service instance"""
    from ...main import data_service
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
    "/feature/{feature_id}",
    response_model=FeatureResponse,
    responses={
        200: {"description": "Feature data retrieved successfully"},
        400: {"model": ErrorResponse, "description": "Invalid query parameters"},
        404: {"model": ErrorResponse, "description": "Feature not found"},
        500: {"model": ErrorResponse, "description": "Server error"}
    },
    summary="Get Feature Data",
    description="Returns detailed information for a specific feature for debugging and drill-down views."
)
async def get_feature_data(
    feature_id: int,
    data_service: DataService = Depends(get_data_service),
    sae_id: Optional[str] = Query(
        None,
        description="Specific SAE context to filter by"
    ),
    explanation_method: Optional[str] = Query(
        None,
        description="Specific explanation method context to filter by"
    ),
    llm_explainer: Optional[str] = Query(
        None,
        description="Specific LLM explainer context to filter by"
    ),
    llm_scorer: Optional[str] = Query(
        None,
        description="Specific LLM scorer context to filter by"
    )
):
    """
    Get detailed information for a specific feature.

    This endpoint retrieves comprehensive information about a single feature,
    including all its scores, metadata, and references to detailed JSON files.
    It's primarily used for debugging and detailed feature analysis.

    When multiple records exist for the same feature_id (due to different
    explanation methods, LLMs, etc.), you can use the optional query parameters
    to specify which specific record you want to retrieve.

    Args:
        feature_id: The unique feature identifier
        sae_id: Optional SAE model identifier filter
        explanation_method: Optional explanation method filter
        llm_explainer: Optional LLM explainer model filter
        llm_scorer: Optional LLM scorer model filter
        data_service: Data service dependency

    Returns:
        FeatureResponse: Detailed feature information

    Raises:
        HTTPException: For feature not found, invalid parameters, or server errors
    """
    try:
        # Validate feature_id
        if feature_id < 0:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": {
                        "code": "INVALID_FEATURE_ID",
                        "message": "Feature ID must be non-negative",
                        "details": {"feature_id": feature_id}
                    }
                }
            )

        # Retrieve feature data
        return await data_service.get_feature_data(
            feature_id=feature_id,
            sae_id=sae_id,
            explanation_method=explanation_method,
            llm_explainer=llm_explainer,
            llm_scorer=llm_scorer
        )

    except ValueError as e:
        error_msg = str(e)
        if "not found" in error_msg.lower():
            # Build context description for error message
            context_parts = []
            if sae_id:
                context_parts.append(f"sae_id='{sae_id}'")
            if explanation_method:
                context_parts.append(f"explanation_method='{explanation_method}'")
            if llm_explainer:
                context_parts.append(f"llm_explainer='{llm_explainer}'")
            if llm_scorer:
                context_parts.append(f"llm_scorer='{llm_scorer}'")

            context_str = " with " + ", ".join(context_parts) if context_parts else ""

            raise HTTPException(
                status_code=404,
                detail={
                    "error": {
                        "code": "FEATURE_NOT_FOUND",
                        "message": f"Feature {feature_id} not found{context_str}",
                        "details": {
                            "feature_id": feature_id,
                            "sae_id": sae_id,
                            "explanation_method": explanation_method,
                            "llm_explainer": llm_explainer,
                            "llm_scorer": llm_scorer
                        }
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
        logger.error(f"Error retrieving feature data: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "Failed to retrieve feature data",
                    "details": {"error": str(e)}
                }
            }
        )