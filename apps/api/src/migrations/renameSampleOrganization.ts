// One-off rename of the rental sample organizations: removes "demo" from slugs, names,
// login emails and scripted record codes. Dry run by default; writing needs
// RENAME_CONFIRM=caseflow-rental. Passwords, ids and history are left untouched.
import mongoose from "mongoose";
import { connectDatabase } from "../db.js";

const ORGS = [
  { from: "caseflow-rental-demo", to: "caseflow-rental", name: "CaseFlow Căn hộ" },
  { from: "caseflow-rental-isolation-demo", to: "caseflow-rental-isolation", name: "Căn hộ - Đối chứng cách ly" }
];
const EMAIL = /@((?:cudan\.)?)canho-demo\.local$/;
const apply = process.env.RENAME_CONFIRM === "caseflow-rental";

await connectDatabase();
const db = mongoose.connection.db!;
const report: Record<string, unknown> = { mode: apply ? "apply" : "dry-run" };
try {
  const orgs = db.collection("organizations");
  const orgIds: mongoose.Types.ObjectId[] = [];
  for (const org of ORGS) {
    const source = await orgs.findOne({ slug: org.from });
    const target = await orgs.findOne({ slug: org.to });
    report[org.from] = { found: Boolean(source), targetSlugTaken: Boolean(target) };
    if (target && source) throw new Error(`Slug ${org.to} already exists`);
    if (!source) continue;
    orgIds.push(source._id as mongoose.Types.ObjectId);
    if (apply) await orgs.updateOne({ _id: source._id }, { $set: { slug: org.to, name: org.name } });
  }
  if (!orgIds.length) { report.note = "Nothing to rename."; }
  else {
    const users = db.collection("users");
    const matched = await users.find({ organizationId: { $in: orgIds }, email: { $regex: EMAIL } }).project({ email: 1, organizationId: 1 }).toArray();
    const renamed = matched.map(user => ({ _id: user._id, organizationId: user.organizationId, email: String(user.email).replace(EMAIL, "@$1canho.local") }));
    const clashes = await users.countDocuments({ $or: renamed.map(user => ({ organizationId: user.organizationId, email: user.email })) });
    report.users = { toRename: renamed.length, clashes };
    if (clashes) throw new Error("New emails would collide with existing accounts");

    const cases = db.collection("caserecords");
    const scripted = await cases.find({ organizationId: { $in: orgIds }, code: { $regex: /^RENTAL-DEMO-/ } }).project({ code: 1, organizationId: 1 }).toArray();
    const caseClashes = scripted.length ? await cases.countDocuments({ $or: scripted.map(item => ({ organizationId: item.organizationId, code: String(item.code).replace("RENTAL-DEMO-", "RENTAL-") })) }) : 0;
    report.cases = { toRename: scripted.length, clashes: caseClashes };
    if (caseClashes) throw new Error("New case codes would collide");
    report.incidents = await db.collection("incidents").countDocuments({ organizationId: { $in: orgIds }, code: { $regex: /^INC-DEMO-/ } });
    report.tasks = await db.collection("maintenancetasks").countDocuments({ organizationId: { $in: orgIds }, key: { $regex: /^rental-demo-task-/ } });
    report.knowledge = await db.collection("knowledgearticles").countDocuments({ organizationId: { $in: orgIds }, version: "demo-1" });

    if (apply) {
      for (const user of renamed) await users.updateOne({ _id: user._id }, { $set: { email: user.email } });
      for (const item of scripted) await cases.updateOne({ _id: item._id }, { $set: { code: String(item.code).replace("RENTAL-DEMO-", "RENTAL-") } });
      await db.collection("incidents").updateMany({ organizationId: { $in: orgIds }, code: { $regex: /^INC-DEMO-/ } }, [{ $set: { code: { $replaceOne: { input: "$code", find: "INC-DEMO-", replacement: "INC-" } } } }]);
      await db.collection("maintenancetasks").updateMany({ organizationId: { $in: orgIds }, key: { $regex: /^rental-demo-task-/ } }, [{ $set: {
        key: { $replaceOne: { input: "$key", find: "rental-demo-task-", replacement: "rental-task-" } },
        fingerprint: { $replaceOne: { input: "$fingerprint", find: "rental-demo-task-", replacement: "rental-task-" } } } }]);
      await db.collection("knowledgearticles").updateMany({ organizationId: { $in: orgIds }, version: "demo-1" }, { $set: { version: "v1" } });
    }

    // Report any other visible text that still says "demo" (names, titles), without changing it.
    const leftovers: Record<string, number> = {};
    for (const [collection, fields] of Object.entries({ users: ["name", "title"], services: ["name", "description"], caserecords: ["title"], rentalproperties: ["name"], knowledgearticles: ["title"], incidents: ["title"] })) {
      const count = await db.collection(collection).countDocuments({ organizationId: { $in: orgIds }, $or: fields.map(field => ({ [field]: { $regex: /demo/i } })) });
      if (count) leftovers[collection] = count;
    }
    report.leftoverDemoText = leftovers;
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await mongoose.disconnect();
}
