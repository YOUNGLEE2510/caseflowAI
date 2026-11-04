import { describe, expect, it } from "vitest";
import { nextStep, isRecommendationManager, categoryResolver } from "../src/services/recommendations.js";

it("resolves category labels and keys without guessing ambiguous aliases", () => {
  const resolve = categoryResolver([{ key: "finance", name: "Học phí", category: "Tài chính" }, { key: "other", name: "Khác", category: "Chung" }, { key: "general", name: "Hỗ trợ", category: "Chung" }]);
  expect(resolve(" HOC PHI ")).toBe("Tài chính");
  expect(resolve("finance")).toBe("Tài chính");
  expect(resolve("Tài chính")).toBe("Tài chính");
  expect(resolve("Chung")).toBe("Chung");
  expect(resolve("unknown")).toBeNull();
});

it("keeps a canonical category when multiple services share it", () => {
  const resolve = categoryResolver([
    { key: "wifi", name: "Network", category: "it_access" },
    { key: "account", name: "Account", category: "it_access" },
    { key: "other", name: "Network", category: "general_support" }
  ]);
  expect(resolve("it_access")).toBe("it_access");
  expect(resolve("wifi")).toBe("it_access");
  expect(resolve("Network")).toBeNull();
});

describe("recommendation next steps", () => {
  it("limits operational recommendations to managers", () => {
    expect(isRecommendationManager("requester")).toBe(false);
    expect(isRecommendationManager("agent")).toBe(false);
    expect(isRecommendationManager("manager")).toBe(true);
    expect(isRecommendationManager("org_admin")).toBe(true);
  });
  it("does not propose work on closed cases", () => {
    expect(nextStep({ status: "closed", missingFields: ["semester"] })).toBeNull();
  });
  it("prioritizes missing information", () => {
    expect(nextStep({ status: "new", missingFields: ["semester"] })?.action).toBe("request_information");
  });
  it("requires routing review before assignment", () => {
    expect(nextStep({ status: "new", missingFields: [] })?.action).toBe("review_routing");
  });
  it("proposes assignment only after review", () => {
    expect(nextStep({ status: "triaged", reviewStatus: "confirmed", missingFields: [] })?.action).toBe("assign");
  });
});
