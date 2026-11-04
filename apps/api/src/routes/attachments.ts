import { raw, Router } from "express";
import { existsSync, mkdirSync } from "fs";
import { realpath, unlink, writeFile } from "fs/promises";
import { basename, join, extname, relative, isAbsolute } from "path";
import { createHash, randomUUID } from "crypto";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { pipeline } from "node:stream/promises";
import { config } from "../config.js";
import { scanFile } from "../services/malwareScanner.js";
import { storeObject, deleteObject, getObjectStream } from "../services/objectStorage.js";
import { HttpError } from "../middleware/error.js";
import { Attachment, CaseRecord, Organization } from "../models.js";

interface DownloadableAttachment {
  caseId: { toString(): string };
  originalName: string;
  mimeType: string;
  storagePath: string;
  storageProvider?: string;
  objectKey?: string;
  internal?: boolean;
}
import { auditFromReq, logAudit } from "../services/helpers.js";
import { caseScope } from "../services/casePolicy.js";
import { validateObjectId } from "../middleware/validateId.js";
import { Types } from "mongoose";
import { uploadDirectory, settleUpload, type UploadReservation } from "../services/attachmentUploads.js";

export const attachmentRouter = Router();

const UPLOAD_DIR = uploadDirectory;
const ABSOLUTE_MAX_FILE_SIZE = 25 * 1024 * 1024; // Parser ceiling: 25 MB.
const MIME_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};
const DEFAULT_ALLOWED_EXTENSIONS = new Set([".pdf", ".docx", ".png", ".jpg", ".jpeg", ".xlsx"]);
function publicFile(value: Record<string, unknown>) {
  const { storagePath: _path, filename: _filename, objectKey: _key, uploadFingerprint: _fingerprint, ...file } = value;
  return file;
}
function assertReplay(file: { deletedAt?: unknown; deleting?: boolean; uploadFingerprint?: string }, fingerprint: string | undefined) {
  if (file.deletedAt || file.deleting || file.uploadFingerprint !== fingerprint) throw new HttpError(409, "Mã tải tệp đã được sử dụng cho dữ liệu khác hoặc tệp đã xóa.");
}

function ensureUploadDir() {
  if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
}

function uploadPolicy(settings?: { maxFileSizeMB?: number; allowedFileTypes?: string[] }) {
  const requestedMb = Number(settings?.maxFileSizeMB);
  const maxFileSize = Math.min(
    ABSOLUTE_MAX_FILE_SIZE,
    Math.max(1, Number.isFinite(requestedMb) ? requestedMb : 10) * 1024 * 1024
  );
  const configuredExtensions = settings?.allowedFileTypes?.length
    ? settings.allowedFileTypes
    : [...DEFAULT_ALLOWED_EXTENSIONS];
  const allowedExtensions = new Set(
    configuredExtensions.map((extension) => extension.trim().toLowerCase()).filter((extension) => extension in MIME_BY_EXTENSION)
  );
  return { maxFileSize, allowedExtensions };
}

/* Upload file cho case */
const uploadLimit = rateLimit({ windowMs: 60_000, limit: 10, keyGenerator: req => req.auth!.id, standardHeaders: "draft-7", legacyHeaders: false });
attachmentRouter.post("/cases/:caseId/attachments", uploadLimit, raw({ type: "application/octet-stream", limit: ABSOLUTE_MAX_FILE_SIZE }), async (req, res) => {
  const caseFilter: Record<string, unknown> = { _id: req.params.caseId, ...caseScope(req.auth!) };
  const caseRecord = await CaseRecord.findOne(caseFilter);
  if (!caseRecord) throw new HttpError(404, "Không tìm thấy hồ sơ.");
  if (caseRecord.status === "closed") throw new HttpError(422, "Hãy mở lại hồ sơ trước khi tải tệp.");
  const internalHeader = z.enum(["true", "false"]).optional().parse(req.get("X-Internal"));
  const internal = req.auth!.role === "requester" ? false : internalHeader !== "false";
  if (req.auth!.role === "requester" && internalHeader === "true") throw new HttpError(403, "Người yêu cầu không thể tải tệp nội bộ.");

  const organization = await Organization.findById(req.auth!.organizationId)
    .select("settings.maxFileSizeMB settings.allowedFileTypes")
    .lean<{ settings?: { maxFileSizeMB?: number; allowedFileTypes?: string[] } }>();
  const policy = uploadPolicy(organization?.settings);

  const contentType = req.headers["content-type"] || "";
  if (!contentType.includes("octet-stream")) {
    throw new HttpError(400, "Tệp phải được gửi dưới dạng application/octet-stream.");
  }

  const encodedName = (req.headers["x-filename"] as string) || "uploaded-file";
  let decodedName = encodedName;
  try {
    decodedName = decodeURIComponent(encodedName);
  } catch {
    // Keep the original header when it is not URI encoded.
  }
  const originalName = basename(decodedName.replace(/\\/g, "/")).replace(/[\x00-\x1f\x7f]/g, "").slice(0, 240);
  const ext = extname(originalName).toLowerCase();
  if (!policy.allowedExtensions.has(ext)) {
    throw new HttpError(400, `Loại file "${ext}" không được chấp nhận.`);
  }

  const filename = `${randomUUID()}${ext}`;
  const storagePath = join(UPLOAD_DIR, filename);
  const buffer: Buffer = req.body;
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new HttpError(400, "Tệp tải lên không được để trống.");
  if (buffer.length > policy.maxFileSize) {
    throw new HttpError(413, `Tệp vượt quá dung lượng cho phép (${Math.round(policy.maxFileSize / 1048576)} MB).`);
  }
  const signatures: Record<string, string[]> = { ".pdf": ["255044462d"], ".png": ["89504e470d0a1a0a"], ".jpg": ["ffd8ff"], ".jpeg": ["ffd8ff"], ".docx": ["504b0304"], ".xlsx": ["504b0304"], ".doc": ["d0cf11e0a1b11ae1"], ".xls": ["d0cf11e0a1b11ae1"] };
  const header = buffer.subarray(0, 8).toString("hex");
  if (!signatures[ext]?.some((signature) => header.startsWith(signature))) throw new HttpError(400, "Nội dung tệp không khớp với định dạng đã chọn.");

  const key = z.string().regex(/^[a-zA-Z0-9_-]{16,128}$/).optional().parse(req.get("Idempotency-Key"));
  const attachmentId = key ? new Types.ObjectId(createHash("sha256").update(JSON.stringify([req.auth!.organizationId, req.auth!.id, String(caseRecord._id), key])).digest("hex").slice(0, 24)) : new Types.ObjectId();
  const fingerprint = key ? createHash("sha256").update(JSON.stringify([originalName, internal])).update(buffer).digest("hex") : undefined;
  const replayFilter = { _id: attachmentId, organizationId: req.auth!.organizationId, caseId: caseRecord._id, uploaderId: req.auth!.id };
  if (key) {
    const previous = await Attachment.findOne(replayFilter).select("+uploadFingerprint");
    if (previous) {
      assertReplay(previous, fingerprint);
      await settleUpload(caseRecord, { _id: attachmentId, size: previous.size, filename: previous.filename }, false);
      res.status(201).json({ attachment: publicFile(previous.toObject()) }); return;
    }
  }
  const scan = await scanFile(buffer);
  const upload: UploadReservation = { _id: attachmentId, filename, size: buffer.length,
    storageProvider: config.STORAGE_PROVIDER, expiresAt: new Date(Date.now() + 10 * 60000) };
  const [existing] = await Attachment.aggregate([{ $match: { caseId: caseRecord._id, deletedAt: null, deleting: { $ne: true } } },
    { $group: { _id: null, count: { $sum: 1 }, bytes: { $sum: "$size" } } }]);
  await CaseRecord.updateOne({ _id: caseRecord._id }, { $max: { attachmentCount: existing?.count || 0, attachmentBytes: existing?.bytes || 0 } });
  const reservation = await CaseRecord.updateOne({ _id: caseRecord._id, ...caseScope(req.auth!), status: { $ne: "closed" },
    attachmentReservations: { $not: { $elemMatch: { _id: attachmentId } } },
    attachmentCount: { $lt: 10 }, attachmentBytes: { $lte: 50 * 1024 * 1024 - buffer.length } },
    { $inc: { attachmentCount: 1, attachmentBytes: buffer.length, __v: 1 }, $push: { attachmentReservations: upload } });
  if (!reservation.modifiedCount) {
    const committed = key ? await Attachment.findOne(replayFilter).select("+uploadFingerprint") : null;
    if (committed) {
      assertReplay(committed, fingerprint);
      res.status(201).json({ attachment: publicFile(committed.toObject()) }); return;
    }
    if (await CaseRecord.exists({ _id: caseRecord._id, "attachmentReservations._id": attachmentId })) throw new HttpError(409, "Tệp đang được xử lý. Vui lòng thử lại sau.");
    throw new HttpError(422, "Hồ sơ đã đóng hoặc đạt giới hạn 10 tệp / 50 MB.");
  }
  if (key) {
    const committed = await Attachment.findOne(replayFilter).select("+uploadFingerprint");
    if (committed) {
      await settleUpload(caseRecord, upload, true);
      assertReplay(committed, fingerprint);
      res.status(201).json({ attachment: publicFile(committed.toObject()) }); return;
    }
  }
  const objectKey = `${req.auth!.organizationId}/${caseRecord._id}/${filename}`;
  let attachment;
  try {
  if (config.STORAGE_PROVIDER !== "local") await storeObject(objectKey, buffer, MIME_BY_EXTENSION[ext], config.STORAGE_PROVIDER);
  else {
    ensureUploadDir();
    await writeFile(storagePath, buffer, { flag: "wx" });
  }

  attachment = await Attachment.create({
    _id: upload._id,
    uploadFingerprint: fingerprint,
    organizationId: req.auth!.organizationId,
    caseId: caseRecord._id,
    uploaderId: req.auth!.id,
    uploaderName: req.auth!.name,
    filename,
    originalName,
    mimeType: MIME_BY_EXTENSION[ext],
    size: buffer.length,
    internal,
    storagePath: config.STORAGE_PROVIDER === "local" ? storagePath : undefined,
    storageProvider: config.STORAGE_PROVIDER,
    objectKey: config.STORAGE_PROVIDER !== "local" ? objectKey : undefined,
    ...scan
  });
  } catch (error) {
    await CaseRecord.updateOne({ _id: caseRecord._id, "attachmentReservations._id": upload._id },
      { $set: { "attachmentReservations.$.expiresAt": new Date(Date.now() + 120000) } }).catch(() => undefined);
    throw error;
  }
  await settleUpload(caseRecord, upload, false);

  await CaseRecord.updateOne({ _id: caseRecord._id, organizationId: req.auth!.organizationId }, { $push: { events: {
    type: "attachment",
    internal,
    label: `Đã đính kèm tệp "${originalName}"`,
    actorId: req.auth!.id as any,
    actorName: req.auth!.name,
    createdAt: new Date()
  } }, $inc: { __v: 1 } });

  await logAudit({
    ...auditFromReq(req),
    action: "attachment.upload",
    resource: "Attachment",
    resourceId: String(attachment._id),
    changes: { filename: originalName, size: buffer.length }
  }, req);

  res.status(201).json({ attachment: publicFile(attachment.toObject()) });
});

/* Liệt kê attachments của case */
attachmentRouter.get("/cases/:caseId/attachments", async (req, res) => {
  const caseFilter: Record<string, unknown> = { _id: req.params.caseId, ...caseScope(req.auth!) };

  const caseExists = await CaseRecord.exists(caseFilter);
  if (!caseExists) throw new HttpError(404, "Không tìm thấy hồ sơ.");

  const attachments = await Attachment.find({
    deletedAt: null, deleting: { $ne: true },
    organizationId: req.auth!.organizationId,
    caseId: req.params.caseId,
    ...(req.auth!.role === "requester" ? { $or: [{ internal: false }, { internal: { $exists: false }, uploaderId: req.auth!.id }] } : {})
  })
    .select("-storagePath -filename -objectKey")
    .sort({ createdAt: -1 })
    .lean();

  res.json({ attachments });
});

/* Download file */
attachmentRouter.get("/attachments/:id/download", async (req, res) => {
  const attachment = await Attachment.findOne({
    deletedAt: null, deleting: { $ne: true },
    _id: req.params.id,
    organizationId: req.auth!.organizationId,
    ...(req.auth!.role === "requester" ? { $or: [{ internal: false }, { internal: { $exists: false }, uploaderId: req.auth!.id }] } : {})
  }).lean<DownloadableAttachment>().exec();
  if (!attachment) throw new HttpError(404, "Không tìm thấy tệp đính kèm.");

  const canAccess = await CaseRecord.exists({ _id: attachment.caseId, ...caseScope(req.auth!) });
  if (!canAccess) throw new HttpError(404, "Không tìm thấy tệp đính kèm.");

  let realFile = "";
  if (!attachment.storageProvider || attachment.storageProvider === "local") {
    if (!attachment.storagePath) throw new HttpError(404, "Tệp không tồn tại trên hệ thống.");
    const relativePath = relative(UPLOAD_DIR, attachment.storagePath);
    if (relativePath.startsWith("..") || isAbsolute(relativePath) || !existsSync(attachment.storagePath)) {
      throw new HttpError(404, "Tệp không tồn tại trên hệ thống.");
    }
    const [realDirectory, resolvedFile] = await Promise.all([realpath(UPLOAD_DIR), realpath(attachment.storagePath)]);
    realFile = resolvedFile;
    const realRelative = relative(realDirectory, realFile);
    if (realRelative.startsWith("..") || isAbsolute(realRelative)) {
      throw new HttpError(404, "Tệp không tồn tại trên hệ thống.");
    }
  }

  if (["s3", "cloudinary"].includes(attachment.storageProvider || "") && (!attachment.objectKey || !attachment.objectKey.startsWith(`${req.auth!.organizationId}/${attachment.caseId}/`))) {
    throw new HttpError(404, "Không tìm thấy tệp đính kèm.");
  }

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="download${extname(attachment.originalName)}"; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`
  );
  res.setHeader("Content-Type", attachment.mimeType);
  await logAudit({
    ...auditFromReq(req),
    action: "attachment.download",
    resource: "Attachment",
    resourceId: req.params.id,
    changes: { caseId: String(attachment.caseId), filename: attachment.originalName }
  }, req);
  res.setHeader("Cache-Control", "private, no-store");
  if (attachment.storageProvider === "s3" || attachment.storageProvider === "cloudinary") {
    const stream = await getObjectStream(attachment.objectKey!, attachment.storageProvider);
    await pipeline(stream, res);
  } else res.sendFile(realFile);
});

attachmentRouter.delete("/attachments/:id", validateObjectId("id"), async (req, res) => {
  const { reason } = z.object({ reason: z.enum(["uploaded_by_mistake", "personal_data", "obsolete"]) }).strict().parse(req.body);
  const filter = { _id: req.params.id, organizationId: req.auth!.organizationId,
    ...(!["org_admin", "platform_admin"].includes(req.auth!.role) ? { uploaderId: req.auth!.id } : {}) };
  const attachment = await Attachment.findOne(filter);
  if (!attachment || !await CaseRecord.exists({ _id: attachment.caseId, ...caseScope(req.auth!) })) throw new HttpError(404, "Không tìm thấy tệp đính kèm.");
  if (attachment.deletedAt) { res.json({ deleted: true }); return; }
  const lease = randomUUID();
  const locked = await Attachment.updateOne({ ...filter, deletedAt: null, $or: [
    { deletionLeaseUntil: { $exists: false } }, { deletionLeaseUntil: null }, { deletionLeaseUntil: { $lte: new Date() } }
  ] }, { $set: { deleting: true, deletionLease: lease, deletionLeaseUntil: new Date(Date.now() + 120_000) } });
  if (!locked.modifiedCount) throw new HttpError(409, "Tệp đang được xóa. Vui lòng thử lại sau.");
  try {
    if (attachment.storageProvider === "s3" || attachment.storageProvider === "cloudinary") {
      if (!attachment.objectKey?.startsWith(`${req.auth!.organizationId}/${attachment.caseId}/`)) throw new HttpError(422, "Thông tin tệp không hợp lệ.");
      await deleteObject(attachment.objectKey, attachment.storageProvider);
    } else if (attachment.storagePath && existsSync(attachment.storagePath)) {
      const [directory, path] = await Promise.all([realpath(UPLOAD_DIR), realpath(attachment.storagePath)]);
      const target = relative(directory, path);
      if (target.startsWith("..") || isAbsolute(target)) throw new HttpError(422, "Thông tin tệp không hợp lệ.");
      await unlink(path);
    }
    await CaseRecord.updateOne({ _id: attachment.caseId, organizationId: req.auth!.organizationId, "events._id": { $ne: attachment._id } }, [{ $set: {
      attachmentCount: { $max: [0, { $subtract: [{ $ifNull: ["$attachmentCount", 0] }, 1] }] },
      attachmentBytes: { $max: [0, { $subtract: [{ $ifNull: ["$attachmentBytes", 0] }, attachment.size] }] },
      __v: { $add: [{ $ifNull: ["$__v", 0] }, 1] },
      events: { $concatArrays: [{ $ifNull: ["$events", []] }, { $literal: [{ _id: attachment._id, type: "attachment_deleted", internal: attachment.internal,
        label: "Tệp đính kèm đã được xóa", actorId: new Types.ObjectId(req.auth!.id), actorName: req.auth!.name, createdAt: new Date() }] }] }
    } }]);
    await Attachment.updateOne({ ...filter, deletionLease: lease }, { $set: { deletedAt: new Date(), deleting: false, originalName: "deleted-file" },
      $unset: { objectKey: 1, storagePath: 1, uploadFingerprint: 1, deletionLease: 1, deletionLeaseUntil: 1 } });
  } catch {
    await Attachment.updateOne({ ...filter, deletionLease: lease }, { $unset: { deletionLease: 1, deletionLeaseUntil: 1 } });
    throw new HttpError(503, "Chưa thể xóa tệp. Tệp đã được ẩn; vui lòng thử lại để hoàn tất.");
  }
  await logAudit({ ...auditFromReq(req), action: "attachment.delete", resource: "Attachment", resourceId: String(attachment._id), changes: { reason, caseId: String(attachment.caseId) } }, req);
  res.json({ deleted: true });
});
