"""Prepare an anonymized, leakage-aware CaseFlow classification dataset."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from .config import TRAINING_EXAMPLES

EMAIL = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
PHONE = re.compile(r"(?:\+?\d[\d .()-]{7,}\d)")
STUDENT_ID = re.compile(r"\b(?:SV|CT|IT)?\d{6,10}\b", re.IGNORECASE)


def redact_pii(text: str) -> tuple[str, int]:
    replacements = 0
    for pattern, marker in ((EMAIL, "[EMAIL]"), (PHONE, "[PHONE]"), (STUDENT_ID, "[STUDENT_ID]")):
        text, count = pattern.subn(marker, text)
        replacements += count
    return " ".join(text.split()), replacements


def _unit_key(row: dict[str, str], position: int) -> str:
    value = row.get("group_id", "").strip()
    return value or f"row-{position:08d}"


def _unit_order(unit: str, rows: list[dict[str, str]]) -> tuple[int, str]:
    dates = [row.get("created_at", "").strip() for row in rows if row.get("created_at", "").strip()]
    if dates:
        return 0, min(dates)
    return 1, hashlib.sha256(unit.encode("utf-8")).hexdigest()


def prepare_dataset(input_path: Path, output: Path) -> dict:
    with input_path.open(encoding="utf-8-sig", newline="") as stream:
        source_rows = list(csv.DictReader(stream))
    required = {"text", "label"}
    if not source_rows or not required.issubset(source_rows[0]):
        raise ValueError("CSV must include text,label columns; group_id and created_at are optional")

    allowed = set(TRAINING_EXAMPLES)
    seen: set[str] = set()
    units: dict[str, list[dict[str, str]]] = {}
    rejected = Counter()
    pii_replacements = 0
    for position, row in enumerate(source_rows, start=1):
        text, replacements = redact_pii(row.get("text", "").strip())
        label = row.get("label", "").strip()
        pii_replacements += replacements
        normalized = " ".join(text.casefold().split())
        if len(text) < 12:
            rejected["too_short"] += 1
            continue
        if label not in allowed:
            rejected["unknown_label"] += 1
            continue
        if normalized in seen:
            rejected["duplicate"] += 1
            continue
        seen.add(normalized)
        units.setdefault(_unit_key(row, position), []).append({
            "text": text,
            "label": label,
            "created_at": row.get("created_at", "").strip(),
        })

    if len(seen) < 30:
        raise ValueError("Need at least 30 valid, independent rows before creating a holdout split")
    ordered_units = sorted(units.items(), key=lambda item: _unit_order(item[0], item[1]))
    total = sum(len(rows) for _, rows in ordered_units)
    targets = {"train": total * 0.70, "validation": total * 0.85}
    splits: dict[str, list[dict[str, str]]] = {"train": [], "validation": [], "test": []}
    assigned = 0
    for _, rows in ordered_units:
        destination = "train" if assigned < targets["train"] else "validation" if assigned < targets["validation"] else "test"
        splits[destination].extend(rows)
        assigned += len(rows)
    if not splits["test"] or not splits["validation"]:
        raise ValueError("Dataset is too small to create independent validation and test splits")

    output.mkdir(parents=True, exist_ok=True)
    for name, rows in splits.items():
        with (output / f"{name}.csv").open("w", encoding="utf-8-sig", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=["text", "label", "created_at"])
            writer.writeheader()
            writer.writerows(rows)
    manifest = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source": str(input_path.resolve()),
        "taxonomy": sorted(allowed),
        "rows": {name: len(rows) for name, rows in splits.items()},
        "label_distribution": {name: dict(Counter(row["label"] for row in rows)) for name, rows in splits.items()},
        "rejected": dict(rejected),
        "pii_replacements": pii_replacements,
        "split_method": "group-aware chronological split when created_at is present; stable hash otherwise",
        "warning": "Review the anonymized output and annotation agreement before using it for model selection.",
    }
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Prepare a reviewed CaseFlow training dataset")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(prepare_dataset(args.input, args.output), ensure_ascii=False, indent=2))
