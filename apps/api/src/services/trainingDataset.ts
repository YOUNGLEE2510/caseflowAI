export type ReviewedCase = {
  title?: string;
  description?: string;
  category?: string;
  createdAt?: Date;
  ai?: {
    classification?: string;
    confidence?: number;
    reviewStatus?: "confirmed" | "corrected";
    humanCorrectedLabel?: string | null;
    reviewedAt?: Date | null;
  };
};

export function redactTrainingText(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]")
    // Personal identifiers before phones: student-style codes (B22DCCN019, SV12345678) and
    // citizen IDs (CCCD 12 digits, CMND 9 digits); then any other long number.
    .replace(/\b(?:[A-Z]{1,2}\d{2}[A-Z]{2,8}\d{3,6}|(?:MSSV|MSV|SV)\s*[:#-]?\s*\d{6,10}|\d{12}|\d{9})\b/gi, "[ID_NUMBER]")
    .replace(/(?:\+?\d[\d .()-]{7,}\d)/g, "[PHONE]")
    .replace(/\b\d{6,12}\b/g, "[ID_NUMBER]")
    .replace(/\s+/g, " ")
    .trim();
}

function csvCell(value: string | number | undefined | null) {
  const raw = String(value ?? "");
  const text = /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildReviewedTrainingCsv(cases: ReviewedCase[]) {
  const headers = ["text", "label", "predicted_label", "confidence", "reviewed_at", "created_at"];
  const rows = cases.flatMap((record) => {
    if (record.ai?.reviewStatus !== "confirmed" && record.ai?.reviewStatus !== "corrected") {
      return [];
    }
    const label = record.ai?.reviewStatus === "corrected"
      ? record.ai.humanCorrectedLabel
      : record.category;
    const text = redactTrainingText(`${record.title || ""}. ${record.description || ""}`);
    if (!text || !label) return [];
    return [[
      text,
      label,
      record.ai?.classification,
      record.ai?.confidence,
      record.ai?.reviewedAt?.toISOString(),
      record.createdAt?.toISOString()
    ].map(csvCell).join(",")];
  });
  return "\uFEFF" + [headers.join(","), ...rows].join("\n");
}
