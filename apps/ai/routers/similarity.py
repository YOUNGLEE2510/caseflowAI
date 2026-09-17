from fastapi import APIRouter
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from ..schemas import SimilarityRequest

router = APIRouter()


@router.post("/similarity")
def similarity(request: SimilarityRequest) -> dict:
    if not request.items:
        return {"matches": []}
    corpus = [request.text] + [
        f"{item.title}. {item.text}" for item in request.items
    ]
    vectorizer = TfidfVectorizer(
        lowercase=True, ngram_range=(1, 2), sublinear_tf=True
    )
    if not any(vectorizer.build_analyzer()(document) for document in corpus):
        return {"matches": []}
    matrix = vectorizer.fit_transform(corpus)
    scores = cosine_similarity(matrix[0:1], matrix[1:]).flatten()
    matches = [
        {
            "id": item.id,
            "title": item.title,
            "score": round(float(score), 4),
        }
        for item, score in zip(request.items, scores, strict=True)
        if score >= request.threshold
    ]
    matches.sort(key=lambda item: item["score"], reverse=True)
    return {"matches": matches[:5]}
