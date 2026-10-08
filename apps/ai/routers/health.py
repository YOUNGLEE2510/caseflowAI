from fastapi import APIRouter
from datetime import datetime, timezone
from hashlib import sha256
import json
from time import monotonic
from ..config import TRAINING_EXAMPLES
from ..models.classifier import classifier, MODEL_METADATA

router = APIRouter()
STARTED_AT = datetime.now(timezone.utc).isoformat()
STARTED_CLOCK = monotonic()
DATASET_SHA256 = sha256(json.dumps(TRAINING_EXAMPLES, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()


@router.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "caseflow-intelligence",
        "classifier": f"{MODEL_METADATA['variant']}-tfidf-logistic-regression",
        "trainingSamples": sum(len(items) for items in TRAINING_EXAMPLES.values()),
        "categories": len(TRAINING_EXAMPLES),
        "modelVersion": MODEL_METADATA["version"],
        "model": MODEL_METADATA,
        "datasetSha256": DATASET_SHA256,
        "modelReady": hasattr(classifier, "classes_"),
        "startedAt": STARTED_AT,
        "uptimeSeconds": round(monotonic() - STARTED_CLOCK, 2),
    }
