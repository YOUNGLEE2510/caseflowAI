from fastapi.testclient import TestClient
from apps.ai.app import app


def test_internal_token_required(monkeypatch):
    monkeypatch.setenv("AI_INTERNAL_TOKEN", "test-internal-secret")
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        assert client.post("/classify", json={"text": "test"}).status_code == 401
        assert client.post("/classify", headers={"X-Internal-Token": "wrong"}, json={"text": "test"}).status_code == 401
        assert client.post("/classify", headers={"X-Internal-Token": "test-internal-secret"}, json={"text": "test"}).status_code != 401
