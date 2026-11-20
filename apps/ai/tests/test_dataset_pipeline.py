import csv

from apps.ai.prepare_caseflow_dataset import prepare_dataset, redact_pii


def test_redact_pii_removes_identifiers():
    text, count = redact_pii("CCCD 012345678901 gui tu a@example.com, so 0912 345 678")
    assert text == "CCCD [ID_NUMBER] gui tu [EMAIL], so [PHONE]"
    assert count == 3


def test_prepare_dataset_redacts_deduplicates_and_keeps_groups_together(tmp_path):
    source = tmp_path / "source.csv"
    labels = ["water", "electrical", "internet", "appliances", "access_security", "general_support"]
    rows = []
    for index in range(36):
        rows.append({"text": f"Ye u cau ho tro {index} voi noi dung day du CCCD 012345678901", "label": labels[index % len(labels)], "group_id": f"case-{index // 2}", "created_at": f"2026-01-{index % 28 + 1:02d}"})
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
    assert all("[ID_NUMBER]" in row["text"] for rows in split_rows.values() for row in rows)


def test_redact_pii_masks_student_codes_and_other_long_numbers():
    for identifier in ("B22DCCN019", "b22dccn019", "N21DCCN001", "SV12345678", "MSSV: 20212345", "HD 20240815"):
        text, count = redact_pii(f"Toi o can 1205, ma {identifier} can ho tro")
        assert identifier.split()[-1].split(":")[-1].strip() not in text
        assert count >= 1
    text, _ = redact_pii("Goi 0912 345 678, CCCD 012345678901")
    assert text == "Goi [PHONE], CCCD [ID_NUMBER]"
