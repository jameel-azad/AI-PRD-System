from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api import auth, projects, files, prd, feasibility

app = FastAPI(title="Xccelera PRD Portal API", version="3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    settings.validate_required_keys()


app.include_router(auth.router,        prefix="/api/v1/auth",        tags=["auth"])
app.include_router(projects.router,    prefix="/api/v1/projects",    tags=["projects"])
app.include_router(files.router,       prefix="/api/v1/files",       tags=["files"])
app.include_router(prd.router,         prefix="/api/v1/prd",         tags=["prd"])
app.include_router(feasibility.router, prefix="/api/v1/feasibility", tags=["feasibility"])


@app.get("/health")
async def health():
    return {"status": "ok"}
