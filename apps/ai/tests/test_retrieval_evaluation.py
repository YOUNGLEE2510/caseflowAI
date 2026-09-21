import csv
import json

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
