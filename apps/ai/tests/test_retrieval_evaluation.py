import csv
import json
from pathlib import Path

import pytest

from apps.ai.evaluate_retrieval import evaluate


def test_retrieval_evaluation_reports_hits_and_refusal(tmp_path):
    articles = tmp_path / "knowledge.json"
    articles.write_text(json.dumps([
        {"id": "card", "title": "Cap lai the ra vao", "content": "Khoa the cu va xac minh nguoi thue truoc khi cap the moi.", "category": "access_security", "sourceLabel": "An ninh"},
        {"id": "ac", "title": "Dieu hoa khong lanh", "content": "Kiem tra che do Cool va ve sinh luoi loc dieu hoa.", "category": "appliances", "sourceLabel": "Dien lanh"},
    ]), encoding="utf-8")
    questions = tmp_path / "questions.csv"
    with questions.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=["query", "expected_ids", "answerable"])
        writer.writeheader()
        writer.writerows([
            {"query": "cap lai the ra vao bi mat", "expected_ids": "card", "answerable": "true"},
            {"query": "gui xe may tang ham", "expected_ids": "", "answerable": "false"},
        ])

    report = evaluate(articles, questions)
    assert report["metrics"]["hit_at_1"] == 1
    assert report["metrics"]["recall_at_5"] == 1
    assert report["metrics"]["refusal_rate"] == 1
    assert report["metadata"]["article_count"] == 2
    assert report["metadata"]["question_count"] == 2


def test_retrieval_evaluation_rejects_invalid_ground_truth(tmp_path):
    articles = tmp_path / "knowledge.json"
    articles.write_text(json.dumps([
        {"id": "card", "title": "The ra vao", "content": "Khoa the cu khi mat the.", "category": "access_security", "sourceLabel": "An ninh"},
    ]), encoding="utf-8")
    questions = tmp_path / "questions.csv"
    questions.write_text(
        "id,query,expected_ids,answerable\nq1,khoa the cu,missing,true\n",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="unknown article ids"):
        evaluate(articles, questions)


def test_rental_knowledge_benchmark_guards_retrieval_and_abstention():
    # Locked test questions; the score threshold was chosen on the separate dev set.
    data = Path(__file__).resolve().parents[1] / "data"
    report = evaluate(data / "rental_knowledge.json", data / "rental_retrieval_questions.csv")

    assert report["metadata"]["article_count"] == 28
    assert report["metadata"]["question_count"] == 64
    assert report["metrics"]["unanswerable_questions"] == 12
    assert report["metrics"]["hit_at_3"] >= 0.8
    assert report["metrics"]["refusal_rate"] >= 0.5
