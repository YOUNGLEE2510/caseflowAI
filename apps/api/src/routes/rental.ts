import { Router, type Request } from "express";
import { z } from "zod";
import { requireRoles } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import { CaseRecord, User } from "../models.js";
import { RentalProperty, RentalUnit, RentalAsset, MaintenanceTask } from "../models/rental.js";
import { maintenanceRouter } from "./maintenance.js";
import { rentalUnitsRouter } from "./rentalUnits.js";
import { auditFromReq, logAudit } from "../services/helpers.js";
import { signQrToken } from "../services/qrIntake.js";

export const rentalRouter = Router();
rentalRouter.use(maintenanceRouter);
rentalRouter.use(rentalUnitsRouter);
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
  // Keep the letting status consistent with the resident list edited here.
  let occupancySync: { $set: Record<string, unknown>; $push?: Record<string, unknown> } | null = null;
  if (item.kind === "unit") {
    const current = await RentalUnit.findOne(key).select("occupancyStatus readinessStatus").lean<{ occupancyStatus?: string; readinessStatus?: string }>();
    const occupancy = current?.occupancyStatus || "vacant";
    const now = new Date();
    const note = item.residentIds.length ? "Gán người thuê qua danh mục" : "Gỡ hết người thuê qua danh mục";
    const changes: Array<{ axis: string; from: string; to: string }> = [];
    if (!item.residentIds.length && ["occupied", "notice"].includes(occupancy)) {
      changes.push({ axis: "occupancy", from: occupancy, to: "vacant" });
      if ((current?.readinessStatus || "ready") !== "needs_cleaning" && (current?.readinessStatus || "ready") !== "under_repair") {
        changes.push({ axis: "readiness", from: current?.readinessStatus || "ready", to: "needs_cleaning" });
      }
    } else if (item.residentIds.length && ["vacant", "reserved"].includes(occupancy)) {
      changes.push({ axis: "occupancy", from: occupancy, to: "occupied" });
    }
    if (changes.length) {
      occupancySync = {
        $set: { ...Object.fromEntries(changes.map(change => [change.axis === "occupancy" ? "occupancyStatus" : "readinessStatus", change.to])),
          statusNote: note, statusUpdatedAt: now, statusUpdatedByName: actor.actorName },
        $push: { statusHistory: { $each: changes.map(change => ({ ...change, note, actorName: actor.actorName, at: now })), $slice: -200 } }
      };
    }
  }
  try {
    await model.updateOne(key, {
      $set: { ...fields, ...(item.kind === "asset" ? { unitCode: item.unitCode || "" } : {}), ...(occupancySync?.$set || {}) },
      ...(occupancySync?.$push ? { $push: occupancySync.$push } : {})
    }, { upsert: true, runValidators: true });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === 11000) {
      throw new HttpError(409, "Mã thiết bị đã được dùng tại vị trí khác. Không được đổi vị trí hoặc mã của thiết bị cũ.");
    }
    throw error;
  }
  await logAudit({ ...actor, action: "rental.catalog.update", resource: kind, changes: { code: item.code } }, req);
  res.status(204).end();
});

/* ── QR intake codes per unit ── */

async function findUnit(req: Request) {
  const unit = await RentalUnit.findOne({ organizationId: req.auth!.organizationId, propertyCode: code.parse(String(req.params.property)), code: code.parse(String(req.params.code)) })
    .select("_id organizationId propertyCode code qrEnabled qrVersion qrIssuedAt").lean<{ _id: { toString(): string }; organizationId: { toString(): string };
      propertyCode: string; code: string; qrEnabled?: boolean; qrVersion?: number; qrIssuedAt?: Date | null }>();
  if (!unit) throw new HttpError(404, "Không tìm thấy căn hộ.");
  return unit;
}
const presentQr = (unit: Awaited<ReturnType<typeof findUnit>>) => ({
  propertyCode: unit.propertyCode, unitCode: unit.code, enabled: Boolean(unit.qrEnabled && unit.qrVersion), issuedAt: unit.qrIssuedAt || null,
  path: unit.qrEnabled && unit.qrVersion ? `/r/${signQrToken(String(unit.organizationId), String(unit._id), unit.qrVersion)}` : null
});

rentalRouter.get("/rental/units/:property/:code/qr", manage, async (req, res) => {
  res.json(presentQr(await findUnit(req)));
});

// Issue a new code. Any code printed earlier for this unit stops working.
rentalRouter.post("/rental/units/:property/:code/qr", manage, async (req, res) => {
  const unit = await findUnit(req);
  const updated = await RentalUnit.findOneAndUpdate({ _id: unit._id, organizationId: req.auth!.organizationId },
    { $inc: { qrVersion: 1 }, $set: { qrEnabled: true, qrIssuedAt: new Date() } }, { new: true })
    .select("_id organizationId propertyCode code qrEnabled qrVersion qrIssuedAt").lean<Awaited<ReturnType<typeof findUnit>>>();
  await logAudit({ ...auditFromReq(req), action: "rental.qr.issue", resource: "unit", resourceId: String(unit._id),
    changes: { propertyCode: unit.propertyCode, unitCode: unit.code, version: updated!.qrVersion } }, req);
  res.status(201).json(presentQr(updated!));
});

rentalRouter.delete("/rental/units/:property/:code/qr", manage, async (req, res) => {
  const unit = await findUnit(req);
  await RentalUnit.updateOne({ _id: unit._id, organizationId: req.auth!.organizationId }, { $set: { qrEnabled: false } });
  await logAudit({ ...auditFromReq(req), action: "rental.qr.disable", resource: "unit", resourceId: String(unit._id),
    changes: { propertyCode: unit.propertyCode, unitCode: unit.code } }, req);
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
