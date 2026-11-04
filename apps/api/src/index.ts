import mongoose from "mongoose";
import { app } from "./app.js";
import { config } from "./config.js";
import { connectDatabase } from "./db.js";
import { runSlaCheck } from "./jobs/slaChecker.js";
import { createSlaScheduler } from "./jobs/slaScheduler.js";
import { seedDatabase } from "./seed.js";
import { initializeObjectStorage } from "./services/objectStorage.js";
import { processEmailOutbox, migrateLegacyEmailEncryption } from "./services/emailOutbox.js";
import { ensureCaseSearchIndex } from "./services/caseSearchMigration.js";
import { processCaseDeliveries } from "./jobs/caseDelivery.js";
import { processCaseTriage } from "./jobs/caseTriage.js";
import { recoverAttachmentUploads } from "./services/attachmentUploads.js";

async function bootstrap() {
  await connectDatabase();
  await migrateLegacyEmailEncryption();
  await initializeObjectStorage();
  if (config.AUTO_SEED) await seedDatabase(false);
  await ensureCaseSearchIndex();

  const server = app.listen(config.PORT, () => {
    console.log(`CaseFlow API listening on http://localhost:${config.PORT}`);
  });
  const slaScheduler = createSlaScheduler(
    runSlaCheck,
    config.SLA_CHECK_INTERVAL_MINUTES * 60_000,
    config.SLA_CHECK_ON_START
  );
  const shutdown = () => {
    clearInterval(emailWorker);
    clearInterval(triageWorker);
    clearInterval(uploadWorker);
    slaScheduler.stop();
    server.close(() => { void mongoose.disconnect().then(() => process.exit(0)); });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  let emailRunning = false;
  let triageRunning = false;
  let uploadRunning = false;
  const uploadWorker = setInterval(() => {
    if (uploadRunning) return;
    uploadRunning = true;
    void recoverAttachmentUploads().catch(() => console.warn("[Upload recovery] Worker unavailable")).finally(() => { uploadRunning = false; });
  }, 60000);
  uploadWorker.unref();
  const triageWorker = setInterval(() => {
    if (triageRunning) return;
    triageRunning = true;
    void processCaseTriage().catch(() => console.warn("[Case triage] Worker unavailable")).finally(() => { triageRunning = false; });
  }, 2000);
  triageWorker.unref();
  const emailWorker = setInterval(() => {
    if (emailRunning) return;
    emailRunning = true;
    void processCaseDeliveries().then(() => processEmailOutbox()).catch(() => console.warn("[Delivery worker] Worker unavailable")).finally(() => { emailRunning = false; });
  }, 10_000);
  emailWorker.unref();
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

bootstrap().catch(async (error) => {
  console.error("Unable to start CaseFlow API", error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});

export default app;
