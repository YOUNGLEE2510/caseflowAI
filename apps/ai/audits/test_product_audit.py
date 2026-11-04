import pytest
from pydantic import ValidationError
from fastapi.testclient import TestClient

from apps.ai.app import app
from apps.ai.routers.knowledge import retrieve_knowledge
from apps.ai.schemas import KnowledgeArticle, KnowledgeRequest, SimilarityRequest


def article():
    return KnowledgeArticle(
        id="audit-wifi", title="Kết nối Wi-Fi campus", category="it_access",
        content="Sử dụng tài khoản được cấp. Nếu không kết nối được, quên mạng cũ rồi đăng nhập lại.",
        sourceLabel="Isolated audit fixture, not an institutional policy",
    )


def test_f27_retrieval_returns_actionable_body_not_only_a_matching_title():
    result = retrieve_knowledge(KnowledgeRequest(query="không kết nối Wi-Fi", articles=[article()]))
    assert result["citations"]
    excerpt = result["citations"][0]["excerpt"]
    assert excerpt != article().title
    assert "đăng nhập lại" in excerpt


def test_retrieval_abstains_when_no_sources_exist():
    assert retrieve_knowledge(KnowledgeRequest(query="khôi phục mật khẩu", articles=[]))["citations"] == []


def test_similarity_rejects_more_than_100_candidates():
    with pytest.raises(ValidationError):
        SimilarityRequest(text="audit request", items=[{"id": str(i), "title": "Fixture", "text": "Fixture text"} for i in range(101)])


@pytest.mark.parametrize("due_hours", ["NaN", "Infinity"])
def test_sla_rejects_non_finite_deadlines(due_hours, monkeypatch):
    monkeypatch.setenv("AI_INTERNAL_TOKEN", "audit-fixture-token")
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post("/sla/predict", headers={"X-Internal-Token": "audit-fixture-token"}, json={"elapsedHours": 1, "dueHours": due_hours, "transfers": 0, "workload": 1, "remainingSteps": 1, "priority": "normal"})
    assert response.status_code == 422


def test_sla_accepts_valid_finite_input(monkeypatch):
    monkeypatch.setenv("AI_INTERNAL_TOKEN", "audit-fixture-token")
    with TestClient(app) as client:
        response = client.post("/sla/predict", headers={"X-Internal-Token": "audit-fixture-token"}, json={"elapsedHours": 1, "dueHours": 8, "transfers": 0, "workload": 1, "remainingSteps": 1, "priority": "normal"})
    assert response.status_code == 200
    assert 0 <= response.json()["riskScore"] <= 1
