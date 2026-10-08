import mongoose from "mongoose";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { config } from "../config.js";
import { Organization, User, PasswordResetToken } from "../models.js";
import { emailPasswordReset, sendEmail } from "./emailService.js";

const schema = new mongoose.Schema({
  payload: { type: String, required: true },
  kind: { type: String, enum: ["reset-request", "email"], required: true },
  attempts: { type: Number, default: 0 },
  nextAt: { type: Date, default: Date.now },
  lockedUntil: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
schema.index({ completedAt: 1, nextAt: 1, lockedUntil: 1 });
export const EmailOutbox = mongoose.models.EmailOutbox || mongoose.model("EmailOutbox", schema);
const key = createHash("sha256").update(`caseflow-email-outbox:${config.JWT_SECRET}`).digest();
function encrypt(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}
function decrypt<T>(value: string): T {
  const buffer = Buffer.from(value, "base64");
  const cipher = createDecipheriv("aes-256-gcm", key, buffer.subarray(0, 12));
  cipher.setAuthTag(buffer.subarray(12, 28));
  return JSON.parse(Buffer.concat([cipher.update(buffer.subarray(28)), cipher.final()]).toString());
}
export async function enqueuePasswordReset(organizationSlug: string, email: string) {
  await EmailOutbox.create({ kind: "reset-request", payload: encrypt({ organizationSlug, email }), expiresAt: new Date(Date.now() + 30 * 60_000) });
}
export async function processEmailOutbox() {
  const now = new Date();
  const job = await EmailOutbox.findOneAndUpdate({ completedAt: null, attempts: { $lt: 5 }, nextAt: { $lte: now }, expiresAt: { $gt: now },
    $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }] },
  { $set: { lockedUntil: new Date(Date.now() + 120_000) }, $inc: { attempts: 1 } }, { new: true });
  if (!job) return;
  try {
    let payload: Parameters<typeof sendEmail>[0];
    if (job.kind === "reset-request") {
      const input = decrypt<{ organizationSlug: string; email: string }>(job.payload);
      const organization = await Organization.findOne({ slug: input.organizationSlug.toLowerCase(), status: "active" }).lean<{ _id: mongoose.Types.ObjectId; slug: string }>();
      const user = organization ? await User.findOne({ organizationId: organization._id, email: input.email.toLowerCase(), active: true }).lean<{ _id: mongoose.Types.ObjectId; email: string; name: string }>() : null;
      if (!organization || !user) { await EmailOutbox.updateOne({ _id: job._id }, { $set: { completedAt: new Date(), payload: "", lockedUntil: null } }); return; }
      const token = randomBytes(32).toString("hex");
      const url = new URL("/reset-password", config.WEB_ORIGIN);
      url.searchParams.set("organization", organization.slug); url.searchParams.set("token", token);
      await PasswordResetToken.updateMany({ organizationId: organization._id, userId: user._id, usedAt: null }, { $set: { usedAt: new Date() } });
      await PasswordResetToken.create({ organizationId: organization._id, userId: user._id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: job.expiresAt });
      payload = { to: user.email, ...emailPasswordReset(user.name, url.toString()) };
      await EmailOutbox.updateOne({ _id: job._id }, { $set: { kind: "email", payload: encrypt(payload) } });
    } else payload = decrypt<Parameters<typeof sendEmail>[0]>(job.payload);
    const result = await sendEmail(payload);
    if (!result.sent) throw new Error("Delivery unavailable");
    await EmailOutbox.updateOne({ _id: job._id }, { $set: { completedAt: new Date(), payload: "", lockedUntil: null } });
  } catch {
    await EmailOutbox.updateOne({ _id: job._id }, { $set: { lockedUntil: null, nextAt: new Date(Date.now() + Math.min(600_000, 30_000 * 2 ** job.attempts)) } });
    console.warn("[Email outbox] Delivery deferred; encrypted job retained for retry.");
  }
}
