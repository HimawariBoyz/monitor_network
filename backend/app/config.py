import os


def _int(name: str, default: int) -> int:
    return int(os.getenv(name, str(default)))


DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql+psycopg://monitor:monitor@localhost:5432/monitor"
)
JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production")
JWT_EXPIRE_MINUTES = _int("JWT_EXPIRE_MINUTES", 480)

# How often the simulation engine produces a sample for every device.
SIM_INTERVAL_SECONDS = _int("SIM_INTERVAL_SECONDS", 5)
# A device whose last check is older than this is shown as Unknown (stale data),
# never as Offline: we simply do not know.
STALE_AFTER_SECONDS = _int("STALE_AFTER_SECONDS", 20)
METRICS_RETENTION_DAYS = _int("METRICS_RETENTION_DAYS", 7)
SEED_HISTORY_MINUTES = _int("SEED_HISTORY_MINUTES", 60)
