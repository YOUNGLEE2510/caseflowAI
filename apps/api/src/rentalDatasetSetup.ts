// Fills the rental demo organization with a synthetic, deterministic dataset.
// Default is a dry run. Writing needs RENTAL_DATASET_CONFIRM=caseflow-rental-demo;
// replacing an earlier synthetic dataset also needs RENTAL_DATASET_REPLACE=sim-rental-v1.
// Staff accounts come from rentalSetup.ts; this tool only adds residents and operating history.
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { config } from "./config.js";
import { connectDatabase } from "./db.js";
import { Organization, User, CaseRecord, Incident, Notification } from "./models.js";
import { RentalProperty, RentalUnit, RentalAsset, MaintenanceTask } from "./models/rental.js";
import {
  DATASET_CASE_PREFIX, DATASET_INCIDENT_PREFIX, DATASET_RESIDENT_CODE_PREFIX, DATASET_TAG, DATASET_TASK_PREFIX, generateRentalDataset
} from "./demo/rentalDataset.js";
import { STAFF, STAFF_EMAILS, TEAM_BY_CATEGORY } from "./demo/rentalOrg.js";

const slug = "caseflow-rental-demo";
const nowOverride = process.env.RENTAL_DATASET_NOW ? new Date(process.env.RENTAL_DATASET_NOW) : undefined;
if (nowOverride && Number.isNaN(nowOverride.getTime())) throw new Error("RENTAL_DATASET_NOW is not a valid date");
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const syntheticResidents = { role: "requester", employeeCode: new RegExp(`^${escape(DATASET_RESIDENT_CODE_PREFIX)}`) };

function databaseTarget() {
  try {
    return { host: new URL(config.MONGODB_URI).hostname, database: config.MONGODB_DB };
  } catch {
    return { host: "unparsed", database: config.MONGODB_DB };
  }
}

async function insertValidated(model: mongoose.Model<any>, rows: Record<string, unknown>[]) {
  // Validate with the schema (also fills search tokens), then insert raw so the
  // historical createdAt/updatedAt values are kept and no delivery hooks run.
  for (let index = 0; index < rows.length; index += 200) {
    const documents = rows.slice(index, index + 200).map(row => new model(row));
    for (const document of documents) await document.validate();
    if (documents.length) await model.collection.insertMany(documents.map(document => document.toObject({ depopulate: true, virtuals: false })));
  }
}

await connectDatabase();
try {
  if (config.DEPLOYMENT_MODE === "pilot") throw new Error("Synthetic data is not allowed in pilot mode.");
  const organization = await Organization.findOne({ slug });
  if (!organization) throw new Error(`Organization ${slug} does not exist. Run rentalSetup.ts first.`);
  if (organization.settings?.serviceDomain !== "rental") throw new Error("Organization domain conflict");
  const organizationId = organization._id as mongoose.Types.ObjectId;
  const staffUsers = await User.find({ organizationId, email: { $in: Object.values(STAFF_EMAILS) } }).select("email").lean<Array<{ _id: mongoose.Types.ObjectId; email: string }>>();
  const staffIds = new Map(STAFF.map(member => [member.key, staffUsers.find(user => user.email === STAFF_EMAILS[member.key])?._id]));
  const missingStaff = STAFF.filter(member => !staffIds.get(member.key)).map(member => STAFF_EMAILS[member.key]);
  const dataset = generateRentalDataset({ seed: process.env.RENTAL_DATASET_SEED || DATASET_TAG, now: nowOverride });
  const existing = await CaseRecord.countDocuments({ organizationId, tags: DATASET_TAG });
  const residents = dataset.users.filter(user => user.role === "requester");
  const plan = {
    target: { organization: slug, ...databaseTarget() }, existingSyntheticCases: existing, missingStaff,
    planned: { properties: dataset.properties.length, units: dataset.units.length, assets: dataset.assets.length,
      residents: residents.length, cases: dataset.cases.length, incidents: dataset.incidents.length, maintenanceTasks: dataset.tasks.length },
    window: { from: dataset.start.toISOString(), to: dataset.now.toISOString() }
  };
  if (process.env.RENTAL_DATASET_CONFIRM !== slug) {
    console.log(JSON.stringify({ mode: "dry-run", ...plan,
      operation: "Add synthetic properties, units, assets, residents, cases, incidents and maintenance tasks to the rental demo organization." }, null, 2));
  } else {
    if (missingStaff.length) throw new Error(`Staff accounts missing (${missingStaff.length}). Run rentalSetup.ts first.`);
    if (existing && process.env.RENTAL_DATASET_REPLACE !== DATASET_TAG) {
      throw new Error(`Synthetic dataset already present (${existing} cases). Set RENTAL_DATASET_REPLACE=${DATASET_TAG} to remove and regenerate only synthetic records.`);
    }
    if (existing || await User.exists({ organizationId, ...syntheticResidents })) {
      // Remove only records created by this tool; staff and hand-made demo data are untouched.
      const caseIds = (await CaseRecord.find({ organizationId, tags: DATASET_TAG }).select("_id").lean()).map(item => item._id);
      const userIds = (await User.find({ organizationId, ...syntheticResidents }).select("_id").lean()).map(item => item._id);
      await Notification.deleteMany({ organizationId, $or: [{ relatedCaseId: { $in: caseIds } }, { userId: { $in: userIds } }] });
      await CaseRecord.deleteMany({ organizationId, _id: { $in: caseIds } });
      await Incident.deleteMany({ organizationId, code: new RegExp(`^${escape(DATASET_INCIDENT_PREFIX)}`) });
      await MaintenanceTask.deleteMany({ organizationId, key: new RegExp(`^${escape(DATASET_TASK_PREFIX)}`) });
      await RentalAsset.deleteMany({ organizationId, code: { $in: dataset.assets.map(item => item.code) } });
      await RentalUnit.deleteMany({ organizationId, propertyCode: { $in: dataset.properties.map(item => item.code) } });
      await RentalProperty.deleteMany({ organizationId, code: { $in: dataset.properties.map(item => item.code) } });
      await User.deleteMany({ organizationId, _id: { $in: userIds } });
    }
    const conflicts = await CaseRecord.countDocuments({ code: new RegExp(`^${escape(DATASET_CASE_PREFIX)}`) });
    if (conflicts) throw new Error("Case codes with the synthetic prefix exist outside this dataset; nothing was written.");
    const emailConflicts = await User.countDocuments({ organizationId, email: { $in: residents.map(user => user.email) } });
    if (emailConflicts) throw new Error("Resident email addresses already exist in the organization; nothing was written.");

    // Synthetic residents cannot sign in: their password is random and never stored.
    const residentHash = await bcrypt.hash(randomBytes(32).toString("base64url"), 12);
    const userIds = new Map<string, mongoose.Types.ObjectId>([...staffIds].map(([key, value]) => [key, value!]));
    for (const resident of residents) userIds.set(resident.key, new mongoose.Types.ObjectId());
    const id = (key: string | null) => (key ? userIds.get(key)! : null);
    await insertValidated(User, residents.map(user => ({
      _id: userIds.get(user.key), organizationId, email: user.email, name: user.name, role: "requester", passwordHash: residentHash,
      team: "", title: user.title, active: user.active, joinedAt: user.joinedAt, employeeCode: user.employeeCode,
      createdAt: user.joinedAt || dataset.start, updatedAt: dataset.now
    })));
    await insertValidated(RentalProperty, dataset.properties.map(item => ({ organizationId, code: item.code, name: item.name, address: item.address, active: true })));
    await insertValidated(RentalUnit, dataset.units.map(unit => ({ organizationId, propertyCode: unit.propertyCode, code: unit.code, floor: unit.floor,
      residentIds: unit.residentKeys.map(key => userIds.get(key)), occupancyStatus: unit.occupancyStatus, readinessStatus: unit.readinessStatus,
      availableFrom: unit.availableFrom, statusNote: unit.statusNote, statusUpdatedAt: unit.statusUpdatedAt, statusUpdatedByName: "Dữ liệu mô phỏng" })));
    await insertValidated(RentalAsset, dataset.assets.map(asset => ({ organizationId, code: asset.code, propertyCode: asset.propertyCode,
      unitCode: asset.unitCode, name: asset.name, category: asset.category, active: true })));

    const caseIds = new Map(dataset.cases.map(item => [item.code, new mongoose.Types.ObjectId()]));
    await insertValidated(CaseRecord, dataset.cases.map(item => ({
      _id: caseIds.get(item.code), organizationId, code: item.code, title: item.title, description: item.description,
      serviceKey: item.category, category: item.category, priority: item.priority, status: item.status, channel: item.channel,
      requesterId: id(item.requesterKey), requesterName: item.requesterName, createdById: id(item.createdByKey), createdByName: item.createdByName,
      assigneeId: id(item.assigneeKey), assigneeName: item.assigneeName, team: item.team, dueAt: item.dueAt,
      resolvedAt: item.resolvedAt, closedAt: item.closedAt, slaBreached: item.slaBreached, slaBreachedAt: item.slaBreachedAt,
      slaStartedAt: item.slaStartedAt, slaPausedAt: item.slaPausedAt, slaPausedHours: item.slaPausedHours,
      attachmentCount: 0, attachmentBytes: 0, attachmentCountersReconciled: true, transferCount: item.transferCount, reopenCount: item.reopenCount,
      cycles: item.cycles.map(cycle => ({ ...cycle, team: item.team, serviceKey: item.category })),
      satisfaction: item.satisfaction, satisfactionComment: item.satisfactionComment, satisfactionAt: item.satisfactionAt,
      propertyCode: item.propertyCode, unitCode: item.unitCode, ...(item.assetCode ? { assetCode: item.assetCode } : {}), tags: item.tags,
      ai: { ...item.ai, processingStatus: "complete", modelVersion: "synthetic-dataset-v1", reviewedById: id(item.ai.reviewedByKey),
        extracted: {}, similarCaseIds: [] },
      events: item.events.map(event => ({ type: event.type, label: event.label, actorId: id(event.actorKey), actorName: event.actorName,
        internal: event.internal, metadata: event.metadata || {}, createdAt: event.createdAt })),
      comments: item.comments.map(comment => ({ authorId: id(comment.authorKey), authorName: comment.authorName, body: comment.body,
        internal: comment.internal, createdAt: comment.createdAt })),
      createdAt: item.createdAt, updatedAt: item.updatedAt
    })));
    await insertValidated(Incident, dataset.incidents.map(incident => ({
      organizationId, code: incident.code, title: incident.title, summary: incident.summary, severity: incident.severity, status: incident.status,
      team: dataset.cases.find(item => item.code === incident.caseCodes[0])?.team || TEAM_BY_CATEGORY.general_support,
      propertyCode: incident.propertyCode, appointmentAt: incident.appointmentAt, ownerId: id(incident.ownerKey), ownerName: incident.ownerName,
      caseIds: incident.caseCodes.map(code => caseIds.get(code)), affectedCount: incident.caseCodes.length,
      signal: { clusterScore: incident.clusterScore, growthRate: 0, keywords: incident.keywords, detectionConfidence: incident.clusterScore },
      responseTimeline: incident.responseTimeline, detectedAt: incident.detectedAt, resolvedAt: incident.resolvedAt,
      rootCause: incident.rootCause, resolution: incident.resolution, createdAt: incident.detectedAt,
      updatedAt: incident.responseTimeline.at(-1)?.createdAt || incident.detectedAt
    })));
    await insertValidated(MaintenanceTask, dataset.tasks.map(task => ({
      organizationId, key: task.key, fingerprint: task.key, propertyCode: task.propertyCode, assetCode: task.assetCode, title: task.title,
      dueAt: task.dueAt, assigneeId: id(task.assigneeKey), status: task.status, result: task.result, completedAt: task.completedAt,
      createdAt: task.createdAt, updatedAt: task.updatedAt
    })));
    console.log(JSON.stringify({ mode: "written", ...plan, replaced: existing }, null, 2));
  }
} finally {
  await mongoose.disconnect();
}
