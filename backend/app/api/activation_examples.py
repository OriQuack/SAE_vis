"""
API endpoint for activation examples with token highlighting metadata.
Updated for dual n-gram architecture (character + word patterns).
"""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import Response
from pydantic import BaseModel
from typing import List
import logging
import asyncio
from concurrent.futures import ThreadPoolExecutor

from ..services.data_service import DataService
from ..services.activation_cache_service import activation_cache_service
from ..models.responses import ActivationExamplesResponse

# Thread pool for running blocking I/O operations without blocking the event loop
# This enables true parallel processing of multiple activation example requests
_executor = ThreadPoolExecutor(max_workers=8)

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


@router.post("/activation-examples", response_model=ActivationExamplesResponse)
async def get_activation_examples(
    request: ActivationExamplesRequest,
    service: DataService = Depends(get_data_service)
):
    """
    Fetch activation examples with dual n-gram highlighting metadata.

    This endpoint provides token-level activation data for visualizing
    which tokens activate a feature, with dual n-gram pattern analysis:
    - Character-level n-grams (morphology): suffixes, prefixes with char_offset
    - Word-level n-grams (semantics): reconstructed words and phrases

    Returns for each feature:
    - 8 quantile examples (2 per quantile × 4 quantiles)
    - Token strings (pre-processed, '▁' prefix removed)
    - Activation values per token
    - Dual Jaccard scores: char_ngram_max_jaccard, word_ngram_max_jaccard
    - Top n-gram text: top_char_ngram_text, top_word_ngram_text
    - N-gram positions: char_ngram_positions (with char_offset), word_ngram_positions
    - Pattern type: Semantic/Lexical/Both/None

    Performance:
    - Batch fetching: Load all needed features in one query (~20ms)
    - Pre-processed data: Uses activation_display.parquet (5-10 MB)
    - Optimized: 250x faster than legacy path

    Args:
        request: Contains list of feature IDs to fetch
        service: Injected DataService instance

    Returns:
        ActivationExamplesResponse with dual n-gram examples per feature

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

        # Run blocking I/O in thread pool to enable parallel request handling
        # This allows multiple activation example requests to be processed concurrently
        loop = asyncio.get_event_loop()
        examples = await loop.run_in_executor(
            _executor,
            service.get_activation_examples,
            request.feature_ids
        )

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


@router.get("/activation-examples-cached")
async def get_all_activation_examples_cached():
    """
    Return ALL activation examples as pre-computed MessagePack + gzip blob.

    This endpoint returns pre-serialized binary data for maximum performance:
    - Pre-computed at startup (no serialization delay)
    - MessagePack format (smaller than JSON)
    - Gzip compressed (70-80% size reduction)

    Frontend should:
    1. Fetch as arraybuffer
    2. Decompress with pako (gzip)
    3. Decode with msgpack-lite

    Returns:
        Binary response (application/x-msgpack with Content-Encoding: gzip)

    Raises:
        HTTPException 503: If cache not ready
    """
    if not activation_cache_service.is_ready():
        raise HTTPException(
            status_code=503,
            detail="Activation cache not ready"
        )

    blob = activation_cache_service.get_cached_blob()
    if blob is None:
        raise HTTPException(
            status_code=503,
            detail="Activation cache is empty"
        )

    stats = activation_cache_service.get_stats()
    logger.info(f"Serving cached activation examples: {stats['feature_count']} features, {stats['cache_size_mb']:.2f} MB")

    # Note: Do NOT set Content-Encoding: gzip - that would cause browser to auto-decompress
    # Frontend will manually decompress with pako
    return Response(
        content=blob,
        media_type="application/octet-stream",
        headers={
            "X-Feature-Count": str(stats['feature_count']),
            "X-Cache-Size-MB": f"{stats['cache_size_mb']:.2f}",
            "X-Content-Encoding": "gzip+msgpack"  # Custom header for documentation
        }
    )
