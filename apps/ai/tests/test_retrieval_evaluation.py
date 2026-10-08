import csv
import json
from pathlib import Path

import pytest

from apps.ai.evaluate_retrieval import evaluate


def test_retrieval_evaluation_reports_hits_and_refusal(tmp_path):
    articles = tmp_path / "knowledge.json"
    articles.write_text(json.dumps([
        {"id": "it", "title": "Khoi phuc tai khoan", "content": "Mo cong SIS va chon dat lai mat khau.", "category": "it_access", "sourceLabel": "IT"},
        {"id": "finance", "title": "Hoc phi", "content": "Cung cap ma giao dich de doi soat hoc phi.", "category": "finance", "sourceLabel": "Finance"},
    ]), encoding="utf-8")
    questions = tmp_path / "questions.csv"
    with questions.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=["query", "expected_ids", "answerable"])
        writer.writeheader()
        writer.writerows([
            {"query": "dat lai mat khau SIS", "expected_ids": "it", "answerable": "true"},
            {"query": "quy dinh noi tru ky tuc xa", "expected_ids": "", "answerable": "false"},
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
        {"id": "it", "title": "Tai khoan", "content": "Dat lai mat khau.", "category": "it_access", "sourceLabel": "IT"},
    ]), encoding="utf-8")
    questions = tmp_path / "questions.csv"
    questions.write_text(
        "id,query,expected_ids,answerable\nq1,dat lai mat khau,missing,true\n",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="unknown article ids"):
        evaluate(articles, questions)


def test_retrieval_demo_fixture_exercises_refusal_path():
    fixtures = Path(__file__).parent / "fixtures"
    report = evaluate(
        fixtures / "retrieval_demo_articles.json",
        fixtures / "retrieval_demo_questions.csv",
    )

    assert report["metadata"]["question_count"] == 15
    assert report["metrics"]["unanswerable_questions"] == 3
    assert report["metrics"]["refusal_rate"] == 1
