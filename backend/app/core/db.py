"""Database session management.

Synchronous SQLAlchemy. FastAPI runs sync path operations in a threadpool, and
sync sessions keep Alembic and pytest straightforward. The prototype does not
need async I/O to meet its load profile.
"""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings


def _build_engine(url: str):
    connect_args: dict = {}
    if url.startswith("sqlite"):
        connect_args["check_same_thread"] = False

    engine = create_engine(
        url,
        pool_pre_ping=True,
        connect_args=connect_args,
        future=True,
    )

    if url.startswith("sqlite"):
        # SQLite ignores foreign keys unless explicitly enabled. Tests rely on
        # constraint behaviour matching Postgres.
        @event.listens_for(engine, "connect")
        def _sqlite_pragmas(dbapi_connection, _record):  # pragma: no cover
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


engine = _build_engine(settings.database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
