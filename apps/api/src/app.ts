import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import { createHash } from "node:crypto";
import helmet from "helmet";
import { requestLogger } from "./middleware/requestLogger.js";
import { config } from "./config.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { requestIdMiddleware } from "./middleware/requestId.js";
import { apiRouter } from "./routes.js";

export const app = express();
app.disable("x-powered-by");
app.set("trust proxy", config.TRUST_PROXY_HOPS);
app.use(helmet());
app.use(cors({ origin: config.WEB_ORIGIN, credentials: true }));
app.use(requestIdMiddleware);
app.use(express.json({ limit: "2mb" }));
if (process.env.NODE_ENV !== "test") app.use(requestLogger);
app.use("/api", rateLimit({
  windowMs: 60_000,
  limit: config.API_RATE_LIMIT_PER_MINUTE,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: (req) => req.path === "/health",
  message: { message: "Quá nhiều yêu cầu. Vui lòng thử lại sau một phút." }
}));
app.use("/api/auth/login", rateLimit({
  windowMs: 60_000,
  limit: 5,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const identity = JSON.stringify([
      typeof req.body?.organizationSlug === "string" ? req.body.organizationSlug.trim().toLowerCase() : "",
      typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : ""
    ]);
    return `${req.ip || "unknown"}:${createHash("sha256").update(identity).digest("hex")}`;
  },
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Đăng nhập quá nhiều lần. Vui lòng thử lại sau một phút." }
}));
app.use(["/api/auth/google", "/api/auth/microsoft"], rateLimit({
  windowMs: 60_000,
  limit: config.OAUTH_RATE_LIMIT_PER_MINUTE,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Yêu cầu đăng nhập quá nhiều lần. Vui lòng thử lại sau." }
}));
app.use("/api/auth/password-reset", rateLimit({
  windowMs: 15 * 60_000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Yêu cầu đặt lại mật khẩu quá nhiều lần. Vui lòng thử lại sau." }
}));
app.use("/api", apiRouter);
app.use(notFound);
app.use(errorHandler);
