from fastapi import APIRouter
from . import filters, histogram, table, feature_groups, activation_examples, classification, cluster_candidates, cold_start, consensus, action_log

router = APIRouter()

router.include_router(filters.router, tags=["filters"])
router.include_router(histogram.router, tags=["histogram"])
router.include_router(table.router, tags=["table"])
router.include_router(feature_groups.router, tags=["feature-groups"])
router.include_router(activation_examples.router, tags=["activation-examples"])
router.include_router(classification.router, tags=["classification"])
router.include_router(cluster_candidates.router, tags=["cluster-candidates"])
router.include_router(cold_start.router, tags=["cold-start"])
router.include_router(consensus.router, tags=["consensus"])
router.include_router(action_log.router, tags=["action-log"])