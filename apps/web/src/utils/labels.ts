export const categoryLabels: Record<string, { vi: string; en: string }> = {
  it_access: { vi: "Tài khoản và CNTT", en: "Accounts and IT" },
  academic_records: { vi: "Học vụ", en: "Academic records" },
  student_services: { vi: "Dịch vụ sinh viên", en: "Student services" },
  facilities: { vi: "Cơ sở vật chất", en: "Facilities" },
  finance: { vi: "Tài chính", en: "Finance" },
  general_support: { vi: "Hỗ trợ chung", en: "General support" }
};

const statusLabels: Record<string, { vi: string; en: string }> = {
  new: { vi: "Mới", en: "New" }, triaged: { vi: "Đã phân loại", en: "Triaged" },
  in_progress: { vi: "Đang xử lý", en: "In progress" }, waiting: { vi: "Chờ phản hồi", en: "Waiting" },
  resolved: { vi: "Đã giải quyết", en: "Resolved" }, closed: { vi: "Đã đóng", en: "Closed" }
};

export function timelineLabel(event: { type: string; label: string }, locale: "vi" | "en") {
  const transition = /^Chuyển trạng thái từ (\w+) sang (\w+)$/.exec(event.label);
  if (transition) {
    const from = statusLabels[transition[1]]?.[locale] || transition[1];
    const to = statusLabels[transition[2]]?.[locale] || transition[2];
    return `${from} → ${to}`;
  }
  const label = event.label.replace(/\b(it_access|academic_records|student_services|facilities|finance|general_support)\b/g, key => categoryLabels[key][locale]);
  const channel = /^Tiếp nhận từ kênh (\w+)$/.exec(event.label);
  if (channel) {
    const channels: Record<string, { vi: string; en: string }> = { portal: { vi: "Cổng trực tuyến", en: "Online portal" }, email: { vi: "Email", en: "Email" }, phone: { vi: "Điện thoại", en: "Phone" }, walk_in: { vi: "Tiếp nhận trực tiếp", en: "Walk-in" } };
    return `${locale === "vi" ? "Tiếp nhận qua" : "Received via"} ${channels[channel[1]]?.[locale] || channel[1]}`;
  }
  if (locale === "vi") return label;
  const assigned = /^Đã giao cho (.+)$/.exec(event.label);
  if (assigned) return `Assigned to ${assigned[1]}`;
  const rating = /^Người yêu cầu đánh giá (\d\/5)$/.exec(event.label);
  if (rating) return `Requester rated ${rating[1]}`;
  const uploaded = /^Đã đính kèm tệp (.+)$/.exec(event.label);
  if (uploaded) return `Attached file ${uploaded[1]}`;
  if (event.type === "commented") return event.label.includes("nội bộ") ? "Internal note added" : "Reply added";
  const labels: Record<string, string> = { ai_reviewed: "AI routing reviewed by staff", ai_triage: "AI routing suggestion recorded; awaiting staff review", ai_classified: "AI routing suggestion recorded", created: "Request created", closed_by_requester: "Requester confirmed closure", reopened_by_requester: "Requester reopened the case", resolved: "Case resolved", comment_added: "Reply added", internal_note: "Internal note added" };
  return labels[event.type] || label;
}
