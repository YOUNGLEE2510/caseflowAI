import { raw, Router } from "express";
import { existsSync, mkdirSync } from "fs";
import { unlink, writeFile } from "fs/promises";
import { basename, join, extname, resolve, relative, isAbsolute } from "path";
import { randomUUID } from "crypto";
import { z } from "zod";
import { HttpError } from "../middleware/error.js";
import { Attachment, CaseRecord } from "../models.js";

interface DownloadableAttachment {
  caseId: { toString(): string };
  originalName: string;
  mimeType: string;
  storagePath: string;
}
import { auditFromReq, logAudit } from "../services/helpers.js";
import { authenticate } from "../middleware/auth.js";

export const attachmentRouter = Router();
attachmentRouter.use(authenticate);

const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR || join(process.cwd(), "uploads"));
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
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
const ALLOWED_EXTENSIONS = new Set(Object.keys(MIME_BY_EXTENSION));

function ensureUploadDir() {
  if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
}

/* Upload file cho case */
attachmentRouter.post("/cases/:caseId/attachments", raw({ type: "application/octet-stream", limit: MAX_FILE_SIZE }), async (req, res) => {
  ensureUploadDir();

  const caseFilter: Record<string, unknown> = {
    _id: req.params.caseId,
    organizationId: req.auth!.organizationId
  };
  if (req.auth!.role === "requester") caseFilter.requesterId = req.auth!.id;
  const caseRecord = await CaseRecord.findOne(caseFilter);
  if (!caseRecord) throw new HttpError(404, "Không tìm thấy hồ sơ.");

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
  const originalName = basename(decodedName).slice(0, 240);
  const ext = extname(originalName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new HttpError(400, `Loại file "${ext}" không được chấp nhận.`);
  }

  const filename = `${randomUUID()}${ext}`;
  const storagePath = join(UPLOAD_DIR, filename);
  const buffer: Buffer = req.body;
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new HttpError(400, "Tệp tải lên không được để trống.");
  const signatures: Record<string, string[]> = { ".pdf": ["255044462d"], ".png": ["89504e470d0a1a0a"], ".jpg": ["ffd8ff"], ".jpeg": ["ffd8ff"], ".docx": ["504b0304"], ".xlsx": ["504b0304"], ".doc": ["d0cf11e0a1b11ae1"], ".xls": ["d0cf11e0a1b11ae1"] };
  const header = buffer.subarray(0, 8).toString("hex");
  if (!signatures[ext]?.some((signature) => header.startsWith(signature))) throw new HttpError(400, "Nội dung tệp không khớp với định dạng đã chọn.");

  await writeFile(storagePath, buffer);

  const attachment = await Attachment.create({
    organizationId: req.auth!.organizationId,
    caseId: caseRecord._id,
    uploaderId: req.auth!.id,
    uploaderName: req.auth!.name,
    filename,
    originalName,
    mimeType: MIME_BY_EXTENSION[ext],
    size: buffer.length,
    storagePath
  }).catch(async (error: unknown) => { await unlink(storagePath).catch(() => undefined); throw error; });

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

  const { storagePath: _path, filename: _filename, ...publicAttachment } = attachment.toObject();
  res.status(201).json({ attachment: publicAttachment });
});

/* Liệt kê attachments của case */
attachmentRouter.get("/cases/:caseId/attachments", async (req, res) => {
  const caseFilter: Record<string, unknown> = {
    _id: req.params.caseId,
    organizationId: req.auth!.organizationId
  };
  if (req.auth!.role === "requester") caseFilter.requesterId = req.auth!.id;

  const caseExists = await CaseRecord.exists(caseFilter);
  if (!caseExists) throw new HttpError(404, "Không tìm thấy hồ sơ.");

  const attachments = await Attachment.find({
    organizationId: req.auth!.organizationId,
    caseId: req.params.caseId
  })
    .select("-storagePath -filename")
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

  if (req.auth!.role === "requester") {
    const canAccess = await CaseRecord.exists({
      _id: attachment.caseId,
      organizationId: req.auth!.organizationId,
      requesterId: req.auth!.id
    });
    if (!canAccess) throw new HttpError(404, "Không tìm thấy tệp đính kèm.");
  }

  const relativePath = relative(UPLOAD_DIR, attachment.storagePath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath) || !existsSync(attachment.storagePath)) {
    throw new HttpError(404, "Tệp không tồn tại trên hệ thống.");
  }

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="download${extname(attachment.originalName)}"; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`
  );
  res.setHeader("Content-Type", attachment.mimeType);
  res.sendFile(attachment.storagePath);
});
