export interface RecommendationContext {
  status: string;
  assigneeId?: unknown;
  reviewStatus?: string;
  missingFields: string[];
}

export function categoryResolver(services: Array<{ key: string; name: string; category: string }>) {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").trim().toLowerCase().replace(/\s+/g, " ");
  const aliases = new Map<string, Set<string>>();
  for (const service of services) for (const alias of [service.key, service.name, service.category]) {
    const key = normalize(alias);
    if (!key) continue;
    const targets = aliases.get(key) || new Set<string>();
    targets.add(service.category);
    aliases.set(key, targets);
  }
  return (value: string) => {
    const category = services.find(service => normalize(service.category) === normalize(value));
    if (category) return category.category;
    const targets = aliases.get(normalize(value));
    return targets?.size === 1 ? [...targets][0] : null;
  };
}

export function isRecommendationManager(role: string) {
  return ["manager", "org_admin", "platform_admin"].includes(role);
}

export function nextStep(context: RecommendationContext) {
  if (["resolved", "closed"].includes(context.status)) return null;
  if (context.missingFields.length) return { action: "request_information", reason: `Cần bổ sung: ${context.missingFields.join(", ")}.` };
  if (!context.reviewStatus || context.reviewStatus === "pending") return { action: "review_routing", reason: "Phân loại AI chưa được nhân viên xác nhận." };
  if (!context.assigneeId) return { action: "assign", reason: "Hồ sơ chưa có người phụ trách." };
  return { action: "review_progress", reason: "Kiểm tra tiến độ và cập nhật bước xử lý tiếp theo theo quy trình dịch vụ." };
}
