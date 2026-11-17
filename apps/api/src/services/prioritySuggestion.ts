/**
 * Explainable priority suggestion for an incoming request.
 *
 * There is no labelled priority data yet, so this is a transparent rule layer on top of the
 * ML outputs (category label, related open cases) rather than a trained model. Every
 * suggestion carries the reasons that produced it; staff confirm or change the priority.
 * Requesters cannot set priority themselves, so this suggestion never changes it automatically.
 */
export type Priority = "low" | "normal" | "high" | "urgent";
export interface PrioritySuggestion { priority: Priority; reasons: string[] }

const ORDER: Priority[] = ["low", "normal", "high", "urgent"];

/** Lowercase and strip Vietnamese diacritics so "cháy", "chay" and "CHÁY" all match. */
export function normalizePriorityText(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase().replace(/\s+/g, " ");
}

// `patterns` run on diacritic-free text; `accented` run on the original lowercase text for words whose
// unaccented form is ambiguous (e.g. "cháy" = burning vs "chạy" = running both become "chay").
interface Signal { level: Priority; reason: string; patterns: RegExp[]; accented?: RegExp[] }
const SIGNALS: Signal[] = [
  { level: "urgent", reason: "Có dấu hiệu nguy hiểm cháy nổ hoặc điện", accented: [/cháy/, /khói/], patterns: [/(boc|bi) chay\b/, /chay no/, /mui khet/, /tia lua/, /chap dien/, /dien giat/, /giat dien/, /no (tung|bung)/] },
  { level: "urgent", reason: "Nghi rò rỉ khí gas", patterns: [/(ro ri|ro|mui) gas/, /\bgas\b.*\b(ro|mui)\b/] },
  { level: "urgent", reason: "Có người bị kẹt hoặc bị thương", patterns: [/(ket|mac ket) (trong )?thang may/, /bi thuong/, /cap cuu/, /\bnga\b.*(chay mau|bat tinh)/] },
  { level: "urgent", reason: "Nguy cơ ngập hoặc hư hại kết cấu", patterns: [/\bngap\b/, /nuoc tran (ra|khap|vao)/, /(sap|nut|bong|do) (tran|tuong|ban cong)/] },
  { level: "high", reason: "Mất dịch vụ thiết yếu", patterns: [/mat (dien|nuoc)/, /(khong|ko|k) co (dien|nuoc)/, /cup (dien|nuoc)/, /mat mang (toan|ca)/] },
  { level: "high", reason: "Ảnh hưởng nhiều căn hoặc khu vực chung", patterns: [/ca (tang|toa|day|khu)/, /toan (bo |)(tang|toa|khu|nha)/, /nhieu (can|phong|ho)/, /cac can (khac|ben canh)/] },
  { level: "high", reason: "Rò rỉ nước đang tiếp diễn", patterns: [/ro ri nuoc/, /ro nuoc/, /nuoc (nho|chay|ri) (xuong|tu tran|ra san)/, /(ong|duong) nuoc.*(vo|bi ro|ro lien)/] },
  { level: "high", reason: "Vấn đề an ninh, ra vào", patterns: [/(khong|ko) (khoa|vao|mo) duoc (cua|nha|phong)/, /(khoa|cua) (chinh )?(bi )?hong/, /mat (chia )?khoa/, /dot nhap|trom/] },
  { level: "low", reason: "Yêu cầu tư vấn hoặc không gấp", patterns: [/khong gap/, /khi nao tien/, /(gop y|hoi thong tin|thac mac|tu van|de xuat)/] }
];

const CATEGORY_BASE: Record<string, Priority> = { general_support: "low" };

export function suggestPriority(input: { text: string; category?: string; relatedOpenCases?: number }): PrioritySuggestion {
  const text = normalizePriorityText(input.text);
  const accented = input.text.normalize("NFC").toLowerCase();
  const matched = SIGNALS.filter(signal => signal.patterns.some(pattern => pattern.test(text)) || signal.accented?.some(pattern => pattern.test(accented)));
  const raising = matched.filter(signal => signal.level !== "low");
  let level: Priority = raising.length
    ? raising.reduce<Priority>((top, signal) => ORDER.indexOf(signal.level) > ORDER.indexOf(top) ? signal.level : top, "normal")
    : matched.length ? "low" : CATEGORY_BASE[input.category || ""] || "normal";
  const reasons = (raising.length ? raising : matched).map(signal => signal.reason);
  if ((input.relatedOpenCases || 0) >= 2 && level !== "urgent") {
    level = ORDER[Math.max(ORDER.indexOf("high"), ORDER.indexOf(level) + 1)] as Priority;
    reasons.push(`Có ${input.relatedOpenCases} phản ánh tương tự đang mở, có thể là sự cố chung`);
  }
  if (!reasons.length) reasons.push(level === "low" ? "Nhóm yêu cầu hỗ trợ chung" : "Không phát hiện dấu hiệu khẩn cấp");
  return { priority: level, reasons: [...new Set(reasons)] };
}
