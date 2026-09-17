import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { config } from "../config.js";
import { authenticate } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import { Organization, PasswordResetToken, User } from "../models.js";
import { emailPasswordReset, sendEmail } from "../services/emailService.js";

interface LeanOrganization {
  _id: import("mongoose").Types.ObjectId;
  name: string;
  slug: string;
}

function publicUser(user: any, organization?: LeanOrganization | null) {
  return {
    id: String(user._id),
    organizationId: String(user.organizationId),
    organizationName: organization?.name || "",
    organizationSlug: organization?.slug || "",
    name: user.name,
    email: user.email,
    role: user.role,
    team: user.team,
    title: user.title,
    avatarColor: user.avatarColor,
    active: user.active
  };
}

export { publicUser };
export const authRouter = Router();

const loginSchema = z.object({
  organizationSlug: z.string().trim().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(6)
});

const passwordResetRequestSchema = z.object({
  organizationSlug: z.string().trim().min(2).max(80),
  email: z.string().email()
});

const passwordResetConfirmSchema = z.object({
  organizationSlug: z.string().trim().min(2).max(80),
  token: z.string().regex(/^[a-f0-9]{64}$/i),
  password: z.string().min(10).max(128).refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Mật khẩu không được vượt quá 72 byte.")
});

function resetTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

const resetRequestMessage = "Nếu tài khoản hợp lệ, hướng dẫn đặt lại mật khẩu sẽ được gửi đến email đã đăng ký.";

authRouter.post("/auth/login", async (req, res) => {
  const input = loginSchema.parse(req.body);
  const organization = (await Organization.findOne({
    slug: input.organizationSlug.toLowerCase(),
    status: "active"
  }).lean()) as LeanOrganization | null;
  const user = organization
    ? ((await User.findOne({
        organizationId: organization._id,
        email: input.email.toLowerCase(),
        active: true
      })
        .select("+passwordHash")
        .lean()) as any)
    : null;

  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw new HttpError(401, "Mã đơn vị, email hoặc mật khẩu không chính xác.");
  }

  const payload = publicUser(user, organization);
  const token = jwt.sign(
    { id: payload.id, organizationId: payload.organizationId, tokenVersion: user.tokenVersion || 0 },
    config.JWT_SECRET,
    { expiresIn: "12h", algorithm: "HS256" }
  );
  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  res.json({ token, user: payload });
});

authRouter.post("/auth/password-reset/request", async (req, res) => {
  const input = passwordResetRequestSchema.parse(req.body);
  const organization = (await Organization.findOne({ slug: input.organizationSlug.toLowerCase(), status: "active" }).lean()) as LeanOrganization | null;
  const user = organization
    ? await User.findOne({ organizationId: organization._id, email: input.email.toLowerCase(), active: true }).lean<any>()
    : null;

  if (organization && user) {
    const rawToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 60_000);
    await PasswordResetToken.updateMany(
      { organizationId: organization._id, userId: user._id, usedAt: null },
      { $set: { usedAt: new Date() } }
    );
    await PasswordResetToken.create({
      organizationId: organization._id,
      userId: user._id,
      tokenHash: resetTokenHash(rawToken),
      expiresAt
    });
    const resetUrl = new URL("/reset-password", config.WEB_ORIGIN);
    resetUrl.searchParams.set("organization", organization.slug);
    resetUrl.searchParams.set("token", rawToken);
    await sendEmail({ to: user.email, ...emailPasswordReset(user.name, resetUrl.toString()) });
  }

  res.status(202).json({ message: resetRequestMessage });
});

authRouter.post("/auth/password-reset/confirm", async (req, res) => {
  const input = passwordResetConfirmSchema.parse(req.body);
  const organization = (await Organization.findOne({ slug: input.organizationSlug.toLowerCase(), status: "active" }).lean()) as LeanOrganization | null;
  if (!organization) throw new HttpError(422, "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.");

  const token = await PasswordResetToken.findOneAndUpdate(
    {
      organizationId: organization._id,
      tokenHash: resetTokenHash(input.token),
      usedAt: null,
      expiresAt: { $gt: new Date() }
    },
    { $set: { usedAt: new Date() } },
    { new: true }
  ).lean<any>();
  if (!token) throw new HttpError(422, "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.");

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await User.findOneAndUpdate(
    { _id: token.userId, organizationId: organization._id, active: true },
    { $set: { passwordHash }, $inc: { tokenVersion: 1 } },
    { new: true }
  ).lean<any>();
  if (!user) throw new HttpError(422, "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.");

  await PasswordResetToken.updateMany(
    { organizationId: organization._id, userId: user._id, usedAt: null },
    { $set: { usedAt: new Date() } }
  );
  res.json({ message: "Mật khẩu đã được đặt lại. Vui lòng đăng nhập." });
});

authRouter.get("/auth/me", authenticate, async (req, res) => {
  const user = await User.findOne({
    _id: req.auth!.id,
    organizationId: req.auth!.organizationId,
    active: true
  }).lean();
  if (!user) throw new HttpError(404, "Không tìm thấy tài khoản.");
  const organization = (await Organization.findOne({
    _id: req.auth!.organizationId,
    status: "active"
  }).lean()) as LeanOrganization | null;
  if (!organization) throw new HttpError(403, "Tổ chức hiện không hoạt động.");
  res.json({ user: publicUser(user, organization) });
});

authRouter.post("/auth/logout", authenticate, async (req, res) => {
  await User.updateOne(
    { _id: req.auth!.id, organizationId: req.auth!.organizationId },
    { $inc: { tokenVersion: 1 } }
  );
  res.json({ message: "Đã đăng xuất." });
});
