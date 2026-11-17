import { randomBytes } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDatabase } from "./db.js";
import { Organization, User, ServiceDefinition, CaseRecord, KnowledgeArticle, Incident } from "./models.js";
import { RentalProperty, RentalUnit, RentalAsset, MaintenanceTask } from "./models/rental.js";
import { addBusinessHours } from "./services/workingHours.js";

const slug = "caseflow-rental-demo";
const credentialsFile = process.env.RENTAL_CREDENTIALS_FILE || join(tmpdir(), "caseflow-rental-credentials.json");
await connectDatabase();
try {
  const existing = await Organization.findOne({ slug });
  if (process.env.RENTAL_SETUP_CONFIRM !== slug) {
    console.log(JSON.stringify({ mode: "dry-run", target: slug, exists: Boolean(existing),
      existingOrganizations: await Organization.countDocuments(), existingCases: await CaseRecord.countDocuments(),
      operation: "Create or fill the rental demo organization only; no existing records are removed." }));
  } else {
    try {
      await access(credentialsFile, constants.W_OK);
    } catch (error) {
      if (!(typeof error === "object" && error && "code" in error && error.code === "ENOENT")) {
        throw new Error("Credential file is not writable. Fix its ownership before modifying demo data.");
      }
      await access(dirname(credentialsFile), constants.W_OK);
    }
    const organization = existing || await Organization.create({
      slug, name: "CaseFlow Căn hộ Demo", settings: { serviceDomain: "rental" }
    });
    if (organization.settings?.serviceDomain !== "rental") throw new Error("Organization domain conflict");
    const organizationId = organization._id;
    const password = randomBytes(24).toString("base64url");
    const passwordHash = await bcrypt.hash(password, 12);
    const credentials: { email: string; password: string; organization?: string }[] = [];
    const definitions = [
      ["admin", "Quản trị đơn vị vận hành", "org_admin"],
      ["manager", "Quản lý vận hành", "manager"],
      ["technician", "Kỹ thuật viên", "agent"],
      ["resident", "Người thuê căn A301", "requester"],
      ["resident2", "Người thuê căn A302", "requester"],
      ["resident3", "Người thuê căn B301", "requester"],
      ["resident4", "Người thuê căn A303", "requester"]
    ];
    const members: Record<string, mongoose.Types.ObjectId> = {};
    for (const [key, name, role] of definitions) {
      const email = `${key}@rental.caseflow.local`;
      let user = await User.findOne({ organizationId, email });
      if (!user) {
        user = await User.create({ organizationId, email, name, role, passwordHash, team: "Vận hành căn hộ", title: name });
        credentials.push({ email, password });
      }
      members[key] = user._id;
    }
    const catalog = [
      ["water", "Cấp thoát nước"], ["electrical", "Điện"], ["internet", "Internet"],
      ["appliances", "Thiết bị căn hộ"], ["access_security", "Ra vào và an ninh"], ["general_support", "Hỗ trợ chung"]
    ];
    for (const [key, name] of catalog) await ServiceDefinition.updateOne({ organizationId, key }, { $setOnInsert: {
      organizationId, key, name, category: key, team: "Vận hành căn hộ", slaHours: 24,
      description: "Dịch vụ thử nghiệm. Thời hạn cấu hình không phải cam kết xử lý sự cố khẩn cấp.",
      requiredFields: [], active: true
    } }, { upsert: true });
    for (const code of ["TOWER-A", "TOWER-B"]) await RentalProperty.updateOne({ organizationId, code }, { $setOnInsert: {
      organizationId, code, name: `Cơ sở mô phỏng ${code}`, address: "Địa điểm giả lập, không phải địa chỉ thật"
    } }, { upsert: true });
    for (const [propertyCode, code, resident] of [["TOWER-A", "A301", "resident"], ["TOWER-A", "A302", "resident2"], ["TOWER-A", "A303", "resident4"], ["TOWER-B", "B301", "resident3"]]) {
      await RentalUnit.updateOne({ organizationId, propertyCode, code }, { $setOnInsert: { organizationId, propertyCode, code, floor: "3", residentIds: [members[resident]] } }, { upsert: true });
    }
    for (const [code, propertyCode, unitCode, name, category] of [
      ["PUMP-A", "TOWER-A", "", "Bơm cấp nước dùng chung", "water"],
      ["ROUTER-A", "TOWER-A", "", "Điểm mạng dùng chung", "internet"],
      ["ROUTER-B", "TOWER-B", "", "Thiết bị mạng tầng 3", "internet"],
      ["AC-A301", "TOWER-A", "A301", "Điều hòa căn A301", "appliances"],
      ["LOCK-B301", "TOWER-B", "B301", "Khóa từ căn B301", "access_security"]
    ]) await RentalAsset.updateOne({ organizationId, code }, { $setOnInsert: { organizationId, code, propertyCode, unitCode, name, category } }, { upsert: true });
    const now = Date.now();
    for (const [code, resident, propertyCode, unitCode, title, description, category, assetCode, status, extra] of [
      ["RENTAL-DEMO-001", "resident", "TOWER-A", "A301", "Nước yếu từ sáng", "Tất cả vòi trong căn A301 đều chảy yếu từ khoảng 8 giờ sáng.", "water", "PUMP-A", "new", {}],
      ["RENTAL-DEMO-002", "resident2", "TOWER-A", "A302", "Vòi sen gần như không có nước", "Sáng nay nước ở bếp và phòng tắm căn A302 đều rất yếu.", "water", "PUMP-A", "new", {}],
      ["RENTAL-DEMO-003", "resident3", "TOWER-B", "B301", "Nước chảy yếu trong bếp", "Căn B301 tại cơ sở khác có vòi bếp bị yếu nhưng vòi sen bình thường.", "water", "", "new", {}],
      ["RENTAL-DEMO-004", "resident", "TOWER-A", "A301", "Điều hòa không lạnh", "Điều hòa vẫn chạy nhưng phòng không mát sau khoảng một giờ.", "appliances", "AC-A301", "new", {}],
      ["RENTAL-DEMO-005", "resident4", "TOWER-A", "A303", "Nước yếu tại căn A303", "Nước yếu ở tất cả vòi trong căn từ sáng nay.", "water", "PUMP-A", "new", {}],
      ["RENTAL-DEMO-006", "resident3", "TOWER-B", "B301", "Mất kết nối Wi-Fi buổi tối", "Mạng Wi-Fi tầng 3 tòa B rớt liên tục từ 19 giờ.", "internet", "ROUTER-B", "in_progress", { priority: "high", assigneeId: members.technician, assigneeName: "Kỹ thuật viên" }],
      ["RENTAL-DEMO-007", "resident2", "TOWER-A", "A302", "Aptomat bếp nhảy liên tục", "Cứ bật bếp từ là aptomat tổng trong căn tự ngắt.", "electrical", "", "triaged", { priority: "high" }],
      ["RENTAL-DEMO-008", "resident4", "TOWER-A", "A303", "Hẹn kiểm tra van nước bếp", "Đã báo lịch nhưng chưa có mặt ở căn, chờ xác nhận khung giờ chiều.", "water", "", "waiting", { assigneeId: members.technician, assigneeName: "Kỹ thuật viên" }],
      ["RENTAL-DEMO-009", "resident3", "TOWER-B", "B301", "Thẻ từ không mở được cửa căn", "Đã thay pin khóa từ và kiểm tra lại thẻ cho người thuê.", "access_security", "LOCK-B301", "resolved", { resolvedAt: new Date(now - 2 * 86_400_000), satisfaction: 5, satisfactionAt: new Date(now - 86_400_000) }],
      ["RENTAL-DEMO-010", "resident", "TOWER-A", "A301", "Kiểm tra điểm mạng dùng chung", "Đã khởi động lại bộ phát và đo lại tín hiệu tại hành lang.", "internet", "ROUTER-A", "closed", { resolvedAt: new Date(now - 5 * 86_400_000), closedAt: new Date(now - 4 * 86_400_000), satisfaction: 4, satisfactionAt: new Date(now - 4 * 86_400_000) }]
    ] as Array<[string, string, string, string, string, string, string, string, string, Record<string, unknown>]>) {
      const createdAt = new Date(now - (["resolved", "closed"].includes(status) ? 7 * 86_400_000 : 0));
      await CaseRecord.updateOne({ organizationId, code }, { $setOnInsert: {
        organizationId, code, requesterId: members[resident], requesterName: definitions.find(item => item[0] === resident)![1],
        propertyCode, unitCode, assetCode, title, description, category, serviceKey: category,
        team: "Vận hành căn hộ", status, createdAt, updatedAt: new Date(now), dueAt: addBusinessHours(createdAt, 24),
        ai: { processingStatus: "queued", reviewStatus: "pending" }, ...extra
      } }, { upsert: true, runValidators: true, timestamps: false });
    }
    const wifiCase = await CaseRecord.findOne({ organizationId, code: "RENTAL-DEMO-006" }).select("_id").lean<{ _id: mongoose.Types.ObjectId }>();
    if (wifiCase) {
      await Incident.updateOne({ organizationId, code: "INC-DEMO-WIFI-B" }, { $setOnInsert: {
        organizationId, code: "INC-DEMO-WIFI-B", title: "Gián đoạn mạng tầng 3 TOWER-B",
        summary: "Điểm phát mạng khu vực tầng 3 tòa B suy hao tín hiệu vào giờ cao điểm.",
        severity: "medium", status: "investigating", propertyCode: "TOWER-B", team: "Vận hành căn hộ",
        ownerId: members.technician, ownerName: "Kỹ thuật viên", caseIds: [wifiCase._id], affectedCount: 1,
        signal: { keywords: ["wifi", "mất mạng", "tầng 3"], clusterScore: 0.72, growthRate: 0, detectionConfidence: 0.72 },
        responseTimeline: [{ type: "created", label: "Đã tạo sự cố", actorName: "Quản lý vận hành" }]
      } }, { upsert: true });
    }
    await MaintenanceTask.updateOne({ organizationId, key: "rental-demo-task-pump-a" }, { $setOnInsert: {
      organizationId, key: "rental-demo-task-pump-a", fingerprint: "rental-demo-task-pump-a",
      propertyCode: "TOWER-A", assetCode: "PUMP-A", title: "Kiểm tra áp lực và van một chiều bơm PUMP-A",
      dueAt: new Date(now + 2 * 86_400_000), assigneeId: members.technician, status: "planned"
    } }, { upsert: true });
    await MaintenanceTask.updateOne({ organizationId, key: "rental-demo-task-ac-a301" }, { $setOnInsert: {
      organizationId, key: "rental-demo-task-ac-a301", fingerprint: "rental-demo-task-ac-a301",
      propertyCode: "TOWER-A", assetCode: "AC-A301", title: "Vệ sinh dàn lạnh và kiểm tra gas điều hòa A301",
      dueAt: new Date(now - 86_400_000), assigneeId: members.technician, status: "completed",
      result: "Đã vệ sinh lưới lọc và bổ sung gas R32 đạt chuẩn.", completedAt: new Date(now - 86_400_000),
      createdAt: new Date(now - 2 * 86_400_000), updatedAt: new Date(now - 86_400_000)
    } }, { upsert: true, timestamps: false });
    const knowledgeTitle = "Tiếp nhận phản ánh cấp thoát nước";
    await KnowledgeArticle.updateOne({ organizationId, title: knowledgeTitle }, { $setOnInsert: {
      organizationId, title: knowledgeTitle, category: "water", status: "draft", sourceLabel: "Quy trình mô phỏng CaseFlow",
      content: "Ghi cơ sở, căn, thời điểm bắt đầu và phạm vi ảnh hưởng. Không kết luận cùng nguyên nhân chỉ vì mô tả giống nhau. Có dấu hiệu ngập gần điện thì chuyển đầu mối khẩn, không hướng dẫn người thuê tiếp cận vùng nguy hiểm. Kỹ thuật kiểm tra, ghi kết quả từng vị trí; khôi phục sự cố chung không tự đóng phản ánh riêng.",
      tags: ["nước", "tiếp nhận"], version: "demo-1"
    } }, { upsert: true });
    const isolationSlug = "caseflow-rental-isolation-demo";
    const isolation = await Organization.findOne({ slug: isolationSlug }) || await Organization.create({
      slug: isolationSlug, name: "Căn hộ Demo - Đối chứng cách ly", settings: { serviceDomain: "rental" }
    });
    const isolationEmail = "outsider@rental.caseflow.local";
    if (!await User.exists({ organizationId: isolation._id, email: isolationEmail })) {
      await User.create({ organizationId: isolation._id, email: isolationEmail, name: "Quản lý tổ chức đối chứng",
        role: "manager", passwordHash, team: "Vận hành căn hộ" });
      credentials.push({ email: isolationEmail, password, organization: isolationSlug });
    }
    if (credentials.length) {
      let previous: typeof credentials = [];
      try {
        const stored = JSON.parse(await readFile(credentialsFile, "utf8"));
        if (stored.organization === slug && Array.isArray(stored.credentials)) previous = stored.credentials;
      } catch { /* First setup has no credential file. */ }
      await writeFile(credentialsFile,
        JSON.stringify({ organization: slug, datasetKind: "synthetic-demo", credentials: [...previous, ...credentials] }, null, 2), { mode: 0o600 });
    }
    console.log(JSON.stringify({ organization: slug, cases: await CaseRecord.countDocuments({ organizationId }),
      properties: await RentalProperty.countDocuments({ organizationId }), createdUsers: credentials.length,
      credentialsFile: credentials.length ? credentialsFile : null }));
  }
} finally {
  await mongoose.disconnect();
}
