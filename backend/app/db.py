import logging
import time
from datetime import datetime, timezone

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from . import config

log = logging.getLogger(__name__)

engine = create_engine(config.DATABASE_URL, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

# PostgreSQL (optionally with TimescaleDB) or Oracle (python-oracledb thin mode).
IS_ORACLE = engine.dialect.name == "oracle"

_INIT_LOCK_ID = 424242


class Base(DeclarativeBase):
    pass


# Set by init_db(): with TimescaleDB, device_metrics is a hypertable with a
# retention policy; otherwise the worker deletes old metrics itself.
HAS_TIMESCALE = False


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def bucket_epoch_sql(column: str = "collected_at") -> str:
    """SQL for the start of the `:bucket`-second bucket of `column`, as Unix seconds.

    Works on both databases so the chart queries need no TimescaleDB functions.
    Oracle stores times as UTC TIMESTAMP (see models.UTCDateTime).
    """
    if IS_ORACLE:
        return (f"FLOOR((CAST({column} AS DATE) - DATE '1970-01-01') * 86400 / :bucket)"
                " * :bucket")
    return f"floor(extract(epoch from {column}) / :bucket) * :bucket"


def epoch_to_dt(value) -> datetime:
    return datetime.fromtimestamp(float(value), timezone.utc)


def wait_for_db(timeout: int = 120) -> None:
    deadline = time.time() + timeout
    probe = "SELECT 1 FROM dual" if IS_ORACLE else "SELECT 1"
    while True:
        try:
            with engine.connect() as conn:
                conn.execute(text(probe))
            return
        except Exception as exc:  # noqa: BLE001
            if time.time() > deadline:
                raise
            log.info("waiting for database: %s", exc)
            time.sleep(2)


def _lock(conn) -> None:
    """Serialize init_db() between the API and the worker."""
    if not IS_ORACLE:
        conn.execute(text(f"SELECT pg_advisory_lock({_INIT_LOCK_ID})"))
        return
    try:
        conn.execute(text(
            "DECLARE r INTEGER; BEGIN "
            f"r := DBMS_LOCK.REQUEST({_INIT_LOCK_ID}, DBMS_LOCK.X_MODE, 120, FALSE); END;"
        ))
    except Exception as exc:  # noqa: BLE001
        conn.rollback()
        log.warning("DBMS_LOCK not available (GRANT EXECUTE ON SYS.DBMS_LOCK), "
                    "continuing without init lock: %s", exc)


def _unlock(conn) -> None:
    try:
        if IS_ORACLE:
            conn.execute(text(
                f"DECLARE r INTEGER; BEGIN r := DBMS_LOCK.RELEASE({_INIT_LOCK_ID}); END;"
            ))
        else:
            conn.execute(text(f"SELECT pg_advisory_unlock({_INIT_LOCK_ID})"))
        conn.commit()
    except Exception:  # noqa: BLE001
        conn.rollback()


def _setup_timescale(conn) -> None:
    global HAS_TIMESCALE
    try:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS timescaledb"))
        conn.commit()
        HAS_TIMESCALE = True
    except Exception:  # noqa: BLE001
        conn.rollback()
        log.warning("TimescaleDB extension not available, using plain PostgreSQL")


def init_db(attempts: int = 3) -> None:
    """Create schema (plus TimescaleDB hypertable on PostgreSQL) and seed data.

    Both the API and the worker call this; a database lock makes it safe to run
    concurrently and the seed step is idempotent. If the lock is unavailable
    (Oracle user without DBMS_LOCK), a lost race is simply retried.
    """
    wait_for_db()
    for attempt in range(1, attempts + 1):
        try:
            _init_db_once()
            return
        except Exception:  # noqa: BLE001
            if attempt == attempts:
                raise
            log.warning("init_db attempt %s failed, retrying", attempt, exc_info=True)
            time.sleep(3)


def _init_db_once() -> None:
    from . import models  # noqa: F401  (register tables)
    from .seed import seed

    with engine.connect() as conn:
        _lock(conn)
        try:
            if not IS_ORACLE:
                _setup_timescale(conn)
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
            _unlock(conn)
