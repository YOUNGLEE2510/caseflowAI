export const categoryLabels: Record<string, { vi: string; en: string }> = {
  water: { vi: "Cấp thoát nước", en: "Water and drainage" },
  electrical: { vi: "Điện", en: "Electrical" },
  internet: { vi: "Internet", en: "Internet" },
  appliances: { vi: "Thiết bị căn hộ", en: "Apartment appliances" },
  access_security: { vi: "Ra vào và an ninh", en: "Access and security" },
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
  const label = event.label.replace(/\b(water|electrical|internet|appliances|access_security|general_support)\b/g, key => categoryLabels[key][locale]);
  const channel = /^Tiếp nhận từ kênh (\w+)$/.exec(event.label);
  if (channel) {
    const channels: Record<string, { vi: string; en: string }> = { portal: { vi: "Cổng trực tuyến", en: "Online portal" }, email: { vi: "Email", en: "Email" }, phone: { vi: "Điện thoại", en: "Phone" }, walk_in: { vi: "Tiếp nhận trực tiếp", en: "Walk-in" }, qr: { vi: "Mã QR căn hộ", en: "Unit QR code" } };
    return `${locale === "vi" ? "Tiếp nhận qua" : "Received via"} ${channels[channel[1]]?.[locale] || channel[1]}`;
  }
  if (locale === "vi") return label;
  const qrIntake = /^Tiếp nhận qua mã QR căn (\S+)/.exec(event.label);
  if (qrIntake) return `Received via QR code for unit ${qrIntake[1]} — sender not verified`;
  const verified = /^Đã xác minh người gửi: (.+)$/.exec(event.label);
  if (verified) return `Sender verified: ${verified[1]}`;
  if (event.type === "intake_verified") return "QR submission verified (sender has no account)";
  if (event.type === "intake_rejected") return "QR submission rejected";
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
