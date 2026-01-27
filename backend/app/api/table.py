"""
Table data endpoint for LLM scoring visualization.

Provides feature-level score data (824 rows, one per feature) for table visualization.
"""

from fastapi import APIRouter, Depends, HTTPException

from typing import Optional

from app.models.requests import TableDataRequest
from app.models.responses import FeatureTableDataResponse
from app.services.table_data_service import TableDataService

router = APIRouter()

# Module-level singleton for TableDataService (set at startup)
_table_service: Optional[TableDataService] = None


def set_table_service(service: TableDataService) -> None:
    """Set the table service instance (called at startup)."""
    global _table_service
    _table_service = service


def get_table_service() -> TableDataService:
    """Dependency to get the table service instance."""
    if not _table_service:
        raise HTTPException(status_code=503, detail="Table service not initialized")
    return _table_service


@router.post("/table-data", response_model=FeatureTableDataResponse)
async def get_table_data(
    request: TableDataRequest,
    table_service: TableDataService = Depends(get_table_service)
) -> FeatureTableDataResponse:
    """
    Get feature-level score data for table visualization.

    Returns 824 rows (one per feature) with scores organized by explainer.
    Each explainer has: embedding (1 value) + fuzz (3 scorers) + detection (3 scorers).
    Includes highlighted explanations showing alignment across LLM explainers.

    Process:
    1. Applies filters to master parquet
    2. Computes global statistics for normalization
    3. Calculates consistency scores (scorer, metric, explainer, cross-explainer)
    4. Fetches highlighted explanations from alignment service
    5. Builds response with aggregated scores

    Args:
        request: TableDataRequest with filters
        table_service: Injected TableDataService singleton

    Returns:
        FeatureTableDataResponse with features and metadata

    Raises:
        HTTPException: 400 for invalid filters, 500 for server errors
    """
    try:
        # Delegate to singleton service (no per-request instantiation)
        return await table_service.get_table_data(request.filters)

    except ValueError as e:
        # Invalid filter or data errors
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Unexpected server errors
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch table data: {str(e)}"
        )
