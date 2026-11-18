"""Analyse user-study and labelling data collected by people (never generated here).

Subcommands
  timing     CSV participant,scenario_group,condition,started_at,confirmed_at,classification_correct,duplicate_jobs,false_links
             condition is "manual" or "assisted"; timestamps are ISO 8601 with time zone.
  sus        CSV participant,q1..q10 with answers 1-5 (standard System Usability Scale).
  agreement  CSV id,text,annotator_a,annotator_b with category labels; reports Cohen's kappa.

Examples
  python -m apps.ai.analyze_study timing docs/study/timing.csv
  python -m apps.ai.analyze_study sus docs/study/sus.csv
  python -m apps.ai.analyze_study agreement docs/study/annotations.csv --output artifacts/study/agreement.json
"""
from __future__ import annotations

import argparse
import csv
import json
import statistics
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

from sklearn.metrics import cohen_kappa_score, confusion_matrix

CONDITIONS = ("manual", "assisted")


def _rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return [{key.strip(): (value or "").strip() for key, value in row.items()} for row in csv.DictReader(stream)]


def _bool(value: str, field: str) -> bool:
    if value.lower() in {"true", "1", "yes", "co", "có"}:
        return True
    if value.lower() in {"false", "0", "no", "khong", "không"}:
        return False
    raise ValueError(f"{field} must be true/false, got {value!r}")


def _quartiles(values: list[float]) -> tuple[float, float]:
    if len(values) < 2:
        return values[0], values[0]
    q = statistics.quantiles(values, n=4, method="inclusive")
    return q[0], q[2]


def analyse_timing(path: Path) -> dict:
    rows = _rows(path)
    required = {"participant", "scenario_group", "condition", "started_at", "confirmed_at", "classification_correct"}
    if not rows or not required.issubset(rows[0]):
        raise ValueError(f"Timing CSV needs columns: {', '.join(sorted(required))}")
    by_condition: dict[str, list[dict]] = defaultdict(list)
    for index, row in enumerate(rows, start=2):
        if row["condition"] not in CONDITIONS:
            raise ValueError(f"Line {index}: condition must be manual or assisted")
        started, confirmed = datetime.fromisoformat(row["started_at"]), datetime.fromisoformat(row["confirmed_at"])
        if started.tzinfo is None or confirmed.tzinfo is None:
            raise ValueError(f"Line {index}: timestamps need a time zone, e.g. 2026-11-20T09:15:00+07:00")
        seconds = (confirmed - started).total_seconds()
        if seconds < 0:
            raise ValueError(f"Line {index}: confirmed_at is before started_at")
        by_condition[row["condition"]].append({
            "participant": row["participant"], "seconds": seconds,
            "correct": _bool(row["classification_correct"], "classification_correct"),
            "duplicate_jobs": int(row.get("duplicate_jobs") or 0), "false_links": int(row.get("false_links") or 0),
        })
    summary = {}
    for condition in CONDITIONS:
        items = by_condition.get(condition, [])
        if not items:
            continue
        seconds = sorted(item["seconds"] for item in items)
        q1, q3 = _quartiles(seconds)
        summary[condition] = {
            "attempts": len(items), "participants": len({item["participant"] for item in items}),
            "median_seconds": round(statistics.median(seconds), 1), "q1_seconds": round(q1, 1), "q3_seconds": round(q3, 1),
            "classification_accuracy": round(sum(item["correct"] for item in items) / len(items), 4),
            "duplicate_jobs": sum(item["duplicate_jobs"] for item in items), "false_links": sum(item["false_links"] for item in items),
        }
    report: dict = {"conditions": summary}
    # Paired comparison per participant (median time in each condition), only when both conditions exist.
    medians = {condition: {p: statistics.median([i["seconds"] for i in by_condition[condition] if i["participant"] == p])
                           for p in {i["participant"] for i in by_condition.get(condition, [])}} for condition in CONDITIONS}
    paired = sorted(set(medians["manual"]) & set(medians["assisted"]))
    report["paired_participants"] = len(paired)
    if len(paired) >= 5:
        from scipy.stats import wilcoxon
        differences = [medians["assisted"][p] - medians["manual"][p] for p in paired]
        result = wilcoxon(differences)
        report["wilcoxon"] = {"statistic": float(result.statistic), "p_value": round(float(result.pvalue), 4),
                              "median_difference_seconds": round(statistics.median(differences), 1)}
    else:
        report["wilcoxon"] = "Cần ít nhất 5 người tham gia ở cả hai điều kiện để kiểm định cặp."
    return report


def analyse_sus(path: Path) -> dict:
    rows = _rows(path)
    scores = []
    for index, row in enumerate(rows, start=2):
        answers = []
        for number in range(1, 11):
            value = int(row[f"q{number}"])
            if not 1 <= value <= 5:
                raise ValueError(f"Line {index}: q{number} must be 1-5")
            answers.append(value)
        # Odd items are positive (score-1), even items negative (5-score); total x 2.5 gives 0-100.
        total = sum((value - 1) if number % 2 == 1 else (5 - value) for number, value in enumerate(answers, start=1))
        scores.append({"participant": row["participant"], "sus": total * 2.5})
    values = [item["sus"] for item in scores]
    return {"participants": len(values), "mean": round(statistics.mean(values), 1),
            "sd": round(statistics.stdev(values), 1) if len(values) > 1 else 0.0,
            "median": round(statistics.median(values), 1), "scores": scores,
            "note": "SUS 68 là mức trung bình thường được dùng làm ngưỡng tham chiếu."}


def analyse_agreement(path: Path) -> dict:
    rows = _rows(path)
    if not rows or not {"annotator_a", "annotator_b"}.issubset(rows[0]):
        raise ValueError("Agreement CSV needs annotator_a and annotator_b columns")
    rows = [row for row in rows if row["annotator_a"] and row["annotator_b"]]
    a, b = [row["annotator_a"] for row in rows], [row["annotator_b"] for row in rows]
    labels = sorted(set(a) | set(b))
    disagreements = [{"id": row.get("id", ""), "text": row.get("text", ""), "a": row["annotator_a"], "b": row["annotator_b"]}
                     for row in rows if row["annotator_a"] != row["annotator_b"]]
    return {"items": len(rows), "observed_agreement": round(sum(x == y for x, y in zip(a, b)) / len(rows), 4),
            "cohen_kappa": round(float(cohen_kappa_score(a, b)), 4), "labels": labels,
            "confusion_matrix": confusion_matrix(a, b, labels=labels).tolist(),
            "label_counts": {"a": dict(Counter(a)), "b": dict(Counter(b))}, "disagreements": disagreements}


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyse CaseFlow user-study and labelling data")
    parser.add_argument("kind", choices=["timing", "sus", "agreement"])
    parser.add_argument("path", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = {"timing": analyse_timing, "sus": analyse_sus, "agreement": analyse_agreement}[args.kind](args.path)
    text = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
