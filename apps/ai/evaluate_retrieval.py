"""Evaluate CaseFlow retrieval with a reviewed question-to-source benchmark."""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

from pydantic import ValidationError

try:
    from .routers.knowledge import retrieve_knowledge
    from .schemas import KnowledgeArticle, KnowledgeRequest
except ImportError:
    from routers.knowledge import retrieve_knowledge
    from schemas import KnowledgeArticle, KnowledgeRequest


def load_articles(path: Path) -> list[KnowledgeArticle]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError("Knowledge file must be a JSON array")
    try:
        return [KnowledgeArticle.model_validate(item) for item in payload]
    except ValidationError as error:
        raise ValueError(f"Invalid knowledge article: {error}") from error


def evaluate(articles_path: Path, questions_path: Path) -> dict:
    articles = load_articles(articles_path)
    with questions_path.open(encoding="utf-8-sig", newline="") as stream:
        questions = list(csv.DictReader(stream))
    if not questions or not {"query", "expected_ids", "answerable"}.issubset(questions[0]):
        raise ValueError("Questions CSV must include query,expected_ids,answerable")

    answerable_results: list[dict] = []
    unanswerable_results: list[bool] = []
    predictions: list[dict] = []
    for row in questions:
        answerable = row["answerable"].strip().lower() in {"1", "true", "yes"}
        expected = {value.strip() for value in row["expected_ids"].split(";") if value.strip()}
        if answerable and not expected:
            raise ValueError("Answerable question is missing expected_ids")
        result = retrieve_knowledge(KnowledgeRequest(query=row["query"], articles=articles, topK=5))
        retrieved = [citation["id"] for citation in result["citations"]]
        predictions.append({"query": row["query"], "answerable": answerable, "expected_ids": sorted(expected), "retrieved_ids": retrieved})
        if answerable:
            ranks = [index + 1 for index, item in enumerate(retrieved) if item in expected]
            first_rank = min(ranks) if ranks else None
            answerable_results.append({"hit1": first_rank == 1, "hit3": bool(first_rank and first_rank <= 3), "recall5": bool(ranks), "rr": 1 / first_rank if first_rank else 0})
        else:
            unanswerable_results.append(not retrieved)

    if not answerable_results:
        raise ValueError("Benchmark needs at least one answerable question")
    mean = lambda values: round(sum(values) / len(values), 4)
    metrics = {
        "answerable_questions": len(answerable_results),
        "unanswerable_questions": len(unanswerable_results),
        "hit_at_1": mean([float(item["hit1"]) for item in answerable_results]),
        "hit_at_3": mean([float(item["hit3"]) for item in answerable_results]),
        "recall_at_5": mean([float(item["recall5"]) for item in answerable_results]),
        "mrr": mean([item["rr"] for item in answerable_results]),
        "refusal_rate": mean([float(item) for item in unanswerable_results]) if unanswerable_results else None,
    }
    return {"metrics": metrics, "predictions": predictions}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate CaseFlow RAG retrieval")
    parser.add_argument("--articles", type=Path, required=True, help="JSON array of approved articles")
    parser.add_argument("--questions", type=Path, required=True, help="CSV query,expected_ids,answerable")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = evaluate(args.articles, args.questions)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report["metrics"], ensure_ascii=False, indent=2))
