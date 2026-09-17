import numpy as np
from fastapi import APIRouter

from ..models.sla_predictor import sla_model
from ..schemas import SlaRequest

router = APIRouter()


@router.post("/sla/predict")
def predict_sla(request: SlaRequest) -> dict:
    priority_map = {"low": 0, "normal": 1, "high": 2, "urgent": 3}
    elapsed_ratio = request.elapsedHours / max(request.dueHours, 1)
    features = np.array(
        [
            [
                elapsed_ratio,
                request.transfers,
                request.workload,
                request.remainingSteps,
                priority_map[request.priority],
                max(request.dueHours, 0),
            ]
        ]
    )
    score = float(sla_model.predict_proba(features)[0, 1])
    factors: list[str] = []
    if elapsed_ratio >= 0.7:
        factors.append("Thời gian xử lý đã sử dụng phần lớn SLA")
    if request.workload >= 9:
        factors.append("Khối lượng công việc của bộ phận đang cao")
    if request.transfers >= 2:
        factors.append("Hồ sơ đã được chuyển bộ phận nhiều lần")
    if request.remainingSteps >= 4:
        factors.append("Quy trình còn nhiều bước chưa hoàn thành")
    if request.priority == "urgent":
        factors.append("Hồ sơ có mức ưu tiên khẩn cấp")
    level = "high" if score >= 0.7 else "medium" if score >= 0.4 else "low"
    return {
        "riskScore": round(score, 4),
        "riskLevel": level,
        "factors": factors,
    }
