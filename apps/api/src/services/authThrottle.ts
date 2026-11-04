import mongoose from "mongoose";
import { createHmac } from "node:crypto";
import { config } from "../config.js";
import { HttpError } from "../middleware/error.js";

const schema = new mongoose.Schema({ _id: String, attempts: { type: Number, default: 0 }, expiresAt: Date });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const AuthThrottle = mongoose.models.AuthThrottle || mongoose.model("AuthThrottle", schema);

export async function consumeAuthAttempt(identity: string, purpose = "password", limit = 20) {
  const windowMs = 15 * 60_000;
  const bucket = Math.floor(Date.now() / windowMs);
  const id = createHmac("sha256", config.JWT_SECRET).update(`${purpose}:${identity.trim().toLowerCase()}:${bucket}`).digest("hex");
  const row = await AuthThrottle.findOneAndUpdate({ _id: id }, { $inc: { attempts: 1 },
    $setOnInsert: { expiresAt: new Date((bucket + 2) * windowMs) } }, { upsert: true, new: true });
  if (row.attempts > limit) throw new HttpError(429, "Quá nhiều lần xác thực. Vui lòng thử lại sau 15 phút.");
  return id;
}
