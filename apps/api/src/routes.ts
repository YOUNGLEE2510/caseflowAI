import { Router } from "express";
import mongoose from "mongoose";
import { authenticate } from "./middleware/auth.js";
import { authRouter } from "./routes/authRoutes.js";
import { casesRouter } from "./routes/casesRouter.js";
import { dashboardRouter } from "./routes/dashboardRouter.js";
import { caseActionsRouter } from "./routes/caseActionsRouter.js";
import { knowledgeRouter } from "./routes/knowledgeRouter.js";
import { profileRouter } from "./routes/profile.js";
import { adminRouter } from "./routes/admin.js";
import { analyticsRouter } from "./routes/analytics.js";
import { attachmentRouter } from "./routes/attachments.js";
import { notificationRouter } from "./routes/notifications.js";
import { systemRouter } from "./routes/system.js";

export const apiRouter = Router();

/* ── Health (unauthenticated) ── */

apiRouter.get("/health", async (_req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    status: connected ? "ok" : "degraded",
    service: "caseflow-api",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    timestamp: new Date().toISOString()
  });
});

/* ── Auth (mixed: login is public, logout needs auth) ── */

apiRouter.use(authRouter);

/* ── Authenticated sub-routers ── */

apiRouter.use(authenticate);
apiRouter.use(casesRouter);
apiRouter.use(dashboardRouter);
apiRouter.use(caseActionsRouter);
apiRouter.use(knowledgeRouter);
apiRouter.use(profileRouter);
apiRouter.use(adminRouter);
apiRouter.use("/notifications", notificationRouter);
apiRouter.use("/analytics", analyticsRouter);
apiRouter.use(attachmentRouter);
apiRouter.use("/system", systemRouter);
