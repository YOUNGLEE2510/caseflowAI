import express, { type Express } from "express";
import { randomUUID } from "node:crypto";

/** Request-driven initialization only: no listener, seed, migrations or timers. */
export function createServerlessApp(handler: Express, initialize: () => Promise<unknown>, afterResponse?: () => unknown) {
  const server = express();
  server.disable("x-powered-by");
  let pending: Promise<unknown> | undefined;
  server.use((_req, res, next) => {
    pending ??= Promise.resolve().then(initialize).catch(error => {
      pending = undefined;
      throw error;
    });
    void pending.then(() => {
      // Background work never delays or alters the user's response.
      if (afterResponse) res.once("finish", () => { try { afterResponse(); } catch { /* reported by the task runner */ } });
      next();
    }, () => {
      const requestId = randomUUID();
      res.setHeader("X-Request-Id", requestId);
      res.status(503).json({ message: "Dịch vụ chưa sẵn sàng. Vui lòng thử lại.", requestId });
    });
  });
  server.use(handler);
  return server;
}
