import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";

/**
 * Express middleware factory that validates one or more route params as valid
 * MongoDB ObjectIds.  Returns 400 immediately if any param is invalid, rather
 * than letting the request propagate to Mongoose where it would throw a
 * CastError.
 *
 * @example
 *   router.get("/cases/:id", validateObjectId("id"), handler);
 *   router.post("/cases/:caseId/attachments", validateObjectId("caseId"), handler);
 */
export function validateObjectId(...paramNames: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    for (const name of paramNames) {
      const value = req.params[name];
      if (!value || !mongoose.isValidObjectId(value)) {
        res.status(400).json({ message: `Mã định danh "${name}" không hợp lệ.` });
        return;
      }
    }
    next();
  };
}
