"""Versioned small-data classifier; only load artifacts from trusted server storage."""
import json
import os
import logging
from threading import RLock
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from uuid import uuid4
import joblib
import sklearn
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import FeatureUnion, Pipeline
from ..config import TRAINING_EXAMPLES
from .text_utils import summarize, extract_entities

VARIANTS = ("word", "character", "hybrid")
DATASET_SHA256 = sha256(json.dumps(TRAINING_EXAMPLES, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def classifier_pipeline(variant: str = "word") -> Pipeline:
    if variant not in VARIANTS:
        raise ValueError(f"Unsupported variant: {variant}")
    word = TfidfVectorizer(lowercase=True, ngram_range=(1, 2), sublinear_tf=True)
    char = TfidfVectorizer(lowercase=True, strip_accents="unicode", analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True)
    features = FeatureUnion([("word", word), ("character", char)], transformer_weights={"word": 0.65, "character": 0.35}) if variant == "hybrid" else word if variant == "word" else char
    return Pipeline([("features", features), ("classifier", LogisticRegression(max_iter=1000, class_weight="balanced", C=20.0, random_state=42))])


def training_rows() -> tuple[list[str], list[str]]:
    texts, labels = [], []
    for label, examples in TRAINING_EXAMPLES.items():
        texts.extend(examples)
        labels.extend([label] * len(examples))
    return texts, labels


def build_classifier(variant: str = "word") -> Pipeline:
    texts, labels = training_rows()
    return classifier_pipeline(variant).fit(texts, labels)


def load_or_train(variant: str, directory: Path) -> tuple[Pipeline, dict]:
    signature = f"2:{variant}:{DATASET_SHA256}:{sklearn.__version__}"
    version = f"{variant}-logreg-v2-{sha256(signature.encode()).hexdigest()[:12]}"
    directory.mkdir(parents=True, exist_ok=True)
    artifact, manifest = directory / f"{version}.joblib", directory / f"{version}.json"
    if artifact.is_file() and manifest.is_file():
        try:
            metadata = json.loads(manifest.read_text(encoding="utf-8"))
            if metadata["version"] != version or metadata["artifactSha256"] != sha256(artifact.read_bytes()).hexdigest():
                raise ValueError("Artifact integrity failure")
            model = joblib.load(artifact)
            if set(model.classes_) != set(TRAINING_EXAMPLES):
                raise ValueError("Taxonomy mismatch")
            return model, {**metadata, "loadedFromCache": True}
        except (OSError, ValueError, KeyError, EOFError, TypeError):
            pass
    model = build_classifier(variant)
    metadata = {"version": version, "variant": variant, "datasetSha256": DATASET_SHA256,
                "sklearnVersion": sklearn.__version__, "trainingSamples": len(training_rows()[0]),
                "trainedAt": datetime.now(timezone.utc).isoformat(), "datasetKind": "demo", "confidenceCalibrated": False}
    temporary = directory / f".{version}-{uuid4().hex}.tmp"
    temp_manifest = temporary.with_suffix(".json.tmp")
    try:
        joblib.dump(model, temporary)
        metadata["artifactSha256"] = sha256(temporary.read_bytes()).hexdigest()
        temp_manifest.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(temporary, artifact)
        os.replace(temp_manifest, manifest)
    finally:
        temporary.unlink(missing_ok=True)
        temp_manifest.unlink(missing_ok=True)
    return model, {**metadata, "loadedFromCache": False}


classifier, MODEL_METADATA = load_or_train(os.getenv("CLASSIFIER_VARIANT", "word"),
    Path(os.getenv("MODEL_DIR", str(Path(__file__).resolve().parents[3] / "artifacts" / "models"))))

_registry = Path(os.getenv("MODEL_REGISTRY_DIR", str(Path(os.getenv("MODEL_DIR", "artifacts/models")) / "registry")))
_model_lock = RLock()
_pointer_stamp = None


def refresh_active_model():
    global classifier, _pointer_stamp
    pointer = _registry / "active_model.json"
    if not pointer.exists():
        return
    stamp = pointer.stat().st_mtime_ns
    if stamp == _pointer_stamp:
        return
    try:
        from ..model_registry import load_active
        model, metadata = load_active(_registry)
        classifier = model
        MODEL_METADATA.clear()
        MODEL_METADATA.update(metadata)
        _pointer_stamp = stamp
    except Exception:
        logging.getLogger(__name__).warning("Active model rejected; retaining last validated model")


def classify_text(text: str) -> dict:
    with _model_lock:
        refresh_active_model()
        return _classify_text(text)


def _classify_text(text: str) -> dict:
    ranking = sorted(zip(classifier.classes_, classifier.predict_proba([text])[0], strict=True), key=lambda item: item[1], reverse=True)
    best_label, best_score = ranking[0]
    if classifier.named_steps["features"].transform([text]).nnz == 0:
        best_label, best_score = "general_support", 0.0
    return {"label": best_label, "confidence": round(float(best_score), 4), "summary": summarize(text),
            "extracted": extract_entities(text), "modelVersion": MODEL_METADATA["version"],
            "topCandidates": [{"label": label, "score": round(float(score), 4)} for label, score in ranking[:3]]}
