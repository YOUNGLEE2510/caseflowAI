// Unauthenticated intake through a unit's QR code. The signed token is the only
// capability: it names one unit in one organization. Submissions are untrusted,
// stay "pending verification" and cannot be assigned until staff confirm them.
import { Router } from "express";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { z } from "zod";
import { config } from "../config.js";
import { HttpError } from "../middleware/error.js";
import { CaseRecord, Organization, ServiceDefinition, User } from "../models.js";
import { RentalProperty, RentalUnit } from "../models/rental.js";
import { fallbackClassify } from "../services/aiClient.js";
import { logAudit } from "../services/helpers.js";
import { addBusinessHours, organizationCalendar } from "../services/workingHours.js";
import { normalizePhone, parseQrToken, verifyQrSignature } from "../services/qrIntake.js";
import { processCaseTriage } from "../jobs/caseTriage.js";

export const publicIntakeRouter = Router();
const CATEGORIES = ["water", "electrical", "internet", "appliances", "access_security", "general_support"] as const;
const QR_REQUESTER_EMAIL = "qr-intake@caseflow.invalid";
const PHONE_DAILY_LIMIT = 5;
const DUPLICATE_WINDOW_MS = 30 * 60_000;

const reportSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(20).transform(normalizePhone).pipe(z.string().regex(/^0\d{9,10}$/)),
  description: z.string().trim().min(12).max(2000),
  category: z.enum(CATEGORIES).optional(),
  // Honeypot: real people never see or fill this field.
  website: z.string().max(0).optional()
}).strict();

interface QrUnit {
  _id: mongoose.Types.ObjectId; organizationId: mongoose.Types.ObjectId; propertyCode: string; code: string;
  qrEnabled?: boolean; qrVersion?: number
}

async function resolveUnit(token: string) {
  const parsed = parseQrToken(token);
  const unit = parsed ? await RentalUnit.findById(parsed.unitId).select("organizationId propertyCode code qrEnabled qrVersion").lean<QrUnit>() : null;
  // One generic answer for malformed, forged, rotated and disabled codes.
  if (!parsed || !unit || !unit.qrEnabled || unit.qrVersion !== parsed.version || !verifyQrSignature(parsed, String(unit.organizationId))) {
    throw new HttpError(404, "Mã QR không hợp lệ hoặc đã được thay mới. Vui lòng liên hệ ban quản lý.");
  }
  const [organization, property] = await Promise.all([
    Organization.findById(unit.organizationId).select("name settings.serviceDomain settings.holidayDates")
      .lean<{ name: string; settings?: { serviceDomain?: string; holidayDates?: string[] } }>(),
    RentalProperty.findOne({ organizationId: unit.organizationId, code: unit.propertyCode, active: true }).select("name").lean<{ name: string }>()
  ]);
  if (!organization || organization.settings?.serviceDomain !== "rental" || !property) {
    throw new HttpError(404, "Mã QR không hợp lệ hoặc đã được thay mới. Vui lòng liên hệ ban quản lý.");
  }
  return { unit, organization, property };
}

async function qrRequester(organizationId: mongoose.Types.ObjectId) {
  // Placeholder requester that owns unverified submissions; inactive so it cannot sign in or be picked.
  const existing = await User.findOne({ organizationId, email: QR_REQUESTER_EMAIL }).select("_id").lean<{ _id: mongoose.Types.ObjectId }>();
  if (existing) return existing._id;
  const passwordHash = await bcrypt.hash(randomBytes(32).toString("base64url"), 12);
  try {
    const user = await User.create({ organizationId, email: QR_REQUESTER_EMAIL, name: "Người gửi qua mã QR (chưa xác minh)",
      role: "requester", passwordHash, active: false, title: "Tài khoản hệ thống" });
    return user._id as mongoose.Types.ObjectId;
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === 11000) {
      return (await User.findOne({ organizationId, email: QR_REQUESTER_EMAIL }).select("_id").lean<{ _id: mongoose.Types.ObjectId }>())!._id;
    }
    throw error;
  }
}

publicIntakeRouter.get("/public/qr/:token", async (req, res) => {
  const { unit, organization, property } = await resolveUnit(String(req.params.token));
  const services = await ServiceDefinition.find({ organizationId: unit.organizationId, key: { $in: CATEGORIES }, active: true })
    .select("key name").sort({ key: 1 }).lean<Array<{ key: string; name: string }>>();
  // Only what the reporter needs to recognise the place; never resident names.
  res.json({ organizationName: organization.name, propertyName: property.name, unitCode: unit.code,
    categories: services.map(item => ({ key: item.key, name: item.name })) });
});

publicIntakeRouter.post("/public/qr/:token/reports", async (req, res) => {
  const { unit, organization } = await resolveUnit(String(req.params.token));
  const input = reportSchema.parse(req.body);
  if (input.website) throw new HttpError(422, "Dữ liệu không hợp lệ.");
  const organizationId = unit.organizationId;
  const since = new Date(Date.now() - 24 * 3_600_000);
  const recent = await CaseRecord.find({ organizationId, "intakeVerification.reporterPhone": input.phone, createdAt: { $gte: since } })
    .select("code unitCode description createdAt").sort({ createdAt: -1 }).limit(PHONE_DAILY_LIMIT + 1)
    .lean<Array<{ code: string; unitCode?: string; description: string; createdAt: Date }>>();
  const duplicate = recent.find(item => item.unitCode === unit.code && item.description === input.description
    && Date.now() - item.createdAt.getTime() < DUPLICATE_WINDOW_MS);
  if (duplicate) {
    res.status(200).json({ code: duplicate.code, duplicate: true, message: "Phản ánh này đã được ghi nhận trước đó." });
    return;
  }
  if (recent.length >= PHONE_DAILY_LIMIT) throw new HttpError(429, "Số điện thoại này đã gửi nhiều phản ánh trong hôm nay. Vui lòng gọi trực tiếp ban quản lý.");

  const service = (await ServiceDefinition.findOne({ organizationId, key: input.category || "general_support", active: true }).lean<{ key: string; category: string; team: string; slaHours: number }>())
    || await ServiceDefinition.findOne({ organizationId, key: "general_support", active: true }).lean<{ key: string; category: string; team: string; slaHours: number }>();
  if (!service) throw new HttpError(503, "Ban quản lý chưa mở tiếp nhận qua mã QR. Vui lòng gọi trực tiếp.");
  const requesterId = await qrRequester(organizationId);
  const classification = fallbackClassify(input.description);
  const title = input.description.split(/[.!?\n]/)[0].trim().slice(0, 120) || "Phản ánh qua mã QR";
  const dueAt = addBusinessHours(new Date(), service.slaHours, organizationCalendar(organization.settings));
  let record: any;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      record = await CaseRecord.create({
        code: `CF-${new Date().getFullYear()}-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
        organizationId, title, description: input.description, serviceKey: service.key, category: service.category,
        priority: "normal", status: "new", channel: "qr", requesterId, requesterName: input.name,
        createdById: null, createdByName: "", team: service.team, dueAt,
        propertyCode: unit.propertyCode, unitCode: unit.code,
        intakeVerification: { status: "pending", reporterName: input.name, reporterPhone: input.phone },
        ai: { processingStatus: "queued", classification: classification.label, routingMismatch: classification.label !== service.category,
          confidence: classification.confidence, summary: classification.summary,
          modelVersion: classification.modelVersion || `${classification.provider}-unversioned`, extracted: classification.extracted,
          analyzedAt: new Date(), reviewStatus: "pending" },
        events: [
          { type: "created", label: `Tiếp nhận qua mã QR căn ${unit.code} — chưa xác minh người gửi`, actorName: "Mã QR căn hộ" },
          { type: "ai_triage", label: `Đã tiếp nhận tại ${service.team}; chờ nhân viên xác minh và phân loại`, actorName: "CaseFlow AI", internal: true }
        ]
      });
      break;
    } catch (error) {
      if (!(typeof error === "object" && error && "code" in error && error.code === 11000) || attempt === 2) throw error;
    }
  }
  if (config.CASE_TRIAGE_MODE === "inline") await processCaseTriage({ caseId: String(record._id), organizationId: String(organizationId) });
  // Audit without the reporter's phone number or text.
  await logAudit({ organizationId: String(organizationId), actorId: String(requesterId), actorName: "Mã QR căn hộ", actorRole: "requester",
    action: "case.qr_intake", resource: "case", resourceId: String(record._id),
    changes: { unitCode: unit.code, propertyCode: unit.propertyCode, reporter: createHash("sha256").update(input.phone).digest("hex").slice(0, 12) } }, req);
  res.status(201).json({ code: record.code, duplicate: false,
    message: "Ban quản lý sẽ gọi lại số điện thoại bạn cung cấp để xác nhận trước khi cử kỹ thuật lên căn." });
});
