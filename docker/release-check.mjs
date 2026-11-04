import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = dotenv.parse(readFileSync(resolve(root, process.env.CASEFLOW_ENV_FILE || ".env.docker")));
const origin = new URL(env.WEB_ORIGIN || "http://localhost:8080");
if (!["http:", "https:"].includes(origin.protocol)) throw new Error("Unsupported web origin.");
const checks = [];
async function check(name, run, required = true) {
  try { checks.push({ name, required, ok: Boolean(await run()) }); }
  catch { checks.push({ name, required, ok: false }); }
}
const get = path => fetch(new URL(path, origin), { redirect: "manual", signal: AbortSignal.timeout(15000) });
await check("api_database_health", async () => {
  const response = await get("/api/health");
  const body = await response.json();
  return response.ok && body.status === "ok" && body.database === "connected";
});
await check("mongodb_ping", async () => {
  const client = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  try { await client.connect(); return (await client.db(env.MONGODB_DB || "caseflow_ai").command({ ping: 1 })).ok === 1; }
  finally { await client.close(); }
});
await check("seed_disabled", () => env.AUTO_SEED !== "true");
await check("cloudinary_credentials_present", () => env.STORAGE_PROVIDER === "cloudinary" && ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"].every(key => Boolean(env[key]?.trim())));
if (env.DEPLOYMENT_MODE === "pilot") {
  await check("pilot_https", () => origin.protocol === "https:");
  await check("pilot_scanner", () => env.MALWARE_SCAN_MODE === "clamav");
}
let organization;
await check("organization_directory", async () => {
  const response = await get("/api/auth/organizations");
  const body = await response.json(); organization = body.organizations?.[0]?.slug;
  return response.ok && typeof organization === "string";
});
for (const [provider, host, prefix] of [["google", "accounts.google.com", "GOOGLE"], ["microsoft", "login.microsoftonline.com", "MICROSOFT"]]) {
  await check(`${provider}_oauth_start`, async () => {
    if (!organization || !env[`${prefix}_OAUTH_CLIENT_ID`] || !env[`${prefix}_OAUTH_CLIENT_SECRET`]) return false;
    const response = await get(`/api/auth/${provider}?organization=${encodeURIComponent(organization)}`);
    const location = response.headers.get("location");
    if (response.status !== 302 || !location) return false;
    const destination = new URL(location);
    if (destination.protocol !== "https:" || destination.hostname !== host) return false;
    const callback = new URL(destination.searchParams.get("redirect_uri"));
    const cookie = response.headers.get("set-cookie") || "";
    return callback.origin === origin.origin && callback.pathname.endsWith(`/auth/${provider}/callback`) &&
      destination.searchParams.get("client_id") === env[`${prefix}_OAUTH_CLIENT_ID`] &&
      destination.searchParams.has("state") && /httponly/i.test(cookie) && /samesite=lax/i.test(cookie) &&
      (origin.protocol !== "https:" || /secure/i.test(cookie)) &&
      (provider !== "microsoft" || destination.searchParams.get("code_challenge_method") === "S256");
  }, process.argv.includes("--require-oauth"));
}
if (process.argv.includes("--smtp")) await check("smtp_connection", async () => {
  const { default: nodemailer } = await import("nodemailer");
  if (!["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"].every(key => env[key])) return false;
  const port = Number(env.SMTP_PORT || 465);
  const transport = nodemailer.createTransport({ host: env.SMTP_HOST, port, secure: port === 465, requireTLS: port !== 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 });
  try { return await transport.verify(); } finally { transport.close(); }
});
const passed = checks.every(item => !item.required || item.ok);
console.log(JSON.stringify({ passed, checks, manualSignInRequired: true, emailsSent: false, userDataModified: false }, null, 2));
process.exitCode = passed ? 0 : 1;
