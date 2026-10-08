from apps.ai.models.classifier import classify_text, load_or_train, VARIANTS


def test_artifact_round_trip_and_version_isolation(tmp_path):
    model, first = load_or_train("hybrid", tmp_path)
    restored, second = load_or_train("hybrid", tmp_path)
    assert first["version"] == second["version"]
    assert second["loadedFromCache"] is True
    assert model.predict(["wifi tài khoản mật khẩu"]).tolist() == restored.predict(["wifi tài khoản mật khẩu"]).tolist()
    _, word = load_or_train("word", tmp_path)
    assert word["version"] != first["version"]


def test_corrupted_artifact_is_rebuilt(tmp_path):
    _, metadata = load_or_train("character", tmp_path)
    (tmp_path / f"{metadata['version']}.joblib").write_bytes(b"corrupted")
    _, rebuilt = load_or_train("character", tmp_path)
    assert rebuilt["loadedFromCache"] is False
    assert rebuilt["version"] == metadata["version"]


def test_empty_features_abstain():
    result = classify_text("!!!")
    assert result["confidence"] == 0
    assert result["label"] == "general_support"
    assert result["modelVersion"]
