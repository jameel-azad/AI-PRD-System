# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Xccelera PRD Portal** — an AI-powered system that ingests raw client communication (call recordings, transcripts, documents) and produces structured Product Requirements Documents (PRDs). The pipeline runs Gemini 1.5 Pro for extraction/generation/feasibility and OpenAI Whisper for audio transcription.

## Commands

### Infrastructure (run first)
```bash
docker compose up -d   # starts PostgreSQL+pgvector, Redis, MinIO
```

### Backend
```bash
cd backend
pip install -r requirements.txt

# Apply DB migrations
alembic upgrade head

# Run API server
uvicorn app.main:app --reload

# Run Celery workers (separate terminal)
celery -A workers.celery_app worker --loglevel=info
```

### Frontend
```bash
cd frontend
npm install
npm run dev      # dev server at http://localhost:5173
npm run build    # production build
```

### Tests
```bash
cd backend
# Requires a running Postgres instance with a `prdportal_test` database
pytest                                   # all tests
pytest tests/test_transcription.py      # single file
pytest -k "test_name"                   # single test by name
```
Tests hit a real database (`prdportal_test` at `localhost:5432`); no mocking of DB or AI calls.

## Architecture

### Processing Pipeline (`backend/app/pipeline/orchestrator.py`)
The core of the system. Triggered per uploaded `SourceFile`, runs these stages sequentially:
1. **Transcription** — Whisper API for audio/video; text/docs skip this
2. **PII redaction** — strips personal data from transcript before storage
3. **Chunk → embed → extract** — splits transcript into overlapping chunks (1500 chars, 200 overlap), generates 768-dim embeddings via Gemini, runs `extract_requirements` to produce structured `Requirement` rows with section classification and confidence scores
4. **PRD generation** — `generate_prd` + `analyse_gaps` over all project requirements
5. **Completeness scoring** — `score_completeness` grades the generated PRD
6. **Result** — saves a `PRDVersion` row with the full PRD JSON (including `_gaps` and `_scores` keys)

Celery workers (`backend/workers/`) run this pipeline asynchronously. The orchestrator uses `NullPool` for asyncpg because each Celery task creates a fresh event loop.

### Data Model
- **Project** → has a `ProjectStage` enum: `intake → processing → drafted → gap_review → feasibility → client_review → approved`
- **SourceFile** → uploaded file, tracks `status` (`pending → processing → complete`)
- **Requirement** → extracted item with `section`, `content`, `embedding` (pgvector 768-dim), `confidence`, `source_refs`
- **PRDVersion** → versioned JSON PRD stored as a JSON column
- **Approval** → approval workflow record per project

### Backend Structure
- `app/api/` — FastAPI routers (auth, projects, files, prd, feasibility); all routes require JWT auth via `deps.py`
- `app/services/` — AI service layer: `extraction.py`, `prd_generator.py`, `feasibility.py`, `transcription.py`, `embeddings.py`, `completeness.py`, `gap_analysis.py`
- `app/pipeline/orchestrator.py` — orchestrates services into the full pipeline
- `app/models/` — SQLAlchemy 2.0 async ORM models
- `workers/` — Celery app definition and task definitions (separate from `app/workers/`)
- `alembic/versions/` — DB migrations; run `alembic upgrade head` after pulling new migrations

### Feasibility Service (`backend/app/services/feasibility.py`)
Runs a Gemini agentic tool-call loop (max 5 rounds) to check sanctions (OFAC/UN/EU/UK), geopolitical risk, and regulatory requirements. The tool functions (`check_ofac_sanctions`, `check_geopolitical_risk`, etc.) are currently **stub implementations** — they must be replaced with live API calls before production use. Returns a structured JSON with `overall_status`: `green | amber | red` and optionally injects NFRs into the PRD.

### Frontend Structure
- React 18 + Vite + TailwindCSS
- State: **Zustand** stores (`authStore`, `projectStore`, `appStore` for toasts/modals/notifications)
- Data fetching: **TanStack Query** + axios (`src/services/api.js`)
- Pages: Dashboard, ProjectsView, ProjectWorkspace, ApprovalsView, ClarificationsView, etc.
- `src/data/mockData.js` — static mock data still used in some views (not yet wired to the API)

## Environment Variables
The backend reads config from `app/core/config.py` (pydantic-settings). Required keys validated on startup:
- `GEMINI_API_KEY` — Gemini 1.5 Pro (extraction, PRD generation, feasibility, embeddings)
- `OPENAI_API_KEY` — Whisper transcription
- `DATABASE_URL` — asyncpg connection string
- `REDIS_URL` — Celery broker/backend
- `MINIO_*` — object storage for uploaded files
- `SECRET_KEY` — JWT signing

## Key Constraints
- The `assessment_date` field in feasibility prompts must be passed in — `Date.now()` / `datetime.utcnow()` equivalents are called at the call site, not inside the service functions.
- Embeddings are 768-dimensional (Gemini); the pgvector column is sized to match — do not change the embedding model without a migration.
- The Celery workers import `app.*` directly; `PYTHONPATH` must include `backend/` when launching workers.
