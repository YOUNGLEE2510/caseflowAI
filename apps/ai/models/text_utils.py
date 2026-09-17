"""Tiện ích xử lý văn bản cho pipeline AI."""
import re


def summarize(text: str, limit: int = 180) -> str:
    """Rút gọn text thành tối đa `limit` ký tự, bỏ whitespace thừa."""
    compact = re.sub(r"\s+", " ", text).strip()
    if len(compact) <= limit:
        return compact
    return compact[: limit - 1].rstrip() + "…"


def extract_entities(text: str) -> dict[str, str]:
    """Trích xuất entity đơn giản bằng regex: mã SV, phòng, deadline.

    Đây là rule-based extraction, không phải NER model. Đủ dùng cho
    các pattern phổ biến trong ngữ cảnh trường đại học. Với text phức tạp
    hơn nên xem xét underthesea hoặc PhoBERT NER.
    """
    extracted: dict[str, str] = {}

    # Mã sinh viên: SV/CT/IT + 6-10 chữ số, hoặc chỉ 6-10 chữ số
    student_id = re.search(r"\b(?:SV|CT|IT)?\d{6,10}\b", text, re.IGNORECASE)

    # Phòng học: ví dụ A1-302, B2.105, Đ3-01
    room = re.search(r"\b[A-ZĐ]\d{1,2}[-.]?\d{2,4}\b", text, re.IGNORECASE)

    # Deadline: "trước thứ Hai", "ngày 15/09", "hôm nay", "ngày mai"
    deadline = re.search(
        r"(trước\s+(?:thứ\s+\w+|ngày\s+\d{1,2}[/-]\d{1,2})|hôm nay|ngày mai)",
        text,
        re.IGNORECASE,
    )

    if student_id:
        extracted["studentId"] = student_id.group(0).upper()
    if room:
        extracted["location"] = room.group(0).upper()
    if deadline:
        extracted["deadline"] = deadline.group(0)

    return extracted
