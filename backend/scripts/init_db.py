"""Create any missing tables for the local prototype database.

There is no migration runner in this prototype; the schema is created from the
SQLAlchemy metadata. Safe to run repeatedly (create_all is additive).
"""

from __future__ import annotations

from app.core.db import engine
from app.models import Base


def main() -> int:
    Base.metadata.create_all(engine)
    print("Database schema is up to date.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
