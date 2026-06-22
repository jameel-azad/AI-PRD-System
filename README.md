# Xccelera PRD Portal

An AI-powered Product Requirements Document (PRD) generation platform. The system ingests raw client communication — call recordings, transcripts, and documents — and produces structured, versioned PRDs through an automated AI pipeline. Built for business analysts and product managers to eliminate the manual effort of transforming discovery artifacts into formal requirements.

---

## Features

### Core Capabilities
- **AI Pipeline** — LangGraph StateGraph orchestrating transcription → PII redaction → chunking → requirement extraction → PRD generation → gap analysis → completeness scoring
- **Multi-format File Ingestion** — audio (MP3, WAV, M4A, OGG), video (MP4, MOV, AVI, MKV, WebM), documents (PDF, DOCX, TXT, MD), and images (PNG, JPG, JPEG, WebP)
- **Automatic Audio/Video Transcription** — OpenAI Whisper with timestamped segment tracking for source attribution
- **PII Redaction** — personal data stripped from transcripts before storage
- **Semantic Requirement Extraction** — transcript chunks embedded as 768-dim vectors (Gemini), requirements classified by section and scored with confidence levels
- **Versioned PRD Generation** — structured JSON PRD with 13 sections (project overview, functional/non-functional requirements, user stories, stakeholders, timelines, etc.)
- **Gap Analysis** — AI-surfaced open questions prioritised by section
- **Completeness Scoring** — traffic-light (0–100) score per PRD section
- **Feasibility Check** — LangGraph ReAct agent running OFAC / UN / EU / UK sanctions screening, geopolitical risk assessment, and regulatory mapping; optionally uses Tavily for live web search
- **Compliance NFR Injection** — feasibility agent injects regulation-specific non-functional requirements directly into the PRD
- **PRD Export** — download as PDF (branded cover page), DOCX, or Markdown
- **Approval Workflow** — client/admin approval, stage transitions, and comment threads
- **Email Notifications** — SMTP notifications for PRD ready, gap review needed, approval requested, and feasibility flags
- **Audit Log** — per-user event log of project, comment, approval, and PRD generation events
- **Task Queue Management** — monitor pipeline task status, cancel tasks, reprocess failed files

### User Roles & Permissions

| Role | Registration | Create Projects | Upload Files | Approve PRD | Manage Users | Override Feasibility |
|------|-------------|-----------------|--------------|-------------|--------------|----------------------|
| `admin` | Admin-only | Yes | Yes | Yes | Yes | Yes |
| `ba_pm` | Open / Invite | Yes | Yes | No | No | No |
| `client` | Open / Invite | No | No | Yes | No | No |

- **Self-registration** can be disabled (`REGISTRATION_OPEN=false`) to require admin-issued invite links (72-hour, single-use, role-pinned)
- Clients are automatically redirected to their project's PRD view on login
- Project data is owner-scoped; admins see all projects

### Project Lifecycle Stages

```
intake → processing → drafted → gap_review → feasibility → client_review → approved
```

---

## Tech Stack

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| React | 18.3 | UI framework |
| Vite | 5.2 | Build tool & dev server |
| React Router | 6.23 | Client-side routing |
| TanStack Query | 5.40 | Server-state fetching and caching |
| Zustand | 4.5 | Client-state management (`authStore`, `projectStore`, `appStore`) |
| Axios | 1.7 | HTTP client with cookie-credential support |
| TailwindCSS | 3.4 | Utility-first CSS |
| PostCSS + Autoprefixer | — | CSS processing |

### Backend
| Technology | Version | Purpose |
|---|---|---|
| Python | 3.12 | Runtime |
| FastAPI | 0.111 | REST API framework |
| Uvicorn | 0.30 | ASGI server |
| SQLAlchemy | 2.0 (async) | ORM |
| Alembic | 1.13 | Database migrations |
| asyncpg | 0.29 | Async PostgreSQL driver |
| Celery | 5.4 | Async task queue |
| LangGraph | ≥0.2 | AI pipeline orchestration (StateGraph + ReAct agent) |
| LangChain Core | ≥0.3 | LLM abstraction layer |
| slowapi | 0.1.9 | Rate limiting |
| structlog | 24.1 | Structured logging |
| fpdf2 | ≥2.7 | PDF generation |
| python-docx | ≥1.1 | DOCX generation |
| python-jose | 3.3 | JWT encoding/decoding |
| passlib + bcrypt | 1.7 | Password hashing |

### AI / LLM
| Service | Model | Purpose |
|---|---|---|
| Google Gemini | `gemini-1.5-pro` (default) | Requirement extraction, PRD generation, gap analysis, feasibility agent |
| Google Gemini | `models/embedding-001` | 768-dim text embeddings |
| OpenAI Whisper | `whisper-1` | Audio/video transcription |
| Anthropic Claude | `claude-sonnet-4-6` (optional) | Alternative LLM for extraction/generation (switchable via env var) |
| Tavily Search | — | Optional live web search for feasibility sanctions checks |

### Infrastructure
| Service | Version | Purpose |
|---|---|---|
| PostgreSQL + pgvector | 15 | Primary database + vector similarity search |
| Redis | 7 Alpine | Celery broker and result backend |
| MinIO | latest | S3-compatible object storage for uploaded files |
| Docker / Docker Compose | — | Container orchestration |
| Celery Flower | — | Worker monitoring UI (production) |

---

## Project Architecture

### High-Level Overview

```
┌─────────────────────────┐       ┌─────────────────────────────────────────────┐
│     React Frontend       │       │                FastAPI Backend               │
│  (Vite, Zustand, Query)  │◄─────►│         REST API — /api/v1/*                │
│  Port 5173               │       │         Port 8000                           │
└─────────────────────────┘       └──────────────┬──────────────────────────────┘
                                                  │
                              ┌───────────────────┼────────────────────┐
                              │                   │                    │
                       ┌──────▼──────┐    ┌───────▼───────┐   ┌───────▼──────┐
                       │  PostgreSQL  │    │     Redis      │   │    MinIO     │
                       │  + pgvector │    │  (Celery MQ)   │   │ (File Store) │
                       └─────────────┘    └───────┬────────┘   └──────────────┘
                                                  │
                                         ┌────────▼────────┐
                                         │  Celery Worker   │
                                         │  LangGraph       │
                                         │  Pipeline Graph  │
                                         └─────────────────┘
```

### AI Processing Pipeline (LangGraph StateGraph)

Each uploaded file triggers an 8-node StateGraph:

```
START
  └─► load_source_file       — fetch SourceFile from DB, mark processing
        ├─► [error] handle_error → END
        └─► transcribe_node  — Whisper for audio/video; pass-through for text; PII redact
              └─► chunk_and_extract — 1500-char chunks, 200-char overlap
                    │                  embed each chunk, extract Requirements with section + confidence
                    └─► generate_prd_node   — Gemini generates all 13 PRD sections
                          └─► analyse_gaps_node  — Gemini surfaces open gap questions
                                └─► score_completeness_node — 0–100 traffic-light per section
                                      └─► save_prd  — persist PRDVersion, notify owner → END
```

### Folder Structure

```
AI-PRD-System/
├── docker-compose.yml          # Dev infrastructure (Postgres, Redis, MinIO)
├── docker-compose.prod.yml     # Production stack (API, workers, Flower, Postgres, Redis, MinIO)
├── .env                        # Local environment variables (not committed to VCS)
│
├── backend/
│   ├── Dockerfile              # Python 3.12-slim + ffmpeg
│   ├── requirements.txt        # Production dependencies
│   ├── requirements-dev.txt    # Test / dev tools (pytest, locust, bandit, pip-audit)
│   ├── alembic.ini
│   ├── alembic/
│   │   └── versions/           # 5 incremental migrations (0001–0005)
│   ├── app/
│   │   ├── main.py             # FastAPI app factory, middleware, router mounting
│   │   ├── core/
│   │   │   ├── config.py       # pydantic-settings; validates required keys on startup
│   │   │   ├── database.py     # Async engine + session factory
│   │   │   ├── security.py     # bcrypt hashing, JWT encode/decode
│   │   │   └── limiter.py      # slowapi rate limiter instance
│   │   ├── api/
│   │   │   ├── deps.py         # get_current_user, require_role, require_admin
│   │   │   ├── auth.py         # Register, login, logout, refresh, password reset, invites, user management
│   │   │   ├── projects.py     # CRUD, stage transitions, comments, gap answers, activity log
│   │   │   ├── files.py        # File upload (to MinIO) + pipeline dispatch, delete
│   │   │   ├── prd.py          # Get PRD, version history, approve, list approvals
│   │   │   ├── feasibility.py  # Run feasibility check, get report, admin override
│   │   │   ├── export.py       # Download PRD as PDF / DOCX / Markdown
│   │   │   └── queue.py        # Task status, cancel, reprocess
│   │   ├── models/             # SQLAlchemy 2.0 ORM models
│   │   │   ├── user.py         # User, UserRole enum
│   │   │   ├── project.py      # Project, ProjectStage enum
│   │   │   ├── source_file.py  # SourceFile (uploaded artifact)
│   │   │   ├── requirement.py  # Extracted requirement with pgvector embedding
│   │   │   ├── prd_version.py  # Versioned PRD JSON blob
│   │   │   ├── approval.py     # Approval record
│   │   │   ├── comment.py      # Threaded comment with resolve flag
│   │   │   └── feasibility_report.py
│   │   ├── pipeline/
│   │   │   ├── graph.py        # LangGraph StateGraph — 8 nodes, NullPool engine
│   │   │   ├── state.py        # PipelineState TypedDict
│   │   │   └── orchestrator.py # Thin wrapper: ainvoke(pipeline_graph)
│   │   └── services/
│   │       ├── transcription.py  # OpenAI Whisper + MinIO download
│   │       ├── pii.py            # PII redaction
│   │       ├── embeddings.py     # Gemini embed_text, chunk_text
│   │       ├── extraction.py     # Gemini requirement extraction
│   │       ├── prd_generator.py  # Gemini PRD generation + gap analysis
│   │       ├── completeness.py   # Section scoring
│   │       ├── feasibility.py    # LangGraph ReAct agent (OFAC/UN/EU/UK + web_search)
│   │       ├── export.py         # PDF / DOCX / Markdown rendering
│   │       ├── storage.py        # MinIO wrapper (upload, download, delete)
│   │       ├── email.py          # SMTP email notifications (fire-and-forget)
│   │       ├── queue.py          # Celery task status helpers
│   │       └── llm_factory.py    # Switchable LLM (Gemini or Claude)
│   ├── workers/
│   │   ├── celery_app.py         # Celery app with task routing
│   │   └── tasks.py              # Celery task definitions
│   └── tests/
│       ├── conftest.py           # pytest fixtures (real DB, AsyncClient)
│       ├── test_pipeline_integration.py
│       ├── test_transcription.py
│       └── locustfile.py         # Load test scenarios
│
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js            # Proxies /api → localhost:8000
    ├── tailwind.config.js
    └── src/
        ├── App.jsx               # Router, QueryClient, auth guards
        ├── pages/
        │   ├── LoginPage.jsx
        │   ├── Dashboard.jsx
        │   ├── ProjectsView.jsx
        │   ├── ProjectWorkspace.jsx  # Tabbed: PRD, files, feasibility, comments, approvals
        │   ├── ApprovalsView.jsx
        │   ├── ClarificationsView.jsx
        │   ├── ClientsView.jsx
        │   ├── TeamView.jsx
        │   └── SettingsView.jsx
        ├── components/
        │   ├── AppShell.jsx          # Sidebar nav, role-aware
        │   ├── PRDSection.jsx        # Renders a single PRD section
        │   ├── FeasibilityPanel.jsx  # Feasibility form + result display
        │   ├── FileUpload.jsx        # Drag-and-drop with progress
        │   ├── DiscussionThread.jsx  # Threaded comments
        │   ├── Toast.jsx
        │   └── ModalHost.jsx
        ├── store/
        │   ├── authStore.js          # User, viewRole, login/logout
        │   ├── projectStore.js       # Projects list, selected project
        │   └── appStore.js           # Toasts, modals, notifications
        └── services/
            └── api.js                # Axios instance + typed API surface
```

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Python | 3.12+ | Backend runtime |
| Node.js | 18+ | Frontend build |
| npm | 9+ | Comes with Node 18+ |
| Docker | 24+ | Infrastructure containers |
| Docker Compose | v2+ | Use `docker compose` (not `docker-compose`) |
| ffmpeg | Any recent | Installed automatically inside the Docker image; required for audio pre-processing before Whisper upload |

**External API keys required:**
- Google Gemini API key — [aistudio.google.com](https://aistudio.google.com/app/apikey)
- OpenAI API key — [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

**Optional:**
- Anthropic API key — only needed when `LANGGRAPH_LLM=claude`
- Tavily API key — enables live sanctions/regulatory web search in feasibility checks

---

## Installation

### 1. Clone the repository

```bash
git clone <repository-url>
cd AI-PRD-System
```

### 2. Configure environment variables

Edit `.env` in the project root and fill in your API keys:

```
GEMINI_API_KEY=<your-gemini-key>
OPENAI_API_KEY=<your-openai-key>
JWT_SECRET_KEY=<generate with: openssl rand -hex 32>
```

### 3. Start infrastructure

```bash
docker compose up -d
```

This starts PostgreSQL (port 5432), Redis (port 6379), and MinIO (ports 9000 / 9001).

### 4. Backend setup

```bash
cd backend
pip install -r requirements.txt

# Apply all database migrations
alembic upgrade head
```

### 5. Frontend setup

```bash
cd frontend
npm install
```

---

## Environment Variables

All variables are read from `.env` in the project root via `pydantic-settings`.

### Required

| Variable | Description |
|---|---|
| `DATABASE_URL` | Async PostgreSQL connection string. Format: `postgresql+asyncpg://user:pass@host:port/dbname` |
| `GEMINI_API_KEY` | Google Gemini API key. Used for extraction, PRD generation, gap analysis, embeddings, and the feasibility agent. |
| `OPENAI_API_KEY` | OpenAI API key. Used exclusively for Whisper audio/video transcription. |

### Authentication

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET_KEY` | `change-me-in-production` | HMAC signing key for JWT tokens. **Change this before any deployment.** Generate with `openssl rand -hex 32`. |
| `JWT_ALGORITHM` | `HS256` | JWT signing algorithm. |
| `JWT_EXPIRE_MINUTES` | `480` | Token lifetime (8 hours). The frontend silently refreshes every 20 minutes. |

### Infrastructure

| Variable | Default | Description |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379/0` | Celery broker and result backend. |
| `MINIO_ENDPOINT` | `localhost:9000` | MinIO host:port (no scheme). |
| `MINIO_ACCESS_KEY` | `minioadmin` | MinIO access key. |
| `MINIO_SECRET_KEY` | `minioadmin` | MinIO secret key. |
| `MINIO_BUCKET` | `prd-files` | Bucket name for uploaded files. Created automatically if missing. |
| `MINIO_USE_SSL` | `false` | Set `true` when MinIO is behind TLS in production. |

### AI / LLM

| Variable | Default | Description |
|---|---|---|
| `GEMINI_MODEL` | `gemini-1.5-pro` | Gemini chat model for all generation tasks. |
| `GEMINI_EMBEDDING_MODEL` | `models/embedding-001` | Embedding model. **Do not change** without a DB migration — the pgvector column is fixed at 768 dimensions. |
| `OPENAI_WHISPER_MODEL` | `whisper-1` | Whisper model for transcription. |
| `LANGGRAPH_LLM` | `gemini` | Set to `gemini` or `claude` to switch the LLM for the entire pipeline. Requires a server/worker restart. |
| `ANTHROPIC_API_KEY` | _(empty)_ | Required only when `LANGGRAPH_LLM=claude`. |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | Anthropic model ID when Claude is selected. |
| `TAVILY_API_KEY` | _(empty)_ | Optional. Enables live web search in the feasibility agent. Without it, sanctions checks use a static snapshot and flag results as requiring manual verification. |

### Email / SMTP

| Variable | Default | Description |
|---|---|---|
| `SMTP_ENABLED` | `false` | Set to `true` to activate email notifications. |
| `SMTP_HOST` | `smtp.gmail.com` | SMTP server hostname. |
| `SMTP_PORT` | `587` | SMTP port. |
| `SMTP_USE_TLS` | `true` | Enable STARTTLS. |
| `SMTP_USER` | _(empty)_ | SMTP login username. |
| `SMTP_PASSWORD` | _(empty)_ | SMTP password. Use an App Password for Gmail. |
| `SMTP_FROM` | `noreply@xccelera.ai` | Sender address for outgoing emails. |

### Application

| Variable | Default | Description |
|---|---|---|
| `APP_BASE_URL` | `http://localhost:5173` | Frontend base URL, included in email notification links. |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated list of allowed CORS origins. |
| `REGISTRATION_OPEN` | `true` | Set to `false` to disable self-registration. New accounts must then be created by an admin or via the invite link flow. |

### Sample `.env`

```dotenv
# ── Database ───────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql+asyncpg://prduser:prdpass@localhost:5432/prdportal

# ── Redis / Celery ─────────────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379/0

# ── MinIO ──────────────────────────────────────────────────────────────────────
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=prd-files
MINIO_USE_SSL=false

# ── JWT ────────────────────────────────────────────────────────────────────────
JWT_SECRET_KEY=<output of: openssl rand -hex 32>
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=480

# ── AI / LLM ───────────────────────────────────────────────────────────────────
GEMINI_API_KEY=<your-gemini-key>
GEMINI_MODEL=gemini-1.5-pro
GEMINI_EMBEDDING_MODEL=models/embedding-001

OPENAI_API_KEY=<your-openai-key>
OPENAI_WHISPER_MODEL=whisper-1

LANGGRAPH_LLM=gemini
# ANTHROPIC_API_KEY=          # only needed when LANGGRAPH_LLM=claude
# ANTHROPIC_MODEL=claude-sonnet-4-6

# TAVILY_API_KEY=             # optional — enables live sanctions web search

# ── Email (disabled by default) ────────────────────────────────────────────────
SMTP_ENABLED=false
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USE_TLS=true
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=noreply@xccelera.ai

# ── App ────────────────────────────────────────────────────────────────────────
APP_BASE_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173
REGISTRATION_OPEN=true
```

---

## Running the Application

### Development

Open four terminals:

**Terminal 1 — Infrastructure**

```bash
docker compose up -d
```

**Terminal 2 — Backend API**

```bash
cd backend
uvicorn app.main:app --reload
# API:  http://localhost:8000
# Docs: http://localhost:8000/docs
```

**Terminal 3 — Celery Worker**

```bash
# Linux / macOS
cd backend
PYTHONPATH=. celery -A workers.celery_app worker --loglevel=info

# Windows (PowerShell)
cd backend
$env:PYTHONPATH = "."
celery -A workers.celery_app worker --loglevel=info
```

**Terminal 4 — Frontend**

```bash
cd frontend
npm run dev
# Frontend: http://localhost:5173
# Vite proxies all /api/* requests to http://localhost:8000
```

### Production

```bash
# Requires .env.prod with production values
docker compose -f docker-compose.prod.yml up -d

# Apply migrations inside the running container
docker compose -f docker-compose.prod.yml exec api alembic upgrade head
```

Production services:

| URL | Service |
|-----|---------|
| `http://localhost:8000` | FastAPI REST API |
| `http://localhost:9000` | MinIO S3 API |
| `http://localhost:9001` | MinIO web console |
| `http://localhost:5555` | Celery Flower task monitor |

### Build Commands

```bash
# Frontend production build — outputs to frontend/dist/
cd frontend
npm run build

# Preview the production build locally
npm run preview
```

**Production checklist:**
- [ ] Generate a strong `JWT_SECRET_KEY`: `openssl rand -hex 32`
- [ ] Set `REGISTRATION_OPEN=false` and create the first admin account via the API
- [ ] Set `MINIO_USE_SSL=true` if MinIO is behind TLS
- [ ] Set `secure=True` on the auth cookie in `backend/app/api/auth.py:87` when serving over HTTPS
- [ ] Set `APP_BASE_URL` and `CORS_ORIGINS` to your production domain
- [ ] Set `SMTP_ENABLED=true` and configure SMTP credentials

---

## API Documentation

Interactive docs are served at `http://localhost:8000/docs` (Swagger UI) and `http://localhost:8000/redoc` when the backend is running.

All endpoints require authentication via an `httpOnly` cookie (`xccelera_token`) issued at login. The cookie is sent automatically by the browser and by the Axios client (`withCredentials: true`).

**Base URL:** `http://localhost:8000/api/v1`

### Authentication (`/auth`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/auth/register` | No | Create a new account. Blocked if `REGISTRATION_OPEN=false` without a valid invite token. |
| `POST` | `/auth/login` | No | Authenticate and receive `httpOnly` auth cookie. Rate-limited: 10 attempts / 15 min per IP. |
| `POST` | `/auth/logout` | No | Clear the auth cookie. |
| `POST` | `/auth/refresh` | Yes | Re-issue the auth cookie, extending the session. |
| `GET` | `/auth/me` | Yes | Return the current user's profile. |
| `POST` | `/auth/forgot-password` | No | Request a 6-digit OTP reset code. Rate-limited: 3 requests/hour per email. |
| `POST` | `/auth/reset-password` | No | Submit OTP + new password. Locked after 5 wrong codes / 15-min window. |
| `POST` | `/auth/invite` | Admin | Generate a 72-hour single-use invite link pinned to a given role. |
| `GET` | `/auth/users` | Admin | List all registered users. |
| `POST` | `/auth/users` | Admin | Create a user directly (bypasses registration gate). |
| `PATCH` | `/auth/users/{id}/role` | Admin | Change a user's role. |
| `DELETE` | `/auth/users/{id}` | Admin | Delete a user account. |
| `GET` | `/auth/audit-log` | Yes | Recent system events (scoped to owner's projects for non-admins). |

**Login example:**

```bash
curl -c cookies.txt -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "yourpassword"}'
```

### Projects (`/projects`)

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| `GET` | `/projects/` | All | List projects (owner-scoped; admin sees all). Supports `?q=`, `?stage=`, `?limit=`, `?offset=`. |
| `POST` | `/projects/` | Admin, BA/PM | Create a project. Body: `{ name, client_org }`. |
| `GET` | `/projects/{id}` | Owner, Admin | Project detail with files, requirement count, and completeness score. |
| `PATCH` | `/projects/{id}/stage` | Admin, BA/PM | Update project stage. |
| `DELETE` | `/projects/{id}` | Admin | Delete a project and all associated data. |
| `GET` | `/projects/{id}/comments` | Yes | List all comments for a project. |
| `POST` | `/projects/{id}/comments` | Yes | Add a comment. Supports `parent_id` for threading. |
| `PATCH` | `/projects/{id}/comments/{cid}/resolve` | Yes | Mark a comment as resolved. |
| `PATCH` | `/projects/{id}/gaps/answer` | Owner, Admin | Submit an answer to a gap question. Body: `{ gap_key, answer }`. |
| `GET` | `/projects/{id}/activity` | Owner, Admin | Timeline of project events. |

### Files (`/files`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/files/{project_id}/upload` | Upload a file. Stores in MinIO, creates a `SourceFile` record, dispatches Celery pipeline task. Returns `{ id, filename, status: "queued", task_id }`. |
| `DELETE` | `/files/{file_id}` | Delete a file from storage and the database. |

File size limits: audio 500 MB, video 1 GB, document 50 MB, image 20 MB.

```bash
curl -b cookies.txt -X POST http://localhost:8000/api/v1/files/1/upload \
  -F "file=@/path/to/recording.mp3"
```

### PRD (`/prd`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/prd/{project_id}` | Get the latest PRD version. Response: `{ content, scores, gaps, version, created_at }`. |
| `GET` | `/prd/{project_id}/versions` | List all PRD versions (id, version number, created_at). |
| `GET` | `/prd/{project_id}/version/{num}` | Get a specific PRD version by number. |
| `POST` | `/prd/{project_id}/approve` | Submit an approval and move project to `approved`. Restricted to Admin and Client roles. |
| `GET` | `/prd/{project_id}/approvals` | List all approval records. |

### Feasibility (`/feasibility`)

Rate-limited to 5 requests / minute.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/feasibility/{project_id}/run` | Run a full feasibility check. Body: `{ client_name, country, industry, description }`. |
| `GET` | `/feasibility/{project_id}` | Retrieve the most recent feasibility report. |
| `POST` | `/feasibility/{project_id}/override` | **Admin only.** Override a RED block and advance the project to `gap_review`. |

```bash
curl -b cookies.txt -X POST http://localhost:8000/api/v1/feasibility/1/run \
  -H "Content-Type: application/json" \
  -d '{"client_name":"Acme Corp","country":"Germany","industry":"healthcare","description":"Cloud-hosted patient data platform"}'
```

### Export (`/export`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/export/{project_id}?format=pdf` | Download the latest PRD as `pdf` (default), `docx`, or `md`. Returns a binary attachment. |

### Queue (`/queue`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/queue/stats` | Active, queued, and scheduled Celery task counts across all workers. |
| `GET` | `/queue/tasks/{task_id}` | Status of a pipeline task: `queued \| processing \| retrying \| complete \| failed \| cancelled`. |
| `DELETE` | `/queue/tasks/{task_id}` | Cancel a pending/running task. |
| `POST` | `/queue/{project_id}/reprocess` | Re-enqueue all non-complete files for a project. Rate-limited: 10 / min. |

---

## Database

### Setup

Migrations are managed by Alembic. Run after first install and after pulling any new migration files:

```bash
cd backend
alembic upgrade head
```

### Schema

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `users` | `id`, `email`, `name`, `role`, `hashed_pw`, `created_at` | Roles: `ba_pm`, `admin`, `client` |
| `projects` | `id`, `name`, `client_org`, `stage`, `owner_id`, `gap_answers` (JSON) | 7-stage lifecycle |
| `source_files` | `id`, `project_id`, `storage_key`, `filename`, `file_type`, `transcript`, `status`, `created_at` | Status: `pending → queued → processing → complete / failed` |
| `requirements` | `id`, `project_id`, `section`, `content`, `source_refs` (JSON), `embedding` (vector 768), `confidence` | pgvector column — do not change the embedding model without a migration |
| `prd_versions` | `id`, `project_id`, `version`, `content` (JSON), `created_at` | JSON stores all 13 PRD sections plus `_gaps` and `_scores` |
| `approvals` | `id`, `project_id`, `approver_id`, `status`, `comment`, `created_at` | |
| `comments` | `id`, `project_id`, `user_id`, `content`, `parent_id`, `resolved`, `created_at` | Threaded via `parent_id` |
| `feasibility_reports` | `id`, `project_id`, `result` (JSON), `overall_status`, `created_at` | Status: `green`, `amber`, `red` |

### Migration Commands

```bash
# Show current revision
alembic current

# Show full migration history
alembic history --verbose

# Roll back one step
alembic downgrade -1

# Create a new migration
alembic revision -m "describe_your_change"
```

### Migration History

| Revision | Description |
|----------|-------------|
| `0001` | Initial schema — all core tables, pgvector extension |
| `0002` | Add feasibility report comments |
| `0003` | Add `comment.resolved` flag |
| `0004` | Add `project.gap_answers` JSON column |
| `0005` | Add `source_file.created_at` timestamp |

---

## Testing

Tests hit a **real PostgreSQL database** (`prdportal_test`). Database mocking is intentionally avoided.

### Setup

Create the test database before running tests:

```bash
# Using psql directly
createdb -U prduser prdportal_test

# Or via the Docker container
docker exec -it <postgres-container-name> psql -U prduser -c "CREATE DATABASE prdportal_test;"
```

The test database URL (`postgresql+asyncpg://prduser:prdpass@localhost:5432/prdportal_test`) is defined in `backend/tests/conftest.py`. The schema is created and torn down automatically per test session.

### Running Tests

```bash
cd backend

# All tests
pytest

# Single test file
pytest tests/test_transcription.py

# Single test by name
pytest -k "test_register_and_login"

# Verbose output
pytest -v
```

### Test Suites

| File | What it covers |
|------|----------------|
| `tests/test_pipeline_integration.py` | Auth (register/login), project CRUD, file upload enqueue, health endpoint |
| `tests/test_transcription.py` | Transcription service unit tests |
| `tests/locustfile.py` | Load testing — run with `locust -f tests/locustfile.py` |

### Dev-only Tools

```bash
# Check for known vulnerabilities in dependencies
pip-audit

# Static security analysis
bandit -r app/
```

---

## Deployment

### Docker (Recommended)

```bash
# Start all production services
docker compose -f docker-compose.prod.yml up -d

# Apply database migrations inside the running API container
docker compose -f docker-compose.prod.yml exec api alembic upgrade head

# Follow API logs
docker compose -f docker-compose.prod.yml logs -f api

# Follow worker logs
docker compose -f docker-compose.prod.yml logs -f worker
```

The production Compose file (`docker-compose.prod.yml`) reads from `.env.prod` and adds:
- `restart: unless-stopped` on all services
- Health check on the API container (`GET /health`, 30s interval)
- Celery worker with `--concurrency=4`
- Celery Flower monitoring UI on port 5555

### Manual Deployment

```bash
# API server — production mode
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4

# Celery worker
PYTHONPATH=. celery -A workers.celery_app worker --loglevel=info --concurrency=4

# Celery Flower
PYTHONPATH=. celery -A workers.celery_app flower --port=5555
```

### CI/CD

No CI/CD pipeline configuration was found in the repository at the time of writing.

---

## Troubleshooting

### API server fails to start — `RuntimeError: GEMINI_API_KEY is not set`

The server validates required environment variables on startup. Ensure `GEMINI_API_KEY` and `OPENAI_API_KEY` are set in `.env` in the **project root** (not inside `backend/`).

### Pipeline tasks stay in `queued` status

The Celery worker is not running. Start it:

```bash
cd backend
PYTHONPATH=. celery -A workers.celery_app worker --loglevel=info
```

### Celery worker cannot connect to Redis

```bash
# Check Redis container
docker compose ps redis

# Test from the host
redis-cli -u redis://localhost:6379 ping   # should return PONG
```

### MinIO bucket not found on first upload

The storage service attempts to create the bucket automatically. If it fails, create it manually via the MinIO console at `http://localhost:9001` (default credentials: `minioadmin` / `minioadmin`) or via the CLI:

```bash
docker exec <minio-container> mc alias set local http://localhost:9000 minioadmin minioadmin
docker exec <minio-container> mc mb local/prd-files
```

### `pgvector` extension not found

Run the initial migration:

```bash
cd backend
alembic upgrade head
```

Migration `0001` executes `CREATE EXTENSION IF NOT EXISTS vector` automatically.

### Audio transcription fails for large files

Whisper has a 25 MB API file size limit. The transcription service uses `ffmpeg` to compress audio before uploading. Ensure `ffmpeg` is available in the execution environment — it is installed automatically in the Docker image. When running outside Docker, install it separately (`apt install ffmpeg` / `brew install ffmpeg`).

### Password reset codes are not being emailed in development

When `SMTP_ENABLED=false` (the default), reset codes are logged at `WARNING` level in the API server terminal:

```
WARNING  app.api.auth: [DEV] Password reset code for user@example.com: 123456
```

### Embedding dimension mismatch after changing `GEMINI_EMBEDDING_MODEL`

The `requirements.embedding` pgvector column is fixed at 768 dimensions. Switching to an embedding model that produces a different dimension requires a new Alembic migration to `ALTER COLUMN embedding TYPE vector(N)`.

---

## Security Considerations

### Authentication & Session Management

- Passwords are hashed with **bcrypt** (adaptive cost, randomly salted per hash)
- JWT tokens are signed with **HS256** and stored in **`httpOnly`, `SameSite=Lax` cookies** — not accessible to JavaScript
- Token expiry defaults to 8 hours; the frontend silently refreshes every 20 minutes
- **Admin accounts** cannot be created via self-registration — only by a logged-in admin or programmatically at the DB level
- **Invite links** are single-use, 72-hour expiry, and pin the role at issue time (the registrant cannot escalate)

### Rate Limiting

| Endpoint | Limit |
|----------|-------|
| Login | 10 attempts / IP / 15 min |
| Forgot-password requests | 3 / email / hour |
| Reset-code verification | Locked after 5 wrong codes / 15 min |
| Feasibility checks | 5 / IP / min |
| Reprocess endpoint | 10 / IP / min |

### Data Protection

- **PII redaction** strips personal identifiers from transcripts before they are persisted
- **Project scoping** — non-admin users can only access their own projects
- **CORS** is restricted to the origins listed in `CORS_ORIGINS`

### Known Production Hardening Steps

- Generate a strong `JWT_SECRET_KEY` (`openssl rand -hex 32`) before deploying
- Set `secure=True` on the auth cookie in `backend/app/api/auth.py:87` when serving over HTTPS
- Set `REGISTRATION_OPEN=false` for closed-access deployments
- Set `MINIO_USE_SSL=true` when MinIO is behind a TLS terminator

### Feasibility Agent Limitations

The feasibility agent's OFAC / UN / EU / UK sanctions reference data is a **static training-data snapshot** and may be outdated. Enable `TAVILY_API_KEY` for live web search verification. Without it, the agent explicitly marks results as requiring manual verification against authoritative sources (OFAC SDN search, UN Consolidated Sanctions List, EU EEAS, UK OFSI).

---

## Contributing

### Development Workflow

1. Create a feature branch from `main`
2. Start the development stack (`docker compose up -d`)
3. Implement your changes
4. Run the test suite and security tools before committing:

```bash
cd backend
pytest
bandit -r app/
pip-audit
```

### Database Changes

Always create a new Alembic migration — never modify existing migration files:

```bash
cd backend
alembic revision -m "add_feature_x"
# Edit the generated file in alembic/versions/
alembic upgrade head
```

### Branching Strategy

- `main` — stable, deployable
- `feature/<description>` — new features
- `fix/<description>` — bug fixes

### Pull Request Process

1. Ensure all tests pass (`pytest`)
2. Ensure no new high-severity `bandit` findings are introduced
3. Include a clear description of what changed and why
4. Tag the PR with the relevant area: `pipeline`, `api`, `frontend`, or `infra`

---

## License

No license file was found in the repository at the time of writing. Contact the project maintainers for licensing information.

---

*Xccelera PRD Portal*
