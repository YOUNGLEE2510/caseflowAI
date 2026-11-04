import { Router } from "express";
import { parsePatch } from "../services/parsePatch.js";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { parseUserCsv } from "../services/userCsv.js";
import { enqueuePasswordReset } from "../services/emailOutbox.js";
import { Organization } from "../models.js";
import { z } from "zod";
import { requireRoles } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import { CaseRecord, KnowledgeArticle, ServiceDefinition, User } from "../models.js";
import { auditFromReq, logAudit, notify } from "../services/helpers.js";
import { newPasswordSchema as passwordSchema } from "../services/passwordPolicy.js";

export const adminRouter = Router();



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
    const input = parsePatch(updateServiceSchema, req.body);
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


const createUserSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().email(),
  password: passwordSchema,
  role: z.enum(["requester", "agent", "manager", "org_admin"]),
  team: z.string().trim().max(60).default(""),
  title: z.string().trim().max(100).default(""),
  phone: z.string().trim().max(20).default(""),
  skills: z.array(z.string().trim()).default([]),
  maxCaseload: z.number().int().min(1).max(100).default(15),
  personnelManager: z.boolean().default(false),
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
  personnelManager: z.boolean().optional(),
  avatarColor: z.string().optional(),
  active: z.boolean().optional()
});

adminRouter.post("/users/import", requireRoles("org_admin", "platform_admin"), rateLimit({ windowMs: 15 * 60_000, limit: 10,
  keyGenerator: req => req.auth!.id, standardHeaders: "draft-7", legacyHeaders: false }), async (req, res) => {
  const input = z.object({ csv: z.string().min(1).max(100000), confirm: z.boolean().default(false) }).strict().parse(req.body);
  let rows: ReturnType<typeof parseUserCsv>;
  try { rows = parseUserCsv(input.csv); } catch { throw new HttpError(422, "CSV không hợp lệ: cần name,email,role,team; tối đa 100 dòng, vai trò requester/agent và email không trùng."); }
  const organizationId = req.auth!.organizationId;
  const existing = await User.find({ organizationId, email: { $in: rows.map(row => row.email) } }).select("email").lean<Array<{ email: string }>>();
  const duplicates = new Set(existing.map(row => row.email));
  if (!input.confirm) { res.json({ rows: rows.map(row => ({ ...row, exists: duplicates.has(row.email) })), total: rows.length }); return; }
  const organization = await Organization.findById(organizationId).select("slug").lean<{ slug: string }>();
  if (!organization) throw new HttpError(404, "Không tìm thấy tổ chức.");
  const results: Array<{ email: string; status: string }> = [];
  for (const row of rows) {
    if (duplicates.has(row.email)) { results.push({ email: row.email, status: "exists" }); continue; }
    try {
      await User.create({ ...row, organizationId, passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 12), mustChangePassword: true });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      results.push({ email: row.email, status: "exists" }); continue;
    }
    try { await enqueuePasswordReset(organization.slug, row.email); results.push({ email: row.email, status: "created" }); }
    catch { results.push({ email: row.email, status: "created_email_pending" }); }
  }
  await logAudit({ ...auditFromReq(req), action: "user.create", resource: "User", changes: { operation: "csv_import", created: results.filter(row => row.status.startsWith("created")).length } }, req);
  res.json({ results });
});

adminRouter.post(
  "/users",
  requireRoles("org_admin", "platform_admin"),
  async (req, res) => {
    const input = createUserSchema.parse(req.body);
    if (input.role === "requester" && input.personnelManager) throw new HttpError(422, "Sinh viên không được cấp quyền quản lý nhân sự.");
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
      mustChangePassword: true,
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
    if (nextRole === "requester" && input.personnelManager === true) throw new HttpError(422, "Sinh viên không được cấp quyền quản lý nhân sự.");
    if (nextRole === "requester") input.personnelManager = false;
    const nextTeam = input.team ?? current.team;
    if (nextRole === "agent" && !nextTeam) throw new HttpError(422, "Nhân viên cần có đơn vị phụ trách.");
    if (input.active === false || nextRole !== current.role || nextTeam !== current.team) {
      const assigned = await CaseRecord.exists({ organizationId: req.auth!.organizationId, assigneeId: current._id, status: { $nin: ["resolved", "closed"] } });
      if (assigned) throw new HttpError(422, "Hãy chuyển các hồ sơ đang phụ trách trước khi khóa hoặc đổi vai trò/đơn vị.");
    }
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.auth!.organizationId },
      { $set: input, ...((nextRole !== current.role || nextTeam !== current.team || (input.active !== undefined && input.active !== current.active)) ? { $inc: { tokenVersion: 1 } } : {}) },
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
    const input = z.object({ password: passwordSchema }).parse(req.body);
    const current = await User.findOne({ _id: req.params.id, organizationId: req.auth!.organizationId }).lean<any>();
    if (!current) throw new HttpError(404, "Không tìm thấy người dùng.");
    if (current.role === "platform_admin" || (current.role === "org_admin" && req.auth!.role !== "platform_admin" && req.auth!.id !== String(current._id))) throw new HttpError(403, "Không được đặt lại mật khẩu của quản trị viên khác.");
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.auth!.organizationId },
      { $set: { passwordHash, mustChangePassword: true }, $inc: { tokenVersion: 1 } }
    );
    if (!user) throw new HttpError(404, "Không tìm thấy người dùng.");
    await logAudit({ ...auditFromReq(req), action: "user.update", resource: "User", resourceId: String(user._id), changes: { passwordReset: true } }, req);
    res.json({ message: "Mật khẩu đã được cập nhật." });
  }
);


const createArticleSchema = z.object({
  title: z.string().trim().min(5).max(200),
  content: z.string().trim().min(20).max(50_000),
  category: z.string().trim().min(2).max(60),
  tags: z.array(z.string().trim()).default([]),
  sourceLabel: z.string().trim().min(2).max(120),
  sourceUrl: z.string().url().refine((url) => /^https?:\/\//i.test(url)).or(z.literal("")).default(""),
  version: z.string().trim().min(1).max(30).default("1.0"),
  effectiveAt: z.string().datetime({ offset: true }).transform(value => new Date(value)).optional(),
  expiresAt: z.string().datetime({ offset: true }).transform(value => new Date(value)).nullable().optional(),
  status: z.enum(["draft", "published"]).default("draft")
});

const updateArticleSchema = createArticleSchema.partial().extend({ expectedUpdatedAt: z.string().datetime({ offset: true }).optional() });

adminRouter.post(
  "/knowledge",
  requireRoles("agent", "manager", "org_admin", "platform_admin"),
  async (req, res) => {
    const input = createArticleSchema.parse(req.body);
    if (input.expiresAt && input.expiresAt <= (input.effectiveAt || new Date())) throw new HttpError(422, "Ngày hết hạn phải sau ngày hiệu lực.");
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
    const { expectedUpdatedAt, ...input } = parsePatch(updateArticleSchema, req.body);
    const current = await KnowledgeArticle.findOne({ _id: req.params.id, organizationId: req.auth!.organizationId }).select("+revisions").lean<any>();
    if (!current) throw new HttpError(404, "Không tìm thấy tài liệu.");
    if (expectedUpdatedAt && new Date(expectedUpdatedAt).getTime() !== new Date(current.updatedAt).getTime()) throw new HttpError(409, "Tài liệu đã thay đổi từ khi bạn mở. Vui lòng tải lại.");
    const effectiveAt = input.effectiveAt ?? current.effectiveAt;
    const expiresAt = input.expiresAt === undefined ? current.expiresAt : input.expiresAt;
    if (expiresAt && new Date(expiresAt) <= new Date(effectiveAt)) throw new HttpError(422, "Ngày hết hạn phải sau ngày hiệu lực.");
    if (req.auth!.role === "agent" && (String(current.authorId) !== req.auth!.id || current.status !== "draft" || input.status === "published")) throw new HttpError(403, "Chỉ được sửa bản nháp của mình; quản lý thực hiện phê duyệt.");
    const status = input.status ?? current.status;
    const isPublishing = input.status === "published" && current.status !== "published";
    const isUnpublishing = input.status === "draft" && current.status !== "draft";
    const contentChanged = Object.entries(input).some(([key, value]) => key !== "status" && JSON.stringify(value) !== JSON.stringify(current[key]));
    if (current.status === "published" && contentChanged && input.status === undefined) throw new HttpError(409, "Chọn công bố lại hoặc chuyển bản nháp khi sửa tài liệu đã công bố.");
    const republishing = current.status === "published" && status === "published" && contentChanged;
    const archiveCurrent = current.status === "published" && (contentChanged || isUnpublishing);
    if (archiveCurrent && (current.revisions?.length || 0) >= 100) throw new HttpError(422, "Tài liệu đã đạt giới hạn phiên bản; hãy lưu trữ tài liệu trước khi tạo bản mới.");
    const versionExists = (version: string) => current.revisions?.some((revision: { version: string }) => revision.version === version);
    if ((republishing || isPublishing) && input.version && input.version !== current.version && versionExists(input.version)) throw new HttpError(409, "Phiên bản này đã tồn tại.");
    const snapshot = Object.fromEntries(["title", "content", "category", "tags", "sourceLabel", "sourceUrl", "version", "effectiveAt", "expiresAt", "reviewedByName", "reviewedAt"].map(key => [key, current[key]]));
    const article = await KnowledgeArticle.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.auth!.organizationId, updatedAt: current.updatedAt },
      {
        ...(archiveCurrent ? { $push: { revisions: snapshot } } : {}),
        $set: {
          ...input,
          ...((republishing && (!input.version || input.version === current.version) || isPublishing && versionExists(input.version || current.version)) ? { version: `rev-${Date.now()}-${(current.revisions?.length || 0) + 1}` } : {}),
          status,
          reviewedByName: isPublishing || republishing ? req.auth!.name : isUnpublishing ? "" : current.reviewedByName,
          reviewedAt: isPublishing || republishing ? new Date() : isUnpublishing ? null : current.reviewedAt
        }
      },
      { new: true, runValidators: true }
    );
    if (!article) throw new HttpError(409, "Tài liệu vừa được cập nhật. Vui lòng tải lại trước khi sửa.");

    await logAudit({
      ...auditFromReq(req),
      action: "knowledge.update",
      resource: "KnowledgeArticle",
      resourceId: String(article._id),
      changes: { fields: Object.keys(input), title: input.title, status: input.status, version: input.version }
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
