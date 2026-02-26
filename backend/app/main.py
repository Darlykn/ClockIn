import logging
import subprocess
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.files import router as files_router
from app.api.stats import router as stats_router
from app.api.users import router as users_router
from app.holidays import warm_cache_on_startup

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run Alembic migrations and pre-load production calendar on startup."""
    logger.info("Running Alembic migrations...")
    try:
        result = subprocess.run(
            ["alembic", "upgrade", "head"],
            capture_output=True,
            text=True,
            cwd="/app",
        )
        if result.returncode != 0:
            logger.error("Alembic migration failed:\n%s", result.stderr)
        else:
            logger.info("Migrations applied successfully:\n%s", result.stdout)
    except Exception as exc:
        logger.exception("Failed to run migrations: %s", exc)

    await warm_cache_on_startup()

    yield

    logger.info("Shutting down AttendTrack backend.")


app = FastAPI(
    title="AttendTrack API",
    description="Система учёта посещаемости сотрудников на основе данных СКУД.",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/auth", tags=["Auth"])
app.include_router(users_router, prefix="/api/users", tags=["Users"])
app.include_router(files_router, prefix="/api/files", tags=["Files"])
app.include_router(stats_router, prefix="/api/stats", tags=["Stats"])


@app.get("/health", tags=["System"])
async def health_check() -> dict:
    return {"status": "ok"}
