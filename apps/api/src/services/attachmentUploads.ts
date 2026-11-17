import { Types } from "mongoose";
import { unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Attachment, CaseRecord } from "../models.js";
import { deleteObject } from "./objectStorage.js";
import { acquireJobLease, releaseJobLease } from "./jobLease.js";

export interface UploadReservation {
  _id: Types.ObjectId; filename: string; size: number;
  storageProvider: "local" | "s3" | "cloudinary"; expiresAt: Date;
}
interface UploadCase { _id: Types.ObjectId; organizationId: Types.ObjectId; attachmentReservations: UploadReservation[] }
export const uploadDirectory = resolve(process.env.UPLOAD_DIR || join(process.cwd(), "uploads"));

export async function settleUpload(record: Pick<UploadCase, "_id" | "organizationId">, reservation: Pick<UploadReservation, "_id" | "size" | "filename">, releaseQuota: boolean) {
  await CaseRecord.updateOne({ _id: record._id, organizationId: record.organizationId, attachmentReservations: { $elemMatch: { _id: reservation._id, filename: reservation.filename } } }, [{ $set: {
    attachmentReservations: { $filter: { input: "$attachmentReservations", as: "entry", cond: { $or: [{ $ne: ["$$entry._id", reservation._id] }, { $ne: ["$$entry.filename", reservation.filename] }] } } },
    ...(releaseQuota ? {
      attachmentCount: { $max: [0, { $subtract: [{ $ifNull: ["$attachmentCount", 0] }, 1] }] },
      attachmentBytes: { $max: [0, { $subtract: [{ $ifNull: ["$attachmentBytes", 0] }, reservation.size] }] }
    } : {}),
    __v: { $add: [{ $ifNull: ["$__v", 0] }, 1] }
  } }]);
}

export async function recoverAttachmentUploads(now = new Date()) {
  if (!await CaseRecord.exists({ "attachmentReservations.expiresAt": { $lte: now } })) return;
  const lease = await acquireJobLease("attachment-upload-recovery", 300000);
  if (!lease) return;
  try {
    const records = await CaseRecord.find({ "attachmentReservations.expiresAt": { $lte: now } })
      .select("organizationId +attachmentReservations").sort({ "attachmentReservations.expiresAt": 1 }).limit(5).lean<UploadCase[]>();
    let attempts = 0;
    for (const record of records) for (const reservation of record.attachmentReservations) {
      if (reservation.expiresAt > now) continue;
      if (++attempts > 5) return;
      try {
        const committed = await Attachment.exists({ _id: reservation._id, filename: reservation.filename, caseId: record._id, organizationId: record.organizationId });
        if (!committed) {
          if (!Number.isInteger(reservation.size) || reservation.size < 1 || reservation.size > 25 * 1024 * 1024 || !["local", "s3", "cloudinary"].includes(reservation.storageProvider)) throw new Error("Invalid upload reservation");
          if (!/^[a-f0-9-]{36}\.(pdf|docx?|xlsx?|png|jpe?g)$/i.test(reservation.filename)) throw new Error("Invalid upload reservation");
          if (reservation.storageProvider === "local") {
            await unlink(join(uploadDirectory, reservation.filename)).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
          } else {
            await deleteObject(`${record.organizationId}/${record._id}/${reservation.filename}`, reservation.storageProvider);
          }
        }
        await settleUpload(record, reservation, !committed);
      } catch {
        await CaseRecord.updateOne({ _id: record._id, "attachmentReservations._id": reservation._id },
          { $set: { "attachmentReservations.$.expiresAt": new Date(Date.now() + 60000) } });
        console.warn("[Upload recovery] Cleanup deferred; reservation retained.");
      }
    }
  } finally { await releaseJobLease("attachment-upload-recovery", lease.ownerId); }
}

/**
 * One-time rebuild of quota counters for cases created before counters existed.
 * The write only applies if the case version is unchanged since it was read, so a concurrent
 * delete, reservation or settlement (all of which bump __v) forces a re-read instead of
 * restoring a stale count. Committed-but-unsettled uploads are de-duplicated against their
 * reservation, and attachments whose deletion was already counted are excluded.
 */
export async function reconcileLegacyAttachmentCounters(caseId: Types.ObjectId, attempts = 5) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const record = await CaseRecord.findOne({ _id: caseId, attachmentCountersReconciled: { $ne: true } })
      .select("__v events._id events.type +attachmentReservations").lean<{
        __v: number; events?: Array<{ _id: Types.ObjectId; type?: string }>; attachmentReservations?: Array<{ _id: Types.ObjectId; size: number }>
      }>();
    if (!record) return true;
    const counted = new Set((record.events || []).filter(event => event.type === "attachment_deleted").map(event => String(event._id)));
    const active = await Attachment.find({ caseId, deletedAt: null }).select("_id size").lean<Array<{ _id: Types.ObjectId; size: number }>>();
    const sizes = new Map<string, number>();
    for (const file of active) if (!counted.has(String(file._id))) sizes.set(String(file._id), file.size || 0);
    for (const reservation of record.attachmentReservations || []) sizes.set(String(reservation._id), reservation.size || 0);
    const bytes = [...sizes.values()].reduce((sum, size) => sum + size, 0);
    const updated = await CaseRecord.updateOne({ _id: caseId, __v: record.__v, attachmentCountersReconciled: { $ne: true } },
      { $set: { attachmentCount: sizes.size, attachmentBytes: bytes, attachmentCountersReconciled: true }, $inc: { __v: 1 } });
    if (updated.modifiedCount) return true;
  }
  return false;
}
