import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTVerifyGetKey } from "jose";
import { config } from "../config.js";

const keys = createRemoteJWKSet(new URL("https://login.microsoftonline.com/common/discovery/v2.0/keys"));
const guid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const consumerTenant = "9188040d-6c67-4c5b-b112-36a304b66dad";

export async function verifyMicrosoftIdentity(idToken: string, nonce: string, key: JWTVerifyGetKey = keys) {
  const unverified = decodeJwt(idToken);
  if (typeof unverified.tid !== "string" || !guid.test(unverified.tid)) throw new Error("Invalid Microsoft tenant");
  const tenant = unverified.tid.toLowerCase();
  const configured = config.MICROSOFT_OAUTH_TENANT.toLowerCase();
  if ((configured === "consumers" && tenant !== consumerTenant) ||
      (configured === "organizations" && tenant === consumerTenant) ||
      (guid.test(configured) && tenant !== configured)) throw new Error("Microsoft tenant not allowed");
  const { payload } = await jwtVerify(idToken, key, {
    algorithms: ["RS256"], audience: config.MICROSOFT_OAUTH_CLIENT_ID,
    issuer: `https://login.microsoftonline.com/${tenant}/v2.0`,
    requiredClaims: ["exp", "iat", "sub", "oid", "tid", "nonce"]
  });
  if (payload.nonce !== nonce || payload.ver !== "2.0" || typeof payload.oid !== "string" || !guid.test(payload.oid)) {
    throw new Error("Invalid Microsoft identity");
  }
  return { objectId: payload.oid.toLowerCase(), tenantId: tenant };
}
