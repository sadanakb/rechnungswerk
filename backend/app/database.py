"""
Database connection and session management.

Supports SQLite (development) and PostgreSQL (production).
Switch via DATABASE_URL environment variable:
  SQLite (default): sqlite:///./data/rechnungswerk.db
  PostgreSQL:       postgresql://user:pass@host:5432/rechnungswerk
"""
import logging

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.config import settings
from app.models import Base

logger = logging.getLogger(__name__)


def _build_engine(url: str):
    """Create engine with settings appropriate for SQLite or PostgreSQL."""
    if url.startswith("sqlite"):
        return create_engine(
            url,
            connect_args={"check_same_thread": False},
        )
    # PostgreSQL / MySQL / other relational DBs
    return create_engine(
        url,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,  # auto-reconnect on stale connections
    )


engine = _build_engine(settings.database_url)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """FastAPI dependency for DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database — create all tables.

    NOTE: For production, use Alembic migrations instead of create_all().
    Run: cd backend && alembic upgrade head
    """
    Base.metadata.create_all(bind=engine)
    db_type = "SQLite" if settings.database_url.startswith("sqlite") else "PostgreSQL"
    logger.info("[Database] Tables created (%s)", db_type)
