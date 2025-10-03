from fastapi import APIRouter
from . import filters, histogram, sankey, comparison, feature, set_visualization

router = APIRouter()

router.include_router(filters.router, tags=["filters"])
router.include_router(histogram.router, tags=["histogram"])
router.include_router(sankey.router, tags=["sankey"])
router.include_router(comparison.router, tags=["comparison"])
router.include_router(feature.router, tags=["feature"])
router.include_router(set_visualization.router, tags=["set_visualization"])