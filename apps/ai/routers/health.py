from fastapi import APIRouter
from ..config import TRAINING_EXAMPLES

router = APIRouter()


@router.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "caseflow-intelligence",
        "classifier": "tfidf-logistic-regression",
        "trainingSamples": sum(len(items) for items in TRAINING_EXAMPLES.values()),
        "categories": len(TRAINING_EXAMPLES),
    }
