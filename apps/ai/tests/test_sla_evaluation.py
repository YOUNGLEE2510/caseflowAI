import pytest
from apps.ai.evaluate_sla import evaluate


def test_sla_evaluation_compares_model_and_rule(tmp_path):
    dataset = tmp_path / "sla.csv"
    dataset.write_text("elapsedHours,dueHours,transfers,workload,remainingSteps,priority,breached\n1,24,0,2,1,normal,0\n23,24,3,12,4,urgent,1\n", encoding="utf-8")
    report = evaluate(dataset)
    assert report["samples"] == 2
    assert set(report["models"]) == {"logistic_regression", "elapsed_80_percent"}
    assert report["models"]["elapsed_80_percent"]["rocAuc"] == 1


def test_sla_evaluation_rejects_single_class(tmp_path):
    dataset = tmp_path / "sla.csv"
    dataset.write_text("elapsedHours,dueHours,transfers,workload,remainingSteps,priority,breached\n1,24,0,2,1,normal,0\n", encoding="utf-8")
    with pytest.raises(ValueError, match="both breached"):
        evaluate(dataset)
