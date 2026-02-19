"""
RechnungsWerk FastAPI Main Application
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import init_db
from app.routers import health, invoices

# Initialize FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="E-Invoice OCR and XRechnung Generator - Convert paper invoices to ZUGFeRD/XRechnung",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, prefix="/api", tags=["Health"])
app.include_router(invoices.router, prefix="/api", tags=["Invoices"])


@app.on_event("startup")
async def startup_event():
    """Initialize database on startup"""
    print("[Startup] Initializing RechnungsWerk database...")
    init_db()
    print("[Startup] Database initialized")


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "RechnungsWerk API",
        "version": settings.app_version,
        "docs": "/docs",
        "health": "/api/health",
    }
