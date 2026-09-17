"""
Dự báo nguy cơ trễ SLA cho hồ sơ đang xử lý.

Model hiện tại train trên dữ liệu synthetic (tổng hợp), chưa phải
dữ liệu vận hành thật. Hệ số trong logit function được chọn thủ công
để mô phỏng pattern hợp lý: thời gian đã dùng, số lần chuyển bộ phận,
workload team, v.v. đều tương quan dương với xác suất trễ.

Khi có dữ liệu thật từ pilot, cần train lại và so sánh với baseline
rule-based (elapsed >= 80% → high risk).
"""
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


def build_sla_model() -> Pipeline:
    """Sinh dữ liệu tổng hợp và train LogReg dự báo SLA breach."""
    rng = np.random.default_rng(42)
    samples = 2_500

    # Feature engineering: 6 đặc trưng đầu vào
    elapsed_ratio = rng.uniform(0, 1.4, samples)    # có thể > 1.0 khi đã quá hạn
    transfers = rng.integers(0, 5, samples)          # số lần chuyển bộ phận
    workload = rng.integers(1, 18, samples)          # số hồ sơ đang mở của team
    remaining_steps = rng.integers(1, 7, samples)    # bước còn lại trong quy trình
    priority_weight = rng.integers(0, 4, samples)    # 0=low..3=urgent
    due_hours = rng.uniform(4, 72, samples)          # SLA target (giờ)

    x = np.column_stack(
        [elapsed_ratio, transfers, workload, remaining_steps, priority_weight, due_hours]
    )

    # Hệ số logit thủ công — mô phỏng mối quan hệ giữa features và breach
    # elapsed_ratio ảnh hưởng mạnh nhất (4.6), intercept âm (-4.2) để phần lớn
    # case bình thường có rủi ro thấp
    logits = (
        -4.2
        + elapsed_ratio * 4.6
        + transfers * 0.48
        + workload * 0.11
        + remaining_steps * 0.23
        + priority_weight * 0.3
        - np.log1p(due_hours) * 0.12  # SLA dài hơn → ít rủi ro hơn (ceteris paribus)
    )
    probabilities = 1 / (1 + np.exp(-logits))
    labels = (rng.random(samples) < probabilities).astype(int)

    model = Pipeline(
        [
            ("scale", StandardScaler()),
            ("classifier", LogisticRegression(max_iter=1_000, random_state=42)),
        ]
    )
    model.fit(x, labels)
    return model


sla_model = build_sla_model()
