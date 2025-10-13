from fastapi import APIRouter, HTTPException, Depends
import logging
from ..services.visualization_service import DataService
from ..models.requests import HistogramRequest, FilteredHistogramPanelRequest
from ..models.responses import HistogramResponse, FilteredHistogramPanelResponse
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
            node_id=request.nodeId,
            group_by=request.groupBy,
            average_by=request.averageBy,
            fixed_domain=request.fixedDomain,
            selected_llm_explainers=request.selectedLLMExplainers
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

@router.post(
    "/histogram-panel-data-filtered",
    response_model=FilteredHistogramPanelResponse,
    responses={
        200: {"description": "Filtered histogram panel data generated successfully"},
        400: {"model": ErrorResponse, "description": "Invalid request parameters"},
        500: {"model": ErrorResponse, "description": "Server error"}
    },
    summary="Get Filtered Histogram Panel Data",
    description="Returns all histogram panel data filtered by specific feature IDs. Efficiently filters once and generates all 5 metric histograms."
)
async def get_filtered_histogram_panel_data(
    request: FilteredHistogramPanelRequest,
    data_service: DataService = Depends(get_data_service)
):
    """
    Generate all histogram panel data filtered by feature IDs.

    This endpoint efficiently filters the dataset by the provided feature IDs
    and generates histograms for all 5 metrics used in the histogram panel:
    - feature_splitting
    - semsim_mean (averaged by llm_explainer)
    - score_embedding (averaged by llm_scorer)
    - score_fuzz (averaged by llm_scorer)
    - score_detection (averaged by llm_scorer)

    Args:
        request: Filtered histogram panel request containing feature IDs and bin count
        data_service: Data service dependency

    Returns:
        FilteredHistogramPanelResponse: Dictionary of histograms and filtered feature count

    Raises:
        HTTPException: For invalid feature IDs, insufficient data, or server errors
    """
    try:
        histograms = await data_service.get_filtered_histogram_panel_data(
            feature_ids=request.featureIds,
            bins=request.bins,
            selected_llm_explainers=request.selectedLLMExplainers
        )

        return FilteredHistogramPanelResponse(
            histograms=histograms,
            filtered_feature_count=len(request.featureIds)
        )

    except ValueError as e:
        error_msg = str(e)
        if "feature_ids cannot be empty" in error_msg:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": {
                        "code": "INVALID_REQUEST",
                        "message": "Feature IDs list cannot be empty",
                        "details": {}
                    }
                }
            )
        elif "No data available" in error_msg:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": {
                        "code": "INSUFFICIENT_DATA",
                        "message": "No data available for provided feature IDs",
                        "details": {"feature_count": len(request.featureIds)}
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
        logger.error(f"Error generating filtered histogram panel data: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "Failed to generate filtered histogram panel data",
                    "details": {"error": str(e)}
                }
            }
        )