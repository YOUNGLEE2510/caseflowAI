import { describe, expect, it } from "vitest";
import { seedDatabase } from "../src/seed.js";
import { config } from "../src/config.js";
import { canUseAiRouting } from "../src/services/routing.js";
import { fallbackClassify } from "../src/services/aiClient.js";
import { redactCommonIdentifiers } from "../src/services/groundedAnswer.js";
import { personnelPatch } from "../src/routes/personnel.js";

describe("release safety", () => {
  it("blocks destructive reset before accessing a database", async () => {
    await expect(seedDatabase(true)).rejects.toThrow("Destructive seed reset");
  });
  it("blocks every seed operation in pilot", async () => {
    const previous = config.DEPLOYMENT_MODE;
    try { config.DEPLOYMENT_MODE = "pilot"; await expect(seedDatabase()).rejects.toThrow("disabled outside local"); }
    finally { config.DEPLOYMENT_MODE = previous; }
  });
  it("never allows keyword fallback through the ML threshold", () => {
    const result = fallbackClassify("đăng nhập mật khẩu tài khoản wifi email");
    expect(result.confidence).toBeLessThan(0.55);
    expect(canUseAiRouting(0.99, "fallback")).toBe(false);
    expect(canUseAiRouting(0.8, "ml-service")).toBe(true);
  });
  it("redacts Vietnamese student identifiers before an external draft", () => {
    for (const id of ["B22DCCN019", "N21DCCN001", "D20CQCN001"]) expect(redactCommonIdentifiers(`Mã ${id}`)).not.toContain(id);
  });
  it("uses the account capacity ceiling for personnel too", () => {
    expect(personnelPatch.safeParse({ maxCaseload: 150 }).success).toBe(false);
    expect(personnelPatch.safeParse({ maxCaseload: 100 }).success).toBe(true);
  });
});
