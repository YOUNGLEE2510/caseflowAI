import { describe, expect, it } from "vitest";
import { buildReviewedTrainingCsv, redactTrainingText } from "./trainingDataset.js";

describe("reviewed training dataset export", () => {
  it("removes common identifiers before writing training text", () => {
    expect(redactTrainingText("CCCD 012345678901 khong vao duoc, email a@example.com, 0912 345 678"))
      .toBe("CCCD [ID_NUMBER] khong vao duoc, email [EMAIL], [PHONE]");
  });

  it("masks student-style codes as well as citizen IDs", () => {
    for (const id of ["B22DCCN019", "b22dccn019", "SV12345678", "MSSV 20212345", "012345678901"]) {
      expect(redactTrainingText(`Ma ${id} can ho tro`)).not.toMatch(/\d{5,}|DCCN/i);
    }
  });
  it("uses a human correction as the training label and omits unreviewed cases", () => {
    const csv = buildReviewedTrainingCsv([
      {
        title: "Khong vao duoc",
        description: "Hop dong 20240815 bi khoa",
        category: "internet",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        ai: { classification: "water", confidence: 0.62, reviewStatus: "corrected", humanCorrectedLabel: "internet", reviewedAt: new Date("2026-01-02T00:00:00.000Z") }
      },
      { title: "Unreviewed", description: "Do not include", category: "water", ai: { reviewStatus: undefined } }
    ]);

    expect(csv).toContain("Hop dong [ID_NUMBER] bi khoa,internet,water,0.62");
    expect(csv).not.toContain("Unreviewed");
  });
});
