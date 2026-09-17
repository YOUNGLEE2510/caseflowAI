"""Evaluate a frozen SLA predictor on independently labeled operational records."""
import argparse
import csv
import json
from pathlib import Path

import numpy as np
from sklearn.metrics import average_precision_score, brier_score_loss, precision_recall_curve, roc_auc_score
from apps.ai.models.sla_predictor import sla_model


def evaluate(path: Path) -> dict:
    with path.open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    if not rows:
        raise ValueError("Dataset is empty")
    priorities = {"low": 0, "normal": 1, "high": 2, "urgent": 3}
    features, labels = [], []
    for row in rows:
        elapsed, due = float(row["elapsedHours"]), float(row["dueHours"])
        if due <= 0 or elapsed < 0:
            raise ValueError("Invalid elapsedHours or dueHours")
        features.append([elapsed / due, int(row["transfers"]), int(row["workload"]), int(row["remainingSteps"]), priorities[row["priority"]], due])
        labels.append(int(row["breached"]))
    if set(labels) != {0, 1}:
        raise ValueError("Evaluation requires both breached and non-breached records")
    x = np.asarray(features)
    predictions = {"logistic_regression": sla_model.predict_proba(x)[:, 1], "elapsed_80_percent": (x[:, 0] >= .8).astype(float)}
    result = {}
    for name, scores in predictions.items():
        precision, recall, thresholds = precision_recall_curve(labels, scores)
        result[name] = {"rocAuc": float(roc_auc_score(labels, scores)), "averagePrecision": float(average_precision_score(labels, scores)), "brierScore": float(brier_score_loss(labels, scores)), "precision": precision.tolist(), "recall": recall.tolist(), "thresholds": thresholds.tolist()}
    return {"samples": len(rows), "models": result, "trainingSource": "synthetic baseline; external evaluation does not change the deployed model"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("artifacts/sla-evaluation.json"))
    args = parser.parse_args()
    report = evaluate(args.dataset)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Evaluated {report['samples']} records: {args.output}")
