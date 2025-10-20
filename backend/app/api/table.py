"""
Table data endpoint for LLM scoring visualization.

Provides feature-level score data (824 rows, one per feature) for table visualization.
"""

from fastapi import APIRouter, Depends, HTTPException

from typing import Optional

from app.models.requests import TableDataRequest
from app.models.responses import FeatureTableDataResponse
from app.services.visualization_service import DataService
from app.services.table_data_service import TableDataService
from app.services.alignment_service import AlignmentService

router = APIRouter()


def get_data_service() -> DataService:
    """Dependency to get the data service instance."""
    from app.main import data_service
    if not data_service:
        raise HTTPException(status_code=503, detail="Data service not initialized")
    return data_service


def get_alignment_service() -> Optional[AlignmentService]:
    """Dependency to get the alignment service instance."""
    from app.main import alignment_service
    return alignment_service  # Can be None if initialization failed


@router.post("/table-data", response_model=FeatureTableDataResponse)
async def get_table_data(
    request: TableDataRequest,
    data_service: DataService = Depends(get_data_service),
    alignment_service: Optional[AlignmentService] = Depends(get_alignment_service)
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
        data_service: Injected DataService instance
        alignment_service: Injected AlignmentService instance (optional)

    Returns:
        FeatureTableDataResponse with features and metadata

    Raises:
        HTTPException: 400 for invalid filters, 500 for server errors
    """
    try:
        # Create table service instance with alignment service
        table_service = TableDataService(data_service, alignment_service)

        # Delegate to service layer
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
