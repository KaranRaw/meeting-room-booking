from pathlib import Path

import psycopg

from app.config import get_settings


def initialize() -> None:
    url = get_settings().database_url.replace("postgresql+psycopg://", "postgresql://", 1)
    migration = Path(__file__).resolve().parent.parent / "migrations" / "001_initial.sql"
    with psycopg.connect(url, connect_timeout=10) as connection:
        with connection.cursor() as cursor:
            # Two deploying processes must not initialize the schema simultaneously.
            cursor.execute("SELECT pg_advisory_xact_lock(528371)")
            cursor.execute(migration.read_text(encoding="utf-8"), prepare=False)
    print("Database initialized; five rooms are ready.")


if __name__ == "__main__":
    initialize()