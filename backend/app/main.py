from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
import sys
import os
from contextlib import asynccontextmanager

from .api import router as api_router
from .services.data_service import DataService
from .services.alignment_service import AlignmentService
from .services.classification_service import ClassificationService
from .services.pair_similarity_service import PairSimilarityService
from .services.hierarchical_cluster_candidate_service import HierarchicalClusterCandidateService
from .services.activation_cache_service import activation_cache_service
from .services.cold_start_service import ColdStartService
from .services.consensus_service import ConsensusService
from .services.table_data_service import TableDataService
from .services.feature_group_service import FeatureGroupService
from .services.histogram_service import HistogramService
from .services.highlight_service import HighlightService
from .api import feature_groups, classification, cluster_candidates, cold_start, consensus, table, filters, histogram, activation_examples

# Configure logging for the application
log_level = os.getenv("LOG_LEVEL", "INFO").upper()
log_file = os.getenv("LOG_FILE")

handlers = [logging.StreamHandler(sys.stdout)]

# Add file handler if LOG_FILE environment variable is set
if log_file:
    file_handler = logging.FileHandler(log_file, mode='a')
    file_handler.setFormatter(
        logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    )
    handlers.append(file_handler)

logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=handlers,
    force=True
)

logger = logging.getLogger(__name__)

data_service = None
alignment_service = None
classification_service = None
pair_similarity_service = None
cluster_candidate_service = None
cold_start_service = None
consensus_service = None
table_service = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global data_service, alignment_service, classification_service, pair_similarity_service, cluster_candidate_service, cold_start_service, consensus_service, table_service
    try:
        data_service = DataService()
        await data_service.initialize()
        logger.info("Data service initialized successfully")

        # Initialize alignment service with data_service reference
        # NOTE: alignment_service is no longer consumed by frontend highlighting
        alignment_service = AlignmentService(data_service=data_service)
        success = await alignment_service.initialize()
        if success:
            logger.info("Alignment service initialized successfully")
        else:
            logger.warning("Alignment service initialization failed - explanations will not be highlighted")

        # Initialize table data service as singleton (for interfeature cache efficiency)
        table_service = TableDataService(data_service, alignment_service)
        table.set_table_service(table_service)
        logger.info("Table data service initialized successfully")

        # Initialize feature groups service
        fg_service = FeatureGroupService(data_service)
        feature_groups.set_feature_group_service(fg_service)
        logger.info("Feature groups service initialized successfully")

        # Inject data service into filters and activation_examples
        filters.set_data_service(data_service)
        activation_examples.set_data_service(data_service)

        # Initialize histogram service
        histogram_service = HistogramService(data_service)
        histogram.set_histogram_service(histogram_service)
        logger.info("Histogram service initialized successfully")

        # Initialize hierarchical cluster candidate service (BEFORE classification service)
        from pathlib import Path
        project_root = Path(__file__).parent.parent.parent
        cluster_candidate_service = HierarchicalClusterCandidateService(project_root=project_root)
        cluster_candidates.set_cluster_candidate_service(cluster_candidate_service)
        logger.info("Hierarchical cluster candidate service initialized successfully")

        # Initialize highlight service (per-token syntax/context scores)
        highlights_path = project_root / "data" / "output" / "activation_highlights.parquet"
        highlight_service = HighlightService(highlights_path)
        highlight_service.initialize()
        activation_examples.set_highlight_service(highlight_service)
        logger.info("Highlight service initialized successfully")

        # Initialize classification service (binary + multi-class SVM)
        classification_service = ClassificationService(data_service=data_service)
        logger.info("Classification service initialized successfully")

        # Initialize pair similarity service (pair-level sorting)
        pair_similarity_service = PairSimilarityService(
            data_service=data_service,
            cluster_service=cluster_candidate_service
        )
        logger.info("Pair similarity service initialized successfully")

        # Pass services to API layer
        classification.set_classification_service(classification_service)
        classification.set_pair_similarity_service(pair_similarity_service)

        # Initialize cold-start suggestions service
        cold_start_service = ColdStartService(
            data_service=data_service,
            cluster_service=cluster_candidate_service
        )
        cold_start.set_cold_start_service(cold_start_service)
        logger.info("Cold-start service initialized successfully")

        # Initialize activation cache service (pre-compute msgpack+gzip blob)
        activation_cache_service.highlight_service = highlight_service
        await activation_cache_service.initialize()
        logger.info("Activation cache service initialized successfully")

        # Initialize consensus service for explanation consensus visualization
        consensus_service = ConsensusService()
        success = await consensus_service.initialize()
        if success:
            consensus.set_consensus_service(consensus_service)
            logger.info("Consensus service initialized successfully")
        else:
            logger.warning("Consensus service initialization failed - consensus visualization will not be available")

        yield
    except Exception as e:
        logger.error(f"Failed to initialize services: {e}")
        raise
    finally:
        if data_service:
            await data_service.cleanup()
        if alignment_service:
            await alignment_service.cleanup()
        if consensus_service:
            await consensus_service.cleanup()

app = FastAPI(
    title="SAE Feature Visualization API",
    description="RESTful API for interactive Sparse Autoencoder feature explanation visualization",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",   # Default React dev server
        "http://localhost:3003",   # Our frontend port
        "http://localhost:3004",   # Frontend fallback port
        "http://localhost:5173",   # Vite default port
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3003",
        "http://127.0.0.1:3004",
        "http://127.0.0.1:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    # Check if exc.detail is already a properly formatted error response
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    else:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": "HTTP_ERROR",
                    "message": str(exc.detail),
                    "details": {}
                }
            }
        )

@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    logger.error(f"Unexpected error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "An unexpected error occurred",
                "details": {}
            }
        }
    )

@app.get("/")
async def root():
    return {"message": "SAE Feature Visualization API", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "data_service": "connected" if data_service and data_service.is_ready() else "disconnected"
    }

app.include_router(api_router, prefix="/api")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)