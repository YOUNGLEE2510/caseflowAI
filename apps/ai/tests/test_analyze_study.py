import pytest

from apps.ai.analyze_study import analyse_agreement, analyse_sus, analyse_timing


def test_timing_summarises_conditions_and_runs_paired_test(tmp_path):
    lines = ["participant,scenario_group,condition,started_at,confirmed_at,classification_correct,duplicate_jobs,false_links"]
    for participant in range(1, 7):
        lines.append(f"p{participant},g1,manual,2026-11-20T09:00:00+07:00,2026-11-20T09:01:{30 + participant:02d}+07:00,true,0,0")
        lines.append(f"p{participant},g2,assisted,2026-11-20T09:10:00+07:00,2026-11-20T09:10:{40 + participant:02d}+07:00,true,0,0")
    path = tmp_path / "timing.csv"
    path.write_text("\n".join(lines), encoding="utf-8")
    report = analyse_timing(path)
    assert report["conditions"]["manual"]["attempts"] == 6
    assert report["conditions"]["assisted"]["median_seconds"] < report["conditions"]["manual"]["median_seconds"]
    assert report["paired_participants"] == 6
    assert report["wilcoxon"]["median_difference_seconds"] < 0


def test_timing_rejects_naive_timestamps(tmp_path):
    path = tmp_path / "timing.csv"
    path.write_text("participant,scenario_group,condition,started_at,confirmed_at,classification_correct\n"
                    "p1,g1,manual,2026-11-20T09:00:00,2026-11-20T09:01:00,true\n", encoding="utf-8")
    with pytest.raises(ValueError, match="time zone"):
        analyse_timing(path)


def test_sus_scoring_matches_standard_formula(tmp_path):
    path = tmp_path / "sus.csv"
    path.write_text("participant,q1,q2,q3,q4,q5,q6,q7,q8,q9,q10\n"
                    "best,5,1,5,1,5,1,5,1,5,1\nmid,3,3,3,3,3,3,3,3,3,3\n", encoding="utf-8")
    report = analyse_sus(path)
    assert [item["sus"] for item in report["scores"]] == [100.0, 50.0]


def test_agreement_reports_kappa_and_disagreements(tmp_path):
    path = tmp_path / "labels.csv"
    path.write_text("id,text,annotator_a,annotator_b\n1,a,water,water\n2,b,water,electrical\n3,c,internet,internet\n4,d,electrical,electrical\n",
                    encoding="utf-8")
    report = analyse_agreement(path)
    assert report["items"] == 4
    assert report["observed_agreement"] == 0.75
    assert 0 < report["cohen_kappa"] < 1
    assert report["disagreements"][0]["id"] == "2"
