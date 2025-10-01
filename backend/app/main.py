from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
from contextlib import asynccontextmanager

from .api import router as api_router
from .services.visualization_service import DataService

logger = logging.getLogger(__name__)

data_service = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global data_service
    try:
        data_service = DataService()
        await data_service.initialize()
        logger.info("Data service initialized successfully")
        yield
    except Exception as e:
        logger.error(f"Failed to initialize data service: {e}")
        raise
    finally:
        if data_service:
            await data_service.cleanup()

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