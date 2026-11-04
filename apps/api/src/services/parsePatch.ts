import { z } from "zod";

export function parsePatch<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  const parsed = schema.parse(body);
  const keys = new Set(Object.keys(body as Record<string, unknown>));
  return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([key]) => keys.has(key))) as z.output<T>;
}
