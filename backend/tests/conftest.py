import os

import pytest
from sqlalchemy import create_engine, text

ADMIN_URL = os.getenv("TEST_ADMIN_DATABASE_URL", "postgresql+psycopg://monitor:monitor@localhost:5433/monitor")
TEST_URL = ADMIN_URL.rsplit("/", 1)[0] + "/monitor_test"
os.environ["DATABASE_URL"] = TEST_URL
os.environ["SEED_HISTORY_MINUTES"] = "5"


@pytest.fixture(scope="session")
def client():
    admin = create_engine(ADMIN_URL, isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text("DROP DATABASE IF EXISTS monitor_test WITH (FORCE)"))
        conn.execute(text("CREATE DATABASE monitor_test"))
    admin.dispose()

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
