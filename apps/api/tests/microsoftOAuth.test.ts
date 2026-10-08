import { beforeAll, describe, expect, it, vi } from "vitest";
import { generateKeyPair, SignJWT } from "jose";
import { webcrypto } from "node:crypto";

vi.stubGlobal("crypto", webcrypto);
vi.mock("../src/config.js", () => ({ config: { MICROSOFT_OAUTH_CLIENT_ID: "test-client", MICROSOFT_OAUTH_TENANT: "common" } }));
import { verifyMicrosoftIdentity } from "../src/services/microsoftOAuth.js";

const tenant = "11111111-1111-4111-8111-111111111111";
const objectId = "22222222-2222-4222-8222-222222222222";
let pair: Awaited<ReturnType<typeof generateKeyPair>>;
beforeAll(async () => { pair = await generateKeyPair("RS256"); });
async function token(overrides: Record<string, unknown> = {}, audience = "test-client", issuer = `https://login.microsoftonline.com/${tenant}/v2.0`, expiry = "5m") {
  return new SignJWT({ tid: tenant, oid: objectId, nonce: "expected-nonce", ver: "2.0", ...overrides })
    .setProtectedHeader({ alg: "RS256" }).setIssuer(issuer).setAudience(audience).setSubject("subject")
    .setIssuedAt().setExpirationTime(expiry).sign(pair.privateKey);
}
describe("Microsoft identity validation", () => {
  it("validates signature, audience, issuer and nonce and returns immutable identifiers", async () => {
    expect(await verifyMicrosoftIdentity(await token(), "expected-nonce", async () => pair.publicKey))
      .toEqual({ objectId, tenantId: tenant });
  });
  it("rejects a wrong nonce", async () => {
    await expect(verifyMicrosoftIdentity(await token(), "wrong", async () => pair.publicKey)).rejects.toThrow();
  });
  it("rejects wrong audience or issuer", async () => {
    for (const value of [await token({}, "other-client"), await token({}, "test-client", "https://attacker.test")]) {
      await expect(verifyMicrosoftIdentity(value, "expected-nonce", async () => pair.publicKey)).rejects.toThrow();
    }
  });
  it("rejects expired tokens and invalid tenant claims", async () => {
    for (const value of [await token({}, "test-client", `https://login.microsoftonline.com/${tenant}/v2.0`, "-1s"), await token({ tid: "../../attacker" })]) {
      await expect(verifyMicrosoftIdentity(value, "expected-nonce", async () => pair.publicKey)).rejects.toThrow();
    }
  });
  it("rejects tokens signed with an unrelated key", async () => {
    const other = await generateKeyPair("RS256");
    await expect(verifyMicrosoftIdentity(await token(), "expected-nonce", async () => other.publicKey)).rejects.toThrow();
  });
});
