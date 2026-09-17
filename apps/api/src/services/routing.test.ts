import { describe, expect, it } from "vitest";
import {
  AI_ROUTING_CONFIDENCE_THRESHOLD,
  canUseAiRouting,
  resolveAiReviewStatus
} from "./routing.js";

describe("AI-assisted routing policy", () => {
  it("keeps low-confidence predictions in the manual review queue", () => {
    expect(canUseAiRouting(AI_ROUTING_CONFIDENCE_THRESHOLD - 0.01)).toBe(false);
    expect(canUseAiRouting(AI_ROUTING_CONFIDENCE_THRESHOLD)).toBe(true);
  });

  it("records whether a human confirmed or corrected the prediction", () => {
    expect(resolveAiReviewStatus("finance", "finance")).toBe("confirmed");
    expect(resolveAiReviewStatus("finance", "student_services")).toBe("corrected");
  });
});
