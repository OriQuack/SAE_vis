from fastapi import APIRouter
from .endpoints import filters, histogram, sankey, comparison, feature

router = APIRouter()

router.include_router(filters.router, tags=["filters"])
router.include_router(histogram.router, tags=["histogram"])
router.include_router(sankey.router, tags=["sankey"])
router.include_router(comparison.router, tags=["comparison"])
router.include_router(feature.router, tags=["feature"])