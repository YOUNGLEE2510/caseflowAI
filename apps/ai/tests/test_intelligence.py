from apps.ai.schemas import KnowledgeArticle, KnowledgeRequest
from apps.ai.config import TRAINING_EXAMPLES
from apps.ai.models.classifier import classify_text
from apps.ai.routers.knowledge import retrieve_knowledge


def test_training_taxonomy_matches_education_service_catalog():
    assert set(TRAINING_EXAMPLES) == {
        "it_access",
        "academic_records",
        "student_services",
        "facilities",
        "finance",
        "general_support",
    }
    assert sum(len(samples) for samples in TRAINING_EXAMPLES.values()) == 60


def test_classifies_login_request():
    result = classify_text("Em không đăng nhập được tài khoản SIS và đã thử đặt lại mật khẩu")
    assert result["label"] == "it_access"
    assert result["confidence"] > 0.2


def test_classifies_facilities_request():
    result = classify_text("Điều hòa phòng D5-301 bị hỏng và lớp học rất nóng")
    assert result["label"] == "facilities"
    assert result["confidence"] > 0.5
    assert result["extracted"]["location"] == "D5-301"


def test_classifies_representative_requests():
    samples = {
        "academic_records": "Điểm học phần cấu trúc dữ liệu chưa xuất hiện trong bảng điểm",
        "student_services": "Em cần cấp giấy xác nhận sinh viên để vay vốn",
        "finance": "Đã đóng học phí nhưng cổng thông tin vẫn báo còn công nợ",
        "general_support": "Tôi cần gặp cán bộ để được hướng dẫn một thủ tục chung",
    }
    for expected, text in samples.items():
        assert classify_text(text)["label"] == expected


def test_retrieval_returns_source_citation():
    request = KnowledgeRequest(
        query="Sự cố điều hòa phòng học cần ghi nhận gì?",
        articles=[
            KnowledgeArticle(
                id="facilities-1",
                title="Tiếp nhận sự cố cơ sở vật chất",
                content="Sự cố điều hòa cần ghi rõ tòa nhà, phòng và thời điểm phát hiện.",
                category="facilities",
                sourceLabel="Quy trình vận hành",
            ),
            KnowledgeArticle(
                id="finance-1",
                title="Đối soát học phí",
                content="Sinh viên cung cấp mã giao dịch thanh toán để đối soát.",
                category="finance",
                sourceLabel="Quy trình tài chính",
            ),
        ],
        topK=2,
    )

    result = retrieve_knowledge(request)
    assert result["citations"]
    assert result["citations"][0]["id"] == "facilities-1"


def test_punctuation_only_retrieval_has_no_matches():
    from apps.ai.routers.similarity import similarity
    from apps.ai.schemas import SimilarItem, SimilarityRequest
    result = similarity(SimilarityRequest(text="!!!", items=[SimilarItem(id="1", title="?", text="...")]))
    assert result == {"matches": []}
    result = retrieve_knowledge(KnowledgeRequest(query="???", articles=[KnowledgeArticle(id="1", title="?", content="...", category="!", sourceLabel="Source")]))
    assert result["citations"] == []
