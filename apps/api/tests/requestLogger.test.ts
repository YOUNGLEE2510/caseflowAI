import { EventEmitter } from "node:events";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { requestLogger } from "../src/middleware/requestLogger.js";

describe("request logging", () => {
  it.each(["/api/public/qr/", "/API/PUBLIC/QR/"])("redacts the QR capability in %s", prefix => {
    const token = "1234567890123456789012.abcdefghijklmnopqrstuv";
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const response = Object.assign(new EventEmitter(), { statusCode: 201 });
      requestLogger({ originalUrl: `${prefix}${token}/reports?secret=hidden`, method: "POST", requestId: "review-request" } as Request,
        response as unknown as Response, () => undefined);
      response.emit("finish");
      const serialized = log.mock.calls[0][0] as string;
      expect(serialized).not.toContain(token);
      expect(serialized).not.toContain("hidden");
      expect(JSON.parse(serialized)).toMatchObject({ path: `${prefix}[redacted]/reports`, status: 201, requestId: "review-request" });
    } finally { log.mockRestore(); }
  });
});
