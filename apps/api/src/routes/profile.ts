import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { HttpError } from "../middleware/error.js";
import { User, AuditLog } from "../models.js";
import { auditFromReq, logAudit } from "../services/helpers.js";

export const profileRouter = Router();

profileRouter.get("/profile/activity", async (req, res) => {
  const activity = await AuditLog.find({ organizationId: req.auth!.organizationId, actorId: req.auth!.id })
    .sort({ createdAt: -1 }).limit(30).select("action resource createdAt").lean();
  res.json({ activity });
});

const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().max(20).optional(),
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional()
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(6).max(128),
  newPassword: z.string().min(10).max(128).refine(value => Buffer.byteLength(value, "utf8") <= 72, "Mật khẩu không được vượt quá 72 byte.")
});

/* ── Get own profile ── */

profileRouter.get("/profile", async (req, res) => {
  const user = await User.findOne({
    _id: req.auth!.id,
    organizationId: req.auth!.organizationId,
    active: true
  }).select("+microsoftObjectId +microsoftTenantId").lean<any>();
  if (!user) throw new HttpError(404, "Không tìm thấy tài khoản.");

  res.json({
    profile: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      microsoftLinked: Boolean(user.microsoftObjectId && user.microsoftTenantId),
      role: user.role,
      team: user.team,
      title: user.title,
      phone: user.phone || "",
      avatarColor: user.avatarColor,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt
    }
  });
});

/* ── Update own profile ── */

profileRouter.patch("/profile", async (req, res) => {
  const input = updateProfileSchema.parse(req.body);
  if (Object.keys(input).length === 0) throw new HttpError(400, "Không có thông tin cần cập nhật.");

  const user = await User.findOneAndUpdate(
    { _id: req.auth!.id, organizationId: req.auth!.organizationId, active: true },
    { $set: input },
    { new: true, runValidators: true }
  ).lean<any>();
  if (!user) throw new HttpError(404, "Không tìm thấy tài khoản.");

  await logAudit({
    ...auditFromReq(req),
    action: "user.update",
    resource: "User",
    resourceId: String(user._id),
    changes: input
  }, req);

  res.json({
    profile: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      team: user.team,
      title: user.title,
      phone: user.phone || "",
      avatarColor: user.avatarColor
    }
  });
});

/* ── Change own password ── */

profileRouter.post("/profile/change-password", async (req, res) => {
  const input = changePasswordSchema.parse(req.body);
  const user = await User.findOne({
    _id: req.auth!.id,
    organizationId: req.auth!.organizationId,
    active: true
  }).select("+passwordHash").lean<any>();
  if (!user) throw new HttpError(404, "Không tìm thấy tài khoản.");

  const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!valid) throw new HttpError(422, "Mật khẩu hiện tại không chính xác.");

  if (input.currentPassword === input.newPassword) {
    throw new HttpError(422, "Mật khẩu mới phải khác mật khẩu hiện tại.");
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  const updated = await User.updateOne(
    { _id: req.auth!.id, organizationId: req.auth!.organizationId, active: true, passwordHash: user.passwordHash },
    { $set: { passwordHash }, $inc: { tokenVersion: 1 } }
  );

  if (updated.modifiedCount !== 1) throw new HttpError(409, "Tài khoản đã thay đổi. Vui lòng thử lại.");

  await logAudit({
    ...auditFromReq(req),
    action: "user.update",
    resource: "User",
    resourceId: String(user._id),
    changes: { passwordChanged: true }
  }, req);

  res.json({ message: "Mật khẩu đã được cập nhật. Vui lòng đăng nhập lại." });
});
