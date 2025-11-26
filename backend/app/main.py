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
from .services.similarity_sort_service import SimilaritySortService
from .services.hierarchical_cluster_candidate_service import HierarchicalClusterCandidateService
from .api import feature_groups, similarity_sort, cluster_candidates

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
similarity_sort_service = None
cluster_candidate_service = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global data_service, alignment_service, similarity_sort_service, cluster_candidate_service
    try:
        data_service = DataService()
        await data_service.initialize()
        logger.info("Data service initialized successfully")

        # Initialize alignment service with data_service reference
        alignment_service = AlignmentService(data_service=data_service)
        success = await alignment_service.initialize()
        if success:
            logger.info("Alignment service initialized successfully")
        else:
            logger.warning("Alignment service initialization failed - explanations will not be highlighted")

        # Initialize feature groups service
        feature_groups.initialize_service()
        logger.info("Feature groups service initialized successfully")

        # Initialize hierarchical cluster candidate service (BEFORE similarity sort service)
        from pathlib import Path
        project_root = Path(__file__).parent.parent.parent
        cluster_candidate_service = HierarchicalClusterCandidateService(project_root=project_root)
        cluster_candidates.set_cluster_candidate_service(cluster_candidate_service)
        logger.info("Hierarchical cluster candidate service initialized successfully")

        # Initialize similarity sort service with cluster service for pair generation
        similarity_sort_service = SimilaritySortService(
            data_service=data_service,
            cluster_service=cluster_candidate_service  # NEW: Pass cluster service
        )
        similarity_sort.set_similarity_sort_service(similarity_sort_service)
        logger.info("Similarity sort service initialized successfully")

        yield
    except Exception as e:
        logger.error(f"Failed to initialize services: {e}")
        raise
    finally:
        if data_service:
            await data_service.cleanup()
        if alignment_service:
            await alignment_service.cleanup()

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