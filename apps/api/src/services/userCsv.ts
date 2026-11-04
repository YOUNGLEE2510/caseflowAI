import { parse } from "csv-parse/sync";
import { z } from "zod";
const rowSchema = z.object({ name: z.string().trim().min(2).max(100), email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  role: z.enum(["requester", "agent"]), team: z.string().trim().max(60).default("") }).strict();
export function parseUserCsv(csv: string) {
  const rows: unknown[] = parse(csv, { bom: true, columns: true, skip_empty_lines: true, trim: true, max_record_size: 4096 });
  if (!rows.length || rows.length > 100) throw new Error("CSV must contain 1-100 users");
  const users = rows.map(row => rowSchema.parse(row));
  if (new Set(users.map(row => row.email)).size !== users.length) throw new Error("Duplicate emails in CSV");
  if (users.some(row => row.role === "agent" && !row.team)) throw new Error("Agents need a team");
  return users;
}
