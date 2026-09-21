import { config } from "../config.js";
import { CircuitBreakerState } from "../models.js";

export interface ClassificationResult {
  label: string;
  confidence: number;
  summary: string;
  extracted: Record<string, string>;
  topCandidates: Array<{ label: string; score: number }>;
  provider: "ml-service" | "fallback";
}

export interface SimilarCaseInput {
  id: string;
  title: string;
  text: string;
}

// TODO: nên chuyển keyword list sang config hoặc DB để admin cập nhật được
// mà không cần deploy lại backend. Hiện hardcode vì chỉ dùng khi AI service down.
const keywordGroups: Record<string, string[]> = {
  it_access: ["đăng nhập", "mật khẩu", "tài khoản", "wifi", "website", "phần mềm", "email"],
  academic_records: ["bảng điểm", "điểm", "học phần", "đăng ký môn", "tiên quyết", "đồ án"],
  student_services: ["xác nhận sinh viên", "giấy chứng nhận", "học bổng", "rèn luyện", "thẻ sinh viên"],
  facilities: ["điện", "nước", "điều hòa", "phòng học", "thiết bị", "cơ sở vật chất"],
  finance: ["học phí", "biên lai", "hoàn tiền", "thanh toán", "công nợ"]
};

const CIRCUIT_THRESHOLD = 3;        // open after N consecutive failures
const CIRCUIT_COOLDOWN_MS = 30_000; // try again after 30s
const CIRCUIT_KEY = "ai-service";

type PersistedCircuitState = {
  _id: unknown;
  failures: number;
  lastFailureAt: Date | null;
  open: boolean;
};

async function recordSuccess() {
  await CircuitBreakerState.updateOne(
    { key: CIRCUIT_KEY },
    { $set: { failures: 0, open: false, lastFailureAt: null } },
    { upsert: true }
  ).catch(() => undefined);
}

async function recordFailure() {
  const state = await CircuitBreakerState.findOneAndUpdate(
    { key: CIRCUIT_KEY },
    { $inc: { failures: 1 }, $set: { lastFailureAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean().catch(() => null) as PersistedCircuitState | null;
  if (state && state.failures >= CIRCUIT_THRESHOLD && !state.open) {
    await CircuitBreakerState.updateOne({ _id: state._id, open: false }, { $set: { open: true } }).catch(() => undefined);
    console.warn(`[AI Circuit Breaker] Opened after ${CIRCUIT_THRESHOLD} consecutive failures. Will retry after ${CIRCUIT_COOLDOWN_MS / 1000}s.`);
  }
}

async function isCircuitOpen(): Promise<boolean> {
  const state = await CircuitBreakerState.findOne({ key: CIRCUIT_KEY }).lean().catch(() => null) as PersistedCircuitState | null;
  if (!state?.open) return false;
  const elapsed = state.lastFailureAt ? Date.now() - new Date(state.lastFailureAt).getTime() : CIRCUIT_COOLDOWN_MS;
  if (elapsed > CIRCUIT_COOLDOWN_MS) {
    // Half-open: allow a probe. Persisting this state keeps API instances aligned after restarts.
    await CircuitBreakerState.updateOne({ _id: state._id }, { $set: { open: false } }).catch(() => undefined);
    return false;
  }
  return true;
}

/* ── HTTP Helper with Retry ── */

async function postJson<T>(path: string, body: unknown): Promise<T> {
  if (await isCircuitOpen()) {
    throw new Error("AI circuit breaker is open");
  }

  const attempt = async (): Promise<T> => {
    const response = await fetch(`${config.AI_SERVICE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // 5s timeout — đủ cho TF-IDF inference, nhưng nếu chuyển sang
      // transformer model cần tăng lên 10-15s
      signal: AbortSignal.timeout(5_000)
    });
    if (!response.ok) {
      throw new Error(`AI service returned ${response.status}`);
    }
    return (await response.json()) as T;
  };

  try {
    const result = await attempt();
    await recordSuccess();
    return result;
  } catch (firstError) {
    // Retry once after 500ms
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const result = await attempt();
      await recordSuccess();
      return result;
    } catch {
      await recordFailure();
      throw firstError;
    }
  }
}

export function fallbackClassify(text: string): ClassificationResult {
  const normalized = text.toLocaleLowerCase("vi");
  const scores = Object.entries(keywordGroups).map(([label, keywords]) => ({
    label,
    score: keywords.reduce((total, keyword) => total + (normalized.includes(keyword) ? 1 : 0), 0)
  }));
  scores.sort((a, b) => b.score - a.score);

  const best = scores[0];
  const label = best.score > 0 ? best.label : "general_support";
  // Confidence ở fallback không có ý nghĩa xác suất thật, chỉ là heuristic
  // để UI hiển thị mức tin cậy tương đối. Luôn thấp hơn ML service.
  const confidence = best.score > 0 ? Math.min(0.55 + best.score * 0.1, 0.88) : 0.35;

  return {
    label,
    confidence,
    summary: text.trim().replace(/\s+/g, " ").slice(0, 180),
    extracted: {},
    topCandidates: scores.slice(0, 3).map((item) => ({
      label: item.label,
      score: item.score === 0 ? 0.05 : Math.min(0.45 + item.score * 0.1, 0.85)
    })),
    provider: "fallback"
  };
}

export async function classifyText(text: string): Promise<ClassificationResult> {
  try {
    const result = await postJson<Omit<ClassificationResult, "provider">>("/classify", { text });
    return { ...result, provider: "ml-service" };
  } catch {
    return fallbackClassify(text);
  }
}

export async function findSimilarCases(text: string, items: SimilarCaseInput[]) {
  if (items.length === 0) return [];

  try {
    const result = await postJson<{ matches: Array<{ id: string; score: number; title: string }> }>(
      "/similarity",
      { text, items, threshold: 0.28 }
    );
    return result.matches;
  } catch {
    const words = new Set(text.toLocaleLowerCase("vi").split(/\W+/).filter((word) => word.length > 3));
    return items
      .map((item) => {
        const candidate = new Set(item.text.toLocaleLowerCase("vi").split(/\W+/));
        const overlap = [...words].filter((word) => candidate.has(word)).length;
        return { id: item.id, title: item.title, score: words.size ? overlap / words.size : 0 };
      })
      .filter((item) => item.score >= 0.28)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }
}

export async function predictSla(input: {
  elapsedHours: number;
  dueHours: number;
  transfers: number;
  workload: number;
  remainingSteps: number;
  priority: string;
}) {
  try {
    return await postJson<{ riskScore: number; riskLevel: string; factors: string[] }>("/sla/predict", input);
  } catch {
    const timeRatio = input.dueHours <= 0 ? 1 : input.elapsedHours / input.dueHours;
    const score = Math.min(
      0.95,
      Math.max(0.08, timeRatio * 0.55 + input.transfers * 0.09 + input.workload * 0.025 + input.remainingSteps * 0.04)
    );
    return {
      riskScore: Number(score.toFixed(3)),
      riskLevel: score >= 0.7 ? "high" : score >= 0.4 ? "medium" : "low",
      factors: [
        ...(timeRatio > 0.65 ? ["Thời gian xử lý đã sử dụng phần lớn SLA"] : []),
        ...(input.workload > 8 ? ["Khối lượng công việc của bộ phận đang cao"] : []),
        ...(input.transfers > 1 ? ["Hồ sơ đã chuyển bộ phận nhiều lần"] : [])
      ]
    };
  }
}

export async function retrieveKnowledge(
  query: string,
  articles: Array<{ id: string; title: string; content: string; category: string; sourceLabel: string }>
) {
  try {
    return await postJson<{
      answer: string;
      citations: Array<{ id: string; title: string; sourceLabel: string; excerpt: string; score: number }>;
    }>("/knowledge/retrieve", { query, articles, topK: 4 });
  } catch {
    const queryWords = new Set(query.toLocaleLowerCase("vi").split(/\W+/).filter((word) => word.length > 3));
    const chunks = (content: string) => {
      const normalized = content.replace(/\s+/g, " ").trim();
      return normalized.match(/.{1,500}(?:\s|$)|.{1,500}/g)?.map((part) => part.trim()).filter(Boolean) || [];
    };
    const citations = articles
      .map((article) => {
        const allChunks = [article.title, `${article.title} ${article.category}`, ...chunks(article.content)];
        const best = allChunks
          .map((excerpt) => ({ excerpt, score: [...queryWords].filter((word) => excerpt.toLocaleLowerCase("vi").includes(word)).length / Math.max(queryWords.size, 1) }))
          .sort((left, right) => right.score - left.score)[0];
        return {
          id: article.id,
          title: article.title,
          sourceLabel: article.sourceLabel,
          excerpt: best?.excerpt || "",
          score: best?.score || 0
        };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);

    return {
      answer: citations.length
        ? "Đã tìm thấy các tài liệu có nội dung liên quan. Hãy kiểm tra trích dẫn trước khi phản hồi."
        : "Chưa tìm thấy căn cứ phù hợp trong kho tri thức.",
      citations
    };
  }
}
