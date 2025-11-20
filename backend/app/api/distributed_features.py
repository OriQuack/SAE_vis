"""
API endpoint for distributed feature selection.
"""

from fastapi import APIRouter, HTTPException, Depends
import logging
from typing import TYPE_CHECKING

from ..models.requests import DistributedFeaturesRequest
from ..models.responses import DistributedFeaturesResponse

if TYPE_CHECKING:
    from ..services.feature_cluster_service import FeatureClusterService

logger = logging.getLogger(__name__)

router = APIRouter()

# Service instance will be injected
_distributed_features_service: "FeatureClusterService" = None


def set_distributed_features_service(service: "FeatureClusterService"):
    """Set the distributed features service instance."""
    global _distributed_features_service
    _distributed_features_service = service


def get_distributed_features_service() -> "FeatureClusterService":
    """Dependency to get distributed features service."""
    if _distributed_features_service is None:
        raise HTTPException(
            status_code=500,
            detail="Distributed features service not initialized"
        )
    return _distributed_features_service


@router.post("/distributed-features", response_model=DistributedFeaturesResponse)
async def distributed_features(
    request: DistributedFeaturesRequest,
    service: "FeatureClusterService" = Depends(get_distributed_features_service)
) -> DistributedFeaturesResponse:
    """
    Select n evenly distributed features from the input list.

    Uses K-Means clustering in the same 9-dimensional metric space as
    similarity sorting to ensure even distribution across:
    1. decoder_similarity_count - Count of similar features
    2. intra_ngram_jaccard - Max of char and word ngram jaccard
    3. intra_semantic_sim - Semantic similarity from activation examples
    4. inter_ngram_jaccard - Inter-feature ngram jaccard
    5. inter_semantic_sim - Inter-feature semantic similarity
    6. embed_score - Embedding alignment score
    7. fuzz_score - Fuzzing robustness score
    8. detection_score - Detection utility score
    9. llm_explainer_semantic_sim - LLM explainer semantic similarity

    For each cluster, selects the feature closest to the cluster centroid.

    Args:
        request: Request with feature_ids (list to sample from) and n (number to select)
        service: Injected distributed features service

    Returns:
        Response with selected_features list, total_available count, method_used
    """
    try:
        logger.info(
            f"Distributed features request: n={request.n}, "
            f"{len(request.feature_ids)} total features, "
            f"method={request.method}"
        )

        result = await service.get_distributed_features(
            feature_ids=request.feature_ids,
            n=request.n,
            method=request.method
        )

        logger.info(
            f"Distributed features response: {len(result['selected_features'])} features selected"
        )

        return DistributedFeaturesResponse(**result)

    except ValueError as e:
        logger.error(f"Validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error in distributed features endpoint: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )
