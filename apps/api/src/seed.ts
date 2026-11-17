// Local/E2E seed: one rental organisation with the shared department structure.
// Refuses to run outside local mode or against Atlas; never resets existing data.
import bcrypt from "bcryptjs";
import type mongoose from "mongoose";
import { config } from "./config.js";
import { connectDatabase } from "./db.js";
import { CaseRecord, Incident, KnowledgeArticle, Organization, ServiceDefinition, User } from "./models.js";
import { RentalAsset, RentalProperty, RentalUnit } from "./models/rental.js";
import { RESIDENT_EMAIL_DOMAIN, SERVICE_NAMES, STAFF, STAFF_EMAILS, TEAM_BY_CATEGORY, type Category } from "./demo/rentalOrg.js";

export const LOCAL_ORGANIZATION_SLUG = "caseflow-rental-local";
/** Local test residents; staff use STAFF_EMAILS from the shared organisation chart. */
export const LOCAL_RESIDENTS = {
  primary: { name: "Nguyễn Minh Anh", email: `nguyen.anh@${RESIDENT_EMAIL_DOMAIN}` },
  secondary: { name: "Trần Quốc Minh", email: `tran.minh@${RESIDENT_EMAIL_DOMAIN}` }
} as const;

const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000);
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000);
// Service-specific intake fields shown on the request form.
const REQUIRED_FIELDS: Partial<Record<Category, string[]>> = { appliances: ["Vị trí trong căn"], water: ["Vị trí trong căn"] };
const SLA_HOURS: Record<Category, number> = { water: 8, electrical: 8, internet: 12, appliances: 24, access_security: 4, general_support: 48 };

export async function seedDatabase(force = false) {
  if (config.DEPLOYMENT_MODE !== "local") throw new Error("Demo seeding is disabled outside local environments.");
  if (force) throw new Error("Destructive seed reset is disabled. Use a separate disposable demo database.");
  if (config.MONGODB_URI.startsWith("mongodb+srv://")) throw new Error("Demo seeding is disabled for Atlas. Use a disposable local database.");
  const existing = await Organization.findOne({ slug: LOCAL_ORGANIZATION_SLUG });
  if (existing) return existing;

  const organization = await Organization.create({
    name: "CaseFlow Căn hộ (thử nghiệm)", slug: LOCAL_ORGANIZATION_SLUG,
    settings: { serviceDomain: "rental", locale: "vi-VN", timezone: "Asia/Ho_Chi_Minh" }
  });
  const organizationId = organization._id;
  const passwordHash = await bcrypt.hash("Demo123!", 10);
  const staffDocs = await User.insertMany(STAFF.map(member => ({
    organizationId, name: member.name, email: STAFF_EMAILS[member.key], passwordHash, role: member.role, team: member.team,
    title: member.title, skills: member.skills, personnelManager: Boolean(member.personnelManager), employeeCode: member.employeeCode,
    workingDays: member.workingDays || [1, 2, 3, 4, 5], workStart: member.workStart || "08:00", workEnd: member.workEnd || "17:00",
    maxCaseload: member.role === "agent" ? 15 : 0, joinedAt: hoursAgo(24 * 400)
  })));
  const staff = Object.fromEntries(STAFF.map((member, index) => [member.key, staffDocs[index]])) as Record<string, { _id: mongoose.Types.ObjectId; name: string }>;
  const [primary, secondary] = await User.insertMany([
    { organizationId, ...LOCAL_RESIDENTS.primary, passwordHash, role: "requester", title: "Người thuê căn A301", avatarColor: "#2f6d91" },
    { organizationId, ...LOCAL_RESIDENTS.secondary, passwordHash, role: "requester", title: "Người thuê căn A302", avatarColor: "#7b5d9b" }
  ]);

  await ServiceDefinition.insertMany((Object.keys(SERVICE_NAMES) as Category[]).map(key => ({
    organizationId, key, name: SERVICE_NAMES[key], category: key, team: TEAM_BY_CATEGORY[key], slaHours: SLA_HOURS[key],
    description: `Tiếp nhận phản ánh nhóm ${SERVICE_NAMES[key].toLowerCase()} trong căn hộ và khu chung.`,
    requiredFields: REQUIRED_FIELDS[key] || [], active: true
  })));
  await RentalProperty.insertMany([
    { organizationId, code: "TOWER-A", name: "Tòa A (thử nghiệm)", address: "Địa chỉ giả lập", active: true },
    { organizationId, code: "TOWER-B", name: "Tòa B (thử nghiệm)", address: "Địa chỉ giả lập", active: true }
  ]);
  await RentalUnit.insertMany([
    { organizationId, propertyCode: "TOWER-A", code: "A301", floor: "3", residentIds: [primary._id, secondary._id], occupancyStatus: "occupied", readinessStatus: "ready" },
    { organizationId, propertyCode: "TOWER-A", code: "A302", floor: "3", residentIds: [secondary._id], occupancyStatus: "notice", readinessStatus: "ready", availableFrom: hoursFromNow(24 * 14), statusNote: "Khách báo trả căn cuối tháng" },
    { organizationId, propertyCode: "TOWER-A", code: "A303", floor: "3", residentIds: [], occupancyStatus: "vacant", readinessStatus: "needs_cleaning", statusNote: "Khách vừa trả căn" },
    { organizationId, propertyCode: "TOWER-A", code: "A304", floor: "3", residentIds: [], occupancyStatus: "vacant", readinessStatus: "ready", statusNote: "Sẵn sàng cho thuê" },
    { organizationId, propertyCode: "TOWER-A", code: "A305", floor: "3", residentIds: [], occupancyStatus: "vacant", readinessStatus: "under_repair", statusNote: "Thay sàn gỗ phòng ngủ" },
    { organizationId, propertyCode: "TOWER-B", code: "B301", floor: "3", residentIds: [], occupancyStatus: "reserved", readinessStatus: "cleaned", statusNote: "Khách đã đặt cọc" }
  ]);
  await RentalAsset.insertMany([
    { organizationId, propertyCode: "TOWER-A", unitCode: "", code: "PUMP-A", name: "Bơm cấp nước tòa A", category: "water", active: true },
    { organizationId, propertyCode: "TOWER-A", unitCode: "", code: "ROUTER-A3", name: "Bộ phát Wi-Fi tầng 3 tòa A", category: "internet", active: true },
    { organizationId, propertyCode: "TOWER-A", unitCode: "A301", code: "AC-A301", name: "Điều hòa phòng ngủ A301", category: "appliances", active: true }
  ]);

  const events = (actorId: unknown, actorName: string, createdAt: Date) => [
    { type: "created", label: "Hồ sơ được tạo", actorId, actorName, createdAt },
    { type: "ai_triage", label: "AI đã phân loại và đề xuất điều phối", actorName: "CaseFlow AI", createdAt }
  ];
  const requesters = { primary, secondary };
  type Seed = [code: string, title: string, description: string, category: Category, priority: string, status: string,
    requester: keyof typeof requesters, assignee: string | null, ageHours: number, dueInHours: number, unitCode: string, risk: number];
  const seeds: Seed[] = [
    ["CF-2026-0001", "Điều hòa phòng ngủ không lạnh", "Điều hòa chạy nhưng chỉ thổi gió, phòng vẫn nóng sau một giờ.", "appliances", "high", "in_progress", "primary", "hvac_1", 6, 2, "A301", 0.78],
    ["CF-2026-0002", "Mất Wi-Fi cả tầng 3", "Từ 19 giờ không kết nối được Wi-Fi, hàng xóm cùng tầng cũng bị.", "internet", "urgent", "triaged", "secondary", "it_1", 7, 1, "A302", 0.86],
    ["CF-2026-0003", "Nước yếu ở tất cả vòi", "Nước ở bếp và phòng tắm đều chảy rất yếu từ sáng.", "water", "high", "new", "primary", null, 2, 6, "A301", 0.42],
    ["CF-2026-0004", "Aptomat bếp nhảy liên tục", "Bật bếp từ cùng lò vi sóng là aptomat tổng tự ngắt.", "electrical", "high", "waiting", "secondary", "mep_2", 30, 20, "A302", 0.35],
    ["CF-2026-0005", "Thẻ từ không mở được cửa", "Quẹt thẻ nhiều lần khóa mới nhận, có lúc không mở.", "access_security", "normal", "resolved", "primary", "sec_1", 72, -40, "A301", 0],
    ["CF-2026-0006", "Hỏi thủ tục gia hạn hợp đồng", "Tôi muốn gia hạn thêm sáu tháng, cần chuẩn bị giấy tờ gì?", "general_support", "low", "closed", "secondary", "care_1", 120, -80, "A302", 0],
    ["CF-2026-0007", "Bồn cầu xả không trôi", "Đã thử thông nhưng nước vẫn không xuống.", "water", "normal", "in_progress", "primary", "mep_3", 20, -2, "A301", 0.91],
    ["CF-2026-0008", "Bình nóng lạnh không nóng", "Bật hơn 30 phút nhưng nước vẫn lạnh, đèn báo không sáng.", "appliances", "normal", "triaged", "secondary", null, 5, 19, "A302", 0.2],
    ["CF-2026-0009", "Đèn hành lang tầng 3 không sáng", "Đèn hành lang trước cửa căn tắt cả tối.", "electrical", "low", "new", "primary", null, 1, 7, "A301", 0.1],
    ["CF-2026-0010", "Tiếng ồn từ căn bên cạnh", "Căn bên cạnh mở nhạc lớn sau 23 giờ nhiều đêm liền.", "general_support", "normal", "in_progress", "secondary", "care_2", 26, 22, "A302", 0.3],
    ["CF-2026-0011", "Cấp thêm thẻ ra vào", "Cần cấp thêm một thẻ ra vào cho người ở cùng.", "access_security", "low", "closed", "primary", "sec_2", 200, -150, "A301", 0],
    ["CF-2026-0012", "Mạng chậm buổi tối", "Tốc độ mạng rất chậm từ 20 giờ, không họp trực tuyến được.", "internet", "normal", "resolved", "secondary", "it_1", 96, -60, "A302", 0],
    ["CF-2026-0013", "Wi-Fi rớt liên tục trong phòng ngủ", "Điện thoại và máy tính đều mất kết nối Wi-Fi từ tối nay.", "internet", "high", "triaged", "primary", "it_1", 6, 6, "A301", 0.5]
  ];
  const cases = await CaseRecord.insertMany(seeds.map(([code, title, description, category, priority, status, requester, assignee, ageHours, dueInHours, unitCode, risk]) => {
    const person = requesters[requester];
    const owner = assignee ? staff[assignee] : null;
    const resolved = ["resolved", "closed"].includes(status);
    return {
      organizationId, code, title, description, serviceKey: category, category, priority, status, channel: "portal",
      requesterId: person._id, requesterName: person.name, assigneeId: owner?._id || null, assigneeName: owner?.name || "",
      team: TEAM_BY_CATEGORY[category], propertyCode: "TOWER-A", unitCode, dueAt: hoursFromNow(dueInHours),
      createdAt: hoursAgo(ageHours), updatedAt: hoursAgo(Math.max(0.5, ageHours / 4)),
      resolvedAt: resolved ? hoursAgo(ageHours / 2) : null, closedAt: status === "closed" ? hoursAgo(ageHours / 3) : null,
      satisfaction: status === "closed" ? 5 : null,
      customFields: REQUIRED_FIELDS[category] ? { "Vị trí trong căn": "Phòng ngủ chính" } : {},
      ai: { classification: category, confidence: 0.82, summary: description, riskScore: risk,
        riskFactors: risk > 0.6 ? ["Đã sử dụng phần lớn thời hạn SLA"] : [], analyzedAt: hoursAgo(ageHours),
        reviewStatus: status === "new" ? "pending" : "confirmed", processingStatus: "complete" },
      events: [...events(person._id, person.name, hoursAgo(ageHours)),
        ...(owner ? [{ type: "assigned", label: `Đã giao cho ${owner.name}`, actorId: staff.care_lead._id, actorName: staff.care_lead.name, createdAt: hoursAgo(ageHours - 0.5) }] : [])]
    };
  }));
  await Incident.create({
    organizationId, code: "INC-2026-0001", title: "Mất Wi-Fi tầng 3 tòa A", summary: "Nhiều căn tầng 3 báo mất kết nối cùng thời điểm.",
    severity: "high", status: "investigating", team: TEAM_BY_CATEGORY.internet, propertyCode: "TOWER-A",
    ownerId: staff.it_1._id, ownerName: staff.it_1.name, caseIds: [cases[1]._id, cases[11]._id, cases[12]._id], affectedCount: 3,
    signal: { keywords: ["wifi", "mất mạng", "tầng 3"], clusterScore: 0.74, growthRate: 0.2, detectionConfidence: 0.74 },
    responseTimeline: [{ type: "created", label: "Đã tạo sự cố", actorName: staff.head_ops.name }]
  });
  await KnowledgeArticle.insertMany([
    { title: "Tiếp nhận phản ánh cấp thoát nước", category: "water", tags: ["nước", "rò rỉ", "tắc"], sourceLabel: "Quy trình vận hành tòa nhà", version: "2.0",
      content: "Ghi rõ căn, vị trí trong căn, thời điểm bắt đầu và phạm vi ảnh hưởng. Nước tràn gần ổ điện là tình huống khẩn: hướng dẫn khách tránh xa khu vực và báo bảo vệ, không yêu cầu khách tự xử lý." },
    { title: "Xử lý điều hòa không lạnh", category: "appliances", tags: ["điều hòa", "máy lạnh"], sourceLabel: "Hướng dẫn kỹ thuật điện lạnh", version: "1.3",
      content: "Đề nghị khách kiểm tra chế độ và nhiệt độ cài đặt. Nếu vẫn không lạnh sau 30 phút, tạo phiếu cho tổ điện lạnh kèm mã thiết bị và khung giờ khách có mặt." },
    { title: "Mất kết nối Wi-Fi trong căn", category: "internet", tags: ["wifi", "mạng"], sourceLabel: "Hướng dẫn công nghệ thông tin", version: "1.1",
      content: "Hỏi khách một thiết bị hay nhiều thiết bị bị mất kết nối, hàng xóm có bị không. Nhiều căn cùng tầng báo cùng lúc thì kiểm tra bộ phát tầng trước." },
    { title: "Cấp và khóa thẻ ra vào", category: "access_security", tags: ["thẻ từ", "khóa"], sourceLabel: "Quy định an ninh tòa nhà", version: "3.0",
      content: "Thẻ mất phải khóa ngay trên hệ thống. Cấp thẻ mới cần xác minh người thuê theo hợp đồng; không cấp thẻ qua điện thoại khi chưa xác minh." },
    { title: "Quy trình trả căn và bàn giao", category: "general_support", tags: ["trả căn", "bàn giao"], sourceLabel: "Quy trình chăm sóc cư dân", version: "1.0",
      content: "Khi khách báo trả căn, chuyển căn sang trạng thái sắp trả căn và hẹn ngày kiểm tra. Sau khi bàn giao, gỡ người thuê khỏi căn và chuyển buồng phòng dọn dẹp." }
  ].map(article => ({ organizationId, ...article })));

  return organization;
}

async function run() {
  const force = process.argv.includes("--force");
  await connectDatabase();
  await seedDatabase(force);
  console.log("CaseFlow demo data is ready.");
  process.exit(0);
}

if (process.argv[1]?.endsWith("seed.ts")) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
