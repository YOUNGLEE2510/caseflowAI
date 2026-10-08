import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { config } from "../config.js";
import { HttpError } from "../middleware/error.js";
import { Organization, RefreshSession, User } from "../models.js";
import type { Types } from "mongoose";
import type { PublicUserSource } from "./publicUser.js";

export interface RefreshSessionRecord {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  organizationId: Types.ObjectId;
  familyId: string;
  tokenVersion: number;
  remember: boolean;
  expiresAt: Date;
}

export const REFRESH_COOKIE = "caseflow_refresh";
const cookieOptions = { httpOnly: true, secure: new URL(config.WEB_ORIGIN).protocol === "https:", sameSite: "strict" as const, path: "/api/auth" };
export const hashRefreshToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
}

export function checkRefreshOrigin(req: Request) {
  if (req.headers.origin && req.headers.origin !== new URL(config.WEB_ORIGIN).origin) throw new HttpError(403, "Origin not allowed.");
  if (req.headers["sec-fetch-site"] === "cross-site") throw new HttpError(403, "Cross-site request not allowed.");
}

export async function createRefreshSession(res: Response, user: Pick<PublicUserSource, "_id" | "organizationId" | "tokenVersion">, remember: boolean, previous?: RefreshSessionRecord) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = previous?.expiresAt || new Date(Date.now() + config.REFRESH_TTL_DAYS * 86400000);
  const session = await RefreshSession.create({
    userId: user._id, organizationId: user.organizationId,
    tokenHash: hashRefreshToken(token), familyId: previous?.familyId || randomUUID(),
    tokenVersion: user.tokenVersion || 0, remember, expiresAt
  });
  // A replay can revoke the family while the replacement is being inserted.
  if (previous && await RefreshSession.exists({ familyId: previous.familyId, revokedAt: { $ne: null } })) {
    await RefreshSession.updateMany({ familyId: previous.familyId }, { $set: { revokedAt: new Date() } });
    throw new HttpError(401, "Session revoked.");
  }
  res.cookie(REFRESH_COOKIE, token, { ...cookieOptions, ...(remember ? { maxAge: Math.max(0, expiresAt.getTime() - Date.now()) } : {}) });
  return session;
}

export async function rotateRefreshSession(rawToken: string, res: Response) {
  if (!/^[a-f0-9]{64}$/.test(rawToken)) throw new HttpError(401, "Session expired.");
  const session = await RefreshSession.findOneAndUpdate({
    tokenHash: hashRefreshToken(rawToken), consumedAt: null, revokedAt: null, expiresAt: { $gt: new Date() }
  }, { $set: { consumedAt: new Date() } }, { new: true }).lean<RefreshSessionRecord>();
  if (!session) {
    const replay = await RefreshSession.findOne({ tokenHash: hashRefreshToken(rawToken), consumedAt: { $ne: null } }).lean<RefreshSessionRecord>();
    if (replay) await RefreshSession.updateMany({ familyId: replay.familyId }, { $set: { revokedAt: new Date() } });
    throw new HttpError(401, "Session expired or reused.");
  }
  const [user, organization] = await Promise.all([
    User.findOne({ _id: session.userId, organizationId: session.organizationId, active: true }).lean<PublicUserSource>(),
    Organization.findOne({ _id: session.organizationId, status: "active" }).lean<{ name: string; slug: string }>()
  ]);
  if (!user || !organization || (user.tokenVersion || 0) !== session.tokenVersion) {
    await RefreshSession.updateMany({ familyId: session.familyId }, { $set: { revokedAt: new Date() } });
    throw new HttpError(401, "Account unavailable.");
  }
  await createRefreshSession(res, user, session.remember, session);
  return { user, organization, remember: session.remember };
}
