import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

TEST_DB_URL = "postgresql+asyncpg://prduser:prdpass@localhost:5432/prdportal_test"


async def _get_token(client: AsyncClient) -> str:
    """Register a test user and return a JWT token."""
    await client.post("/api/v1/auth/register", json={
        "email": "ba@test.com", "name": "Test BA", "password": "testpass", "role": "ba_pm"
    })
    resp = await client.post("/api/v1/auth/login", json={"email": "ba@test.com", "password": "testpass"})
    return resp.json()["access_token"]


@pytest.mark.asyncio
async def test_register_and_login(client: AsyncClient):
    resp = await client.post("/api/v1/auth/register", json={
        "email": "new@test.com", "name": "New User", "password": "secret", "role": "ba_pm"
    })
    assert resp.status_code == 201
    assert "access_token" in resp.json()


@pytest.mark.asyncio
async def test_create_and_get_project(client: AsyncClient):
    token = await _get_token(client)
    headers = {"Authorization": f"Bearer {token}"}

    create = await client.post("/api/v1/projects/", json={"name": "Test Project", "client_org": "Acme"}, headers=headers)
    assert create.status_code == 201
    project_id = create.json()["id"]

    get = await client.get(f"/api/v1/projects/{project_id}", headers=headers)
    assert get.status_code == 200
    assert get.json()["name"] == "Test Project"


@pytest.mark.asyncio
async def test_upload_queues_pipeline(client: AsyncClient):
    token = await _get_token(client)
    headers = {"Authorization": f"Bearer {token}"}

    create = await client.post("/api/v1/projects/", json={"name": "Upload Test", "client_org": "Corp"}, headers=headers)
    project_id = create.json()["id"]

    files = {"file": ("test.mp4", b"fake-video-bytes", "video/mp4")}
    resp = await client.post(f"/api/v1/files/{project_id}/upload", files=files, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "queued"


@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


# ── PRD regeneration tests ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_regenerate_prd_endpoint_returns_queued(client: AsyncClient, db_session):
    token = await _get_token(client)
    headers = {"Authorization": f"Bearer {token}"}

    create = await client.post(
        "/api/v1/projects/",
        json={"name": "Regen Endpoint Test", "client_org": "Corp"},
        headers=headers,
    )
    assert create.status_code == 201
    project_id = create.json()["id"]

    resp = await client.post(f"/api/v1/prd/{project_id}/regenerate", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "queued"
    assert "task_id" in data


@pytest.mark.asyncio
async def test_regenerate_prd_blocks_approved_project(client: AsyncClient, db_session):
    from app.models.project import Project, ProjectStage

    token = await _get_token(client)
    headers = {"Authorization": f"Bearer {token}"}

    create = await client.post(
        "/api/v1/projects/",
        json={"name": "Approved Project", "client_org": "Corp"},
        headers=headers,
    )
    assert create.status_code == 201
    project_id = create.json()["id"]

    project = await db_session.get(Project, project_id)
    project.stage = ProjectStage.approved
    await db_session.commit()

    resp = await client.post(f"/api/v1/prd/{project_id}/regenerate", headers=headers)
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_regenerate_prd_creates_new_version_with_gap_context(db_session):
    """Full integration: verifies regenerate_prd_for_project produces a new
    PRDVersion (version = old + 1, source = 'regeneration') that incorporates
    the gap answer, and transitions the project to 'drafted'.

    Requires GEMINI_API_KEY to be set — makes real LLM calls.
    """
    from app.models.comment import Comment
    from app.models.project import Project, ProjectStage
    from app.models.prd_version import PRDVersion
    from app.models.requirement import Requirement
    from app.models.user import User
    from app.pipeline.regenerate import regenerate_prd_for_project

    # Build a session factory pointing at the test DB (same target as conftest)
    test_engine = create_async_engine(TEST_DB_URL, poolclass=NullPool)
    test_factory = async_sessionmaker(test_engine, expire_on_commit=False)

    # ── Seed test data ──────────────────────────────────────────────────────────
    owner = User(
        name="BA Regen",
        email="ba_regen_int@test.com",
        hashed_pw="x",
        role="ba_pm",
    )
    db_session.add(owner)
    await db_session.flush()

    project = Project(
        name="Regen Integration Project",
        client_org="TestCorp",
        owner_id=owner.id,
        gap_answers={"0": "UPI and credit cards only"},
    )
    db_session.add(project)
    await db_session.flush()
    project_id = project.id

    db_session.add(Requirement(
        project_id=project_id,
        section="functional_requirements",
        content="The system shall support payment processing.",
        source_refs={"file": "call.mp4", "timestamp": "00:00"},
        embedding=[0.0] * 768,
        confidence=0.9,
    ))

    # Seed PRDVersion v1 with a gap question at index 0
    db_session.add(PRDVersion(
        project_id=project_id,
        version=1,
        source="pipeline",
        content={
            "functional_requirements": {
                "content": "Initial payment content.",
                "completeness": 0.5,
                "requirement_count": 1,
            },
            "_gaps": [
                {
                    "section": "functional_requirements",
                    "question": "Which payment methods should be supported?",
                    "priority": "high",
                }
            ],
            "_scores": {},
        },
    ))

    db_session.add(Comment(
        project_id=project_id,
        user_id=owner.id,
        content="Client confirmed: no cryptocurrency payments.",
        section="functional_requirements",
        resolved=True,
    ))

    project.stage = ProjectStage.gap_review
    await db_session.commit()

    # ── Run regeneration ────────────────────────────────────────────────────────
    await regenerate_prd_for_project(project_id, session_factory=test_factory)

    # ── Assertions ──────────────────────────────────────────────────────────────
    versions = (await db_session.execute(
        select(PRDVersion)
        .where(PRDVersion.project_id == project_id)
        .order_by(PRDVersion.version)
    )).scalars().all()

    await db_session.refresh(project)

    assert len(versions) == 2, "Expected exactly two PRDVersions (v1 original + v2 regenerated)"

    v2 = versions[-1]
    assert v2.version == 2
    assert v2.source == "regeneration"
    assert project.stage == ProjectStage.drafted

    # The LLM was given "UPI and credit cards only" as the gap answer —
    # at least one of those terms should appear in the generated section.
    section_content = v2.content.get("functional_requirements", {}).get("content", "")
    assert section_content, "Expected non-empty content for functional_requirements"
    assert "UPI" in section_content or "credit card" in section_content.lower(), (
        "Gap answer ('UPI and credit cards only') was not reflected in generated content"
    )

    await test_engine.dispose()
