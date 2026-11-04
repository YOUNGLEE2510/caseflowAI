import mongoose from "mongoose";
import { createHash, randomBytes } from "node:crypto";
import { emailCrypto } from "./emailCrypto.js";
import { config } from "../config.js";
import { Organization, User, PasswordResetToken } from "../models.js";
import { emailPasswordReset, sendEmail } from "./emailService.js";

const schema = new mongoose.Schema({
  payload: { type: String, required: true },
  deliveryKey: { type: String },
  kind: { type: String, enum: ["reset-request", "email"], required: true },
  attempts: { type: Number, default: 0 },
  nextAt: { type: Date, default: Date.now },
  lockedUntil: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
schema.index({ completedAt: 1, nextAt: 1, lockedUntil: 1 });
schema.index({ deliveryKey: 1 }, { unique: true, partialFilterExpression: { deliveryKey: { $type: "string" } } });
export const EmailOutbox = mongoose.models.EmailOutbox || mongoose.model("EmailOutbox", schema);
const { encrypt, decrypt } = emailCrypto(config.JWT_SECRET, config.EMAIL_ENCRYPTION_KEY);

export async function migrateLegacyEmailEncryption() {
  if (!config.EMAIL_ENCRYPTION_KEY) return;
  while (true) {
    const jobs = await EmailOutbox.find({ completedAt: null, payload: { $not: /^[a-f0-9]{16}:/ } }).limit(100).lean<Array<{ _id: mongoose.Types.ObjectId; payload: string }>>();
    if (!jobs.length) return;
    for (const job of jobs) await EmailOutbox.updateOne({ _id: job._id, payload: job.payload }, { $set: { payload: encrypt(decrypt(job.payload)) } });
  }
}
export async function enqueuePasswordReset(organizationSlug: string, email: string) {
  await EmailOutbox.create({ kind: "reset-request", payload: encrypt({ organizationSlug, email }), expiresAt: new Date(Date.now() + 30 * 60_000) });
}
export async function enqueueEmail(payload: Parameters<typeof sendEmail>[0], deliveryKey?: string) {
  const job = { kind: "email", payload: encrypt(payload), expiresAt: new Date(Date.now() + 86400_000), ...(deliveryKey ? { deliveryKey } : {}) };
  if (deliveryKey) await EmailOutbox.updateOne({ deliveryKey }, { $setOnInsert: job }, { upsert: true });
  else await EmailOutbox.create(job);
}
export async function processEmailOutbox() {
  // Bound both work per tick and concurrent SMTP connections.
  for (let batch = 0; batch < 4; batch++) {
    const processed = await Promise.all(Array.from({ length: 3 }, () => processEmailJob()));
    if (processed.every(value => !value)) break;
  }
}
async function processEmailJob() {
  const now = new Date();
  const job = await EmailOutbox.findOneAndUpdate({ completedAt: null, attempts: { $lt: 5 }, nextAt: { $lte: now }, expiresAt: { $gt: now },
    $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }] },
  { $set: { lockedUntil: new Date(Date.now() + 120_000) }, $inc: { attempts: 1 } }, { new: true });
  if (!job) return false;
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
      await PasswordResetToken.create({ organizationId: organization._id, userId: user._id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 30 * 60_000) });
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
  return true;
}
