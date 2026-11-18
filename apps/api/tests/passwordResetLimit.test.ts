import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

const enqueue = vi.fn(async () => undefined);
vi.mock("../src/services/emailOutbox.js", async importOriginal => ({
  ...(await importOriginal<typeof import("../src/services/emailOutbox.js")>()),
  enqueuePasswordReset: enqueue
}));

let server: Server;
let base = "";
beforeAll(async () => {
  const { app } = await import("../src/app.js");
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test port");
  base = `http://127.0.0.1:${address.port}/api/auth/password-reset`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => enqueue.mockClear());

const post = (path: string, body: unknown) => fetch(`${base}/${path}`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
}).then(response => response.status);

it("does not create new reset buckets when unused fields vary", async () => {
  const statuses = [];
  for (let index = 0; index < 7; index++) {
    statuses.push(await post("request", { organizationSlug: "sample-org", email: "victim@test.local", token: `x${index}` }));
  }
  // Unknown fields are rejected outright and still count against the recipient bucket.
  expect(statuses.filter(status => status === 202)).toHaveLength(0);
  expect(statuses.slice(-2)).toEqual([429, 429]);
  expect(enqueue).not.toHaveBeenCalled();
});

it("limits one recipient to five queued requests per window", async () => {
  const statuses = [];
  for (let index = 0; index < 7; index++) statuses.push(await post("request", { organizationSlug: "sample-org", email: "Second@Test.local" }));
  expect(statuses).toEqual([202, 202, 202, 202, 202, 429, 429]);
  expect(enqueue).toHaveBeenCalledTimes(5);
});

it("keeps confirmation attempts on their own limiter", async () => {
  const token = "a".repeat(64);
  const statuses = [];
  for (let index = 0; index < 11; index++) statuses.push(await post("confirm", { organizationSlug: "sample-org", token, password: "short" }));
  expect(statuses.slice(0, 10).every(status => status !== 429)).toBe(true);
  expect(statuses[10]).toBe(429);
});
