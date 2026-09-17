import pytest
from apps.ai.open_data import clean_splits, normalized


def row(text, identifier=1):
    return {"utt": text, "id": identifier, "intent": 0, "locale": "vi-VN"}


def test_unicode_normalization():
    assert normalized("  A   B ") == "a b"
    assert normalized("\u00e9") == normalized("e\u0301")


def test_evaluation_text_cannot_enter_training():
    cleaned, removed = clean_splits({
        "train": [row("unique training"), row("TEST")],
        "validation": [row("validation")], "test": [row("test")],
    })
    assert len(cleaned["train"]) == 1
    assert removed["train"]["duplicate_test"] == 1


def test_rejects_wrong_locale():
    invalid = row("test")
    invalid["locale"] = "en-US"
    with pytest.raises(ValueError, match="locale"):
        clean_splits({"train": [row("train")], "validation": [row("valid")], "test": [invalid]})
