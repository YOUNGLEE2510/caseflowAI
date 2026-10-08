import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { config } from "../config.js";
import { authenticate } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import { OAuthLoginTicket, Organization, PasswordResetToken, RefreshSession, User } from "../models.js";
import { REFRESH_COOKIE, checkRefreshOrigin, clearRefreshCookie, createRefreshSession, hashRefreshToken, rotateRefreshSession } from "../services/refreshSession.js";
import { enqueuePasswordReset } from "../services/emailOutbox.js";
import { logAudit } from "../services/helpers.js";
import { microsoftRouter } from "./microsoftAuth.js";
import { publicUser, type PublicUserSource } from "../services/publicUser.js";
import type { RefreshSessionRecord } from "../services/refreshSession.js";

interface LeanOrganization {
  _id: import("mongoose").Types.ObjectId;
  name: string;
  slug: string;
}

interface LoginUser extends PublicUserSource { passwordHash: string }
interface LoginTicket { userId: import("mongoose").Types.ObjectId; organizationId: import("mongoose").Types.ObjectId; remember: boolean }

const dummyPasswordHash = bcrypt.hashSync(randomBytes(32).toString("hex"), 12);
export const authRouter = Router();
authRouter.use(microsoftRouter);

const loginSchema = z.object({
  organizationSlug: z.string().trim().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(6),
  remember: z.boolean().default(true)
});

const passwordResetRequestSchema = z.object({
  organizationSlug: z.string().trim().min(2).max(80),
  email: z.string().email()
});

const passwordResetConfirmSchema = z.object({
  organizationSlug: z.string().trim().min(2).max(80),
  token: z.string().regex(/^[a-f0-9]{64}$/i),
  password: z.string().min(10).max(128).refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Mật khẩu không được vượt quá 72 byte.")
});
const googleStartSchema = z.object({
  organization: z.string().trim().min(2).max(80),
  remember: z.enum(["true", "false"]).optional()
});
const googleCallbackSchema = z.object({
  state: z.string().min(20),
  code: z.string().min(10)
});
const googleExchangeSchema = z.object({
  ticket: z.string().regex(/^[a-f0-9]{64}$/i)
});

interface GoogleOAuthState extends jwt.JwtPayload {
  purpose: "google-oauth";
  organizationSlug: string;
  remember: boolean;
}

function resetTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

const resetRequestMessage = "Nếu tài khoản hợp lệ, hướng dẫn đặt lại mật khẩu sẽ được gửi đến email đã đăng ký.";

function issueAccessToken(user: Pick<PublicUserSource, "_id" | "organizationId" | "tokenVersion">) {
  return jwt.sign(
    { id: String(user._id), organizationId: String(user.organizationId), tokenVersion: user.tokenVersion || 0 },
    config.JWT_SECRET,
    { expiresIn: config.JWT_ACCESS_TTL_SECONDS, algorithm: "HS256" }
  );
}

function googleRedirectUri() {
  return config.GOOGLE_OAUTH_REDIRECT_URI || `http://localhost:${config.PORT}/api/auth/google/callback`;
}

function googleClient() {
  if (!config.GOOGLE_OAUTH_CLIENT_ID || !config.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new HttpError(503, "Đăng nhập Google chưa được cấu hình.");
  }
  return new OAuth2Client(config.GOOGLE_OAUTH_CLIENT_ID, config.GOOGLE_OAUTH_CLIENT_SECRET, googleRedirectUri());
}

function readCookie(req: Request, name: string) {
  const encoded = req.headers.cookie?.split(";").map((value: string) => value.trim()).find((value: string) => value.startsWith(`${name}=`))?.slice(name.length + 1);
  if (!encoded) return "";
  try {
    return decodeURIComponent(encoded);
  } catch {
    return "";
  }
}

function loginRedirect(res: Response, error?: string, organization?: string) {
  const url = new URL("/login", config.WEB_ORIGIN);
  if (error) url.searchParams.set("oauthError", error);
  if (organization) url.searchParams.set("organization", organization);
  res.redirect(url.toString());
}

authRouter.post("/auth/login", async (req, res) => {
  checkRefreshOrigin(req);
  const input = loginSchema.parse(req.body);
  const organization = (await Organization.findOne({
    slug: input.organizationSlug.toLowerCase(),
    status: "active"
  }).lean()) as LeanOrganization | null;
  const user = organization
    ? ((await User.findOne({
        organizationId: organization._id,
        email: input.email.toLowerCase(),
        active: true
      })
        .select("+passwordHash")
        .lean<LoginUser>()))
    : null;

  const passwordMatches = await bcrypt.compare(input.password, user?.passwordHash || dummyPasswordHash);
  if (!organization || !user || !passwordMatches) {
    throw new HttpError(401, "Mã đơn vị, email hoặc mật khẩu không chính xác.");
  }

  const payload = publicUser(user, organization);
  const token = issueAccessToken(user);
  await createRefreshSession(res, user, input.remember);
  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  await logAudit({
    organizationId: String(organization._id), actorId: String(user._id), actorName: user.name,
    actorRole: user.role, action: "auth.login", resource: "User", resourceId: String(user._id)
  }, req);
  res.setHeader("Cache-Control", "no-store");
  res.json({ token, user: payload, remember: input.remember });
});

authRouter.post("/auth/refresh", async (req, res) => {
  checkRefreshOrigin(req);
  res.setHeader("Cache-Control", "no-store");
  try {
    const session = await rotateRefreshSession(readCookie(req, REFRESH_COOKIE), res);
    res.json({ token: issueAccessToken(session.user), user: publicUser(session.user, session.organization), remember: session.remember });
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) clearRefreshCookie(res);
    throw error;
  }
});

/* Google OAuth only links an already provisioned, active CaseFlow account. */
authRouter.get("/auth/google", async (req, res) => {
  const parsed = googleStartSchema.safeParse(req.query);
  if (!parsed.success) {
    loginRedirect(res, "invalid_request");
    return;
  }
  const organization = (await Organization.findOne({
    slug: parsed.data.organization.toLowerCase(),
    status: "active"
  }).lean()) as LeanOrganization | null;
  if (!organization) {
    loginRedirect(res, "not_available");
    return;
  }
  if (!config.GOOGLE_OAUTH_CLIENT_ID || !config.GOOGLE_OAUTH_CLIENT_SECRET) {
    loginRedirect(res, "not_configured", organization.slug);
    return;
  }

  const remember = parsed.data.remember !== "false";
  const state = jwt.sign(
    { purpose: "google-oauth", organizationSlug: organization.slug, remember } satisfies Omit<GoogleOAuthState, keyof jwt.JwtPayload>,
    config.JWT_SECRET,
    { expiresIn: "10m", algorithm: "HS256" }
  );
  res.cookie("caseflow_google_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(googleRedirectUri()).protocol === "https:",
    maxAge: 10 * 60_000,
    path: "/api/auth/google/callback"
  });
  res.redirect(googleClient().generateAuthUrl({
    access_type: "online",
    prompt: "select_account",
    scope: ["openid", "email", "profile"],
    state
  }));
});

authRouter.get("/auth/google/callback", async (req, res) => {
  const parsed = googleCallbackSchema.safeParse(req.query);
  const cookieState = readCookie(req, "caseflow_google_oauth_state");
  res.clearCookie("caseflow_google_oauth_state", { path: "/api/auth/google/callback" });
  if (!parsed.success || !cookieState || cookieState !== parsed.data.state) {
    loginRedirect(res, "invalid_request");
    return;
  }

  let state: GoogleOAuthState;
  try {
    state = jwt.verify(parsed.data.state, config.JWT_SECRET, { algorithms: ["HS256"] }) as GoogleOAuthState;
    if (state.purpose !== "google-oauth" || typeof state.organizationSlug !== "string" || typeof state.remember !== "boolean") {
      throw new Error("Invalid OAuth state");
    }
  } catch {
    loginRedirect(res, "invalid_request");
    return;
  }
  if (typeof req.query.error === "string") {
    loginRedirect(res, "google_cancelled", state.organizationSlug);
    return;
  }

  try {
    const client = googleClient();
    const { tokens } = await client.getToken(parsed.data.code);
    if (!tokens.id_token) throw new Error("Google did not return an ID token");
    const verification = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: config.GOOGLE_OAUTH_CLIENT_ID
    });
    const identity = verification.getPayload();
    if (!identity?.email || identity.email_verified !== true || !identity.sub) throw new Error("Unverified Google identity");

    const organization = (await Organization.findOne({
      slug: state.organizationSlug,
      status: "active"
    }).lean()) as LeanOrganization | null;
    if (!organization) throw new Error("Organization unavailable");

    const user = await User.findOneAndUpdate(
      {
        organizationId: organization._id,
        email: identity.email.toLowerCase(),
        active: true,
        $or: [
          { googleSubject: { $exists: false } },
          { googleSubject: null },
          { googleSubject: "" },
          { googleSubject: identity.sub }
        ]
      },
      { $set: { googleSubject: identity.sub, lastLoginAt: new Date() } },
      { new: true }
    ).lean<PublicUserSource>();
    if (!user) throw new Error("Google account is not linked to an active user");

    const rawTicket = randomBytes(32).toString("hex");
    await OAuthLoginTicket.create({
      organizationId: organization._id,
      userId: user._id,
      tokenHash: resetTokenHash(rawTicket),
      remember: state.remember,
      expiresAt: new Date(Date.now() + 60_000)
    });
    const destination = new URL("/login", config.WEB_ORIGIN);
    destination.searchParams.set("googleCode", rawTicket);
    res.redirect(destination.toString());
  } catch (error) {
    console.warn("[Google OAuth] Login callback failed", error instanceof Error ? error.message : "unknown error");
    loginRedirect(res, "google_failed", state.organizationSlug);
  }
});

authRouter.post(["/auth/google/exchange", "/auth/microsoft/exchange"], async (req, res) => {
  checkRefreshOrigin(req);
  const provider = req.path.includes("microsoft") ? "microsoft" : "google";
  const input = googleExchangeSchema.parse(req.body);
  const ticket = await OAuthLoginTicket.findOneAndUpdate(
    {
      tokenHash: resetTokenHash(input.ticket),
      ...(provider === "google" ? { $or: [{ provider: "google" }, { provider: { $exists: false } }] } : { provider }),
      usedAt: null,
      expiresAt: { $gt: new Date() }
    },
    { $set: { usedAt: new Date() } },
    { new: true }
  ).lean<LoginTicket>();
  if (!ticket) throw new HttpError(401, "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.");

  const [user, organization] = await Promise.all([
    User.findOne({ _id: ticket.userId, organizationId: ticket.organizationId, active: true }).lean<PublicUserSource>(),
    Organization.findOne({ _id: ticket.organizationId, status: "active" }).lean<LeanOrganization>()
  ]);
  if (!user || !organization) throw new HttpError(401, "Tài khoản không còn khả dụng.");

  const payload = publicUser(user, organization);
  const token = issueAccessToken(user);
  await logAudit({
    organizationId: String(organization._id), actorId: String(user._id), actorName: user.name,
    actorRole: user.role, action: "auth.login", resource: "User", resourceId: String(user._id),
    changes: { provider }
  }, req);
  await createRefreshSession(res, user, Boolean(ticket.remember));
  res.setHeader("Cache-Control", "no-store");
  res.json({ token, user: payload, remember: Boolean(ticket.remember) });
});

authRouter.post("/auth/password-reset/request", async (req, res) => {
  const input = passwordResetRequestSchema.parse(req.body);
  await enqueuePasswordReset(input.organizationSlug, input.email);
  res.status(202).json({ message: resetRequestMessage });
});

authRouter.post("/auth/password-reset/confirm", async (req, res) => {
  const input = passwordResetConfirmSchema.parse(req.body);
  const organization = (await Organization.findOne({ slug: input.organizationSlug.toLowerCase(), status: "active" }).lean()) as LeanOrganization | null;
  if (!organization) throw new HttpError(422, "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.");

  const token = await PasswordResetToken.findOneAndUpdate(
    {
      organizationId: organization._id,
      tokenHash: resetTokenHash(input.token),
      usedAt: null,
      expiresAt: { $gt: new Date() }
    },
    { $set: { usedAt: new Date() } },
    { new: true }
  ).lean<{ userId: import("mongoose").Types.ObjectId }>();
  if (!token) throw new HttpError(422, "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.");

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await User.findOneAndUpdate(
    { _id: token.userId, organizationId: organization._id, active: true },
    { $set: { passwordHash }, $inc: { tokenVersion: 1 } },
    { new: true }
  ).lean<PublicUserSource>();
  if (!user) throw new HttpError(422, "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.");

  await RefreshSession.updateMany({ userId: user._id, organizationId: organization._id }, { $set: { revokedAt: new Date() } });
  clearRefreshCookie(res);

  await PasswordResetToken.updateMany(
    { organizationId: organization._id, userId: user._id, usedAt: null },
    { $set: { usedAt: new Date() } }
  );
  res.json({ message: "Mật khẩu đã được đặt lại. Vui lòng đăng nhập." });
});

authRouter.get("/auth/me", authenticate, async (req, res) => {
  const user = await User.findOne({
    _id: req.auth!.id,
    organizationId: req.auth!.organizationId,
    active: true
  }).lean<PublicUserSource>();
  if (!user) throw new HttpError(404, "Không tìm thấy tài khoản.");
  const organization = (await Organization.findOne({
    _id: req.auth!.organizationId,
    status: "active"
  }).lean()) as LeanOrganization | null;
  if (!organization) throw new HttpError(403, "Tổ chức hiện không hoạt động.");
  res.json({ user: publicUser(user, organization) });
});

authRouter.post("/auth/logout", async (req, res) => {
  checkRefreshOrigin(req);
  clearRefreshCookie(res);
  const rawToken = readCookie(req, REFRESH_COOKIE);
  const session = /^[a-f0-9]{64}$/.test(rawToken) ? await RefreshSession.findOne({
    tokenHash: hashRefreshToken(rawToken), consumedAt: null, revokedAt: null, expiresAt: { $gt: new Date() }
  }).lean<RefreshSessionRecord>() : null;
  if (session) {
    const user = await User.findOneAndUpdate({ _id: session.userId, organizationId: session.organizationId,
      $or: [{ tokenVersion: session.tokenVersion }, ...(session.tokenVersion === 0 ? [{ tokenVersion: { $exists: false } }] : [])]
    }, { $inc: { tokenVersion: 1 } }).lean<PublicUserSource>();
    if (user) {
      await RefreshSession.updateMany({ userId: session.userId, organizationId: session.organizationId }, { $set: { revokedAt: new Date() } });
      await logAudit({ organizationId: String(user.organizationId), actorId: String(user._id), actorName: user.name,
        actorRole: user.role, action: "auth.logout", resource: "User", resourceId: String(user._id) }, req);
      res.json({ message: "Đã đăng xuất." });
      return;
    }
  }
  let authenticationError: unknown;
  await authenticate(req, res, (error) => { authenticationError = error; });
  if (authenticationError) throw authenticationError;
  if (res.headersSent || !req.auth) return;
  await RefreshSession.updateMany({ userId: req.auth!.id, organizationId: req.auth!.organizationId }, { $set: { revokedAt: new Date() } });
  await User.updateOne(
    { _id: req.auth!.id, organizationId: req.auth!.organizationId },
    { $inc: { tokenVersion: 1 } }
  );
  await logAudit({
    organizationId: req.auth!.organizationId, actorId: req.auth!.id, actorName: req.auth!.name,
    actorRole: req.auth!.role, action: "auth.logout", resource: "User", resourceId: req.auth!.id
  }, req);
  res.json({ message: "Đã đăng xuất." });
});
