import { Router } from "express";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import * as OTPAuth from "otpauth";
import { z } from "zod";
import { config } from "../config.js";
import { User, RefreshSession } from "../models.js";
import { HttpError } from "../middleware/error.js";
import { auditFromReq, logAudit } from "../services/helpers.js";
import { consumeAuthAttempt } from "../services/authThrottle.js";
import { currentPasswordSchema } from "../services/passwordPolicy.js";

export const mfaRouter = Router();
const key = config.MFA_ENCRYPTION_KEY ? Buffer.from(config.MFA_ENCRYPTION_KEY, "hex") : createHash("sha256").update(`caseflow-mfa:${config.JWT_SECRET}`).digest();
function seal(secret: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}
function open(value: string) {
  const body = Buffer.from(value, "base64"), cipher = createDecipheriv("aes-256-gcm", key, body.subarray(0, 12));
  cipher.setAuthTag(body.subarray(12, 28));
  return Buffer.concat([cipher.update(body.subarray(28)), cipher.final()]).toString("utf8");
}
function totp(secret: string, label: string) {
  return new OTPAuth.TOTP({ issuer: "CaseFlow", label, algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) });
}
const codeSchema = z.object({ code: z.string().trim().regex(/^(?:\d{6}|[a-f0-9]{20})$/i) }).strict();
const recoveryHash = (value: string) => createHash("sha256").update(value.toLowerCase()).digest("hex");
const scope = (req: import("express").Request) => ({ _id: req.auth!.id, organizationId: req.auth!.organizationId, active: true });

mfaRouter.get("/profile/security", async (req, res) => {
  const user = await User.findOne(scope(req)).lean<{ mfaEnabled?: boolean; mustChangePassword?: boolean }>();
  const session = req.auth!.sessionId ? await RefreshSession.findOne({ familyId: req.auth!.sessionId, userId: req.auth!.id, organizationId: req.auth!.organizationId, consumedAt: null, revokedAt: null }).lean<{ mfaVerified?: boolean }>() : null;
  res.setHeader("Cache-Control", "no-store");
  res.json({ mfaEnabled: Boolean(user?.mfaEnabled), mfaVerified: Boolean(session?.mfaVerified),
    mfaRequired: config.DEPLOYMENT_MODE === "pilot" && ["org_admin", "platform_admin"].includes(req.auth!.role), mustChangePassword: Boolean(user?.mustChangePassword) });
});

mfaRouter.post("/profile/mfa/setup", async (req, res) => {
  const { password } = z.object({ password: currentPasswordSchema }).strict().parse(req.body);
  await consumeAuthAttempt(req.auth!.id, "mfa", 10);
  if (!req.auth!.sessionId) throw new HttpError(401, "Vui lòng đăng nhập lại để cấu hình 2FA.");
  const user = await User.findOne(scope(req)).select("+passwordHash");
  if (!user || !await bcrypt.compare(password, user.passwordHash)) throw new HttpError(401, "Thông tin xác thực không hợp lệ.");
  if (user.mustChangePassword) throw new HttpError(403, "Cần đổi mật khẩu được cấp trước khi thiết lập 2FA.");
  if (user.mfaEnabled) throw new HttpError(409, "2FA đã được bật.");
  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  await User.updateOne({ ...scope(req), mfaEnabled: { $ne: true } }, { $set: { mfaPendingSecret: seal(secret), mfaPendingUntil: new Date(Date.now() + 10 * 60_000) } });
  res.setHeader("Cache-Control", "no-store");
  res.json({ secret, uri: totp(secret, req.auth!.email).toString() });
});

mfaRouter.post("/profile/mfa/enable", async (req, res) => {
  const { code } = codeSchema.parse(req.body);
  await consumeAuthAttempt(req.auth!.id, "mfa", 10);
  if (!req.auth!.sessionId) throw new HttpError(401, "Vui lòng đăng nhập lại.");
  const user = await User.findOne(scope(req)).select("+mfaPendingSecret +mfaPendingUntil");
  if (!user?.mfaPendingSecret || !user.mfaPendingUntil || user.mfaPendingUntil <= new Date()) throw new HttpError(422, "Thiết lập đã hết hạn.");
  const delta = totp(open(user.mfaPendingSecret), req.auth!.email).validate({ token: code, window: 1 });
  if (delta === null) throw new HttpError(422, "Mã xác thực không hợp lệ.");
  const recoveryCodes = Array.from({ length: 8 }, () => randomBytes(10).toString("hex"));
  const changed = await User.updateOne({ ...scope(req), mfaEnabled: { $ne: true }, mfaPendingSecret: user.mfaPendingSecret }, {
    $set: { mfaEnabled: true, mfaSecret: user.mfaPendingSecret, mfaRecoveryHashes: recoveryCodes.map(recoveryHash), mfaLastStep: Math.floor(Date.now() / 30000) + delta },
    $unset: { mfaPendingSecret: 1, mfaPendingUntil: 1 }
  });
  if (!changed.modifiedCount) throw new HttpError(409, "Thiết lập đã thay đổi.");
  await RefreshSession.updateMany({ userId: req.auth!.id, organizationId: req.auth!.organizationId, familyId: { $ne: req.auth!.sessionId } }, { $set: { revokedAt: new Date() } });
  await RefreshSession.updateMany({ userId: req.auth!.id, familyId: req.auth!.sessionId, revokedAt: null }, { $set: { mfaVerified: true } });
  await logAudit({ ...auditFromReq(req), action: "auth.mfa_enable", resource: "User", resourceId: req.auth!.id }, req);
  res.setHeader("Cache-Control", "no-store");
  res.json({ recoveryCodes });
});

mfaRouter.post("/profile/mfa/verify", async (req, res) => {
  const { code } = codeSchema.parse(req.body);
  await consumeAuthAttempt(req.auth!.id, "mfa-verify", 10);
  if (!req.auth!.sessionId) throw new HttpError(401, "Vui lòng đăng nhập lại.");
  const user = await User.findOne(scope(req)).select("+mfaSecret +mfaLastStep +mfaRecoveryHashes");
  if (!user?.mfaEnabled || !user.mfaSecret) throw new HttpError(422, "2FA chưa được bật.");
  let changed;
  if (/^\d{6}$/.test(code)) {
    const delta = totp(open(user.mfaSecret), req.auth!.email).validate({ token: code, window: 1 });
    if (delta === null) throw new HttpError(422, "Mã xác thực không hợp lệ.");
    const step = Math.floor(Date.now() / 30000) + delta;
    changed = await User.updateOne({ ...scope(req), mfaEnabled: true, mfaLastStep: { $lt: step } }, { $set: { mfaLastStep: step } });
  } else {
    const hash = recoveryHash(code);
    changed = await User.updateOne({ ...scope(req), mfaEnabled: true, mfaRecoveryHashes: hash }, { $pull: { mfaRecoveryHashes: hash } });
  }
  if (!changed.modifiedCount) throw new HttpError(422, "Mã xác thực không hợp lệ hoặc đã được sử dụng.");
  await RefreshSession.updateMany({ userId: req.auth!.id, organizationId: req.auth!.organizationId, familyId: req.auth!.sessionId, revokedAt: null }, { $set: { mfaVerified: true } });
  await logAudit({ ...auditFromReq(req), action: "auth.mfa_verify", resource: "User", resourceId: req.auth!.id }, req);
  res.json({ message: "Đã xác thực hai bước." });
});
