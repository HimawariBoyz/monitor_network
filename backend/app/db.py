import logging
import time

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from . import config

log = logging.getLogger(__name__)

engine = create_engine(config.DATABASE_URL, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


# Set by init_db(); lets queries use time_bucket() when TimescaleDB is present
# and fall back to plain PostgreSQL date_bin() otherwise (e.g. in tests).
HAS_TIMESCALE = False


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def wait_for_db(timeout: int = 60) -> None:
    deadline = time.time() + timeout
    while True:
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return
        except Exception as exc:  # noqa: BLE001
            if time.time() > deadline:
                raise
            log.info("waiting for database: %s", exc)
            time.sleep(2)


def init_db() -> None:
    """Create schema, TimescaleDB hypertable and seed data.

    Both the API and the worker call this; an advisory lock makes it safe to run
    concurrently and the seed step is idempotent.
    """
    global HAS_TIMESCALE
    from . import models  # noqa: F401  (register tables)
    from .seed import seed

    wait_for_db()
    with engine.connect() as conn:
        conn.execute(text("SELECT pg_advisory_lock(424242)"))
        try:
            try:
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS timescaledb"))
                conn.commit()
                HAS_TIMESCALE = True
            except Exception:  # noqa: BLE001
                conn.rollback()
                log.warning("TimescaleDB extension not available, using plain PostgreSQL")
            Base.metadata.create_all(conn)
            conn.commit()
            if HAS_TIMESCALE:
                conn.execute(text(
                    "SELECT create_hypertable('device_metrics', 'collected_at', "
                    "if_not_exists => TRUE, migrate_data => TRUE)"
                ))
                conn.execute(text(
                    "SELECT add_retention_policy('device_metrics', "
                    f"INTERVAL '{config.METRICS_RETENTION_DAYS} days', if_not_exists => TRUE)"
                ))
                conn.commit()
            with SessionLocal(bind=conn) as db:
                seed(db)
                db.commit()
            conn.commit()
        finally:
            conn.execute(text("SELECT pg_advisory_unlock(424242)"))
            conn.commit()
