import { readFileSync, appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import dotenv from "dotenv";
const file = new URL("../.env.docker", import.meta.url);
const env = dotenv.parse(readFileSync(file));
if (!env.EMAIL_ENCRYPTION_KEY) {
  appendFileSync(file, `\nEMAIL_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}\n`);
  console.log("Independent email encryption key provisioned; existing keys unchanged.");
}
if (!env.METRICS_TOKEN) {
  appendFileSync(file, `\nMETRICS_TOKEN=${randomBytes(32).toString("hex")}\n`);
  console.log("Private monitoring credential provisioned; existing credentials unchanged.");
} else console.log("Existing monitoring credential preserved.");
