"""Scheduled, content-addressed candidate training; never replaces the serving model."""
import argparse
import csv
import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import joblib
import sklearn
from sklearn.metrics import classification_report, confusion_matrix, f1_score
from apps.ai.config import CATEGORY_NAMES
from apps.ai.models.classifier import classifier_pipeline, VARIANTS
from apps.ai.prepare_caseflow_dataset import prepare_dataset


def retrain(source: Path, registry: Path, minimum_f1: float = 0.7) -> dict:
    if not 0 <= minimum_f1 <= 1:
        raise ValueError("minimum_f1 must be between zero and one")
    snapshot = source.read_bytes()
    code_hash = hashlib.sha256(b"".join(path.read_bytes() for path in (
        Path(__file__), Path(__file__).parent / "models" / "classifier.py",
        Path(__file__).parent / "prepare_caseflow_dataset.py"))).hexdigest()
    signature = snapshot + json.dumps([1, sklearn.__version__, minimum_f1, sorted(CATEGORY_NAMES), code_hash]).encode()
    version = hashlib.sha256(signature).hexdigest()
    registry.mkdir(parents=True, exist_ok=True)
    directory = registry / version
    manifest = directory / "manifest.json"
    if manifest.exists():
        previous = json.loads(manifest.read_text(encoding="utf-8"))
        if previous["artifactSha256"] != hashlib.sha256((directory / "model.joblib").read_bytes()).hexdigest():
            raise ValueError("Candidate artifact integrity failure")
        return previous
    lock = registry / ".retrain.lock"
    try:
        descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError as error:
        raise RuntimeError("Another retraining job is running; inspect stale lock after a crash") from error
    try:
        os.close(descriptor)
        directory.mkdir(exist_ok=True)
        snapshot_path = directory / "source.csv"
        snapshot_path.write_bytes(snapshot)
        try:
            dataset = prepare_dataset(snapshot_path, directory / "dataset")
        finally:
            snapshot_path.unlink(missing_ok=True)
        splits = {}
        for name in ("train", "validation", "test"):
            with (directory / "dataset" / f"{name}.csv").open(encoding="utf-8-sig", newline="") as stream:
                splits[name] = list(csv.DictReader(stream))
            if {row["label"] for row in splits[name]} != set(CATEGORY_NAMES):
                raise ValueError(f"Every split must cover the full taxonomy: {name}")
        train, validation, test = (splits[name] for name in ("train", "validation", "test"))
        candidates = []
        for variant in VARIANTS:
            model = classifier_pipeline(variant).fit([r["text"] for r in train], [r["label"] for r in train])
            prediction = model.predict([r["text"] for r in validation])
            score = f1_score([r["label"] for r in validation], prediction, average="macro", zero_division=0)
            candidates.append((float(score), variant, model))
        score, variant, model = max(candidates, key=lambda row: row[0])
        prediction = model.predict([r["text"] for r in test])
        labels = sorted(CATEGORY_NAMES)
        artifact = directory / "model.joblib"
        temporary = directory / "model.tmp"
        joblib.dump(model, temporary)
        os.replace(temporary, artifact)
        result = {"version": version, "pipelineVersion": 1, "trainedAt": datetime.now(timezone.utc).isoformat(),
                  "datasetSha256": hashlib.sha256(snapshot).hexdigest(), "dataset": dataset,
                  "sklearnVersion": sklearn.__version__, "codeSha256": code_hash, "variant": variant,
                  "validationMacroF1": score, "minimumMacroF1": minimum_f1,
                  "status": "eligible_for_review" if score >= minimum_f1 else "rejected",
                  "activated": False, "artifactSha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
                  "variants": [{"variant": v, "validationMacroF1": s} for s, v, _ in candidates],
                  "testReport": classification_report([r["label"] for r in test], prediction, labels=labels, output_dict=True, zero_division=0),
                  "confusionMatrix": confusion_matrix([r["label"] for r in test], prediction, labels=labels).tolist(), "labels": labels}
        pending = directory / "manifest.tmp"
        pending.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(pending, manifest)
        return result
    finally:
        lock.unlink(missing_ok=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--approved-data", action="store_true", help="Explicit confirmation that source rights, privacy and labels were reviewed")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--registry", type=Path, default=Path(os.getenv("MODEL_REGISTRY_DIR", str(Path(os.getenv("MODEL_DIR", str(ROOT / "artifacts" / "models"))) / "registry"))))
    parser.add_argument("--minimum-f1", type=float, default=0.7)
    parser.add_argument("--interval-seconds", type=int, default=0, help="0 runs once; otherwise watch the reviewed CSV (minimum 60 seconds)")
    args = parser.parse_args()
    if not args.approved_data:
        parser.error("Training is on hold. Review source rights, privacy, labels and source-group splits, then explicitly pass --approved-data.")
    if args.interval_seconds and args.interval_seconds < 60:
        parser.error("interval-seconds must be zero or at least 60")
    while True:
        try:
            result = retrain(args.input, args.registry, args.minimum_f1)
            print(json.dumps({key: result[key] for key in ("version", "status", "activated", "validationMacroF1")}), flush=True)
        except (ValueError, OSError, RuntimeError) as error:
            if not args.interval_seconds:
                raise
            print(json.dumps({"status": "failed", "errorType": type(error).__name__}), flush=True)
        if not args.interval_seconds:
            break
        time.sleep(args.interval_seconds)
