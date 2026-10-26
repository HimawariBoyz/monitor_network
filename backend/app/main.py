import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .db import init_db
from .routers import admin, alerts, auth, dashboard, demo, devices


@asynccontextmanager
async def lifespan(_: FastAPI):
    logging.basicConfig(level=logging.INFO)
    init_db()
    yield


app = FastAPI(
    title="Factory Network Monitor API",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

for module in (auth, dashboard, devices, alerts, demo, admin):
    app.include_router(module.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}
