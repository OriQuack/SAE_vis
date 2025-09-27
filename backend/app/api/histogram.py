from fastapi import APIRouter, HTTPException, Depends
import logging
from ..services.data_service import DataService
from ..models.requests import HistogramRequest
from ..models.responses import HistogramResponse
from ..models.common import ErrorResponse

logger = logging.getLogger(__name__)
router = APIRouter()

def get_data_service():
    """Dependency to get data service instance"""
    from ..main import data_service
    if not data_service or not data_service.is_ready():
        raise HTTPException(
            status_code=503,
            detail={
                "error": {
                    "code": "SERVICE_UNAVAILABLE",
                    "message": "Data service is not available",
                    "details": {}
                }
            }
        )
    return data_service

@router.post(
    "/histogram-data",
    response_model=HistogramResponse,
    responses={
        200: {"description": "Histogram data generated successfully"},
        400: {"model": ErrorResponse, "description": "Invalid request parameters"},
        500: {"model": ErrorResponse, "description": "Server error"}
    },
    summary="Get Histogram Data",
    description="Returns histogram data for a specific metric to render distribution visualization with threshold controls."
)
async def get_histogram_data(
    request: HistogramRequest,
    data_service: DataService = Depends(get_data_service)
):
    """
    Generate histogram data for a specific metric.

    This endpoint takes a set of filters and a metric name, then returns
    histogram data including bins, counts, and statistical summary.

    The histogram is used to render distribution visualizations that help
    users set appropriate threshold values for the Sankey diagrams.

    Args:
        request: Histogram request containing filters, metric, and bin count
        data_service: Data service dependency

    Returns:
        HistogramResponse: Histogram data, statistics, and metadata

    Raises:
        HTTPException: For various error conditions including invalid filters,
                      insufficient data, or server errors
    """
    try:
        return await data_service.get_histogram_data(
            filters=request.filters,
            metric=request.metric,
            bins=request.bins,
            threshold_tree=request.thresholdTree,
            node_id=request.nodeId
        )

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
            raise HTTPException(
                status_code=400,
                detail={
                    "error": {
                        "code": "INVALID_REQUEST",
                        "message": error_msg,
                        "details": {}
                    }
                }
            )

    except Exception as e:
        logger.error(f"Error generating histogram data: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "Failed to generate histogram data",
                    "details": {"error": str(e)}
                }
            }
        )