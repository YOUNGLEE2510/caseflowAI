import { describe, expect, it } from "vitest";
import { buildReviewedTrainingCsv, redactTrainingText } from "./trainingDataset.js";

describe("reviewed training dataset export", () => {
  it("removes common identifiers before writing training text", () => {
    expect(redactTrainingText("SV12345678 khong vao duoc, email a@example.com, 0912 345 678"))
      .toBe("[STUDENT_ID] khong vao duoc, email [EMAIL], [PHONE]");
  });

  it("uses a human correction as the training label and omits unreviewed cases", () => {
    const csv = buildReviewedTrainingCsv([
      {
        title: "Khong vao duoc",
        description: "Tai khoan SV12345678 bi khoa",
        category: "it_access",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        ai: { classification: "finance", confidence: 0.62, reviewStatus: "corrected", humanCorrectedLabel: "it_access", reviewedAt: new Date("2026-01-02T00:00:00.000Z") }
      },
      { title: "Unreviewed", description: "Do not include", category: "finance", ai: { reviewStatus: undefined } }
    ]);

    expect(csv).toContain("Tai khoan [STUDENT_ID] bi khoa,it_access,finance,0.62");
    expect(csv).not.toContain("Unreviewed");
  });
});
