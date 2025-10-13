from fastapi import APIRouter
from . import filters, histogram, sankey, comparison, feature, threshold_features, llm_comparison, umap, table

router = APIRouter()

router.include_router(filters.router, tags=["filters"])
router.include_router(histogram.router, tags=["histogram"])
router.include_router(sankey.router, tags=["sankey"])
router.include_router(comparison.router, tags=["comparison"])
router.include_router(feature.router, tags=["feature"])
router.include_router(threshold_features.router, tags=["threshold"])
router.include_router(llm_comparison.router, tags=["llm-comparison"])
router.include_router(umap.router, tags=["umap"])
router.include_router(table.router, tags=["table"])