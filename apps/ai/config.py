"""
Cấu hình chung cho AI service: taxonomy, training data, thresholds.

CATEGORY_NAMES map key nội bộ → tên hiển thị tiếng Việt.
Khi thêm danh mục mới cần cập nhật cả CATEGORY_NAMES và training_samples.json.
"""
import json
from pathlib import Path

# 6 nhóm dịch vụ — tương ứng với taxonomy trong ServiceDefinition bên Express API.
# general_support là fallback khi classifier không tự tin về category nào.
CATEGORY_NAMES = {
    "it_access": "Tài khoản và truy cập",
    "academic_records": "Đào tạo và học vụ",
    "student_services": "Dịch vụ sinh viên",
    "facilities": "Cơ sở vật chất",
    "finance": "Học phí và thanh toán",
    "general_support": "Hỗ trợ chung",
}

# Load từ JSON thay vì hardcode trong source — dễ thêm mẫu mà không sửa code
_data_dir = Path(__file__).parent / "data"
TRAINING_EXAMPLES = json.loads((_data_dir / "training_samples.json").read_text(encoding="utf-8"))
