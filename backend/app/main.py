"""
RechnungsWerk FastAPI Main Application
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.middleware.security import SecurityHeadersMiddleware
from app.database import init_db
from app.auth import ACTIVE_API_KEY
from app.routers import health, invoices, suppliers, external_api, recurring, email, auth as auth_router, billing, mahnwesen, onboarding, newsletter, gobd, users, teams

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup/shutdown lifecycle."""
    logger.info("[Startup] Initializing RechnungsWerk database...")
    init_db()
    logger.info("[Startup] Database initialized")
    if settings.require_api_key:
        logger.info("[Auth] API-Key Authentifizierung AKTIV")
        logger.info("[Auth] API-Key: %s", ACTIVE_API_KEY)
    else:
        logger.warning("[Auth] API-Key Authentifizierung DEAKTIVIERT (Entwicklungsmodus)")
    yield


# Rate limiter (H9)
limiter = Limiter(key_func=get_remote_address)

# Initialize FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="E-Invoice OCR and XRechnung Generator - Convert paper invoices to ZUGFeRD/XRechnung",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key"],
)

# Security headers middleware (added after CORS so it runs first in request pipeline)
app.add_middleware(SecurityHeadersMiddleware)

# Include routers
app.include_router(health.router, prefix="/api", tags=["Health"])
app.include_router(invoices.router, prefix="/api", tags=["Invoices"])
app.include_router(suppliers.router, tags=["Suppliers"])
app.include_router(recurring.router, tags=["Recurring"])
app.include_router(external_api.router, tags=["External API v1"])
app.include_router(email.router, tags=["Email"])
app.include_router(auth_router.router)
app.include_router(billing.router)
app.include_router(mahnwesen.router, tags=["Mahnwesen"])
app.include_router(onboarding.router)
app.include_router(newsletter.router)
app.include_router(gobd.router)
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(teams.router, prefix="/api/teams", tags=["teams"])


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "RechnungsWerk API",
        "version": settings.app_version,
        "docs": "/docs",
        "health": "/api/health",
    }
