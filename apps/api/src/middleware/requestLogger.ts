import type { RequestHandler } from "express";

export const requestLogger: RequestHandler = (req, res, next) => {
  const started = performance.now();
  res.once("finish", () => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl.split("?")[0],
      status: res.statusCode,
      durationMs: Math.round(performance.now() - started)
    }));
  });
  next();
};
