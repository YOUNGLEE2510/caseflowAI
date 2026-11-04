import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export function emailCrypto(jwtSecret: string, independentKey?: string) {
  const legacyKey = createHash("sha256").update(`caseflow-email-outbox:${jwtSecret}`).digest();
  const key = independentKey ? Buffer.from(independentKey, "hex") : legacyKey;
  const kid = independentKey ? createHash("sha256").update(key).digest("hex").slice(0, 16) : "legacy";
  return {
    encrypt(value: unknown) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const body = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
      return `${kid}:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64")}`;
    },
    decrypt<T>(value: string): T {
      const [prefix, encoded] = value.includes(":") ? value.split(":", 2) : ["legacy", value];
      if (prefix !== "legacy" && prefix !== kid) throw new Error("Email encryption key unavailable");
      const buffer = Buffer.from(encoded, "base64");
      const decipher = createDecipheriv("aes-256-gcm", prefix === "legacy" ? legacyKey : key, buffer.subarray(0, 12));
      decipher.setAuthTag(buffer.subarray(12, 28));
      return JSON.parse(Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]).toString());
    }
  };
}
