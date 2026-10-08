import mongoose from "mongoose";
import { app } from "./app.js";
import { config } from "./config.js";
import { connectDatabase } from "./db.js";
import { runSlaCheck } from "./jobs/slaChecker.js";
import { createSlaScheduler } from "./jobs/slaScheduler.js";
import { seedDatabase } from "./seed.js";
import { initializeObjectStorage } from "./services/objectStorage.js";
import { processEmailOutbox } from "./services/emailOutbox.js";

async function bootstrap() {
  await connectDatabase();
  await initializeObjectStorage();
  if (config.AUTO_SEED) await seedDatabase(false);

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
    slaScheduler.stop();
    server.close(() => { void mongoose.disconnect().then(() => process.exit(0)); });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  let emailRunning = false;
  const emailWorker = setInterval(() => {
    if (emailRunning) return;
    emailRunning = true;
    void processEmailOutbox().catch(() => console.warn("[Email outbox] Worker unavailable")).finally(() => { emailRunning = false; });
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
