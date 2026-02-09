"""
Table data endpoint for LLM scoring visualization.

Provides feature-level score data (824 rows, one per feature) for table visualization.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
import logging

from ..models.table import TableDataRequest, FeatureTableDataResponse
from ..services.table_data_service import TableDataService

logger = logging.getLogger(__name__)
router = APIRouter()

_table_service: Optional[TableDataService] = None


def set_table_service(service: TableDataService) -> None:
    """Set the table service instance."""
    global _table_service
    _table_service = service


def get_table_service() -> TableDataService:
    """Dependency to get the table service instance."""
    if _table_service is None:
        raise HTTPException(status_code=503, detail="TableDataService not initialized")
    return _table_service


@router.post("/table-data", response_model=FeatureTableDataResponse)
async def get_table_data(
    request: TableDataRequest,
    service: TableDataService = Depends(get_table_service)
) -> FeatureTableDataResponse:
    """
    Get feature-level score data for table visualization.

    Returns 824 rows (one per feature) with scores organized by explainer.
    Each explainer has: embedding (1 value) + fuzz (3 scorers) + detection (3 scorers).
    Includes highlighted explanations showing alignment across LLM explainers.
    """
    try:
        return await service.get_table_data(request.filters)

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error in get_table_data: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )
