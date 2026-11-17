import express from "express";
import { createServer, type Server } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import { createServerlessApp } from "../src/serverlessApp.js";

let server: Server | undefined;
afterEach(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>(resolve => server!.close(() => resolve()));
    server = undefined;
  }
});
async function serve(initialize: () => Promise<unknown>) {
  const app = express();
  app.get("/probe", (_req, res) => res.json({ ready: true }));
  server = createServer(createServerlessApp(app, initialize));
  await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test port");
  return `http://127.0.0.1:${address.port}/probe`;
}

it("shares initialization across concurrent requests before dispatch", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const initialize = vi.fn(() => gate);
  const url = await serve(initialize);
  const first = fetch(url);
  const second = fetch(url);
  await vi.waitFor(() => expect(initialize).toHaveBeenCalledTimes(1));
  release();
  const responses = await Promise.all([first, second]);
  expect(responses.map(response => response.status)).toEqual([200, 200]);
  expect(await (await fetch(url)).json()).toEqual({ ready: true });
  expect(initialize).toHaveBeenCalledTimes(1);
});

it("returns a generic request ID on initialization failure and retries next time", async () => {
  const initialize = vi.fn()
    .mockRejectedValueOnce(new Error("private-database-host-and-secret"))
    .mockResolvedValue(undefined);
  const url = await serve(initialize);
  const failure = await fetch(url);
  expect(failure.status).toBe(503);
  const body = await failure.json();
  expect(body.requestId).toMatch(/^[a-f0-9-]{36}$/);
  expect(failure.headers.get("x-request-id")).toBe(body.requestId);
  expect(JSON.stringify(body)).not.toContain("private-database");
  expect((await fetch(url)).status).toBe(200);
  expect(initialize).toHaveBeenCalledTimes(2);
});

it("triggers background maintenance only after a successful response", async () => {
  const afterResponse = vi.fn();
  const app = express();
  app.get("/probe", (_req, res) => res.json({ ready: true }));
  server = createServer(createServerlessApp(app, async () => undefined, afterResponse));
  await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test port");
  expect((await fetch(`http://127.0.0.1:${address.port}/probe`)).status).toBe(200);
  await vi.waitFor(() => expect(afterResponse).toHaveBeenCalledTimes(1));
});
