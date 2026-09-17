from fastapi import APIRouter
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from ..models.text_utils import summarize
from ..schemas import KnowledgeRequest

router = APIRouter()


@router.post("/knowledge/retrieve")
def retrieve_knowledge(request: KnowledgeRequest) -> dict:
    if not request.articles:
        return {
            "answer": "Kho tri thức chưa có tài liệu để đối chiếu.",
            "citations": [],
        }
    corpus = [request.query] + [
        f"{article.title}. {article.content}. {article.category}"
        for article in request.articles
    ]
    vectorizer = TfidfVectorizer(
        lowercase=True, ngram_range=(1, 2), sublinear_tf=True
    )
    if not any(vectorizer.build_analyzer()(document) for document in corpus):
        return {"answer": "Chưa tìm thấy căn cứ đủ liên quan trong kho tri thức.", "citations": []}
    matrix = vectorizer.fit_transform(corpus)
    scores = cosine_similarity(matrix[0:1], matrix[1:]).flatten()
    ranked = sorted(
        zip(request.articles, scores, strict=True),
        key=lambda item: item[1],
        reverse=True,
    )
    citations = [
        {
            "id": article.id,
            "title": article.title,
            "sourceLabel": article.sourceLabel,
            "excerpt": summarize(article.content, 280),
            "score": round(float(score), 4),
        }
        for article, score in ranked[: request.topK]
        if score > 0.03
    ]
    answer = (
        "Đã tìm thấy tài liệu liên quan. Nội dung dưới đây là căn cứ hỗ trợ; "
        "nhân viên cần kiểm tra nguồn trước khi phản hồi."
        if citations
        else "Chưa tìm thấy căn cứ đủ liên quan trong kho tri thức."
    )
    return {"answer": answer, "citations": citations}
