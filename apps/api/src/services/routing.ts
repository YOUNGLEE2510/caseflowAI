export const AI_ROUTING_CONFIDENCE_THRESHOLD = 0.55;

export type AiReviewStatus = "confirmed" | "corrected";

export function canUseAiRouting(confidence: number) {
  return Number.isFinite(confidence) && confidence >= AI_ROUTING_CONFIDENCE_THRESHOLD;
}

export function resolveAiReviewStatus(predictedCategory: string, selectedCategory: string): AiReviewStatus {
  return predictedCategory === selectedCategory ? "confirmed" : "corrected";
}
