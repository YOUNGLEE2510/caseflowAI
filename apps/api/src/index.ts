import mongoose from "mongoose";
import { app } from "./app.js";
import { config } from "./config.js";
import { connectDatabase } from "./db.js";
import { runSlaCheck } from "./jobs/slaChecker.js";
import { createSlaScheduler } from "./jobs/slaScheduler.js";
import { seedDatabase } from "./seed.js";

async function bootstrap() {
  await connectDatabase();
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
    slaScheduler.stop();
    server.close(() => { void mongoose.disconnect().then(() => process.exit(0)); });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

bootstrap().catch(async (error) => {
  console.error("Unable to start CaseFlow API", error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});

export default app;
