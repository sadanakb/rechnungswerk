"""
RechnungsWerk FastAPI Main Application
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.middleware import SlowAPIMiddleware
from slowapi.errors import RateLimitExceeded

from app.rate_limiter import limiter

from app.config import settings
from app.middleware.security import SecurityHeadersMiddleware
from app.database import init_db
from app.auth import ACTIVE_API_KEY
from app.routers import health, invoices, suppliers, external_api, recurring, email, auth as auth_router, billing, mahnwesen, onboarding, newsletter, gobd, users, teams, webhooks, api_keys, audit, templates, notifications, contacts, invoice_sequences, import_invoices, contact as contact_router, portal as portal_router, ai as ai_router, datev as datev_router

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

    # ARQ Redis pool (graceful degradation if Redis unavailable)
    try:
        import arq
        from arq.connections import RedisSettings as ArqRedisSettings
        pool = await arq.create_pool(ArqRedisSettings.from_dsn(settings.redis_url))
        app.state.arq_pool = pool
        logger.info("[Startup] ARQ pool connected to Redis at %s", settings.redis_url)
    except Exception as e:
        logger.warning("[Startup] Redis not available (%s) — ARQ tasks will run synchronously", e)
        app.state.arq_pool = None

    yield

    # Shutdown: close ARQ pool
    if hasattr(app.state, "arq_pool") and app.state.arq_pool is not None:
        await app.state.arq_pool.close()
        logger.info("[Shutdown] ARQ pool closed")


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
app.add_middleware(SlowAPIMiddleware)

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
app.include_router(webhooks.router, prefix="/api/webhooks", tags=["webhooks"])
app.include_router(api_keys.router, prefix="/api/api-keys", tags=["api-keys"])
app.include_router(audit.router, prefix="/api/audit", tags=["audit"])
app.include_router(templates.router, prefix="/api/templates", tags=["templates"])
app.include_router(notifications.router)
app.include_router(contacts.router)
app.include_router(invoice_sequences.router)
app.include_router(import_invoices.router)
app.include_router(contact_router.router)
app.include_router(portal_router.router, prefix="/api/portal", tags=["portal"])
app.include_router(ai_router.router, prefix="/api/ai", tags=["ai"])
app.include_router(datev_router.router, prefix="/api/datev", tags=["datev"])


# WebSocket endpoint (Phase 9 — real-time events)
from fastapi import WebSocket, WebSocketDisconnect
from app.ws import manager as ws_manager


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = ""):
    """Real-time WebSocket endpoint. Auth via ?token=<jwt>."""
    from app.auth_jwt import decode_token
    from app.database import SessionLocal
    from app.models import OrganizationMember

    # Validate JWT token
    try:
        payload = decode_token(token)
        user_id = int(payload.get("sub", 0))
    except Exception:
        await websocket.close(code=1008)  # Policy Violation
        return

    # Resolve org_id
    db = SessionLocal()
    try:
        member = db.query(OrganizationMember).filter(
            OrganizationMember.user_id == user_id
        ).first()
        if not member:
            await websocket.close(code=1008)
            return
        org_id = member.organization_id
    finally:
        db.close()

    await ws_manager.connect(org_id, websocket)
    try:
        while True:
            # Keep connection alive — receive messages (ping/pong or ignore)
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(org_id, websocket)


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "RechnungsWerk API",
        "version": settings.app_version,
        "docs": "/docs",
        "health": "/api/health",
    }
