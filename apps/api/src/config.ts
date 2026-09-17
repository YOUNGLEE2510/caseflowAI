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
  LLM_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  LLM_API_KEY: z.string().default(""),
  LLM_MODEL: z.string().default(""),
  LLM_ALLOWED_ORGANIZATIONS: z.string().default(""),
  API_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(10).max(10000).default(100),
  MONGODB_URI: z.string().min(1),
  MONGODB_DB: z.string().default("caseflow_ai"),
  JWT_SECRET: z.string().min(24),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  AI_SERVICE_URL: z.string().url().default("http://127.0.0.1:8001"),
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
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
