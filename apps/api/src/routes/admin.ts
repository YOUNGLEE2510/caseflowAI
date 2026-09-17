import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireRoles } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import { CaseRecord, KnowledgeArticle, ServiceDefinition, User } from "../models.js";
import { auditFromReq, logAudit, notify } from "../services/helpers.js";

export const adminRouter = Router();

/* ═══════════════════════════════════════════════
   SERVICE DEFINITION CRUD
   ═══════════════════════════════════════════════ */

const createServiceSchema = z.object({
  key: z.string().trim().min(2).max(50).regex(/^[a-z][a-z0-9_]*$/),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).default(""),
  category: z.enum(["it_access", "academic_records", "student_services", "facilities", "finance", "general_support"]),
  team: z.string().trim().min(2).max(60),
  slaHours: z.number().int().min(1).max(720),
  escalationHours: z.number().int().min(1).max(720).nullable().default(null),
  autoAssign: z.literal(false).default(false),
  requiredFields: z.array(z.string().trim().min(1).max(80).refine((value) => !/[.$]/.test(value) && !["__proto__", "constructor", "prototype"].includes(value))).max(12).refine((fields) => new Set(fields).size === fields.length).default([]),
  sortOrder: z.number().int().default(0)
});

const updateServiceSchema = createServiceSchema.partial().omit({ key: true }).extend({ active: z.boolean().optional() });

adminRouter.post(
  "/services",
  requireRoles("org_admin", "platform_admin"),
  async (req, res) => {
    const input = createServiceSchema.parse(req.body);
    const exists = await ServiceDefinition.findOne({
      organizationId: req.auth!.organizationId,
      key: input.key
    });
    if (exists) throw new HttpError(409, `Mã dịch vụ "${input.key}" đã tồn tại.`);

    const service = await ServiceDefinition.create({
      ...input,
      organizationId: req.auth!.organizationId
    });

    await logAudit({
      ...auditFromReq(req),
      action: "service.create",
      resource: "ServiceDefinition",
      resourceId: String(service._id),
      changes: input
    }, req);

    res.status(201).json({ service });
  }
);

adminRouter.patch(
  "/services/:id",
  requireRoles("org_admin", "platform_admin"),
  async (req, res) => {
    const input = updateServiceSchema.parse(req.body);
    const current = await ServiceDefinition.findOne({ _id: req.params.id, organizationId: req.auth!.organizationId }).lean<any>();
    if (!current) throw new HttpError(404, "Không tìm thấy dịch vụ.");
    if (current.key === "general_support" && (input.active === false || input.requiredFields?.length)) throw new HttpError(422, "Dịch vụ tiếp nhận chung cần luôn hoạt động và không có trường bổ sung bắt buộc.");
    const service = await ServiceDefinition.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.auth!.organizationId },
      { $set: input },
      { new: true, runValidators: true }
    );
    if (!service) throw new HttpError(404, "Không tìm thấy dịch vụ.");

    await logAudit({
      ...auditFromReq(req),
      action: "service.update",
      resource: "ServiceDefinition",
      resourceId: String(service._id),
      changes: input
    }, req);

    res.json({ service });
  }
);

adminRouter.delete(
  "/services/:id",
  requireRoles("org_admin", "platform_admin"),
  async (req, res) => {
    const service = await ServiceDefinition.findOne({ _id: req.params.id, organizationId: req.auth!.organizationId });
    if (!service) throw new HttpError(404, "Không tìm thấy dịch vụ.");
    if (service.key === "general_support") throw new HttpError(422, "Không thể khóa dịch vụ tiếp nhận chung.");
    service.active = false;
    await service.save();

    await logAudit({
      ...auditFromReq(req),
      action: "service.delete",
      resource: "ServiceDefinition",
      resourceId: String(service._id)
    }, req);

    res.json({ message: "Dịch vụ đã được vô hiệu hóa.", service });
  }
);

/* ═══════════════════════════════════════════════
   USER MANAGEMENT CRUD
   ═══════════════════════════════════════════════ */

const createUserSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(10).max(128),
  role: z.enum(["requester", "agent", "manager", "org_admin"]),
  team: z.string().trim().max(60).default(""),
  title: z.string().trim().max(100).default(""),
  phone: z.string().trim().max(20).default(""),
  skills: z.array(z.string().trim()).default([]),
  maxCaseload: z.number().int().min(1).max(100).default(15),
  avatarColor: z.string().default("#155c4d")
});

const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  role: z.enum(["requester", "agent", "manager", "org_admin"]).optional(),
  team: z.string().trim().max(60).optional(),
  title: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(20).optional(),
  skills: z.array(z.string().trim()).optional(),
  maxCaseload: z.number().int().min(1).max(100).optional(),
  avatarColor: z.string().optional(),
  active: z.boolean().optional()
});

adminRouter.post(
  "/users",
  requireRoles("org_admin", "platform_admin"),
  async (req, res) => {
    const input = createUserSchema.parse(req.body);
    if (input.role === "agent" && !input.team) throw new HttpError(422, "Nhân viên cần được gán đơn vị phụ trách.");
    const exists = await User.findOne({
      organizationId: req.auth!.organizationId,
      email: input.email.toLowerCase()
    });
    if (exists) throw new HttpError(409, `Email "${input.email}" đã được sử dụng.`);

    const passwordHash = await bcrypt.hash(input.password, 12);
    const { password: _, ...rest } = input;
    const user = await User.create({
      ...rest,
      email: input.email.toLowerCase(),
      passwordHash,
      organizationId: req.auth!.organizationId
    });

    await logAudit({
      ...auditFromReq(req),
      action: "user.create",
      resource: "User",
      resourceId: String(user._id),
      changes: { name: input.name, email: input.email, role: input.role, team: input.team }
    }, req);

    res.status(201).json({
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        team: user.team,
        title: user.title,
        active: user.active
      }
    });
  }
);

adminRouter.patch(
  "/users/:id",
  requireRoles("org_admin", "platform_admin"),
  async (req, res) => {
    const input = updateUserSchema.parse(req.body);
    const current = await User.findOne({ _id: req.params.id, organizationId: req.auth!.organizationId }).lean<any>();
    if (!current) throw new HttpError(404, "Không tìm thấy người dùng.");
    if (current.role === "platform_admin" || (["org_admin"].includes(current.role) && (input.active === false || (input.role && input.role !== current.role)))) throw new HttpError(403, "Tài khoản quản trị được bảo vệ khỏi thao tác khóa hoặc hạ quyền.");
    const nextRole = input.role || current.role;
    const nextTeam = input.team ?? current.team;
    if (nextRole === "agent" && !nextTeam) throw new HttpError(422, "Nhân viên cần có đơn vị phụ trách.");
    if (input.active === false || nextRole !== current.role || nextTeam !== current.team) {
      const assigned = await CaseRecord.exists({ organizationId: req.auth!.organizationId, assigneeId: current._id, status: { $nin: ["resolved", "closed"] } });
      if (assigned) throw new HttpError(422, "Hãy chuyển các hồ sơ đang phụ trách trước khi khóa hoặc đổi vai trò/đơn vị.");
    }
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.auth!.organizationId },
      { $set: input, $inc: { tokenVersion: 1 } },
      { new: true, runValidators: true }
    );
    if (!user) throw new HttpError(404, "Không tìm thấy người dùng.");

    const actionType = input.active === false ? "user.deactivate" : "user.update";
    await logAudit({
      ...auditFromReq(req),
      action: actionType,
      resource: "User",
      resourceId: String(user._id),
      changes: input
    }, req);

    res.json({
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        team: user.team,
        title: user.title,
        active: user.active
      }
    });
  }
);

adminRouter.patch(
  "/users/:id/password",
  requireRoles("org_admin", "platform_admin"),
  async (req, res) => {
    const input = z.object({ password: z.string().min(10).max(128) }).parse(req.body);
    const current = await User.findOne({ _id: req.params.id, organizationId: req.auth!.organizationId }).lean<any>();
    if (!current) throw new HttpError(404, "Không tìm thấy người dùng.");
    if (current.role === "platform_admin" || (current.role === "org_admin" && req.auth!.role !== "platform_admin" && req.auth!.id !== String(current._id))) throw new HttpError(403, "Không được đặt lại mật khẩu của quản trị viên khác.");
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.auth!.organizationId },
      { $set: { passwordHash }, $inc: { tokenVersion: 1 } }
    );
    if (!user) throw new HttpError(404, "Không tìm thấy người dùng.");
    await logAudit({ ...auditFromReq(req), action: "user.update", resource: "User", resourceId: String(user._id), changes: { passwordReset: true } }, req);
    res.json({ message: "Mật khẩu đã được cập nhật." });
  }
);

/* ═══════════════════════════════════════════════
   KNOWLEDGE ARTICLE CRUD
   ═══════════════════════════════════════════════ */

const createArticleSchema = z.object({
  title: z.string().trim().min(5).max(200),
  content: z.string().trim().min(20).max(50_000),
  category: z.string().trim().min(2).max(60),
  tags: z.array(z.string().trim()).default([]),
  sourceLabel: z.string().trim().min(2).max(120),
  sourceUrl: z.string().url().refine((url) => /^https?:\/\//i.test(url)).or(z.literal("")).default(""),
  version: z.string().trim().min(1).max(30).default("1.0"),
  status: z.enum(["draft", "published"]).default("draft")
});

const updateArticleSchema = createArticleSchema.partial();

adminRouter.post(
  "/knowledge",
  requireRoles("agent", "manager", "org_admin", "platform_admin"),
  async (req, res) => {
    const input = createArticleSchema.parse(req.body);
    if (input.status === "published" && req.auth!.role === "agent") throw new HttpError(403, "Tài liệu cần được quản lý phê duyệt.");
    const article = await KnowledgeArticle.create({
      ...input,
      organizationId: req.auth!.organizationId,
      authorId: req.auth!.id,
      authorName: req.auth!.name,
      reviewedByName: input.status === "published" ? req.auth!.name : "",
      reviewedAt: input.status === "published" ? new Date() : null
    });

    await logAudit({
      ...auditFromReq(req),
      action: "knowledge.create",
      resource: "KnowledgeArticle",
      resourceId: String(article._id),
      changes: { title: input.title, category: input.category }
    }, req);

    res.status(201).json({ article });
  }
);

adminRouter.patch(
  "/knowledge/:id",
  requireRoles("agent", "manager", "org_admin", "platform_admin"),
  async (req, res) => {
    const input = updateArticleSchema.parse(req.body);
    const current = await KnowledgeArticle.findOne({ _id: req.params.id, organizationId: req.auth!.organizationId }).lean<any>();
    if (!current) throw new HttpError(404, "Không tìm thấy tài liệu.");
    if (req.auth!.role === "agent" && (String(current.authorId) !== req.auth!.id || input.status === "published")) throw new HttpError(403, "Chỉ được sửa bản nháp của mình; quản lý thực hiện phê duyệt.");
    const status = input.status || "draft";
    const article = await KnowledgeArticle.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.auth!.organizationId },
      { $set: { ...input, status, reviewedByName: status === "published" ? req.auth!.name : "", reviewedAt: status === "published" ? new Date() : null } },
      { new: true, runValidators: true }
    );
    if (!article) throw new HttpError(404, "Không tìm thấy tài liệu.");

    await logAudit({
      ...auditFromReq(req),
      action: "knowledge.update",
      resource: "KnowledgeArticle",
      resourceId: String(article._id),
      changes: input
    }, req);

    res.json({ article });
  }
);

adminRouter.delete(
  "/knowledge/:id",
  requireRoles("org_admin", "platform_admin"),
  async (req, res) => {
    const article = await KnowledgeArticle.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.auth!.organizationId },
      { $set: { active: false } },
      { new: true }
    );
    if (!article) throw new HttpError(404, "Không tìm thấy tài liệu.");

    await logAudit({
      ...auditFromReq(req),
      action: "knowledge.delete",
      resource: "KnowledgeArticle",
      resourceId: String(article._id)
    }, req);

    res.json({ message: "Tài liệu đã được vô hiệu hóa." });
  }
);
