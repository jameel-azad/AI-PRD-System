from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core.config import settings
from app.core.limiter import limiter
from app.api import auth, projects, files, prd, feasibility, export, queue

app = FastAPI(title="Xccelera PRD Portal API", version="3.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)


@app.on_event("startup")
async def startup():
    settings.validate_required_keys()


app.include_router(auth.router,        prefix="/api/v1/auth",        tags=["auth"])
app.include_router(projects.router,    prefix="/api/v1/projects",    tags=["projects"])
app.include_router(files.router,       prefix="/api/v1/files",       tags=["files"])
app.include_router(prd.router,         prefix="/api/v1/prd",         tags=["prd"])
app.include_router(feasibility.router, prefix="/api/v1/feasibility", tags=["feasibility"])
app.include_router(export.router,      prefix="/api/v1/export",      tags=["export"])
app.include_router(queue.router,       prefix="/api/v1/queue",       tags=["queue"])


@app.get("/health")
async def health():
    return {"status": "ok"}
