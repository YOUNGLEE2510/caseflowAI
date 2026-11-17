// Signed, rotatable QR intake tokens for rental units.
// Token = base64url(unitId[12] + version[4]) "." base64url(HMAC[16]).
// The MAC binds organization, unit and version, so a code cannot be moved to
// another unit or tenant, and bumping the stored version revokes printed codes.
import { createHmac, timingSafeEqual } from "node:crypto";
import mongoose from "mongoose";
import { config } from "../config.js";

const CONTEXT = "caseflow-qr-intake-v1";
export const QR_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{22}$/;

function key() {
  // Derived from the server secret with a dedicated label; rotating JWT_SECRET also rotates every printed QR code.
  return createHmac("sha256", config.JWT_SECRET).update(CONTEXT).digest();
}

function mac(organizationId: string, unitId: string, version: number) {
  return createHmac("sha256", key()).update(`${organizationId}:${unitId}:${version}`).digest().subarray(0, 16);
}

export function signQrToken(organizationId: string, unitId: string, version: number) {
  if (!Number.isInteger(version) || version < 1) throw new Error("QR version must be a positive integer");
  const head = Buffer.alloc(16);
  Buffer.from(unitId, "hex").copy(head, 0);
  head.writeUInt32BE(version, 12);
  return `${head.toString("base64url")}.${mac(organizationId, unitId, version).toString("base64url")}`;
}

export function parseQrToken(token: string) {
  if (!QR_TOKEN_PATTERN.test(token)) return null;
  const [headPart, macPart] = token.split(".");
  const head = Buffer.from(headPart, "base64url");
  const signature = Buffer.from(macPart, "base64url");
  if (head.length !== 16 || signature.length !== 16) return null;
  const unitId = head.subarray(0, 12).toString("hex");
  const version = head.readUInt32BE(12);
  if (version < 1 || !mongoose.isValidObjectId(unitId)) return null;
  return { unitId, version, signature };
}

export function verifyQrSignature(parsed: { unitId: string; version: number; signature: Buffer }, organizationId: string) {
  return timingSafeEqual(parsed.signature, mac(organizationId, parsed.unitId, parsed.version));
}

export function normalizePhone(value: string) {
  const digits = value.replace(/[\s.()-]/g, "");
  return digits.startsWith("+84") ? `0${digits.slice(3)}` : digits;
}
