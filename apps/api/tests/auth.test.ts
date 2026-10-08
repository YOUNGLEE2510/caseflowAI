import { describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import type { Request, Response } from "express";

vi.mock("../src/config.js", () => ({ config: { JWT_SECRET: "test-secret-with-at-least-24-characters" } }));
import { authenticate } from "../src/middleware/auth.js";

describe("authentication rejection", () => {
  const secret = "test-secret-with-at-least-24-characters";
  const claims = { id: "111111111111111111111111", organizationId: "222222222222222222222222" };
  for (const [name, token] of [
    ["missing token", undefined],
    ["invalid signature", jwt.sign(claims, "wrong", { expiresIn: "1h" })],
    ["expired token", jwt.sign(claims, secret, { expiresIn: -1 })],
    ["token without expiry", jwt.sign(claims, secret)],
  ] as const) {
    it(`rejects ${name} before querying the database`, async () => {
      const next = vi.fn();
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      await authenticate({ headers: { authorization: token ? `Bearer ${token}` : undefined } } as Request, res as unknown as Response, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  }
});
