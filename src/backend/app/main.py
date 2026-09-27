from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.core.config import settings
from app.core.database import init_db
from app.api import auth, events, teams, projects, judging, voting, t4, audit
import faulthandler
import sys

faulthandler.enable(sys.stderr)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    yield
    # Shutdown
    pass


app = FastAPI(
    title="DOGFOOD 2026 Hackathon Platform",
    description="Submission and judging platform for hackathons",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(events.router)
app.include_router(teams.router)
app.include_router(projects.router)
app.include_router(judging.router)
app.include_router(voting.router)
app.include_router(t4.router)
app.include_router(audit.router)


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.get("/health/live")
async def health_live():
    return {"status": "alive", "version": app.version}


@app.get("/health/ready")
async def health_ready():
    from sqlalchemy import text as sa_text

    from app.core.database import engine

    try:
        async with engine.connect() as conn:
            await conn.execute(sa_text("SELECT 1"))
        return {"status": "ready", "database": "reachable"}
    except Exception as exc:  # noqa: BLE001 - readiness probe reports, never raises
        from fastapi import HTTPException

        raise HTTPException(status_code=503, detail=f"database unreachable: {exc}")


@app.get("/health/version")
async def health_version():
    return {"name": "DOGFOOD 2026 API", "version": app.version}


@app.get("/api")
async def api_root():
    return {
        "name": "DOGFOOD 2026 API",
        "version": "0.1.0",
        "docs": "/docs",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)