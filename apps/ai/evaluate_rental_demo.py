"""Small synthetic smoke evaluation; not a real-world quality benchmark."""
import json
from pathlib import Path
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from .config import DOMAIN_PROFILE
from .models.classifier import classifier, MODEL_METADATA

CASES = [
    ("water", "Vòi trong nhà tắm chảy yếu, bồn rửa cũng thiếu nước"),
    ("water", "Nước thải trào ngược từ cống nhà vệ sinh"),
    ("electrical", "Tôi ngửi thấy mùi khét từ ổ cắm điện ở bếp"),
    ("electrical", "Cả căn tối vì không có điện trong khi bên ngoài vẫn sáng"),
    ("internet", "Máy tính kết nối wifi nhưng tất cả trang web đều không tải"),
    ("internet", "Đường truyền mạng chung ngừng hoạt động vào sáng nay"),
    ("appliances", "Tủ lạnh chạy suốt nhưng đồ ăn không lạnh"),
    ("appliances", "Máy giặt căn tôi báo lỗi và không thể vắt quần áo"),
    ("access_security", "Cần hỗ trợ vì chìa khóa phòng đã bị mất"),
    ("access_security", "Thẻ từ của tôi không mở được cổng sảnh"),
    ("general_support", "Xin đổi lịch kỹ thuật đến vì hôm đó tôi đi vắng"),
    ("general_support", "Tôi muốn gửi góp ý cho quản lý và hỏi giờ lễ tân")
]

def evaluate():
    if DOMAIN_PROFILE != "rental":
        raise ValueError("Set DOMAIN_PROFILE=rental")
    labels = sorted(classifier.classes_)
    expected = [label for label, _ in CASES]
    predicted = classifier.predict([text for _, text in CASES]).tolist()
    return {
        "datasetKind": "synthetic-smoke", "limitations": "Hand-authored, 12 short examples. No pilot or external validation.",
        "model": MODEL_METADATA, "accuracy": accuracy_score(expected, predicted),
        "report": classification_report(expected, predicted, labels=labels, output_dict=True, zero_division=0),
        "labels": labels, "confusionMatrix": confusion_matrix(expected, predicted, labels=labels).tolist(),
        "errors": [{"text": text, "expected": wanted, "predicted": got}
                   for (wanted, text), got in zip(CASES, predicted) if wanted != got]
    }

if __name__ == "__main__":
    output = Path("artifacts/ai-evaluation/rental-demo.json")
    output.parent.mkdir(parents=True, exist_ok=True)
    result = evaluate()
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), "datasetKind": result["datasetKind"], "accuracy": result["accuracy"]}))
