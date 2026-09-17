"""
Bộ phân loại yêu cầu dịch vụ sử dụng TF-IDF + Logistic Regression.

Đây là baseline classifier — hoạt động đủ tốt với lượng mẫu nhỏ (~60 câu)
và không cần GPU. Khi có ≥200 mẫu gán nhãn, nên đánh giá lại so với
sentence-transformers hoặc PhoBERT fine-tune.
"""
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

from ..config import TRAINING_EXAMPLES
from .text_utils import summarize, extract_entities


def build_classifier() -> Pipeline:
    """Huấn luyện pipeline TF-IDF + LogReg từ training_samples.json.

    Pipeline được build lại mỗi khi service khởi động. Với ~60 mẫu
    thời gian fit < 50ms nên chưa cần serialize ra file pkl.
    """
    texts: list[str] = []
    labels: list[str] = []
    for label, examples in TRAINING_EXAMPLES.items():
        texts.extend(examples)
        labels.extend([label] * len(examples))

    model = Pipeline(
        [
            (
                "tfidf",
                TfidfVectorizer(
                    lowercase=True,
                    ngram_range=(1, 2),  # bigram bắt được cụm như "học phí", "mật khẩu"
                    min_df=1,
                    sublinear_tf=True,   # log(1+tf) giảm ảnh hưởng của từ lặp nhiều
                ),
            ),
            (
                "classifier",
                LogisticRegression(
                    max_iter=1_000,
                    class_weight="balanced",
                    # C=20.0: regularization yếu hơn default (1.0) vì corpus rất nhỏ.
                    # Thử nghiệm 5-fold CV: C=20 cho macro-F1 cao hơn C=1 khoảng 8%
                    # trên tập demo. Cần đánh giá lại khi có dataset lớn hơn.
                    C=20.0,
                    random_state=42,
                ),
            ),
        ]
    )
    model.fit(texts, labels)
    return model


# Build ngay khi import — classifier sẵn sàng cho request đầu tiên
classifier = build_classifier()


def classify_text(text: str) -> dict:
    """Phân loại văn bản, trả về label + confidence + top-3 candidates.

    Confidence là xác suất softmax từ LogReg, không phải xác suất thực
    của dự đoán đúng — cần calibrate nếu dùng làm threshold tự động.
    """
    probabilities = classifier.predict_proba([text])[0]
    classes = classifier.classes_
    ranking = sorted(
        zip(classes, probabilities, strict=True), key=lambda item: item[1], reverse=True
    )
    best_label, best_score = ranking[0]
    return {
        "label": best_label,
        "confidence": round(float(best_score), 4),
        "summary": summarize(text),
        "extracted": extract_entities(text),
        "topCandidates": [
            {"label": label, "score": round(float(score), 4)}
            for label, score in ranking[:3]
        ],
    }
