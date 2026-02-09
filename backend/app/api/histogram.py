"""API endpoint for histogram data."""

from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
import logging

from ..models.histogram import HistogramRequest, HistogramResponse
from ..services.histogram_service import HistogramService

logger = logging.getLogger(__name__)
router = APIRouter()

_histogram_service: Optional[HistogramService] = None


def set_histogram_service(service: HistogramService) -> None:
    """Set the histogram service instance."""
    global _histogram_service
    _histogram_service = service


def get_histogram_service() -> HistogramService:
    """Dependency to get the histogram service instance."""
    if _histogram_service is None:
        raise HTTPException(status_code=503, detail="HistogramService not initialized")
    return _histogram_service


@router.post("/histogram-data", response_model=HistogramResponse)
async def get_histogram_data(
    request: HistogramRequest,
    service: HistogramService = Depends(get_histogram_service)
):
    """
    Generate histogram data for a specific metric.

    Takes filters and a metric name, returns histogram data including
    bins, counts, and statistical summary for distribution visualization.
    """
    try:
        threshold_path = None
        if request.thresholdPath:
            threshold_path = [
                {"metric": constraint.metric, "rangeLabel": constraint.range_label}
                for constraint in request.thresholdPath
            ]

        return await service.get_histogram_data(
            filters=request.filters,
            metric=request.metric,
            bins=request.bins,
            node_id=request.nodeId,
            fixed_domain=request.fixedDomain,
            threshold_path=threshold_path
        )

    except HTTPException:
        raise
    except ValueError as e:
        error_msg = str(e)
        if "No data available" in error_msg:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": {
                        "code": "INSUFFICIENT_DATA",
                        "message": "No data available after applying filters",
                        "details": {"filters": request.filters.dict(exclude_none=True)}
                    }
                }
            )
        elif "No valid values" in error_msg:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": {
                        "code": "INVALID_METRIC_DATA",
                        "message": f"No valid values found for metric '{request.metric.value}'",
                        "details": {"metric": request.metric.value}
                    }
                }
            )
        else:
            raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error in get_histogram_data: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate histogram data: {str(e)}"
        )
