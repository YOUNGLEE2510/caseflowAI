"""Explicit promotion and integrity checks for trusted local model artifacts."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import joblib
import sklearn

from .config import CATEGORY_NAMES


def load_candidate(registry: Path, version: str):
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", version):
        raise ValueError("Invalid model version")
    root = registry.resolve()
    directory = (root / version).resolve()
    if directory.parent != root:
        raise ValueError("Model path must stay inside registry")
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    artifact = directory / "model.joblib"
    if artifact.resolve().parent != directory or (directory / "manifest.json").resolve().parent != directory:
        raise ValueError("Artifacts must stay inside the version directory")
    if manifest.get("version") != version or manifest.get("status") != "eligible_for_review":
        raise ValueError("Only eligible candidates may be activated")
    if manifest.get("sklearnVersion") != sklearn.__version__:
        raise ValueError("Model runtime version mismatch")
    if hashlib.sha256(artifact.read_bytes()).hexdigest() != manifest.get("artifactSha256"):
        raise ValueError("Model integrity failure")
    model = joblib.load(artifact)
    if set(model.classes_) != set(CATEGORY_NAMES):
        raise ValueError("Model taxonomy mismatch")
    return model, manifest


def activate(registry: Path, version: str, reviewed_by: str) -> dict:
    if not reviewed_by.strip():
        raise ValueError("A reviewer is required")
    _, manifest = load_candidate(registry, version)
    pointer = registry / "active_model.json"
    previous = json.loads(pointer.read_text(encoding="utf-8")) if pointer.exists() else {}
    result = {"version": version, "artifactSha256": manifest["artifactSha256"], "activated": True,
              "reviewedBy": reviewed_by.strip(), "activatedAt": datetime.now(timezone.utc).isoformat(),
              "previousVersion": previous.get("version")}
    temporary = registry / f".active-{uuid4().hex}.tmp"
    try:
        temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(temporary, pointer)
    finally:
        temporary.unlink(missing_ok=True)
    return result


def load_active(registry: Path):
    pointer = json.loads((registry / "active_model.json").read_text(encoding="utf-8"))
    if pointer.get("activated") is not True or not pointer.get("reviewedBy"):
        raise ValueError("Model has not been approved")
    model, manifest = load_candidate(registry, pointer["version"])
    if pointer.get("artifactSha256") != manifest["artifactSha256"]:
        raise ValueError("Activation checksum mismatch")
    return model, {**manifest, "activated": True, "reviewedBy": pointer["reviewedBy"], "datasetKind": "reviewed-derived"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--registry", type=Path, required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--reviewed-by", required=True)
    arguments = parser.parse_args()
    print(json.dumps(activate(arguments.registry, arguments.version, arguments.reviewed_by)))
