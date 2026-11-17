"""Stable text features and conservative context ranking; scores are not probabilities."""
from sklearn.feature_extraction.text import HashingVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from pydantic import AwareDatetime, BaseModel, Field

FEATURES = HashingVectorizer(analyzer="char_wb", ngram_range=(3, 5),
                            n_features=65536, alternate_sign=False, norm="l2")


class RelatedItem(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    title: str = Field(max_length=200)
    text: str = Field(max_length=6000)
    propertyCode: str = Field(min_length=1, max_length=32)
    unitCode: str = Field(default="", max_length=32)
    assetCode: str = Field(default="", max_length=32)
    createdAt: AwareDatetime
    status: str = Field(default="new", max_length=32)


class RelatedRequest(BaseModel):
    source: RelatedItem
    items: list[RelatedItem] = Field(max_length=100)
    threshold: float = Field(default=0.5, ge=0, le=1)


def rank_related(request: RelatedRequest, baseline=False):
    source = request.source
    candidates = [item for item in request.items if item.id != source.id
                  and item.propertyCode == source.propertyCode
                  and item.status not in {"closed", "resolved"}
                  and abs((item.createdAt - source.createdAt).total_seconds()) <= 48 * 3600]
    if not candidates:
        return {"matches": [], "method": "location-time" if baseline else "hashing-char-context-v1",
                "confidenceCalibrated": False}
    if baseline:
        candidates.sort(key=lambda item: (item.createdAt, item.id), reverse=True)
        return {"matches": [{"id": item.id, "title": item.title, "score": 0.0,
                             "signals": ["same_property", "within_48h"]} for item in candidates[:5]],
                "method": "location-time", "confidenceCalibrated": False}
    scores = cosine_similarity(FEATURES.transform([source.text]),
                               FEATURES.transform([item.text for item in candidates])).flatten()
    matches = []
    for item, similarity in zip(candidates, scores, strict=True):
        signals = ["same_property", "within_48h"]
        same_asset = bool(source.assetCode and source.assetCode == item.assetCode)
        same_unit = bool(source.unitCode and source.unitCode == item.unitCode)
        score = float(similarity)
        if same_asset:
            signals.append("same_asset")
        if same_unit:
            signals.append("same_unit")
        # Location signals cannot establish a common cause without textual evidence.
        score = 0.8 * score + (0.15 if same_asset and similarity >= 0.2 else 0) + (0.05 if same_unit and similarity >= 0.2 else 0)
        if score >= request.threshold:
            matches.append({"id": item.id, "title": item.title, "score": round(score, 4),
                            "textScore": round(float(similarity), 4), "signals": signals})
    matches.sort(key=lambda row: (-row["score"], row["id"]))
    return {"matches": matches[:5], "method": "location-time" if baseline else "hashing-char-context-v1",
            "confidenceCalibrated": False}
