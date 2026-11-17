from apps.ai.evaluate_related import evaluate
from apps.ai.related import RelatedRequest, rank_related

def test_stable_scores_and_context_boundaries():
    source = {"id": "source", "title": "Water", "text": "Nước yếu ở tất cả vòi từ sáng",
              "propertyCode": "A", "createdAt": "2026-11-01T08:00:00Z"}
    item = {**source, "id": "match"}
    score = rank_related(RelatedRequest(source=source, items=[item]))["matches"][0]["score"]
    extra = {**item, "id": "unrelated", "text": "Khóa cửa bị kẹt"}
    batch = rank_related(RelatedRequest(source=source, items=[item, extra]))["matches"]
    assert next(row["score"] for row in batch if row["id"] == "match") == score
    assert not rank_related(RelatedRequest(source=source, items=[{**item, "propertyCode": "B"}]))["matches"]
    assert not rank_related(RelatedRequest(source=source, items=[{**item, "status": "resolved"}]))["matches"]

def test_synthetic_evaluation_records_errors_without_claiming_field_results():
    result = evaluate()
    assert result["datasetKind"] == "synthetic-scenarios"
    assert result["results"]["text_context"]["falseNegative"] > 0
    assert result["results"]["text_context"]["falsePositive"] > 0
