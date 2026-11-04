import pytest

from apps.ai.prepare_caseflow_dataset import redact_pii


@pytest.mark.parametrize("identifier", ["B22DCCN019", "B20DCPT123", "N21DCCN001", "D22CQCN001", "b22dccn019", "SV12345678"])
def test_redacts_student_identifiers(identifier):
    text, count = redact_pii(f"Ma sinh vien {identifier} can ho tro dang nhap")
    assert identifier not in text
    assert "[STUDENT_ID]" in text
    assert count == 1
