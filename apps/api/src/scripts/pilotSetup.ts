// Pilot setup for the manual vs assisted user study (docs/study/README.md, section 3).
//
// Creates, in one organization:
//   - participant accounts p01…pNN (role manager, pseudonymous names, studyCode set),
//     with the first condition set by a Latin square: order of conditions and of the
//     scenario groups g1/g2 are both counterbalanced across participants;
//   - one inactive pilot requester that "sends" the scenario requests;
//   - for each participant, a private copy of every scenario (code PL-P01-G1-01…), tagged
//     with study.scenarioGroup, received as "Hỗ trợ chung" so the participant must route it,
//     then analysed by the normal AI triage (assisted participants need its suggestions).
//
// Dry run by default. Writing needs --apply and the exact --org slug. Idempotent: existing
// participants and case copies are kept; passwords are only issued to new accounts (or
// re-issued with --reset-passwords) and written to artifacts/pilot/, never to stdout.
//
//   npm run pilot:setup -- --org <slug> --cases ../../docs/study/pilot_cases.csv [--participants 8] [--apply]
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { config } from "../config.js";
import { connectDatabase } from "../db.js";
import { processCaseTriage } from "../jobs/caseTriage.js";
import { CaseRecord, Organization, ServiceDefinition, User } from "../models.js";
import { addBusinessHours, organizationCalendar } from "../services/workingHours.js";

export type ScenarioGroup = "g1" | "g2";
export interface Scenario { group: ScenarioGroup; title: string; description: string }
export interface ParticipantPlan { code: string; firstCondition: "manual" | "assisted"; firstGroup: ScenarioGroup }

/** Minimal RFC 4180 reader: quoted fields, doubled quotes, CRLF, BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const source = text.replace(/^﻿/, "");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell); cell = "";
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

export function readScenarios(text: string): Scenario[] {
  const [header, ...rows] = parseCsv(text);
  const columns = (header || []).map(name => name.trim().toLowerCase());
  const index = (name: string) => columns.indexOf(name);
  if (index("group") < 0 || index("title") < 0 || index("description") < 0) throw new Error("Scenario CSV needs the columns group,title,description.");
  const scenarios = rows.map((row, line) => {
    const group = row[index("group")]?.trim().toLowerCase();
    const title = row[index("title")]?.trim() || "";
    const description = row[index("description")]?.trim() || "";
    if (group !== "g1" && group !== "g2") throw new Error(`Row ${line + 2}: group must be g1 or g2.`);
    if (title.length < 3 || title.length > 120) throw new Error(`Row ${line + 2}: title must be 3–120 characters.`);
    if (description.length < 12 || description.length > 5000) throw new Error(`Row ${line + 2}: description must be 12–5000 characters.`);
    return { group, title, description } as Scenario;
  });
  for (const group of ["g1", "g2"] as const) {
    const count = scenarios.filter(item => item.group === group).length;
    if (count < 1 || count > 20) throw new Error(`Group ${group} needs 1–20 scenarios (has ${count}).`);
  }
  return scenarios;
}

/** Latin square: condition order alternates every participant, group order every two. */
export function participantPlan(count: number): ParticipantPlan[] {
  if (!Number.isInteger(count) || count < 1 || count > 99) throw new Error("--participants must be 1–99.");
  return Array.from({ length: count }, (_, i) => ({
    code: `p${String(i + 1).padStart(2, "0")}`,
    firstCondition: i % 2 === 0 ? "manual" : "assisted",
    firstGroup: Math.floor(i / 2) % 2 === 0 ? "g1" : "g2"
  }));
}

export const pilotCaseCode = (participant: string, group: ScenarioGroup, index: number) =>
  `PL-${participant.toUpperCase()}-${group.toUpperCase()}-${String(index).padStart(2, "0")}`;

/** 18 random bytes → 24 URL-safe characters: within the 10-character minimum and the 72-byte bcrypt limit. */
const newPassword = () => randomBytes(18).toString("base64url");
const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

async function main() {
  const { values } = parseArgs({ options: {
    org: { type: "string" }, cases: { type: "string" }, participants: { type: "string", default: "8" },
    "email-domain": { type: "string", default: "canho.local" }, apply: { type: "boolean", default: false },
    "reset-passwords": { type: "boolean", default: false }, "skip-triage": { type: "boolean", default: false }
  } });
  if (!values.org || !values.cases) throw new Error("Usage: --org <slug> --cases <scenarios.csv> [--participants 8] [--apply]");
  const domain = values["email-domain"]!.trim().toLowerCase();
  if (!/^[a-z\d.-]+\.[a-z]{2,}$/.test(domain)) throw new Error("--email-domain is not a valid domain.");
  const scenarios = readScenarios(await readFile(resolve(values.cases), "utf8"));
  const plan = participantPlan(Number(values.participants));
  const apply = values.apply;

  await connectDatabase();
  try {
    const organization = await Organization.findOne({ slug: values.org }).lean<any>();
    if (!organization) throw new Error(`Organization "${values.org}" not found.`);
    const service = await ServiceDefinition.findOne({ organizationId: organization._id, key: "general_support", active: true }).lean<any>();
    if (!service) throw new Error("The organization has no active general_support service to receive the scenarios.");
    const host = (() => { try { return new URL(config.MONGODB_URI.replace(/^mongodb(\+srv)?:/, "http:")).hostname; } catch { return "unknown"; } })();
    const report: Record<string, unknown> = { mode: apply ? "apply" : "dry-run", database: `${host}/${config.MONGODB_DB}`,
      organization: organization.slug, scenarios: { g1: scenarios.filter(s => s.group === "g1").length, g2: scenarios.filter(s => s.group === "g2").length } };

    // Pilot requester: owns the scenario requests, cannot sign in.
    const requesterEmail = `pilot.resident@${domain}`;
    let requester = await User.findOne({ organizationId: organization._id, email: requesterEmail }).select("_id name role").lean<any>();
    if (requester && requester.role !== "requester") throw new Error(`${requesterEmail} exists with role ${requester.role}.`);
    if (!requester && apply) requester = (await User.create({ organizationId: organization._id, email: requesterEmail,
      name: "Người thuê (pilot)", role: "requester", active: false, passwordHash: await bcrypt.hash(newPassword(), 10) })).toObject();

    const credentials: string[][] = [];
    const participants: Record<string, unknown>[] = [];
    const casesToTriage: string[] = [];
    let casesCreated = 0, casesKept = 0;
    for (const item of plan) {
      const email = `pilot.${item.code}@${domain}`;
      let user = await User.findOne({ organizationId: organization._id, studyCode: item.code }).select("_id email role").lean<any>();
      if (user && user.email !== email) throw new Error(`Study code ${item.code} already belongs to another account; resolve it before running.`);
      if (!user) {
        const clash = await User.findOne({ organizationId: organization._id, email }).select("role studyCode").lean<any>();
        if (clash) throw new Error(`${email} exists without study code ${item.code}; resolve it before running.`);
      }
      let password = "";
      let action = user ? "kept" : "create";
      if (apply && !user) {
        password = newPassword();
        user = (await User.create({ organizationId: organization._id, email, name: `Người tham gia ${item.code}`, role: "manager",
          title: "Người tham gia thử nghiệm", passwordHash: await bcrypt.hash(password, 10), active: true, studyCode: item.code,
          aiSuggestionsHidden: item.firstCondition === "manual", aiVisibilityChangedAt: new Date() })).toObject();
      } else if (apply && user && values["reset-passwords"]) {
        password = newPassword();
        await User.updateOne({ _id: user._id }, { $set: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: false }, $inc: { tokenVersion: 1 } });
        action = "kept, password reset";
      }
      if (password) credentials.push([item.code, email, password, item.firstCondition, item.firstGroup]);

      let index = { g1: 0, g2: 0 };
      for (const scenario of scenarios) {
        index = { ...index, [scenario.group]: index[scenario.group] + 1 };
        const code = pilotCaseCode(item.code, scenario.group, index[scenario.group]);
        if (await CaseRecord.exists({ code })) { casesKept += 1; continue; }
        casesCreated += 1;
        if (!apply) continue;
        const record = await CaseRecord.create({
          organizationId: organization._id, code, title: scenario.title, description: scenario.description,
          serviceKey: service.key, category: service.category, priority: "normal", status: "new", channel: "portal",
          requesterId: requester._id, requesterName: requester.name, createdById: requester._id, createdByName: requester.name,
          team: service.team, dueAt: addBusinessHours(new Date(), service.slaHours, organizationCalendar(organization.settings)),
          study: { scenarioGroup: scenario.group },
          ai: { processingStatus: "queued", reviewStatus: "pending", riskScore: 0, riskFactors: [], similarCaseIds: [] },
          events: [{ type: "created", label: "Tiếp nhận từ kênh portal", actorId: requester._id, actorName: requester.name },
            { type: "ai_triage", label: `Đã tiếp nhận tại ${service.team}; đang chờ phân tích tự động và nhân viên xác nhận`, actorName: "CaseFlow AI" }]
        });
        casesToTriage.push(String(record._id));
      }
      participants.push({ code: item.code, email, action, firstCondition: item.firstCondition, firstGroup: item.firstGroup });
    }
    report.participants = participants;
    report.cases = { create: casesCreated, kept: casesKept };

    if (apply && casesToTriage.length && !values["skip-triage"]) {
      for (const caseId of casesToTriage) await processCaseTriage({ caseId, organizationId: String(organization._id) });
    }
    if (apply) {
      const statuses = await CaseRecord.aggregate([{ $match: { organizationId: organization._id, code: /^PL-P\d{2}-G[12]-\d{2}$/ } },
        { $group: { _id: "$ai.processingStatus", count: { $sum: 1 } } }]);
      report.aiProcessing = Object.fromEntries(statuses.map(row => [row._id, row.count]));
    }
    if (credentials.length) {
      // Repository-level artifacts/ is gitignored.
      const file = resolve(dirname(import.meta.filename), "../../../../artifacts/pilot", `pilot-accounts-${organization.slug}.csv`);
      await mkdir(dirname(file), { recursive: true });
      const rows = [["participant", "email", "password", "first_condition", "first_group"], ...credentials];
      await writeFile(file, "﻿" + rows.map(row => row.map(csvCell).join(",")).join("\r\n"), { flag: "w", mode: 0o600 });
      report.credentialsFile = file;
    }
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] && resolve(process.argv[1]).replace(/\.[jt]s$/, "") === resolve(import.meta.filename).replace(/\.[jt]s$/, "")) {
  main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
