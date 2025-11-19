from fastapi import APIRouter
from . import filters, histogram, comparison, llm_comparison, table, feature_groups, activation_examples, similarity_sort, distributed_features

router = APIRouter()

router.include_router(filters.router, tags=["filters"])
router.include_router(histogram.router, tags=["histogram"])
router.include_router(comparison.router, tags=["comparison"])
router.include_router(llm_comparison.router, tags=["llm-comparison"])
router.include_router(table.router, tags=["table"])
router.include_router(feature_groups.router, tags=["feature-groups"])
router.include_router(activation_examples.router, tags=["activation-examples"])
router.include_router(similarity_sort.router, tags=["similarity-sort"])
router.include_router(distributed_features.router, tags=["distributed-features"])