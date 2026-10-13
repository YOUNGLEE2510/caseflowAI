import type { NextFunction, Request, Response } from "express";
import { HttpError } from "./error.js";

export function validateInputKeys(value: unknown, depth = 0): void {
  if (depth > 30) throw new HttpError(400, "Dữ liệu lồng nhau quá sâu.");
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (["__proto__", "prototype", "constructor"].includes(key) || key.startsWith("$") || key.includes(".")) {
      throw new HttpError(400, "Dữ liệu chứa tên trường không hợp lệ.");
    }
    validateInputKeys(child, depth + 1);
  }
}

export function inputBoundary(req: Request, _res: Response, next: NextFunction) {
  try {
    validateInputKeys(req.body);
    next();
  } catch (error) { next(error); }
}
