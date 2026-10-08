import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { z } from "zod";

// Resolve relative to this module so `npm run dev` from the monorepo root and
// package-local commands load the same server-only configuration.
const moduleDirectory = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(moduleDirectory, "../.env") });

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  DEPLOYMENT_MODE: z.enum(["local", "pilot"]).default("local"),
  AUDIT_RETENTION_DAYS: z.coerce.number().int().min(0).max(3650).default(365),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  LLM_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  LLM_API_KEY: z.string().default(""),
  LLM_MODEL: z.string().default(""),
  LLM_ALLOWED_ORGANIZATIONS: z.string().default(""),
  API_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(10).max(10000).default(100),
  OAUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(5).max(10000).default(10),
  MONGODB_URI: z.string().min(1),
  MONGODB_DB: z.string().default("caseflow_ai"),
  JWT_SECRET: z.string().min(24),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("caseflow-files"),
  S3_ACCESS_KEY: z.string().default(""),
  S3_SECRET_KEY: z.string().default(""),
  MALWARE_SCAN_MODE: z.enum(["disabled", "clamav"]).default("disabled"),
  CLAMAV_HOST: z.string().default("127.0.0.1"),
  CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
  CLAMAV_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(20000),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  GOOGLE_OAUTH_CLIENT_ID: z.string().trim().default(""),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().trim().default(""),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().trim().default(""),
  MICROSOFT_OAUTH_CLIENT_ID: z.string().trim().default(""),
  MICROSOFT_OAUTH_CLIENT_SECRET: z.string().trim().default(""),
  MICROSOFT_OAUTH_REDIRECT_URI: z.string().trim().default(""),
  MICROSOFT_OAUTH_TENANT: z.string().regex(/^(common|organizations|consumers|[a-f0-9-]{36})$/i).default("common"),
  AI_SERVICE_URL: z.string().url().default("http://127.0.0.1:8001"),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(10000),
  AI_INTERNAL_TOKEN: z.string().default(""),
  AI_FALLBACK_KEYWORDS: z.preprocess((value) => {
    if (typeof value !== "string" || !value.trim()) return undefined;
    try { return JSON.parse(value); } catch { return value; }
  }, z.record(z.array(z.string().trim().min(1).max(100)).min(1).max(100)).optional()),
  SLA_CHECK_INTERVAL_MINUTES: z.coerce.number().int().min(1).max(1_440).default(15),
  SLA_CHECK_ON_START: z
    .string()
    .default("true")
    .transform((value) => value === "true"),
  AUTO_SEED: z
    .string()
    .default("false")
    .transform((value) => value === "true"),
  LOG_LEVEL: z.string().default("dev"),
  SMTP_HOST: z.string().trim().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().trim().optional()
}).superRefine((value, ctx) => {
  if (value.DEPLOYMENT_MODE === "pilot") {
    if (value.AUTO_SEED) ctx.addIssue({ code: "custom", path: ["AUTO_SEED"], message: "Pilot deployments must not seed demo users" });
    if (!value.AI_INTERNAL_TOKEN) ctx.addIssue({ code: "custom", path: ["AI_INTERNAL_TOKEN"], message: "Pilot AI authentication is required" });
    if (!new URL(value.MONGODB_URI).username) ctx.addIssue({ code: "custom", path: ["MONGODB_URI"], message: "Pilot Mongo authentication is required" });
    if (value.MALWARE_SCAN_MODE === "disabled") ctx.addIssue({ code: "custom", path: ["MALWARE_SCAN_MODE"], message: "Pilot attachment scanning is required" });
  }
  if (value.STORAGE_PROVIDER === "s3" && (!value.S3_ACCESS_KEY || !value.S3_SECRET_KEY)) {
    ctx.addIssue({ code: "custom", path: ["STORAGE_PROVIDER"], message: "S3 credentials are required" });
  }
});

const isTestEnv = process.env.NODE_ENV === "test";

const envSource = isTestEnv
  ? {
      MONGODB_URI: "mongodb://127.0.0.1:27017/caseflow_test",
      JWT_SECRET: "test-secret-with-at-least-24-characters",
      STORAGE_PROVIDER: "local",
      ...process.env
    }
  : process.env;

const parsed = envSchema.safeParse(envSource);

if (!parsed.success) {
  console.error("Invalid environment configuration", parsed.error.flatten().fieldErrors);
  if (isTestEnv) {
    throw new Error(`Invalid environment configuration in test mode: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
  }
  process.exit(1);
}

export const config = parsed.data;
