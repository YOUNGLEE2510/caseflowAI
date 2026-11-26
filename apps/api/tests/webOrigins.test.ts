import { describe, expect, it } from "vitest";
import { allowedWebOrigins } from "../src/services/webOrigins.js";

describe("web origin boundary", () => {
  it("allows only same-port loopback aliases locally", () => {
    expect(allowedWebOrigins("http://localhost:8080", "local", {})).toEqual(["http://localhost:8080", "http://127.0.0.1:8080"]);
    expect(allowedWebOrigins("http://127.0.0.1:5173", "local", {})).not.toContain("http://localhost:8080");
    expect(allowedWebOrigins("https://example.com", "local", {})).toEqual(["https://example.com"]);
  });
  it("does not add origins in pilot", () => {
    expect(allowedWebOrigins("https://localhost:8080", "pilot", {})).toEqual(["https://localhost:8080"]);
  });
  it("adds this Vercel deployment's own URLs, exactly and only on Vercel", () => {
    const env = { VERCEL: "1", VERCEL_URL: "caseflow-rental-abc123-yl-25.vercel.app", VERCEL_BRANCH_URL: "caseflow-rental-git-main-yl-25.vercel.app",
      VERCEL_PROJECT_PRODUCTION_URL: "caseflow-rental.vercel.app" };
    expect(allowedWebOrigins("https://caseflow-rental.vercel.app", "pilot", env)).toEqual([
      "https://caseflow-rental.vercel.app", "https://caseflow-rental-abc123-yl-25.vercel.app", "https://caseflow-rental-git-main-yl-25.vercel.app"]);
    expect(allowedWebOrigins("https://caseflow-rental.vercel.app", "pilot", { ...env, VERCEL: undefined })).toEqual(["https://caseflow-rental.vercel.app"]);
    expect(allowedWebOrigins("https://caseflow-rental.vercel.app", "pilot", { VERCEL: "1", VERCEL_URL: "evil.example.com" })).toEqual(["https://caseflow-rental.vercel.app"]);
  });
});
