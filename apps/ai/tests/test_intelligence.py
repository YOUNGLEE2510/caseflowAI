from apps.ai.schemas import KnowledgeArticle, KnowledgeRequest
from apps.ai.config import TRAINING_EXAMPLES
from apps.ai.models.classifier import classify_text
from apps.ai.models.text_utils import extract_entities
from apps.ai.routers.knowledge import retrieve_knowledge


def test_training_taxonomy_matches_rental_service_catalog():
    assert set(TRAINING_EXAMPLES) == {
        "water",
        "electrical",
        "internet",
        "appliances",
        "access_security",
        "general_support",
    }
    assert sum(len(samples) for samples in TRAINING_EXAMPLES.values()) == 300
    assert all(len(samples) == 50 for samples in TRAINING_EXAMPLES.values())


def test_classifies_internet_request():
    result = classify_text("Wifi trong căn mất kết nối liên tục từ tối qua")
    assert result["label"] == "internet"
    assert result["confidence"] > 0.2


def test_entity_extraction_never_returns_personal_numbers():
    assert not any("0912345678" in value for value in extract_entities("Số điện thoại của tôi là 0912345678").values())


def test_classifies_appliance_request_with_location():
    result = classify_text("Điều hòa phòng D5-301 bị hỏng")
    assert result["label"] == "appliances"
    assert result["confidence"] > 0.2
    assert result["extracted"]["location"] == "D5-301"


def test_classifies_representative_requests():
    samples = {
        "water": "Ống nước dưới bồn rửa bị rò ra sàn",
        "electrical": "Cầu dao nhảy liên tục, cả căn mất điện",
        "access_security": "Thẻ từ không mở được cửa căn",
        "general_support": "Tôi cần ban quản lý hướng dẫn thủ tục gia hạn hợp đồng",
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
                title="Đối soát tiền thuê",
                content="Người thuê cung cấp mã giao dịch chuyển khoản để đối soát tiền thuê.",
                category="finance",
                sourceLabel="Quy trình tài chính",
            ),
        ],
        topK=2,
    )

    result = retrieve_knowledge(request)
    assert result["citations"]
    assert result["citations"][0]["id"] == "facilities-1"


def test_retrieval_cites_relevant_passage_beyond_document_opening():
    filler = "Quy trình đăng ký gửi xe và sử dụng phòng sinh hoạt chung. " * 18
    request = KnowledgeRequest(
        query="Tài khoản bị khóa thì đặt lại mật khẩu bằng cách nào?",
        articles=[KnowledgeArticle(id="account", title="Hướng dẫn hỗ trợ", content=filler + "\n\nTài khoản bị khóa: người thuê mở trang đăng nhập CaseFlow và chọn Đặt lại mật khẩu.", category="it_access", sourceLabel="IT")],
    )
    result = retrieve_knowledge(request)
    assert result["citations"][0]["id"] == "account"
    assert "Đặt lại mật khẩu" in result["citations"][0]["excerpt"]


def test_retrieval_reuses_index_for_same_articles():
    from apps.ai.routers.knowledge import index_articles
    request = KnowledgeRequest(query="khóa tài khoản", articles=[KnowledgeArticle(id="a", title="Tài khoản", content="Khóa tài khoản thì liên hệ bộ phận IT.", category="it_access", sourceLabel="IT")])
    index_articles.cache_clear()
    retrieve_knowledge(request)
    retrieve_knowledge(request)
    assert index_articles.cache_info().hits == 1


def test_punctuation_only_retrieval_has_no_matches():
    from apps.ai.routers.similarity import similarity
    from apps.ai.schemas import SimilarItem, SimilarityRequest
    result = similarity(SimilarityRequest(text="!!!", items=[SimilarItem(id="1", title="?", text="...")]))
    assert result == {"matches": []}
    result = retrieve_knowledge(KnowledgeRequest(query="???", articles=[KnowledgeArticle(id="1", title="?", content="...", category="!", sourceLabel="Source")]))
    assert result["citations"] == []


def test_retrieval_matches_query_in_title_only():
    """Query matching an article's title but NOT its body should still return a citation."""
    request = KnowledgeRequest(
        query="đổi thẻ từ ra vào",
        articles=[
            KnowledgeArticle(
                id="title-match",
                title="Hướng dẫn đổi thẻ từ ra vào",
                content="Người thuê liên hệ ban quản lý để được hỗ trợ thủ tục liên quan.",
                category="access_security",
                sourceLabel="Quy trình an ninh",
            ),
            KnowledgeArticle(
                id="unrelated",
                title="Chính sách bảo mật thông tin",
                content="Hệ thống lưu trữ dữ liệu được mã hóa và sao lưu định kỳ.",
                category="it_access",
                sourceLabel="Chính sách CNTT",
            ),
        ],
        topK=2,
    )
    result = retrieve_knowledge(request)
    assert result["citations"], "Expected at least one citation for title-matching query"
    assert result["citations"][0]["id"] == "title-match"
