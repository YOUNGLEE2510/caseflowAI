import csv

from apps.ai.prepare_caseflow_dataset import prepare_dataset, redact_pii


def test_redact_pii_removes_identifiers():
    text, count = redact_pii("SV12345678 gui tu a@example.com, so 0912 345 678")
    assert text == "[STUDENT_ID] gui tu [EMAIL], so [PHONE]"
    assert count == 3


def test_prepare_dataset_redacts_deduplicates_and_keeps_groups_together(tmp_path):
    source = tmp_path / "source.csv"
    labels = ["it_access", "academic_records", "student_services", "facilities", "finance", "general_support"]
    rows = []
    for index in range(36):
        rows.append({"text": f"Ye u cau ho tro {index} voi noi dung day du SV12345678", "label": labels[index % len(labels)], "group_id": f"case-{index // 2}", "created_at": f"2026-01-{index % 28 + 1:02d}"})
    rows.append(rows[0].copy())
    with source.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)

    manifest = prepare_dataset(source, tmp_path / "prepared")
    assert manifest["rejected"]["duplicate"] == 1
    # Redaction is counted before duplicate filtering so the audit covers all input rows.
    assert manifest["pii_replacements"] == 37
    split_rows = {}
    for split in ("train", "validation", "test"):
        with (tmp_path / "prepared" / f"{split}.csv").open(encoding="utf-8-sig", newline="") as stream:
            split_rows[split] = list(csv.DictReader(stream))
    assert sum(len(rows) for rows in split_rows.values()) == 36
    assert all("[STUDENT_ID]" in row["text"] for rows in split_rows.values() for row in rows)
