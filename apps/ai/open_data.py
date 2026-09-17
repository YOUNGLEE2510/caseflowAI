"""Download and benchmark the Vietnamese MASSIVE corpus, isolated from production."""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import unicodedata
from urllib.request import urlopen

from sklearn.metrics import classification_report, confusion_matrix
from .evaluate import model_factories

SOURCE = "https://huggingface.co/datasets/AmazonScience/massive"
ROOT = Path(__file__).resolve().parents[2] / "artifacts" / "open-data" / "massive-vi"


def normalized(text: str) -> str:
    return " ".join(unicodedata.normalize("NFC", text).casefold().split())


def clean_splits(splits: dict[str, list[dict]]) -> tuple[dict, dict]:
    # Evaluation owns duplicates first: training never receives an evaluation text.
    seen: dict[str, str] = {}
    clean, removed = {}, {}
    for split in ("test", "validation", "train"):
        clean[split], removed[split] = [], Counter()
        for row in splits[split]:
            text = str(row.get("utt", "")).strip()
            label = row.get("intent")
            key = normalized(text)
            if not key or label is None:
                removed[split]["invalid"] += 1
                continue
            if key in seen:
                removed[split]["duplicate_" + seen[key]] += 1
                continue
            if row.get("locale") != "vi-VN":
                raise ValueError("Unexpected locale")
            seen[key] = split
            clean[split].append({"text": text, "label": str(label), "source_id": str(row["id"])})
        if not clean[split]:
            raise ValueError(f"Empty split: {split}")
    training_labels = {row["label"] for row in clean["train"]}
    for split in ("validation", "test"):
        if {row["label"] for row in clean[split]} - training_labels:
            raise ValueError("Evaluation contains labels absent from training")
    return clean, {name: dict(counts) for name, counts in removed.items()}


def fetch(url: str) -> bytes:
    with urlopen(url, timeout=90) as response:
        return response.read()


def prepare(output: Path) -> dict:
    import pyarrow.parquet as pq

    output.mkdir(parents=True, exist_ok=True)
    if (output / "manifest.json").exists():
        raise ValueError("Dataset exists; use a new output directory to preserve provenance")
    raw_dir = output / "raw"
    raw_dir.mkdir(exist_ok=True)
    metadata = json.loads(fetch("https://huggingface.co/api/datasets/AmazonScience/massive"))
    license_value = metadata.get("cardData", {}).get("license")
    if license_value not in ("cc-by-4.0", ["cc-by-4.0"]):
        raise ValueError("License changed; review source before importing")
    card = fetch(f"{SOURCE}/raw/{metadata['sha']}/README.md")
    (raw_dir / "README.md").write_bytes(card)
    manifests, splits = [], {}
    for split in ("train", "validation", "test"):
        urls = json.loads(fetch(f"https://huggingface.co/api/datasets/AmazonScience/massive/parquet/vi-VN/{split}"))
        splits[split] = []
        for index, url in enumerate(urls):
            if not url.startswith("https://huggingface.co/"):
                raise ValueError("Unexpected data host")
            content = fetch(url)
            path = raw_dir / f"{split}-{index}.parquet"
            path.write_bytes(content)
            rows = pq.read_table(path).to_pylist()
            splits[split].extend(rows)
            manifests.append({"split": split, "url": url, "file": str(path.relative_to(output)),
                              "sha256": hashlib.sha256(content).hexdigest(), "rows": len(rows)})
    cleaned, removed = clean_splits(splits)
    for split, rows in cleaned.items():
        (output / f"{split}.json").write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    manifest = {
        "source": SOURCE, "publisher": "Amazon Science", "license": "CC-BY-4.0",
        "card_revision": metadata["sha"], "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "purpose": "External intent benchmark only; NOT CaseFlow routing training data",
        "provenance_note": "Parquet conversion endpoint is mutable; raw SHA256 identifies downloaded bytes.",
        "files": manifests, "removed": removed,
        "counts": {split: len(rows) for split, rows in cleaned.items()},
        "limitations": ["Exact normalized deduplication only; near-duplicates require review",
                       "Original intent labels preserved; no mapping to CaseFlow labels"],
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def benchmark(output: Path) -> dict:
    manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
    for item in manifest["files"]:
        if hashlib.sha256((output / item["file"]).read_bytes()).hexdigest() != item["sha256"]:
            raise ValueError("Raw dataset checksum mismatch")
    # Rebuild splits from verified raw bytes instead of trusting edited derived JSON.
    import pyarrow.parquet as pq
    raw = {split: [] for split in ("train", "validation", "test")}
    for item in manifest["files"]:
        raw[item["split"]].extend(pq.read_table(output / item["file"]).to_pylist())
    rows, _ = clean_splits(raw)
    train_x = [row["text"] for row in rows["train"]]
    train_y = [row["label"] for row in rows["train"]]
    labels = sorted(set(train_y))
    results, fitted = {}, {}
    for name, factory in model_factories().items():
        model = factory()
        model.fit(train_x, train_y)
        prediction = model.predict([row["text"] for row in rows["validation"]])
        report = classification_report([row["label"] for row in rows["validation"]], prediction,
                                       labels=labels, output_dict=True, zero_division=0)
        results[name], fitted[name] = report, model
    winner = max(results, key=lambda name: results[name]["macro avg"]["f1-score"])
    expected = [row["label"] for row in rows["test"]]
    predicted = fitted[winner].predict([row["text"] for row in rows["test"]])
    report = {
        "purpose": manifest["purpose"], "selection": "Validation macro-F1; test evaluated only for winner",
        "validation": results, "selected_model": winner,
        "test": classification_report(expected, predicted, labels=labels, output_dict=True, zero_division=0),
        "labels": labels, "confusion_matrix": confusion_matrix(expected, predicted, labels=labels).tolist(),
        "errors": [{"source_id": row["source_id"], "expected": row["label"], "predicted": str(pred)}
                   for row, pred in zip(rows["test"], predicted, strict=True) if row["label"] != pred],
    }
    (output / "benchmark.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return {"selected_model": winner, "test_accuracy": report["test"]["accuracy"],
            "test_macro_f1": report["test"]["macro avg"]["f1-score"]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["prepare", "benchmark"])
    parser.add_argument("--output", type=Path, default=ROOT)
    args = parser.parse_args()
    print(json.dumps(prepare(args.output) if args.action == "prepare" else benchmark(args.output), indent=2))
