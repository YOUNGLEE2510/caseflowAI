import { expect, it } from "vitest";
import { emailCrypto } from "../src/services/emailCrypto.js";

it("keeps independent-key jobs readable after JWT rotation", () => {
  const first = emailCrypto("old-secret", "ab".repeat(32));
  const rotated = emailCrypto("new-secret", "ab".repeat(32));
  expect(rotated.decrypt(first.encrypt({ message: "test" }))).toEqual({ message: "test" });
});

it("migrates legacy payloads before JWT rotation and rejects other key ids", () => {
  const legacy = emailCrypto("old-secret");
  const independent = emailCrypto("old-secret", "ab".repeat(32));
  expect(independent.decrypt(legacy.encrypt({ message: "test" }))).toEqual({ message: "test" });
  expect(() => emailCrypto("old-secret", "cd".repeat(32)).decrypt(independent.encrypt({ message: "test" }))).toThrow();
});
