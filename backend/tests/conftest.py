import os

import pytest
from sqlalchemy import create_engine, text

# PostgreSQL: a fresh monitor_test database is created next to TEST_ADMIN_DATABASE_URL.
# Oracle: set TEST_ORACLE_DATABASE_URL to a throwaway schema; its tables are dropped first.
ORACLE_URL = os.getenv("TEST_ORACLE_DATABASE_URL")
ADMIN_URL = os.getenv("TEST_ADMIN_DATABASE_URL", "postgresql+psycopg://monitor:monitor@localhost:5433/monitor")
TEST_URL = ORACLE_URL or ADMIN_URL.rsplit("/", 1)[0] + "/monitor_test"
os.environ["DATABASE_URL"] = TEST_URL
os.environ["SEED_HISTORY_MINUTES"] = "5"


def _reset_database():
    if ORACLE_URL:
        from app import models  # noqa: F401
        from app.db import Base, engine

        Base.metadata.drop_all(engine)
        return
    admin = create_engine(ADMIN_URL, isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text("DROP DATABASE IF EXISTS monitor_test WITH (FORCE)"))
        conn.execute(text("CREATE DATABASE monitor_test"))
    admin.dispose()


@pytest.fixture(scope="session")
def client():
    _reset_database()

    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c


def login(client, username):
    r = client.post("/api/auth/login", json={"username": username, "password": f"{username}123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="session")
def admin(client):
    return login(client, "admin")


@pytest.fixture(scope="session")
def engineer(client):
    return login(client, "engineer")


@pytest.fixture(scope="session")
def viewer(client):
    return login(client, "viewer")
