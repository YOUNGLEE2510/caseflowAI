import json
import os
import re
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from ..schemas import KnowledgeRequest

router = APIRouter()

# Minimum TF-IDF cosine for a passage to count as evidence. 0.15 was chosen on the
# dev question set (apps/ai/data/rental_retrieval_dev.csv), never on the test set;
# below it the service abstains instead of citing weakly related documents.
MIN_RETRIEVAL_SCORE = float(os.getenv("RETRIEVAL_MIN_SCORE", "0.15"))

# These high-frequency Vietnamese function words otherwise create weak matches
# for out-of-domain queries (for example, a question only sharing "trường").
VIETNAMESE_STOP_WORDS = frozenset({
    "ai", "bằng", "cho", "có", "của", "các", "cần", "đã", "để", "đó", "được",
    "em", "gì", "khi", "không", "là", "một", "nào", "này", "như", "ở", "quy",
    "sau", "sẽ", "sinh", "tác", "thì", "theo", "tôi", "trong", "trường", "và", "về", "với",
    "xin", "yêu", "định", "đến",
})


# Administrative topics the maintenance knowledge base does not cover (billing,
# contracts, parking, amenities, house rules, office hours). They are matched in
# the same TF-IDF space; when a question is closer to one of them than to any
# procedure, the service abstains and points to the building office.
# Topics and the margin were chosen on the dev question set only.
OUT_OF_SCOPE_TOPICS = json.loads((Path(__file__).resolve().parent.parent / "data" / "out_of_scope_topics.json").read_text(encoding="utf-8"))
OUT_OF_SCOPE_ANSWER = "Câu hỏi thuộc nghiệp vụ hành chính (thanh toán, hợp đồng, tiện ích, nội quy), không có trong kho quy trình kỹ thuật. Vui lòng liên hệ ban quản lý."


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
    for topic in OUT_OF_SCOPE_TOPICS:
        entries.append((topic["id"], topic["topic"], "out_of_scope", "", topic["text"], False))
    vectorizer = TfidfVectorizer(
        lowercase=True,
        ngram_range=(1, 2),
        stop_words=list(VIETNAMESE_STOP_WORDS),
        sublinear_tf=True,
    )
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
    best_scope = max((float(scores[i]) for i, entry in enumerate(entries) if entry[2] == "out_of_scope"), default=0.0)
    best_procedure = max((float(scores[i]) for i, entry in enumerate(entries) if entry[2] != "out_of_scope"), default=0.0)
    if best_scope > MIN_RETRIEVAL_SCORE and best_scope >= best_procedure:
        return {"answer": OUT_OF_SCOPE_ANSWER, "citations": [], "outOfScope": True}
    citations = []
    seen = set()
    for position in ranked:
        article_id, title, category, source_label, passage, is_title = entries[position]
        score = float(scores[position])
        if category == "out_of_scope":
            continue
        if score <= MIN_RETRIEVAL_SCORE:
            break
        if article_id in seen:
            continue
        if is_title:
            body_positions = [i for i, entry in enumerate(entries)
                              if entry[0] == article_id and not entry[5] and entry[2] != "out_of_scope"]
            if not body_positions:
                continue
            body_position = max(body_positions, key=lambda i: scores[i])
            passage = entries[body_position][4]
        seen.add(article_id)
        citations.append({"id": article_id, "title": title, "sourceLabel": source_label,
                          "excerpt": passage, "score": round(score, 4)})
        if len(citations) >= request.topK:
            break
    return {"answer": "Đã tìm thấy tài liệu liên quan; nhân viên cần kiểm tra nguồn trước khi phản hồi." if citations else empty["answer"],
            "citations": citations}
