import csv
import json
import pytest
from apps.ai.retrain import retrain
from apps.ai.config import CATEGORY_NAMES


def test_versioned_retraining_is_repeatable(tmp_path):
    source = tmp_path / "reviewed.csv"
    with source.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=["text", "label", "group_id", "created_at"])
        writer.writeheader()
        for group in range(30):
            for label in CATEGORY_NAMES:
                writer.writerow({"text": f"Request {label} example number {group} needs assistance", "label": label,
                                 "group_id": str(group), "created_at": f"2026-01-{group + 1:02d}"})
    result = retrain(source, tmp_path / "registry")
    assert result["activated"] is False
    assert len(result["variants"]) == 3
    assert result == retrain(source, tmp_path / "registry")
    manifest = tmp_path / "registry" / result["version"] / "manifest.json"
    assert json.loads(manifest.read_text(encoding="utf-8"))["version"] == result["version"]
    assert not (tmp_path / "registry" / ".retrain.lock").exists()
    from apps.ai.model_registry import activate, load_active
    pointer = activate(tmp_path / "registry", result["version"], "test-reviewer")
    assert pointer["activated"] is True
    model, metadata = load_active(tmp_path / "registry")
    assert metadata["version"] == result["version"]
    assert set(model.classes_) == set(CATEGORY_NAMES)
    artifact = tmp_path / "registry" / result["version"] / "model.joblib"
    artifact.write_bytes(b"corrupted")
    with pytest.raises(ValueError, match="integrity"):
        load_active(tmp_path / "registry")


def test_retraining_rejects_invalid_threshold(tmp_path):
    with pytest.raises(ValueError):
        retrain(tmp_path / "missing.csv", tmp_path / "registry", 2)
