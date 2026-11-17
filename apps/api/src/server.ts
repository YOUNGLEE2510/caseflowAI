import { app } from "./app.js";
import { config } from "./config.js";
import { connectDatabase } from "./db.js";
import { createServerlessApp } from "./serverlessApp.js";
import { createMaintenanceTrigger, vercelWaitUntil } from "./serverlessMaintenance.js";
import { acquireJobLease } from "./services/jobLease.js";
import { runSlaCheck } from "./jobs/slaChecker.js";
import { processCaseDeliveries } from "./jobs/caseDelivery.js";
import { processEmailOutbox } from "./services/emailOutbox.js";
import { recoverAttachmentUploads } from "./services/attachmentUploads.js";

// Vercel entrypoint. Local/Docker deployments continue to use src/index.ts and its interval workers.
// No seed, migrations or timers here; due background work runs after responses (see serverlessMaintenance.ts).
const maintenance = createMaintenanceTrigger([
  { key: "email-delivery", intervalMs: 60_000, run: () => processCaseDeliveries().then(() => processEmailOutbox()) },
  { key: "sla-check", intervalMs: config.SLA_CHECK_INTERVAL_MINUTES * 60_000, run: runSlaCheck },
  { key: "upload-recovery", intervalMs: 5 * 60_000, run: recoverAttachmentUploads }
], { acquire: acquireJobLease, defer: vercelWaitUntil });

export default createServerlessApp(app, connectDatabase, maintenance);
