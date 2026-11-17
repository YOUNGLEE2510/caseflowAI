"""Compare location/time baseline and the production related-case ranker on synthetic fixtures."""
import json
from hashlib import sha256
from pathlib import Path
from .related import RelatedRequest, rank_related

FIXTURE = Path(__file__).parent / "tests" / "fixtures" / "rental_related_scenarios.json"

def evaluate(path=FIXTURE, threshold=0.5):
    scenarios = json.loads(path.read_text(encoding="utf-8"))
    results = {}
    for baseline in [True, False]:
        tp = fp = fn = 0
        details = []
        for row in scenarios:
            query = RelatedRequest(source=row["source"], items=row["items"], threshold=threshold)
            predicted = {item["id"] for item in rank_related(query, baseline=baseline)["matches"]}
            expected = set(row["expectedIds"])
            tp += len(predicted & expected)
            fp += len(predicted - expected)
            fn += len(expected - predicted)
            details.append({"scenario": row["id"], "expected": sorted(expected), "predicted": sorted(predicted),
                            "falseLinks": sorted(predicted - expected), "missed": sorted(expected - predicted)})
        precision = tp / (tp + fp) if tp + fp else 0
        recall = tp / (tp + fn) if tp + fn else 0
        results["location_time" if baseline else "text_context"] = {
            "precision": precision, "recall": recall,
            "f1": 2 * precision * recall / (precision + recall) if precision + recall else 0,
            "truePositive": tp, "falsePositive": fp, "falseNegative": fn, "scenarios": details}
    return {"datasetKind": "synthetic-scenarios", "scenarios": len(scenarios),
            "fixtureSha256": sha256(path.read_bytes()).hexdigest(), "threshold": threshold,
            "confidenceCalibrated": False, "results": results,
            "limitations": "Seven hand-authored scenarios, including simple positive pairs and hard negatives. Not a generalization or field-efficiency estimate. Threshold not tuned on these scenarios."}

if __name__ == "__main__":
    output = Path("artifacts/ai-evaluation/rental-related.json")
    output.parent.mkdir(parents=True, exist_ok=True)
    report = evaluate()
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), "datasetKind": report["datasetKind"],
                      "metrics": {key: {k: v for k, v in value.items() if k != "scenarios"} for key, value in report["results"].items()}}))
