from pathlib import Path

import pytest

from apps.ai.evaluate import DEFAULT_DATASET, evaluate, load_evaluation_rows


def test_sample_evaluation_compares_two_reproducible_baselines():
    report, predictions, labels = evaluate(DEFAULT_DATASET)
    assert set(report["models"]) == {"majority_baseline", "keyword_rules", "word_tfidf_logreg", "char_tfidf_logreg", "word_tfidf_svm", "hybrid_tfidf_logreg"}
    assert report["metadata"]["evaluationSamples"] == 60
    assert len(labels) == 6
    assert len(predictions) == 360
    # Learned models must beat both baselines on the held-out set.
    learned = report["models"]["hybrid_tfidf_logreg"]["f1Macro"]
    assert learned > report["models"]["keyword_rules"]["f1Macro"] > report["models"]["majority_baseline"]["f1Macro"]
    for metrics in report["models"].values():
        assert 0 <= metrics["f1Macro"] <= 1
        assert len(metrics["confusionMatrix"]) == 6


def test_evaluation_rejects_unknown_labels(tmp_path: Path):
    dataset = tmp_path / "invalid.csv"
    dataset.write_text("text,label\nunknown request,unknown\n", encoding="utf-8")
    with pytest.raises(ValueError, match="Unknown labels"):
        load_evaluation_rows(dataset)
