"""
API endpoint for similarity-based feature sorting.
"""

from fastapi import APIRouter, HTTPException, Depends
import logging
from typing import TYPE_CHECKING

from ..models.similarity_sort import SimilaritySortRequest, SimilaritySortResponse

if TYPE_CHECKING:
    from ..services.similarity_sort_service import SimilaritySortService

logger = logging.getLogger(__name__)

router = APIRouter()

# Service instance will be injected
_similarity_sort_service: "SimilaritySortService" = None


def set_similarity_sort_service(service: "SimilaritySortService"):
    """Set the similarity sort service instance."""
    global _similarity_sort_service
    _similarity_sort_service = service


def get_similarity_sort_service() -> "SimilaritySortService":
    """Dependency to get similarity sort service."""
    if _similarity_sort_service is None:
        raise HTTPException(
            status_code=500,
            detail="Similarity sort service not initialized"
        )
    return _similarity_sort_service


@router.post("/similarity-sort", response_model=SimilaritySortResponse)
async def similarity_sort(
    request: SimilaritySortRequest,
    service: "SimilaritySortService" = Depends(get_similarity_sort_service)
) -> SimilaritySortResponse:
    """
    Sort features by similarity to selected features and dissimilarity to rejected features.

    This endpoint calculates weighted Euclidean distance across 9 metrics:
    1. decoder_similarity_count - Count of similar features
    2. intra_ngram_jaccard - Max of char and word ngram jaccard
    3. intra_semantic_sim - Semantic similarity from activation examples
    4. inter_ngram_jaccard - Inter-feature ngram jaccard
    5. inter_semantic_sim - Inter-feature semantic similarity
    6. embed_score - Embedding alignment score
    7. fuzz_score - Fuzzing robustness score
    8. detection_score - Detection utility score
    9. llm_explainer_semantic_sim - LLM explainer semantic similarity

    Weights are calculated as inverse of (std * 2), normalized to sum = 1.

    Final score = avg_distance_to_selected - avg_distance_to_rejected
    (Higher score = more similar to selected, less similar to rejected)

    Args:
        request: Request with selected_ids, rejected_ids, and feature_ids
        service: Injected similarity sort service

    Returns:
        Response with sorted features and scores
    """
    try:
        logger.info(
            f"Similarity sort request: {len(request.selected_ids)} selected, "
            f"{len(request.rejected_ids)} rejected, "
            f"{len(request.feature_ids)} total features"
        )

        # Validate request
        if not request.feature_ids:
            raise HTTPException(
                status_code=400,
                detail="feature_ids cannot be empty"
            )

        if not request.selected_ids and not request.rejected_ids:
            raise HTTPException(
                status_code=400,
                detail="At least one of selected_ids or rejected_ids must be provided"
            )

        # Call service to calculate scores
        response = await service.get_similarity_sorted_features(request)

        logger.info(f"Similarity sort completed: {response.total_features} features scored")
        return response

    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error in similarity sort: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error during similarity calculation: {str(e)}"
        )
