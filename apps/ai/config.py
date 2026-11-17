"""
Cấu hình chung cho AI service: taxonomy, training data, thresholds.

CATEGORY_NAMES map key nội bộ → tên hiển thị tiếng Việt.
Khi thêm danh mục mới cần cập nhật cả CATEGORY_NAMES và training_samples.json.
"""
import json
import os
from pathlib import Path

# 6 nhóm dịch vụ căn hộ — tương ứng với ServiceDefinition bên Express API.
# general_support là fallback khi classifier không tự tin về category nào.
CATEGORY_NAMES = {
    "water": "Cấp thoát nước", "electrical": "Điện", "internet": "Internet",
    "appliances": "Thiết bị căn hộ", "access_security": "Ra vào và an ninh",
    "general_support": "Hỗ trợ chung",
}

# Mẫu mô phỏng viết tay (xem data/SOURCES.md), không phải dữ liệu khách thuê thật.
_data_dir = Path(__file__).parent / "data"
TRAINING_EXAMPLES = json.loads((_data_dir / "rental_demo.json").read_text(encoding="utf-8"))

# Chỉ còn một miền nghiệp vụ; biến môi trường giữ lại để cấu hình cũ không lỗi.
DOMAIN_PROFILE = os.getenv("DOMAIN_PROFILE", "rental")
if DOMAIN_PROFILE != "rental":
    raise ValueError("Unknown domain profile")
if set(TRAINING_EXAMPLES) != set(CATEGORY_NAMES):
    raise ValueError("Training taxonomy mismatch")
