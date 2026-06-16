import pytest
from httpx import AsyncClient


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
