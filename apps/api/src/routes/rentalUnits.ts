// Unit board: occupancy (who holds the unit) and readiness (is it clean/repaired) per unit.
import { Router, type Request } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { requireRoles } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import { CaseRecord, User } from "../models.js";
import { RentalProperty, RentalUnit, UNIT_OCCUPANCY, UNIT_READINESS } from "../models/rental.js";
import { auditFromReq, logAudit } from "../services/helpers.js";

export const rentalUnitsRouter = Router();
const staff = requireRoles("agent", "manager", "org_admin", "platform_admin");
const code = z.string().trim().regex(/^[a-z\d-]{1,32}$/i).transform(value => value.toUpperCase());

interface BoardUnit {
  _id: mongoose.Types.ObjectId; propertyCode: string; code: string; floor: string; residentIds: mongoose.Types.ObjectId[];
  occupancyStatus?: string; readinessStatus?: string; availableFrom?: Date | null; statusNote?: string;
  statusUpdatedAt?: Date | null; statusUpdatedByName?: string; qrEnabled?: boolean
}
// A unit can be offered to a new tenant only when nobody holds it and it is physically ready.
export const isRentable = (unit: Pick<BoardUnit, "occupancyStatus" | "readinessStatus" | "residentIds">) =>
  (unit.occupancyStatus || "vacant") === "vacant" && (unit.readinessStatus || "ready") === "ready" && !(unit.residentIds || []).length;

rentalUnitsRouter.get("/rental/units", staff, async (req, res) => {
  const organizationId = new mongoose.Types.ObjectId(req.auth!.organizationId);
  const filter = z.object({ propertyCode: code.optional(), view: z.enum(["board", "summary"]).default("board") })
    .parse({ propertyCode: req.query.propertyCode || undefined, view: req.query.view || undefined });
  const [properties, units, openCases] = await Promise.all([
    RentalProperty.find({ organizationId, active: true }).select("code name address").sort({ code: 1 }).limit(100).lean(),
    RentalUnit.find({ organizationId, ...(filter.propertyCode ? { propertyCode: filter.propertyCode } : {}) })
      .select("propertyCode code floor residentIds occupancyStatus readinessStatus availableFrom statusNote statusUpdatedAt statusUpdatedByName qrEnabled")
      .sort({ propertyCode: 1, code: 1 }).limit(1000).lean<BoardUnit[]>(),
    // The overview only needs counts: skip the per-unit open-case aggregation.
    filter.view === "summary" ? Promise.resolve([]) : CaseRecord.aggregate<{ _id: { propertyCode: string; unitCode: string }; open: number }>([
      { $match: { organizationId, unitCode: { $type: "string" }, status: { $nin: ["resolved", "closed"] } } },
      { $group: { _id: { propertyCode: "$propertyCode", unitCode: "$unitCode" }, open: { $sum: 1 } } }
    ])
  ]);
  const open = new Map(openCases.map(row => [`${row._id.propertyCode}/${row._id.unitCode}`, row.open]));
  const rows = units.map(unit => ({
    propertyCode: unit.propertyCode, code: unit.code, floor: unit.floor, residentCount: (unit.residentIds || []).length,
    occupancyStatus: unit.occupancyStatus || "vacant", readinessStatus: unit.readinessStatus || "ready",
    availableFrom: unit.availableFrom || null, statusNote: unit.statusNote || "", statusUpdatedAt: unit.statusUpdatedAt || null,
    statusUpdatedByName: unit.statusUpdatedByName || "", openCases: open.get(`${unit.propertyCode}/${unit.code}`) || 0,
    rentable: isRentable(unit), qrEnabled: Boolean(unit.qrEnabled)
  }));
  const count = (predicate: (row: typeof rows[number]) => boolean) => rows.filter(predicate).length;
  const summary = {
      total: rows.length, rentable: count(row => row.rentable),
      occupancy: Object.fromEntries(UNIT_OCCUPANCY.map(key => [key, count(row => row.occupancyStatus === key)])),
      readiness: Object.fromEntries(UNIT_READINESS.map(key => [key, count(row => row.readinessStatus === key)]))
  };
  if (filter.view === "summary") { res.json({ summary }); return; }
  res.json({ properties, units: rows, summary });
});

async function findUnit(req: Request, history = false) {
  const query = RentalUnit.findOne({ organizationId: req.auth!.organizationId, propertyCode: code.parse(String(req.params.property)), code: code.parse(String(req.params.code)) });
  const unit = await (history ? query.select("+statusHistory") : query).lean<BoardUnit & { statusHistory?: unknown[] }>();
  if (!unit) throw new HttpError(404, "Không tìm thấy căn hộ.");
  return unit;
}

rentalUnitsRouter.get("/rental/units/:property/:code/status", staff, async (req, res) => {
  const unit = await findUnit(req, true);
  const canSeeResidents = req.auth!.role !== "agent";
  const residents = canSeeResidents && unit.residentIds?.length
    ? await User.find({ _id: { $in: unit.residentIds }, organizationId: req.auth!.organizationId }).select("name email active").lean() : [];
  res.json({ history: (unit.statusHistory || []).slice(-50).reverse(),
    residents: residents.map(person => ({ _id: String(person._id), name: person.name, email: person.email, active: person.active })) });
});

const statusSchema = z.object({
  occupancyStatus: z.enum(UNIT_OCCUPANCY).optional(),
  readinessStatus: z.enum(UNIT_READINESS).optional(),
  // z.iso.date() rejects impossible days such as 2026-02-31 instead of rolling them over.
  availableFrom: z.string().datetime({ offset: true }).or(z.iso.date()).nullable().optional(),
  releaseResidents: z.boolean().optional(),
  note: z.string().trim().min(3).max(300)
}).strict();

rentalUnitsRouter.patch("/rental/units/:property/:code/status", staff, async (req, res) => {
  const input = statusSchema.parse(req.body);
  const unit = await findUnit(req);
  // Field staff (cleaning, technicians) report physical readiness; leasing decisions stay with managers.
  if (req.auth!.role === "agent" && (input.occupancyStatus || input.releaseResidents || input.availableFrom !== undefined)) {
    throw new HttpError(403, "Nhân viên chỉ cập nhật tình trạng dọn dẹp/sửa chữa của căn.");
  }
  const currentOccupancy = unit.occupancyStatus || "vacant";
  const currentReadiness = unit.readinessStatus || "ready";
  let residentIds = unit.residentIds || [];
  let readiness = input.readinessStatus;
  if (input.releaseResidents) {
    if (input.occupancyStatus !== "vacant") throw new HttpError(422, "Chỉ gỡ người thuê khi chuyển căn về trạng thái trống.");
    residentIds = [];
    readiness ||= "needs_cleaning"; // a returned unit always needs a turnover clean
  }
  if (input.occupancyStatus === "vacant" && residentIds.length) throw new HttpError(422, "Căn còn người thuê. Chọn gỡ người thuê khi trả căn.");
  if (input.occupancyStatus && ["occupied", "notice"].includes(input.occupancyStatus) && !residentIds.length) {
    throw new HttpError(422, "Gán người thuê cho căn trước khi chuyển sang đang cho thuê.");
  }
  const changes: Array<{ axis: "occupancy" | "readiness"; from: string; to: string }> = [];
  if (input.occupancyStatus && input.occupancyStatus !== currentOccupancy) changes.push({ axis: "occupancy", from: currentOccupancy, to: input.occupancyStatus });
  if (readiness && readiness !== currentReadiness) changes.push({ axis: "readiness", from: currentReadiness, to: readiness });
  const availableFrom = input.availableFrom === undefined ? undefined : input.availableFrom ? new Date(input.availableFrom) : null;
  if (!changes.length && availableFrom === undefined) throw new HttpError(422, "Không có thay đổi trạng thái.");
  const now = new Date();
  await RentalUnit.updateOne({ _id: unit._id, organizationId: req.auth!.organizationId }, {
    $set: {
      ...(input.occupancyStatus ? { occupancyStatus: input.occupancyStatus } : {}), ...(readiness ? { readinessStatus: readiness } : {}),
      ...(availableFrom !== undefined ? { availableFrom } : {}), ...(input.releaseResidents ? { residentIds: [] } : {}),
      statusNote: input.note, statusUpdatedAt: now, statusUpdatedByName: req.auth!.name
    },
    ...(changes.length ? { $push: { statusHistory: { $each: changes.map(change => ({ ...change, note: input.note, actorName: req.auth!.name, at: now })), $slice: -200 } } } : {})
  });
  await logAudit({ ...auditFromReq(req), action: "rental.unit.status", resource: "unit", resourceId: String(unit._id),
    changes: { propertyCode: unit.propertyCode, unitCode: unit.code, transitions: changes, releasedResidents: Boolean(input.releaseResidents) } }, req);
  res.status(204).end();
});
