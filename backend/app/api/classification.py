"""
API endpoints for SVM-based classification (binary + multi-class).

Endpoints:
- POST /similarity-sort           (binary, Stage 2)
- POST /pair-similarity-sort      (binary, Stage 1)
- POST /similarity-score-histogram (binary, Stage 2)
- POST /pair-similarity-score-histogram (binary, Stage 1)
- POST /stage3-quality-scores     (binary, Stage 2→3 bridge)
- POST /cause-classification      (multi-class, Stage 3)
"""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from typing import Optional
import logging

from ..models.classification import (
    SimilaritySortRequest, SimilaritySortResponse,
    PairSimilaritySortRequest, PairSimilaritySortResponse,
    SimilarityHistogramRequest, SimilarityHistogramResponse,
    PairSimilarityHistogramRequest,
    Stage3QualityScoresRequest,
    CauseClassificationRequest,
)
from ..services.classification_service import ClassificationService
from ..services.pair_similarity_service import PairSimilarityService

logger = logging.getLogger(__name__)
router = APIRouter()

_classification_service: Optional[ClassificationService] = None
_pair_similarity_service: Optional[PairSimilarityService] = None


def set_classification_service(service: ClassificationService) -> None:
    """Set the classification service instance."""
    global _classification_service
    _classification_service = service


def set_pair_similarity_service(service: PairSimilarityService) -> None:
    """Set the pair similarity service instance."""
    global _pair_similarity_service
    _pair_similarity_service = service


def get_classification_service() -> ClassificationService:
    """Dependency to get classification service."""
    if _classification_service is None:
        raise HTTPException(status_code=503, detail="ClassificationService not initialized")
    return _classification_service


def get_pair_similarity_service() -> PairSimilarityService:
    """Dependency to get pair similarity service."""
    if _pair_similarity_service is None:
        raise HTTPException(status_code=503, detail="PairSimilarityService not initialized")
    return _pair_similarity_service


@router.post("/similarity-sort", response_model=SimilaritySortResponse)
async def similarity_sort(
    request: SimilaritySortRequest,
    service: ClassificationService = Depends(get_classification_service)
) -> SimilaritySortResponse:
    """
    Sort features by SVM-based similarity scoring.

    Trains an SVM classifier on selected (positive) vs rejected (negative) features,
    then scores all features by signed distance from decision boundary.

    Uses 5 metrics (same as Stage 3 Cause classification for uniformity):
    1. intra_feature_sim - Composite activation consistency: max(char_ngram, word_ngram, semantic)
    2. score_embedding - Embedding-based scoring
    3. score_fuzz - Fuzzy matching score
    4. score_detection - Detection score
    5. explanation_semantic_sim - Semantic similarity between LLM explanations

    Final score = signed distance from SVM decision boundary
    (Positive = more similar to selected, Negative = more similar to rejected)

    Args:
        request: Request with selected_ids, rejected_ids, and feature_ids
        service: Injected classification service

    Returns:
        Response with sorted features and scores
    """
    try:
        logger.info(
            f"Similarity sort request: {len(request.selected_items)} selected, "
            f"{len(request.rejected_items)} rejected, "
            f"{len(request.feature_ids)} total features"
        )

        # Validate request
        if not request.feature_ids:
            raise HTTPException(
                status_code=400,
                detail="feature_ids cannot be empty"
            )

        if not request.selected_items and not request.rejected_items:
            raise HTTPException(
                status_code=400,
                detail="At least one of selected_items or rejected_items must be provided"
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
    service: PairSimilarityService = Depends(get_pair_similarity_service)
) -> PairSimilaritySortResponse:
    """
    Sort feature pairs by similarity to selected pairs and dissimilarity to rejected pairs.

    This endpoint extends similarity sorting to pairs of features (main + similar).
    It uses a 19-dimensional vector: 9 metrics (main) + 9 metrics (similar) + 1 pair metric (cosine_similarity).

    Weights are calculated as: 10 dimensions x inverse of (std * 2), normalized to sum = 1.
    - 9 feature metric weights (applied to both main and similar features)
    - 1 pair metric weight (cosine_similarity between features)

    Final score = -avg_distance_to_selected + avg_distance_to_rejected
    (Higher score = more similar to selected, less similar to rejected)

    Args:
        request: Request with selected_pair_keys, rejected_pair_keys, and pair_keys
        service: Injected pair similarity service

    Returns:
        Response with sorted pairs and scores
    """
    try:
        logger.info(
            f"Pair similarity sort request: {len(request.selected_items)} selected, "
            f"{len(request.rejected_items)} rejected, "
            f"{len(request.pair_keys)} total pairs"
        )

        # Validate request
        if not request.pair_keys:
            raise HTTPException(
                status_code=400,
                detail="pair_keys cannot be empty"
            )

        if not request.selected_items and not request.rejected_items:
            raise HTTPException(
                status_code=400,
                detail="At least one of selected_items or rejected_items must be provided"
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
    service: ClassificationService = Depends(get_classification_service)
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
        service: Injected classification service

    Returns:
        Response with similarity scores and histogram data
    """
    try:
        logger.info(
            f"Similarity histogram request: {len(request.selected_items)} selected, "
            f"{len(request.rejected_items)} rejected, "
            f"{len(request.feature_ids)} total features"
        )

        # Validate request
        if not request.feature_ids:
            raise HTTPException(
                status_code=400,
                detail="feature_ids cannot be empty"
            )

        if not request.selected_items:
            raise HTTPException(
                status_code=400,
                detail="selected_items cannot be empty (need at least 1 selected)"
            )

        if not request.rejected_items:
            raise HTTPException(
                status_code=400,
                detail="rejected_items cannot be empty (need at least 1 rejected)"
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
    service: PairSimilarityService = Depends(get_pair_similarity_service)
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
        service: Injected pair similarity service

    Returns:
        Response with similarity scores and histogram data
    """
    try:
        # Support both simplified (feature_ids + threshold) and legacy (pair_keys) flows
        if request.feature_ids is not None and request.threshold is not None:
            logger.info(
                f"Pair similarity histogram request (SIMPLIFIED): {len(request.selected_items)} selected, "
                f"{len(request.rejected_items)} rejected, "
                f"{len(request.feature_ids)} features at threshold {request.threshold}"
            )
        elif request.pair_keys is not None:
            logger.info(
                f"Pair similarity histogram request (LEGACY): {len(request.selected_items)} selected, "
                f"{len(request.rejected_items)} rejected, "
                f"{len(request.pair_keys)} total pairs"
            )
        else:
            raise HTTPException(
                status_code=400,
                detail="Must provide either (feature_ids + threshold) or pair_keys"
            )

        # Validate: need at least 1 selected and 1 rejected for SVM training
        if not request.selected_items:
            raise HTTPException(
                status_code=400,
                detail="selected_items cannot be empty (need at least 1 selected)"
            )

        if not request.rejected_items:
            raise HTTPException(
                status_code=400,
                detail="rejected_items cannot be empty (need at least 1 rejected)"
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


@router.post("/stage3-quality-scores", response_model=SimilarityHistogramResponse)
async def stage3_quality_scores(
    request: Stage3QualityScoresRequest,
    service: ClassificationService = Depends(get_classification_service)
) -> SimilarityHistogramResponse:
    """
    Calculate quality scores for Stage 3 features using Stage 2's SVM model.

    This endpoint trains an SVM on Stage 2's final selections:
    - Well-Explained features = positive class (selected)
    - Need Revision features = negative class (rejected)

    Then scores the specified feature_ids (typically the Need Revision set)
    to determine their proximity to the Well-Explained decision boundary.

    Features with higher scores are closer to the Well-Explained class,
    indicating they may have been borderline cases suitable for reconsideration.

    Args:
        request: Request with well_explained_ids, need_revision_ids, and feature_ids
        service: Injected classification service

    Returns:
        Response with scores and histogram data
    """
    try:
        logger.info(
            f"Stage 3 quality scores request: well_explained={len(request.well_explained_items)}, "
            f"need_revision={len(request.need_revision_items)}, "
            f"to_score={len(request.feature_ids)}"
        )

        # Validate request
        if not request.feature_ids:
            raise HTTPException(
                status_code=400,
                detail="feature_ids cannot be empty"
            )

        if not request.well_explained_items:
            raise HTTPException(
                status_code=400,
                detail="well_explained_items cannot be empty (need at least 1 for SVM training)"
            )

        if not request.need_revision_items:
            raise HTTPException(
                status_code=400,
                detail="need_revision_items cannot be empty (need at least 1 for SVM training)"
            )

        # Call service to calculate scores and histogram
        response = await service.get_stage3_quality_scores(request)

        logger.info(f"Stage 3 quality scores completed: {response.total_items} features scored")
        return response

    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error in Stage 3 quality scores: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error during Stage 3 quality score calculation: {str(e)}"
        )


@router.post("/cause-classification")
async def cause_classification(
    request: CauseClassificationRequest,
    service: ClassificationService = Depends(get_classification_service)
):
    """
    Classify features into cause categories using OvR SVMs.

    Trains One-vs-Rest SVMs for each category using mean metric vectors
    per feature (averaged across 3 explainers). Returns predicted category
    and decision scores for each feature.

    Requires at least one manually tagged feature per category.

    Args:
        request: Request with feature_ids and cause_selections
        service: Injected classification service

    Returns:
        Response with predicted category and decision scores for each feature
    """
    try:
        logger.info(
            f"Cause classification request: {len(request.feature_ids)} features, "
            f"{len(request.cause_selections)} manual tags"
        )

        # Call service — returns plain dict (bypasses Pydantic for speed)
        result_dict = await service.get_cause_classification(request)

        logger.info(
            f"Cause classification completed: {result_dict['total_features']} features, "
            f"counts: {result_dict['category_counts']}"
        )
        return JSONResponse(content=result_dict)

    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error in cause classification: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error during cause classification: {str(e)}"
        )
