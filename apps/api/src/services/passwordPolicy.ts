import { z } from "zod";

export const newPasswordSchema = z.string().min(10).max(128)
  .refine(value => Buffer.byteLength(value, "utf8") <= 72, "Mật khẩu không được vượt quá 72 byte.");

// Existing passwords remain valid until the owner changes or resets them.
export const currentPasswordSchema = z.string().min(1).max(128)
  .refine(value => Buffer.byteLength(value, "utf8") <= 72, "Mật khẩu không được vượt quá 72 byte.");
