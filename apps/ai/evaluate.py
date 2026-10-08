from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.pipeline import Pipeline
from sklearn.svm import LinearSVC

try:
    from .config import TRAINING_EXAMPLES
except ImportError:
    from config import TRAINING_EXAMPLES


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATASET = Path(__file__).with_name("tests") / "fixtures" / "evaluation_demo.csv"
DEFAULT_OUTPUT = ROOT / "docs" / "ai-evaluation"


def load_evaluation_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        rows = [
            {"text": row.get("text", "").strip(), "label": row.get("label", "").strip()}
            for row in csv.DictReader(stream)
        ]
    rows = [row for row in rows if row["text"] and row["label"]]
    allowed = set(TRAINING_EXAMPLES)
    unknown = sorted({row["label"] for row in rows} - allowed)
    if unknown:
        raise ValueError(f"Unknown labels: {', '.join(unknown)}")
    missing = sorted(allowed - {row["label"] for row in rows})
    if missing:
        raise ValueError(f"Evaluation dataset is missing labels: {', '.join(missing)}")
    if any(count < 2 for count in Counter(row["label"] for row in rows).values()):
        raise ValueError("Evaluation dataset needs at least two examples per category")
    return rows


def training_rows() -> tuple[list[str], list[str]]:
    texts: list[str] = []
    labels: list[str] = []
    for label, examples in TRAINING_EXAMPLES.items():
        texts.extend(examples)
        labels.extend([label] * len(examples))
    return texts, labels


def model_factories() -> dict[str, Callable[[], Pipeline]]:
    import sys
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    from apps.ai.models.classifier import classifier_pipeline
    classifier = lambda: LogisticRegression(  # noqa: E731
        max_iter=1_000, class_weight="balanced", C=20.0, random_state=42
    )
    return {
        "hybrid_tfidf_logreg": lambda: classifier_pipeline("hybrid"),
        "word_tfidf_svm": lambda: Pipeline([
            ("tfidf", TfidfVectorizer(lowercase=True, ngram_range=(1, 2), sublinear_tf=True)),
            ("classifier", LinearSVC(class_weight="balanced", random_state=42)),
        ]),
        "word_tfidf_logreg": lambda: Pipeline(
            [
                ("tfidf", TfidfVectorizer(lowercase=True, ngram_range=(1, 2), sublinear_tf=True)),
                ("classifier", classifier()),
            ]
        ),
        "char_tfidf_logreg": lambda: Pipeline(
            [
                ("tfidf", TfidfVectorizer(lowercase=True, analyzer="char_wb", ngram_range=(3, 5), min_df=1, sublinear_tf=True)),
                ("classifier", classifier()),
            ]
        ),
    }


def evaluate(dataset: Path) -> tuple[dict, list[dict[str, str]], list[str]]:
    rows = load_evaluation_rows(dataset)
    train_texts, train_labels = training_rows()
    normalized_train = {" ".join(value.casefold().split()) for value in train_texts}
    normalized_test = [" ".join(row["text"].casefold().split()) for row in rows]
    if normalized_train.intersection(normalized_test):
        raise ValueError("Training/evaluation overlap detected")
    if len(set(normalized_test)) != len(normalized_test):
        raise ValueError("Duplicate evaluation examples detected")
    test_texts = [row["text"] for row in rows]
    expected = [row["label"] for row in rows]
    labels = list(TRAINING_EXAMPLES)
    results: dict[str, dict] = {}
    predictions: list[dict[str, str]] = []

    for name, factory in model_factories().items():
        model = factory()
        model.fit(train_texts, train_labels)
        predicted = model.predict(test_texts).tolist()
        report = classification_report(expected, predicted, labels=labels, output_dict=True, zero_division=0)
        results[name] = {
            "accuracy": round(float(accuracy_score(expected, predicted)), 4),
            "precisionMacro": round(float(precision_score(expected, predicted, average="macro", zero_division=0)), 4),
            "recallMacro": round(float(recall_score(expected, predicted, average="macro", zero_division=0)), 4),
            "f1Macro": round(float(f1_score(expected, predicted, average="macro", zero_division=0)), 4),
            "f1Micro": round(float(f1_score(expected, predicted, average="micro", zero_division=0)), 4),
            "perCategory": {
                label: {
                    "precision": round(float(report[label]["precision"]), 4),
                    "recall": round(float(report[label]["recall"]), 4),
                    "f1": round(float(report[label]["f1-score"]), 4),
                    "support": int(report[label]["support"]),
                }
                for label in labels
            },
            "confusionMatrix": confusion_matrix(expected, predicted, labels=labels).tolist(),
            "errorCount": sum(a != b for a, b in zip(expected, predicted, strict=True)),
        }
        predictions.extend(
            {"model": name, "text": text, "expected": actual, "predicted": prediction, "correct": str(actual == prediction).lower()}
            for text, actual, prediction in zip(test_texts, expected, predicted, strict=True)
        )

    metadata = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "dataset": str(dataset.resolve()),
        "datasetKind": "demo_holdout" if dataset.resolve() == DEFAULT_DATASET.resolve() else "external",
        "trainingSamples": len(train_texts),
        "evaluationSamples": len(rows),
        "labelDistribution": dict(Counter(expected)),
        "warning": "Demo holdout metrics validate the evaluation pipeline only; they are not evidence of production quality." if dataset.resolve() == DEFAULT_DATASET.resolve() else "Verify anonymization, labeling protocol, and train/test independence before reporting these metrics.",
    }
    return {"metadata": metadata, "models": results}, predictions, labels


def write_outputs(report: dict, predictions: list[dict[str, str]], labels: list[str], output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    (output / "metrics.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    with (output / "predictions.csv").open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=["model", "text", "expected", "predicted", "correct"])
        writer.writeheader()
        writer.writerows(predictions)
    with (output / "confusion_matrices.csv").open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["model", "actual"] + labels)
        for model, metrics in report["models"].items():
            for actual, row in zip(labels, metrics["confusionMatrix"], strict=True):
                writer.writerow([model, actual] + row)


def main() -> None:
    parser = argparse.ArgumentParser(description="Reproducible evaluation for CaseFlow intake classifiers")
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET, help="CSV with text,label columns")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Output directory")
    args = parser.parse_args()
    report, predictions, labels = evaluate(args.dataset)
    write_outputs(report, predictions, labels, args.output)
    print(json.dumps({name: values for name, values in report["models"].items()}, ensure_ascii=False, indent=2))
    print(f"Reports written to {args.output.resolve()}")


if __name__ == "__main__":
    main()
