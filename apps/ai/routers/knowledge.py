import re
from functools import lru_cache

from fastapi import APIRouter
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from ..schemas import KnowledgeRequest

router = APIRouter()


def passages(content: str, limit: int = 650) -> list[str]:
    paragraphs = [" ".join(part.split()) for part in re.split(r"\n\s*\n", content) if part.strip()]
    chunks: list[str] = []
    for paragraph in paragraphs:
        sentences = re.split(r"(?<=[.!?])\s+", paragraph)
        current = ""
        for sentence in sentences:
            if len(sentence) > limit:
                if current:
                    chunks.append(current)
                    current = ""
                chunks.extend(sentence[start:start + limit] for start in range(0, len(sentence), limit))
            elif len(current) + len(sentence) + 1 > limit:
                chunks.append(current)
                current = sentence
            else:
                current = f"{current} {sentence}".strip()
        if current:
            chunks.append(current)
    return chunks


@lru_cache(maxsize=4)
def index_articles(articles: tuple[tuple[str, str, str, str, str], ...]):
    entries = []
    for article_id, title, content, category, source_label in articles:
        # Synthetic passage so TF-IDF can match title/category keywords
        entries.append((article_id, title, category, source_label, title, True))
        entries.extend((article_id, title, category, source_label, part, False) for part in passages(content))
    if not entries:
        return None
    vectorizer = TfidfVectorizer(lowercase=True, ngram_range=(1, 2), sublinear_tf=True)
    corpus = [f"{title}. {category}. {part}" if is_title else part
              for _, title, category, _, part, is_title in entries]
    if not any(vectorizer.build_analyzer()(value) for value in corpus):
        return None
    return entries, vectorizer, vectorizer.fit_transform(corpus)


@router.post("/knowledge/retrieve")
def retrieve_knowledge(request: KnowledgeRequest) -> dict:
    empty = {"answer": "Chưa tìm thấy căn cứ đủ liên quan trong kho tri thức.", "citations": []}
    if not request.articles:
        return {"answer": "Kho tri thức chưa có tài liệu để đối chiếu.", "citations": []}
    articles = tuple((a.id, a.title, a.content, a.category, a.sourceLabel) for a in request.articles)
    index = index_articles(articles)
    if index is None:
        return empty
    entries, vectorizer, matrix = index
    if not vectorizer.build_analyzer()(request.query):
        return empty
    scores = cosine_similarity(vectorizer.transform([request.query]), matrix).flatten()
    ranked = sorted(range(len(entries)), key=lambda i: scores[i], reverse=True)
    citations = []
    seen = set()
    for position in ranked:
        article_id, title, _, source_label, passage, is_title = entries[position]
        score = float(scores[position])
        if score <= 0.03:
            break
        if article_id in seen:
            continue
        seen.add(article_id)
        citations.append({"id": article_id, "title": title, "sourceLabel": source_label,
                          "excerpt": passage, "score": round(score, 4)})
        if len(citations) >= request.topK:
            break
    return {"answer": "Đã tìm thấy tài liệu liên quan; nhân viên cần kiểm tra nguồn trước khi phản hồi." if citations else empty["answer"],
            "citations": citations}
