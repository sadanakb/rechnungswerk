"""
Database connection and session management
"""
import logging

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.config import settings
from app.models import Base

logger = logging.getLogger(__name__)

# Create SQLite engine
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False}  # SQLite specific
)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """Dependency for getting DB session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database (create all tables).

    NOTE: Für Produktion sollte Alembic für Migrationen verwendet werden.
    create_all() ist nur für Entwicklung geeignet.
    """
    Base.metadata.create_all(bind=engine)
    logger.info("[Database] Tables created successfully")
