import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { config } from "../config.js";
import { authenticate } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import { OAuthLoginTicket, Organization, User } from "../models.js";
import { checkRefreshOrigin } from "../services/refreshSession.js";
import { logAudit } from "../services/helpers.js";
import { verifyMicrosoftIdentity } from "../services/microsoftOAuth.js";

export const microsoftRouter = Router();
const cookieName = "caseflow_microsoft_oauth";
const callbackPath = "/api/auth/microsoft/callback";
const startSchema = z.object({ organization: z.string().trim().min(2).max(80), remember: z.enum(["true", "false"]).optional() });
const stateSchema = z.object({
  purpose: z.literal("microsoft-oauth"), state: z.string().regex(/^[a-f0-9]{64}$/),
  nonce: z.string().regex(/^[a-f0-9]{64}$/), verifier: z.string().min(43).max(128),
  organizationSlug: z.string(), remember: z.boolean(),
  userId: z.string().optional(), tokenVersion: z.number().optional()
});

function redirectUri() {
  return config.MICROSOFT_OAUTH_REDIRECT_URI || `http://localhost:${config.PORT}${callbackPath}`;
}
function redirectError(res: Response, error: string, organization?: string) {
  const url = new URL("/login", config.WEB_ORIGIN);
  url.searchParams.set("oauthProvider", "microsoft");
  url.searchParams.set("oauthError", error);
  if (organization) url.searchParams.set("organization", organization);
  res.redirect(url.toString());
}
function begin(res: Response, organizationSlug: string, remember: boolean, user?: { id: string; tokenVersion: number }) {
  if (!config.MICROSOFT_OAUTH_CLIENT_ID || !config.MICROSOFT_OAUTH_CLIENT_SECRET) {
    redirectError(res, "not_configured", organizationSlug);
    return;
  }
  const state = randomBytes(32).toString("hex");
  const nonce = randomBytes(32).toString("hex");
  const verifier = randomBytes(32).toString("base64url");
  const cookie = jwt.sign({ purpose: "microsoft-oauth", state, nonce, verifier, organizationSlug, remember,
    ...(user ? { userId: user.id, tokenVersion: user.tokenVersion } : {}) }, config.JWT_SECRET, { algorithm: "HS256", expiresIn: "10m" });
  res.cookie(cookieName, cookie, { httpOnly: true, sameSite: "lax", secure: new URL(redirectUri()).protocol === "https:", maxAge: 600000, path: callbackPath });
  const url = new URL(`https://login.microsoftonline.com/${config.MICROSOFT_OAUTH_TENANT}/oauth2/v2.0/authorize`);
  url.search = new URLSearchParams({ client_id: config.MICROSOFT_OAUTH_CLIENT_ID, response_type: "code", response_mode: "query",
    redirect_uri: redirectUri(), scope: "openid profile", state, nonce, prompt: "select_account",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" }).toString();
  return url.toString();
}

microsoftRouter.get("/auth/microsoft", async (req, res) => {
  const input = startSchema.safeParse(req.query);
  if (!input.success) return redirectError(res, "invalid_request");
  const org = await Organization.findOne({ slug: input.data.organization.toLowerCase(), status: "active" }).lean<any>();
  if (!org) return redirectError(res, "not_available");
  const url = begin(res, org.slug, input.data.remember !== "false");
  if (url) res.redirect(url);
});

microsoftRouter.post("/auth/microsoft/link", authenticate, async (req, res) => {
  checkRefreshOrigin(req);
  const { currentPassword } = z.object({ currentPassword: z.string().min(6).max(128) }).parse(req.body);
  const user = await User.findOne({ _id: req.auth!.id, organizationId: req.auth!.organizationId, active: true }).select("+passwordHash").lean<any>();
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) throw new HttpError(401, "Mật khẩu hiện tại không chính xác.");
  const org = await Organization.findOne({ _id: user.organizationId, status: "active" }).lean<any>();
  if (!org) throw new HttpError(403, "Tổ chức không còn hoạt động.");
  if (!config.MICROSOFT_OAUTH_CLIENT_ID || !config.MICROSOFT_OAUTH_CLIENT_SECRET) throw new HttpError(503, "Đăng nhập Microsoft chưa được cấu hình.");
  const url = begin(res, org.slug, true, { id: String(user._id), tokenVersion: user.tokenVersion || 0 });
  res.setHeader("Cache-Control", "no-store");
  res.json({ url });
});

microsoftRouter.get("/auth/microsoft/callback", async (req: Request, res: Response) => {
  const rawCookie = req.headers.cookie?.split(";").map((v) => v.trim()).find((v) => v.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  res.clearCookie(cookieName, { path: callbackPath });
  let state: z.infer<typeof stateSchema>;
  try {
    if (!rawCookie) throw new Error("Missing cookie");
    state = stateSchema.parse(jwt.verify(decodeURIComponent(rawCookie), config.JWT_SECRET, { algorithms: ["HS256"] }));
    if (req.query.state !== state.state) throw new Error("State mismatch");
  } catch { return redirectError(res, "invalid_request"); }
  if (req.query.error) return redirectError(res, "cancelled", state.organizationSlug);
  if (typeof req.query.code !== "string" || req.query.code.length < 10) return redirectError(res, "invalid_request", state.organizationSlug);
  try {
    const response = await fetch(`https://login.microsoftonline.com/${config.MICROSOFT_OAUTH_TENANT}/oauth2/v2.0/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(10000),
      body: new URLSearchParams({ client_id: config.MICROSOFT_OAUTH_CLIENT_ID, client_secret: config.MICROSOFT_OAUTH_CLIENT_SECRET,
        grant_type: "authorization_code", code: req.query.code, redirect_uri: redirectUri(), code_verifier: state.verifier, scope: "openid profile" })
    });
    if (!response.ok) throw new Error("Microsoft token exchange failed");
    const tokens = await response.json() as { id_token?: string };
    if (!tokens.id_token) throw new Error("Missing Microsoft ID token");
    const identity = await verifyMicrosoftIdentity(tokens.id_token, state.nonce);
    const org = await Organization.findOne({ slug: state.organizationSlug, status: "active" }).lean<any>();
    if (!org) throw new Error("Organization unavailable");
    let user: any;
    if (state.userId) {
      // Linking requires a password-confirmed local session; never match Microsoft email claims.
      user = await User.findOneAndUpdate({ _id: state.userId, organizationId: org._id, active: true,
        $and: [{ $or: [{ tokenVersion: state.tokenVersion }, ...(state.tokenVersion === 0 ? [{ tokenVersion: { $exists: false } }] : [])] },
          { $or: [{ microsoftObjectId: { $exists: false } }, { microsoftObjectId: identity.objectId, microsoftTenantId: identity.tenantId }] }] },
        { $set: { microsoftObjectId: identity.objectId, microsoftTenantId: identity.tenantId } }, { new: true }).lean<any>();
      if (!user) throw new Error("Link session revoked or identity already linked");
      await logAudit({ actorId: String(user._id), organizationId: String(org._id), actorName: user.name, actorRole: user.role,
        action: "auth.microsoft_link", resource: "User", resourceId: String(user._id) }, req);
      const destination = new URL("/profile", config.WEB_ORIGIN);
      destination.searchParams.set("microsoftLinked", "true");
      return res.redirect(destination.toString());
    }
    user = await User.findOne({ organizationId: org._id, active: true, microsoftObjectId: identity.objectId, microsoftTenantId: identity.tenantId }).lean<any>();
    if (!user) return redirectError(res, "not_linked", org.slug);
    const ticket = randomBytes(32).toString("hex");
    await OAuthLoginTicket.create({ organizationId: org._id, userId: user._id, provider: "microsoft", remember: state.remember,
      tokenHash: createHash("sha256").update(ticket).digest("hex"), expiresAt: new Date(Date.now() + 60000) });
    await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
    const destination = new URL("/login", config.WEB_ORIGIN);
    destination.searchParams.set("microsoftCode", ticket);
    res.redirect(destination.toString());
  } catch {
    redirectError(res, "microsoft_failed", state.organizationSlug);
  }
});
