"""
API endpoint for activation examples with token highlighting metadata.
Updated for dual n-gram architecture (character + word patterns).
"""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import Response
from typing import Optional
import logging
import asyncio
from concurrent.futures import ThreadPoolExecutor

from ..services.data_service import DataService
from ..services.activation_cache_service import activation_cache_service
from ..models.activation_examples import ActivationExamplesRequest, ActivationExamplesResponse

# Thread pool for running blocking I/O operations without blocking the event loop
_executor = ThreadPoolExecutor(max_workers=8)

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


@router.post("/activation-examples", response_model=ActivationExamplesResponse)
async def get_activation_examples(
    request: ActivationExamplesRequest,
    service: DataService = Depends(get_data_service)
):
    """
    Fetch activation examples with dual n-gram highlighting metadata.

    Returns for each feature:
    - 8 quantile examples (2 per quantile x 4 quantiles)
    - Token strings (pre-processed)
    - Activation values per token
    - Dual Jaccard scores and n-gram positions
    - Pattern type: Semantic/Lexical/Both/None
    """
    try:
        if not service.is_ready():
            raise HTTPException(status_code=503, detail="Data service not ready")

        logger.info(f"Fetching activation examples for {len(request.feature_ids)} features")

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
        logger.error(f"Error in get_activation_examples: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )


@router.get("/activation-examples-cached")
async def get_all_activation_examples_cached():
    """
    Return ALL activation examples as pre-computed MessagePack + gzip blob.

    Frontend should:
    1. Fetch as arraybuffer
    2. Decompress with pako (gzip)
    3. Decode with msgpack-lite
    """
    if not activation_cache_service.is_ready():
        raise HTTPException(status_code=503, detail="Activation cache not ready")

    blob = activation_cache_service.get_cached_blob()
    if blob is None:
        raise HTTPException(status_code=503, detail="Activation cache is empty")

    stats = activation_cache_service.get_stats()
    logger.info(f"Serving cached activation examples: {stats['feature_count']} features, {stats['cache_size_mb']:.2f} MB")

    return Response(
        content=blob,
        media_type="application/octet-stream",
        headers={
            "X-Feature-Count": str(stats['feature_count']),
            "X-Cache-Size-MB": f"{stats['cache_size_mb']:.2f}",
            "X-Content-Encoding": "gzip+msgpack"
        }
    )
