import { raw, Router } from "express";
import { existsSync, mkdirSync } from "fs";
import { realpath, unlink, writeFile } from "fs/promises";
import { basename, join, extname, resolve, relative, isAbsolute } from "path";
import { randomUUID } from "crypto";
import { z } from "zod";
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
}
import { auditFromReq, logAudit } from "../services/helpers.js";
import { caseScope } from "../services/casePolicy.js";

export const attachmentRouter = Router();

const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR || join(process.cwd(), "uploads"));
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
attachmentRouter.post("/cases/:caseId/attachments", raw({ type: "application/octet-stream", limit: ABSOLUTE_MAX_FILE_SIZE }), async (req, res) => {
  const caseFilter: Record<string, unknown> = { _id: req.params.caseId, ...caseScope(req.auth!) };
  const caseRecord = await CaseRecord.findOne(caseFilter);
  if (!caseRecord) throw new HttpError(404, "Không tìm thấy hồ sơ.");

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

  const scan = await scanFile(buffer);
  const objectKey = `${req.auth!.organizationId}/${caseRecord._id}/${filename}`;
  if (config.STORAGE_PROVIDER === "s3") await storeObject(objectKey, buffer, MIME_BY_EXTENSION[ext]);
  else {
    ensureUploadDir();
    await writeFile(storagePath, buffer, { flag: "wx" });
  }

  const attachment = await Attachment.create({
    organizationId: req.auth!.organizationId,
    caseId: caseRecord._id,
    uploaderId: req.auth!.id,
    uploaderName: req.auth!.name,
    filename,
    originalName,
    mimeType: MIME_BY_EXTENSION[ext],
    size: buffer.length,
    storagePath: config.STORAGE_PROVIDER === "local" ? storagePath : undefined,
    storageProvider: config.STORAGE_PROVIDER,
    objectKey: config.STORAGE_PROVIDER === "s3" ? objectKey : undefined,
    ...scan
  }).catch(async (error: unknown) => {
    if (config.STORAGE_PROVIDER === "s3") await deleteObject(objectKey).catch(() => undefined);
    else await unlink(storagePath).catch(() => undefined);
    throw error;
  });

  await CaseRecord.updateOne({ _id: caseRecord._id, organizationId: req.auth!.organizationId }, { $push: { events: {
    type: "attachment",
    label: `Đã đính kèm tệp "${originalName}"`,
    actorId: req.auth!.id as any,
    actorName: req.auth!.name,
    createdAt: new Date()
  } }, $inc: { __v: 1 } });

  await logAudit({
    ...auditFromReq(req),
    action: "case.update",
    resource: "Attachment",
    resourceId: String(attachment._id),
    changes: { filename: originalName, size: buffer.length }
  }, req);

  const { storagePath: _path, filename: _filename, objectKey: _key, ...publicAttachment } = attachment.toObject();
  res.status(201).json({ attachment: publicAttachment });
});

/* Liệt kê attachments của case */
attachmentRouter.get("/cases/:caseId/attachments", async (req, res) => {
  const caseFilter: Record<string, unknown> = { _id: req.params.caseId, ...caseScope(req.auth!) };

  const caseExists = await CaseRecord.exists(caseFilter);
  if (!caseExists) throw new HttpError(404, "Không tìm thấy hồ sơ.");

  const attachments = await Attachment.find({
    organizationId: req.auth!.organizationId,
    caseId: req.params.caseId
  })
    .select("-storagePath -filename -objectKey")
    .sort({ createdAt: -1 })
    .lean();

  res.json({ attachments });
});

/* Download file */
attachmentRouter.get("/attachments/:id/download", async (req, res) => {
  const attachment = await Attachment.findOne({
    _id: req.params.id,
    organizationId: req.auth!.organizationId
  }).lean<DownloadableAttachment>().exec();
  if (!attachment) throw new HttpError(404, "Không tìm thấy tệp đính kèm.");

  const canAccess = await CaseRecord.exists({ _id: attachment.caseId, ...caseScope(req.auth!) });
  if (!canAccess) throw new HttpError(404, "Không tìm thấy tệp đính kèm.");

  let realFile = "";
  if (attachment.storageProvider !== "s3") {
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

  if (attachment.storageProvider === "s3" && (!attachment.objectKey || !attachment.objectKey.startsWith(`${req.auth!.organizationId}/${attachment.caseId}/`))) {
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
  if (attachment.storageProvider === "s3") {
    const stream = await getObjectStream(attachment.objectKey!);
    await pipeline(stream, res);
  } else res.sendFile(realFile);
});
