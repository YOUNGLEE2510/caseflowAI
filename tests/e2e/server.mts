import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createServer } from "vite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const database = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
const uploads = await mkdtemp(join(tmpdir(), "caseflow-e2e-"));
process.env.NODE_ENV = "test";
// Browser workflows share one IP and deliberately issue requests faster than a person.
process.env.API_RATE_LIMIT_PER_MINUTE = "1000";
process.env.MONGODB_URI = database.getUri();
process.env.MONGODB_DB = "caseflow_e2e_isolated";
process.env.JWT_SECRET = "e2e-isolated-secret-not-for-deployment";
process.env.AUTO_SEED = "false";
process.env.UPLOAD_DIR = uploads;
process.env.AI_SERVICE_URL = "http://127.0.0.1:1";
process.env.WEB_ORIGIN = "http://127.0.0.1:5188";
const { app } = await import("../../apps/api/src/app.js");
const { seedDatabase } = await import("../../apps/api/src/seed.js");
await mongoose.connect(database.getUri(), { dbName: process.env.MONGODB_DB });
await seedDatabase(false);
const api = app.listen(0, "127.0.0.1");
await new Promise<void>((done) => api.once("listening", done));
const address = api.address();
if (!address || typeof address === "string") throw new Error("No API port");
const web = await createServer({ root: resolve("apps/web"), configFile: resolve("apps/web/vite.config.ts"), server: { host: "127.0.0.1", port: 5188, strictPort: true, proxy: { "/api": { target: `http://127.0.0.1:${address.port}`, changeOrigin: true } } } });
await web.listen();
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await web.close();
  api.closeAllConnections();
  await new Promise<void>((done) => api.close(() => done()));
  await mongoose.disconnect();
  await database.stop();
  if (dirname(resolve(uploads)) !== resolve(tmpdir()) || !basename(uploads).startsWith("caseflow-e2e-")) throw new Error("Unexpected E2E cleanup path");
  await rm(uploads, { recursive: true, force: true });
  process.exit(0);
}
process.once("SIGTERM", () => void close());
process.once("SIGINT", () => void close());
console.log("Isolated E2E app ready on http://127.0.0.1:5188");
