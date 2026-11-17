import { Router } from "express";
import { z } from "zod";
import { requireRoles } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import { CaseRecord, User } from "../models.js";
import { RentalProperty, RentalUnit, RentalAsset, MaintenanceTask } from "../models/rental.js";
import { maintenanceRouter } from "./maintenance.js";
import { auditFromReq, logAudit } from "../services/helpers.js";

export const rentalRouter = Router();
rentalRouter.use(maintenanceRouter);
const manage = requireRoles("manager", "org_admin", "platform_admin");
const code = z.string().trim().regex(/^[a-z\d-]{1,32}$/i).transform(value => value.toUpperCase());
const id = z.string().regex(/^[a-f\d]{24}$/i);
const input = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("property"), code, name: z.string().trim().min(2).max(120), address: z.string().trim().max(240).default("") }).strict(),
  z.object({ kind: z.literal("unit"), propertyCode: code, code, floor: z.string().trim().max(16).default(""), residentIds: z.array(id).max(10).default([]) }).strict(),
  z.object({ kind: z.literal("asset"), propertyCode: code, unitCode: code.optional(), code, name: z.string().trim().min(2).max(120),
    category: z.enum(["water", "electrical", "internet", "appliances", "access_security", "general_support"]) }).strict()
]);

rentalRouter.get("/rental/catalog", async (req, res) => {
  const organizationId = req.auth!.organizationId;
  const canManage = ["manager", "org_admin", "platform_admin"].includes(req.auth!.role);
  const units = await RentalUnit.find({ organizationId, ...(req.auth!.role === "requester" ? { residentIds: req.auth!.id } : {}) })
    .select(`propertyCode code floor${canManage ? " residentIds" : ""}`).sort({ propertyCode: 1, code: 1 }).limit(500).lean();
  const requester = req.auth!.role === "requester";
  const properties = await RentalProperty.find({ organizationId, active: true,
    ...(requester ? { code: { $in: units.map(unit => unit.propertyCode) } } : {}) }).select("code name address").sort({ code: 1 }).limit(100).lean();
  const assets = requester && !units.length ? [] : await RentalAsset.find({ organizationId, active: true,
    ...(requester ? { $or: units.map(unit => ({ propertyCode: unit.propertyCode, unitCode: { $in: ["", unit.code] } })) } : {})
  }).select("propertyCode unitCode code name category").sort({ code: 1 }).limit(500).lean();
  const residents = canManage ? await User.find({ organizationId, active: true, role: "requester" }).select("name").sort({ name: 1 }).limit(500).lean() : [];
  res.json({ properties, units, assets, residents });
});

rentalRouter.put("/rental/catalog", manage, async (req, res) => {
  const item = input.parse(req.body);
  const actor = auditFromReq(req);
  const organizationId = actor.organizationId;
  if (item.kind !== "property" && !await RentalProperty.exists({ organizationId, code: item.propertyCode, active: true })) {
    throw new HttpError(422, "Cơ sở không hợp lệ.");
  }
  if (item.kind === "unit" && await User.countDocuments({ organizationId, role: "requester", active: true,
    _id: { $in: [...new Set(item.residentIds)] } }) !== new Set(item.residentIds).size) throw new HttpError(422, "Người thuê không hợp lệ.");
  if (item.kind === "asset" && item.unitCode && !await RentalUnit.exists({ organizationId, propertyCode: item.propertyCode, code: item.unitCode })) {
    throw new HttpError(422, "Căn không hợp lệ.");
  }
  const { kind, ...fields } = item;
  const model = kind === "property" ? RentalProperty : kind === "unit" ? RentalUnit : RentalAsset;
  const key = { organizationId, code: item.code,
    ...(item.kind === "unit" || item.kind === "asset" ? { propertyCode: item.propertyCode } : {}),
    ...(item.kind === "asset" ? { unitCode: item.unitCode || "" } : {})
  };
  try {
    await model.updateOne(key, { $set: { ...fields, ...(item.kind === "asset" ? { unitCode: item.unitCode || "" } : {}) } }, { upsert: true, runValidators: true });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === 11000) {
      throw new HttpError(409, "Mã thiết bị đã được dùng tại vị trí khác. Không được đổi vị trí hoặc mã của thiết bị cũ.");
    }
    throw error;
  }
  await logAudit({ ...actor, action: "rental.catalog.update", resource: kind, changes: { code: item.code } }, req);
  res.status(204).end();
});

rentalRouter.get("/rental/assets/:code/history", manage, async (req, res) => {
  const assetCode = code.parse(req.params.code);
  const organizationId = req.auth!.organizationId;
  if (!await RentalAsset.exists({ organizationId, code: assetCode })) throw new HttpError(404, "Không tìm thấy thiết bị.");
  const cases = await CaseRecord.find({ organizationId, assetCode }).select("code title status createdAt resolvedAt")
    .sort({ createdAt: -1 }).limit(50).lean();
  const tasks = await MaintenanceTask.find({ organizationId, assetCode }).select("title dueAt status result completedAt")
    .sort({ createdAt: -1 }).limit(50).lean();
  res.json({ cases, tasks });
});
