import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { config } from "../config.js";
import { Organization, User, type UserRole } from "../models.js";
import type { PublicUserSource } from "../services/publicUser.js";

export interface AuthUser {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  role: UserRole;
  team: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthUser;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];

  if (!token) {
    res.status(401).json({ message: "Bạn cần đăng nhập để tiếp tục." });
    return;
  }

  let claims: jwt.JwtPayload;
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET, { algorithms: ["HS256"] });
    if (typeof decoded === "string" || !Number.isFinite(decoded.exp) || !mongoose.isValidObjectId(decoded.id) || !mongoose.isValidObjectId(decoded.organizationId)) throw new Error("Invalid claims");
    claims = decoded;
  } catch {
    res.status(401).json({ message: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn." });
    return;
  }
  try {
    const user = await User.findOne({ _id: claims.id, organizationId: claims.organizationId, active: true }).lean<PublicUserSource>();
    const organization = await Organization.exists({ _id: claims.organizationId, status: "active" });
    if (!user || !organization || (user.tokenVersion || 0) !== (claims.tokenVersion || 0)) {
      res.status(401).json({ message: "Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại." });
      return;
    }
    req.auth = { id: String(user._id), organizationId: String(user.organizationId), name: user.name, email: user.email, role: user.role, team: user.team || "" };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRoles(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      res.status(403).json({ message: "Bạn không có quyền thực hiện thao tác này." });
      return;
    }
    next();
  };
}
