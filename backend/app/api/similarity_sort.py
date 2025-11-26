"""
API endpoint for similarity-based feature sorting.
"""

from fastapi import APIRouter, HTTPException, Depends
import logging
from typing import TYPE_CHECKING

from ..models.similarity_sort import (
    SimilaritySortRequest, SimilaritySortResponse,
    PairSimilaritySortRequest, PairSimilaritySortResponse,
    SimilarityHistogramRequest, SimilarityHistogramResponse,
    PairSimilarityHistogramRequest,
    CauseSimilaritySortRequest, CauseSimilaritySortResponse,
    CauseSimilarityHistogramRequest, CauseSimilarityHistogramResponse
)

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


@router.post("/pair-similarity-sort", response_model=PairSimilaritySortResponse)
async def pair_similarity_sort(
    request: PairSimilaritySortRequest,
    service: "SimilaritySortService" = Depends(get_similarity_sort_service)
) -> PairSimilaritySortResponse:
    """
    Sort feature pairs by similarity to selected pairs and dissimilarity to rejected pairs.

    This endpoint extends similarity sorting to pairs of features (main + similar).
    It uses a 19-dimensional vector: 9 metrics (main) + 9 metrics (similar) + 1 pair metric (cosine_similarity).

    Weights are calculated as: 10 dimensions × inverse of (std * 2), normalized to sum = 1.
    - 9 feature metric weights (applied to both main and similar features)
    - 1 pair metric weight (cosine_similarity between features)

    Final score = -avg_distance_to_selected + avg_distance_to_rejected
    (Higher score = more similar to selected, less similar to rejected)

    Args:
        request: Request with selected_pair_keys, rejected_pair_keys, and pair_keys
        service: Injected similarity sort service

    Returns:
        Response with sorted pairs and scores
    """
    try:
        logger.info(
            f"Pair similarity sort request: {len(request.selected_pair_keys)} selected, "
            f"{len(request.rejected_pair_keys)} rejected, "
            f"{len(request.pair_keys)} total pairs"
        )

        # Validate request
        if not request.pair_keys:
            raise HTTPException(
                status_code=400,
                detail="pair_keys cannot be empty"
            )

        if not request.selected_pair_keys and not request.rejected_pair_keys:
            raise HTTPException(
                status_code=400,
                detail="At least one of selected_pair_keys or rejected_pair_keys must be provided"
            )

        # Call service to calculate scores
        response = await service.get_pair_similarity_sorted(request)

        logger.info(f"Pair similarity sort completed: {response.total_pairs} pairs scored")
        return response

    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error in pair similarity sort: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error during pair similarity calculation: {str(e)}"
        )


@router.post("/similarity-score-histogram", response_model=SimilarityHistogramResponse)
async def similarity_score_histogram(
    request: SimilarityHistogramRequest,
    service: "SimilaritySortService" = Depends(get_similarity_sort_service)
) -> SimilarityHistogramResponse:
    """
    Calculate similarity score distribution for automatic tagging (features).

    Returns histogram data showing the distribution of similarity scores across all features.
    Score = -avg_distance_to_selected + avg_distance_to_rejected
    - Positive scores: closer to selected features
    - Negative scores: closer to rejected features
    - Zero: equidistant from both groups

    Args:
        request: Request with selected_ids, rejected_ids, and feature_ids
        service: Injected similarity sort service

    Returns:
        Response with similarity scores and histogram data
    """
    try:
        logger.info(
            f"Similarity histogram request: {len(request.selected_ids)} selected, "
            f"{len(request.rejected_ids)} rejected, "
            f"{len(request.feature_ids)} total features"
        )

        # Validate request
        if not request.feature_ids:
            raise HTTPException(
                status_code=400,
                detail="feature_ids cannot be empty"
            )

        if not request.selected_ids:
            raise HTTPException(
                status_code=400,
                detail="selected_ids cannot be empty (need at least 1 selected)"
            )

        if not request.rejected_ids:
            raise HTTPException(
                status_code=400,
                detail="rejected_ids cannot be empty (need at least 1 rejected)"
            )

        # Call service to calculate histogram
        response = await service.get_similarity_score_histogram(request)

        logger.info(f"Similarity histogram completed: {response.total_items} features")
        return response

    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error in similarity histogram: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error during histogram calculation: {str(e)}"
        )


@router.post("/pair-similarity-score-histogram", response_model=SimilarityHistogramResponse)
async def pair_similarity_score_histogram(
    request: PairSimilarityHistogramRequest,
    service: "SimilaritySortService" = Depends(get_similarity_sort_service)
) -> SimilarityHistogramResponse:
    """
    Calculate similarity score distribution for automatic tagging (pairs).

    Returns histogram data showing the distribution of similarity scores across all feature pairs.
    Score = -avg_distance_to_selected + avg_distance_to_rejected
    - Positive scores: closer to selected pairs
    - Negative scores: closer to rejected pairs
    - Zero: equidistant from both groups

    Args:
        request: Request with selected_pair_keys, rejected_pair_keys, and pair_keys
        service: Injected similarity sort service

    Returns:
        Response with similarity scores and histogram data
    """
    try:
        # Support both simplified (feature_ids + threshold) and legacy (pair_keys) flows
        if request.feature_ids is not None and request.threshold is not None:
            logger.info(
                f"Pair similarity histogram request (SIMPLIFIED): {len(request.selected_pair_keys)} selected, "
                f"{len(request.rejected_pair_keys)} rejected, "
                f"{len(request.feature_ids)} features at threshold {request.threshold}"
            )
        elif request.pair_keys is not None:
            logger.info(
                f"Pair similarity histogram request (LEGACY): {len(request.selected_pair_keys)} selected, "
                f"{len(request.rejected_pair_keys)} rejected, "
                f"{len(request.pair_keys)} total pairs"
            )
        else:
            raise HTTPException(
                status_code=400,
                detail="Must provide either (feature_ids + threshold) or pair_keys"
            )

        # Validate: need at least 1 selected and 1 rejected for SVM training
        if not request.selected_pair_keys:
            raise HTTPException(
                status_code=400,
                detail="selected_pair_keys cannot be empty (need at least 1 selected)"
            )

        if not request.rejected_pair_keys:
            raise HTTPException(
                status_code=400,
                detail="rejected_pair_keys cannot be empty (need at least 1 rejected)"
            )

        # Call service to calculate histogram
        response = await service.get_pair_similarity_score_histogram(request)

        logger.info(f"Pair similarity histogram completed: {response.total_items} pairs")
        return response

    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error in pair similarity histogram: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error during pair histogram calculation: {str(e)}"
        )


@router.post("/cause-similarity-sort", response_model=CauseSimilaritySortResponse)
async def cause_similarity_sort(
    request: CauseSimilaritySortRequest,
    service: "SimilaritySortService" = Depends(get_similarity_sort_service)
) -> CauseSimilaritySortResponse:
    """
    Sort features by per-category confidence using One-vs-Rest SVM.

    This endpoint implements multi-class classification for cause categorization.
    It trains 3 binary SVMs (one per cause category):
    - noisy-activation vs (missed-lexicon + missed-context)
    - missed-lexicon vs (noisy-activation + missed-context)
    - missed-context vs (noisy-activation + missed-lexicon)

    Each SVM outputs a signed distance (confidence score) from its decision boundary:
    - Positive scores: feature is similar to this category
    - Negative scores: feature is dissimilar to this category

    Returns confidence scores for each of the 3 categories per feature.
    Frontend can then sort by the highest confidence or by a specific category.

    Args:
        request: Request with cause_selections (feature_id -> category) and feature_ids
        service: Injected similarity sort service

    Returns:
        Response with per-category confidence scores for each feature
    """
    try:
        logger.info(
            f"Cause similarity sort request: {len(request.cause_selections)} tagged features, "
            f"{len(request.feature_ids)} total features"
        )

        # Validate request
        if not request.feature_ids:
            raise HTTPException(
                status_code=400,
                detail="feature_ids cannot be empty"
            )

        if not request.cause_selections:
            raise HTTPException(
                status_code=400,
                detail="cause_selections cannot be empty (need tagged examples)"
            )

        # Validate: need at least 2 different categories
        categories = set(request.cause_selections.values())
        if len(categories) < 2:
            raise HTTPException(
                status_code=400,
                detail="Need at least 2 different cause categories for meaningful classification"
            )

        # Call service to calculate per-category confidence scores
        response = await service.get_cause_similarity_sorted(request)

        logger.info(f"Cause similarity sort completed: {response.total_features} features scored")
        return response

    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error in cause similarity sort: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error during cause similarity calculation: {str(e)}"
        )


@router.post("/cause-similarity-score-histogram", response_model=CauseSimilarityHistogramResponse)
async def cause_similarity_score_histogram(
    request: CauseSimilarityHistogramRequest,
    service: "SimilaritySortService" = Depends(get_similarity_sort_service)
) -> CauseSimilarityHistogramResponse:
    """
    Calculate per-category confidence score distributions for automatic tagging.

    Returns 3 separate histograms (one per cause category) showing confidence distributions.
    Each histogram shows the signed distance from that category's SVM decision boundary.

    - Positive scores: feature is similar to this category
    - Negative scores: feature is dissimilar to this category
    - Zero: on the decision boundary

    This allows the frontend to set per-category thresholds for automatic tagging.
    For example, "tag as noisy-activation if confidence >= 0.5".

    Args:
        request: Request with cause_selections and feature_ids
        service: Injected similarity sort service

    Returns:
        Response with per-category histograms, statistics, and all scores
    """
    try:
        logger.info(
            f"Cause similarity histogram request: {len(request.cause_selections)} tagged features, "
            f"{len(request.feature_ids)} total features"
        )

        # Validate request
        if not request.feature_ids:
            raise HTTPException(
                status_code=400,
                detail="feature_ids cannot be empty"
            )

        if not request.cause_selections:
            raise HTTPException(
                status_code=400,
                detail="cause_selections cannot be empty (need tagged examples)"
            )

        # Validate: need at least 2 different categories
        categories = set(request.cause_selections.values())
        if len(categories) < 2:
            raise HTTPException(
                status_code=400,
                detail="Need at least 2 different cause categories for histogram"
            )

        # Call service to calculate histogram
        response = await service.get_cause_similarity_score_histogram(request)

        logger.info(f"Cause similarity histogram completed: {response.total_items} features")
        return response

    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error in cause similarity histogram: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error during cause histogram calculation: {str(e)}"
        )
