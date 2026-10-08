import { randomUUID } from "node:crypto";
import { JobLease } from "../models.js";

export async function acquireJobLease(key: string, ttlMs: number) {
  const ownerId = randomUUID();
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + ttlMs);

  const renewed = await JobLease.findOneAndUpdate(
    { key, lockedUntil: { $lte: now } },
    { $set: { ownerId, lockedUntil } },
    { new: true }
  ).lean();
  if (renewed) return { ownerId };

  try {
    await JobLease.create({ key, ownerId, lockedUntil });
    return { ownerId };
  } catch (error: any) {
    // Another instance may have created the lease after findOneAndUpdate.
    if (error?.code === 11000) return null;
    throw error;
  }
}

export async function releaseJobLease(key: string, ownerId: string) {
  await JobLease.updateOne({ key, ownerId }, { $set: { lockedUntil: new Date(0) } });
}
