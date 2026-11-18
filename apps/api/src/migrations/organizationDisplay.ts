// One-off: title-case organization names, hide the isolation organization from the
// public sign-in list and report any "(thử nghiệm)" left in visible names.
// Dry run by default; writing needs ORG_DISPLAY_CONFIRM=apply.
import mongoose from "mongoose";
import { connectDatabase } from "../db.js";

const CHANGES = [
  { slug: "caseflow-rental", set: { name: "CaseFlow Căn Hộ" } },
  { slug: "caseflow-rental-isolation", set: { name: "Căn Hộ Đối Chứng Cách Ly", "settings.listedOnLogin": false } }
];
const apply = process.env.ORG_DISPLAY_CONFIRM === "apply";

await connectDatabase();
const db = mongoose.connection.db!;
try {
  const report: Record<string, unknown> = { mode: apply ? "apply" : "dry-run" };
  for (const change of CHANGES) {
    const org = await db.collection("organizations").findOne({ slug: change.slug }, { projection: { name: 1, settings: 1 } });
    report[change.slug] = org ? { from: org.name, to: change.set.name, listedOnLogin: "settings.listedOnLogin" in change.set ? false : org.settings?.listedOnLogin ?? true } : "missing";
    if (org && apply) await db.collection("organizations").updateOne({ _id: org._id }, { $set: change.set });
  }
  const marker = /\(thử nghiệm\)/i;
  const leftovers: Record<string, number> = {};
  for (const [collection, field] of [["organizations", "name"], ["rentalproperties", "name"], ["services", "name"], ["users", "name"], ["caserecords", "title"]] as const) {
    const count = await db.collection(collection).countDocuments({ [field]: { $regex: marker } });
    if (count) leftovers[collection] = count;
  }
  report.leftoverTestLabels = leftovers;
  console.log(JSON.stringify(report, null, 2));
} finally {
  await mongoose.disconnect();
}
