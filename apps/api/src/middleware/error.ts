import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export function notFound(req: Request, res: Response) {
  res.status(404).json({ message: `Không tìm thấy ${req.method} ${req.originalUrl}.` });
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (res.headersSent) return _next(error);
  if (error instanceof mongoose.Error.VersionError) {
    res.status(409).json({ message: "Hồ sơ vừa được cập nhật bởi người khác. Vui lòng tải lại trước khi sửa." });
    return;
  }
  if (error instanceof mongoose.Error.ValidationError) {
    res.status(400).json({ message: "Dữ liệu không đáp ứng ràng buộc của hệ thống." });
    return;
  }
  if ((error as { code?: number })?.code === 11000) {
    res.status(409).json({ message: "Dữ liệu bị trùng với bản ghi đã có." });
    return;
  }
  if (["entity.parse.failed", "entity.too.large"].includes((error as { type?: string })?.type || "")) {
    const oversized = (error as { type: string }).type === "entity.too.large";
    res.status(oversized ? 413 : 400).json({ message: oversized ? "Dữ liệu gửi lên quá lớn." : "JSON gửi lên không hợp lệ." });
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ message: error.message });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      message: "Dữ liệu gửi lên chưa hợp lệ.",
      issues: error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message
      }))
    });
    return;
  }

  if (error instanceof mongoose.Error.CastError) {
    res.status(400).json({ message: "Mã định danh không hợp lệ." });
    return;
  }

  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "error",
    requestId: _req.requestId,
    method: _req.method,
    path: _req.originalUrl.split("?")[0],
    errorType: error instanceof Error ? error.name : "UnknownError",
    stack: process.env.NODE_ENV === "development" && error instanceof Error ? error.stack : undefined
  }));
  res.status(500).json({ message: "Hệ thống chưa thể xử lý yêu cầu. Vui lòng thử lại.", requestId: _req.requestId });
}
