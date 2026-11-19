// User-study support: staff accounts in the "manual" condition must not see anything the AI
// produced. AI keeps running and storing its output; this module only withholds it on the way out.
import type { NextFunction, Request, Response } from "express";
import type { AuthUser } from "../middleware/auth.js";

export const isAiHidden = (auth: Pick<AuthUser, "role" | "aiHidden"> | undefined) => Boolean(auth && auth.role !== "requester" && auth.aiHidden);

const NEUTRAL_REVIEW_LABEL = "Đã xác nhận phân loại";

/**
 * Keep only the processing state and a neutral review state of `ai` (the workflow needs to know
 * whether routing was confirmed, but "corrected" would reveal that the AI disagreed), and drop or
 * neutralise AI wording in the timeline.
 */
export function stripAiFromCase<T extends Record<string, any>>(value: T): T {
  const result: Record<string, any> = { ...value };
  const reviewed = Boolean(value.ai?.reviewStatus) && value.ai.reviewStatus !== "pending";
  result.ai = { processingStatus: value.ai?.processingStatus, reviewStatus: reviewed ? "reviewed" : "pending" };
  if (Array.isArray(value.events)) {
    result.events = value.events
      .filter((event: any) => event?.type !== "ai_triage")
      .map((event: any) => event?.type === "ai_reviewed"
        ? { ...event, label: NEUTRAL_REVIEW_LABEL, metadata: undefined }
        : event);
  }
  return result as T;
}

/** Empty, well-formed responses for AI-only endpoints (see contracts/api.md). */
export const hiddenShapes = {
  analysis: { analysis: null, hidden: true },
  recommendation: { recommendation: null, hidden: true },
  related: { matches: [], hidden: true },
  knowledge: { answer: "", citations: [], hidden: true }
} as const;

/** Route guard: answer AI-only endpoints with an empty shape for hidden viewers. */
export function requireAiVisible(shape: Record<string, unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (isAiHidden(req.auth)) {
      res.setHeader("Cache-Control", "no-store");
      res.json(shape);
      return;
    }
    next();
  };
}
