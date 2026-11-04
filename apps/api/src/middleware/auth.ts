import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { config } from "../config.js";
import { Organization, User, RefreshSession, type UserRole } from "../models.js";
import type { PublicUserSource } from "../services/publicUser.js";

export interface AuthUser {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  role: UserRole;
  team: string;
  sessionId?: string;
  mfaVerified?: boolean;
  personnelManager?: boolean;
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
    const session = typeof claims.sid === "string" ? await RefreshSession.findOne({ familyId: claims.sid, userId: user._id,
      organizationId: user.organizationId, tokenVersion: user.tokenVersion || 0, revokedAt: null, expiresAt: { $gt: new Date() } }).lean<{ mfaVerified?: boolean }>() : null;
    if (claims.sid !== undefined && !session) {
      res.status(401).json({ message: "Phiên đăng nhập đã bị thu hồi." });
      return;
    }
    req.auth = { id: String(user._id), organizationId: String(user.organizationId), name: user.name, email: user.email, role: user.role, team: user.team || "", sessionId: typeof claims.sid === "string" ? claims.sid : undefined, mfaVerified: Boolean(session?.mfaVerified) };
    req.auth.personnelManager = Boolean(user.personnelManager);
    const securityPath = /^\/api\/(auth\/(me|logout|logout-all)|profile(?:\/.*)?)$/.test(req.originalUrl.split("?")[0]);
    if (!securityPath && user.mustChangePassword) {
      res.status(403).json({ message: "Bạn cần đổi mật khẩu được cấp trước khi tiếp tục.", code: "PASSWORD_CHANGE_REQUIRED" });
      return;
    }
    if (!securityPath && ((user.mfaEnabled && !session?.mfaVerified) || (config.DEPLOYMENT_MODE === "pilot" && ["org_admin", "platform_admin"].includes(user.role) && !user.mfaEnabled))) {
      res.status(403).json({ message: "Cần hoàn tất xác thực hai bước trong Hồ sơ cá nhân.", code: "MFA_REQUIRED" });
      return;
    }
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
