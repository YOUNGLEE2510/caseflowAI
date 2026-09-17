import { afterEach, expect, it, vi } from "vitest";
vi.mock("../config.js", () => ({ config: { LLM_API_KEY: "test-key", LLM_MODEL: "test-model", LLM_BASE_URL: "https://example.test/v1", LLM_ALLOWED_ORGANIZATIONS: "allowed" } }));
import { groundedAnswer, redactCommonIdentifiers } from "./groundedAnswer.js";
const retrieval = { answer: "Local retrieval", citations: [{ id: "private-db-id", title: "Policy", sourceLabel: "Internal", excerpt: "Contact help@example.com for assistance", score: 0.8 }] };
afterEach(() => vi.unstubAllGlobals());
it("does not send data for an organization outside the allowlist", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  expect((await groundedAnswer("other", "question", retrieval)).generation.mode).toBe("retrieval");
  expect(fetcher).not.toHaveBeenCalled();
});
it("does not generate without sources", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await groundedAnswer("allowed", "question", { answer: "No sources", citations: [] });
  expect(fetcher).not.toHaveBeenCalled();
});
it("redacts common identifiers", () => {
  expect(redactCommonIdentifiers("help@example.com +84 912 345 678")).toBe("[EMAIL] [NUMBER]");
});
it("accepts a cited draft and sends neither database IDs nor email addresses", async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ answer: "Contact support [S1]", sourceIds: ["S1"] }) } }] })));
  vi.stubGlobal("fetch", fetcher);
  expect((await groundedAnswer("allowed", "question", retrieval)).generation.mode).toBe("generated");
  const body = (fetcher.mock.calls[0] as unknown as [unknown, { body: string }])[1].body;
  expect(body).not.toContain("help@example.com");
  expect(body).not.toContain("private-db-id");
});
it("rejects invented citations", async () => {
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ answer: "Unsupported [S99]", sourceIds: ["S99"] }) } }] })));
  expect((await groundedAnswer("allowed", "question", retrieval)).generation.mode).toBe("retrieval");
});
it("falls back after provider errors", async () => {
  vi.stubGlobal("fetch", async () => { throw new Error("timeout"); });
  expect((await groundedAnswer("allowed", "question", retrieval)).answer).toBe("Local retrieval");
});
it("identifies provider quota exhaustion without exposing provider details", async () => {
  vi.stubGlobal("fetch", async () => new Response("provider error", { status: 429 }));
  const result = await groundedAnswer("allowed", "question", retrieval);
  expect(result.generation).toMatchObject({ mode: "retrieval", reason: "quota_exhausted" });
});
