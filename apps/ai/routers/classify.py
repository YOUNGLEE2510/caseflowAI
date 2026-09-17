from fastapi import APIRouter
from ..schemas import TextRequest
from ..models.classifier import classify_text

router = APIRouter()


@router.post("/classify")
def classify(request: TextRequest) -> dict:
    return classify_text(request.text)
