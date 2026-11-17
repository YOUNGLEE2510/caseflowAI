// Deterministic synthetic dataset for the rental demo organization.
// Pure generator: no database access, so tests can check invariants directly.
import { createHash } from "node:crypto";
import { addBusinessHours, businessHoursBetween } from "../services/workingHours.js";
import { DEMO_RESIDENT_EMAILS, DEMO_RESIDENTS, RESIDENT_EMAIL_DOMAIN, STAFF, STAFF_EMAILS, TEAM_BY_CATEGORY, createEmailAllocator, type Category } from "./rentalOrg.js";

export const DATASET_TAG = "sim-rental-v1";
/** Synthetic residents carry this customer-code prefix so a re-run removes only them. */
export const DATASET_RESIDENT_CODE_PREFIX = "SIM-CD";
export const DATASET_CASE_PREFIX = "SIM-";
export const DATASET_INCIDENT_PREFIX = "SIM-INC-";
export const DATASET_TASK_PREFIX = "sim-";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const VN_OFFSET = 7 * HOUR;
const SLA_HOURS = 24;

export type { Category };
export type Status = "new" | "triaged" | "in_progress" | "waiting" | "resolved" | "closed";
export type Priority = "low" | "normal" | "high" | "urgent";

export interface DatasetOptions { seed?: string; now?: Date; days?: number }
export interface SimProperty { code: string; prefix: string; name: string; address: string; floors: number; unitsPerFloor: number }
export type Occupancy = "vacant" | "reserved" | "occupied" | "notice";
export type Readiness = "needs_cleaning" | "cleaned" | "under_repair" | "ready";
export interface SimUnit {
  propertyCode: string; code: string; floor: string; residentKeys: string[];
  occupancyStatus: Occupancy; readinessStatus: Readiness; availableFrom: Date | null; statusNote: string; statusUpdatedAt: Date | null
}
export interface SimAsset { code: string; propertyCode: string; unitCode: string; name: string; category: Category; kind: string; ageYears: number }
export interface SimUser {
  key: string; email: string; name: string; role: "requester" | "agent" | "manager" | "org_admin"; team: string;
  title: string; skills: string[]; active: boolean; joinedAt: Date | null; employeeCode: string;
}
export interface SimTenancy { residentKey: string; unitCode: string; propertyCode: string; start: Date; end: Date | null; activity: number }
export interface SimEvent { type: string; label: string; actorKey: string | null; actorName: string; internal: boolean; createdAt: Date; metadata?: Record<string, unknown> }
export interface SimComment { authorKey: string; authorName: string; body: string; internal: boolean; createdAt: Date }
export interface SimCycle {
  cycleNumber: number; startedAt: Date; resolvedAt: Date; closedAt: Date | null; dueAt: Date; slaPausedHours: number;
  breached: boolean; satisfaction: number | null; satisfactionComment: string; satisfactionAt: Date | null
}
export interface SimCase {
  code: string; title: string; description: string; category: Category; priority: Priority; status: Status;
  channel: "portal" | "phone" | "email" | "walk_in"; requesterKey: string; requesterName: string;
  createdByKey: string | null; createdByName: string; assigneeKey: string | null; assigneeName: string;
  team: string; propertyCode: string; unitCode: string; assetCode: string; createdAt: Date; updatedAt: Date; dueAt: Date;
  slaStartedAt: Date; slaPausedAt: Date | null; slaPausedHours: number; slaBreached: boolean; slaBreachedAt: Date | null;
  resolvedAt: Date | null; closedAt: Date | null; transferCount: number; reopenCount: number; cycles: SimCycle[];
  satisfaction: number | null; satisfactionComment: string; satisfactionAt: Date | null;
  ai: { classification: Category; confidence: number; reviewStatus: "pending" | "confirmed" | "corrected"; humanCorrectedLabel: string | null;
    reviewedAt: Date | null; reviewedByKey: string | null; reviewedByName: string; suggestedPriority: Priority; priorityReasons: string[];
    riskScore: number; riskFactors: string[]; analyzedAt: Date; sharedIncidentCandidate: boolean };
  events: SimEvent[]; comments: SimComment[]; tags: string[]; incidentCode: string | null
}
export interface SimIncident {
  code: string; title: string; summary: string; severity: "low" | "medium" | "high" | "critical";
  status: "monitoring" | "investigating" | "mitigated" | "resolved"; propertyCode: string; ownerKey: string; ownerName: string;
  caseCodes: string[]; detectedAt: Date; resolvedAt: Date | null; appointmentAt: Date | null; rootCause: string; resolution: string;
  keywords: string[]; clusterScore: number; responseTimeline: { type: string; label: string; actorName: string; createdAt: Date }[]
}
export interface SimTask {
  key: string; propertyCode: string; assetCode: string; title: string; dueAt: Date; assigneeKey: string;
  status: "planned" | "in_progress" | "completed" | "cancelled"; result: string; completedAt: Date | null; createdAt: Date; updatedAt: Date
}
export interface RentalDataset {
  seed: string; now: Date; start: Date; properties: SimProperty[]; units: SimUnit[]; assets: SimAsset[];
  users: SimUser[]; tenancies: SimTenancy[]; cases: SimCase[]; incidents: SimIncident[]; tasks: SimTask[]
}

// ---------- randomness ----------
function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
class Random {
  private next: () => number;
  constructor(seed: string) { this.next = mulberry32(createHash("sha256").update(seed).digest().readUInt32LE(0)); }
  float() { return this.next(); }
  between(min: number, max: number) { return min + (max - min) * this.next(); }
  int(min: number, max: number) { return Math.floor(this.between(min, max + 1)); }
  chance(probability: number) { return this.next() < probability; }
  pick<T>(items: readonly T[]): T { return items[Math.floor(this.next() * items.length)]; }
  weighted<T>(items: readonly T[], weight: (item: T) => number): T {
    const total = items.reduce((sum, item) => sum + Math.max(0, weight(item)), 0);
    let roll = this.next() * total;
    for (const item of items) { roll -= Math.max(0, weight(item)); if (roll <= 0) return item; }
    return items[items.length - 1];
  }
  poisson(lambda: number) {
    const limit = Math.exp(-lambda); let product = 1; let count = 0;
    do { count++; product *= this.next(); } while (product > limit);
    return count - 1;
  }
  logNormal(median: number, spread: number) {
    const normal = Math.sqrt(-2 * Math.log(1 - this.next())) * Math.cos(2 * Math.PI * this.next());
    return median * Math.exp(spread * normal);
  }
}

// ---------- time helpers (Vietnam local) ----------
const localParts = (date: Date) => { const local = new Date(date.getTime() + VN_OFFSET); return { month: local.getUTCMonth() + 1, weekday: local.getUTCDay(), hour: local.getUTCHours() }; };
const localMidnight = (date: Date) => { const local = new Date(date.getTime() + VN_OFFSET); return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - VN_OFFSET); };
const later = (date: Date, hours: number) => new Date(date.getTime() + hours * HOUR);
const minDate = (a: Date, b: Date) => (a < b ? a : b);
const REPORT_HOURS = [0.3, 0.2, 0.1, 0.1, 0.1, 0.3, 1.2, 2.2, 2.4, 2, 1.8, 1.6, 1.8, 1.5, 1.4, 1.5, 1.7, 2.2, 3.2, 3.8, 3.9, 3.4, 2.2, 1];

// ---------- names ----------
const FAMILY = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ", "Đặng", "Bùi", "Đỗ", "Hồ", "Ngô", "Dương", "Lý", "Trương", "Đinh"];
const FAMILY_WEIGHT = [38, 11, 9, 7, 5, 5, 4, 4, 4, 3, 3, 3, 2, 2, 2, 1, 1, 1];
const MIDDLE = ["Văn", "Thị", "Minh", "Ngọc", "Thanh", "Hoàng", "Quốc", "Thu", "Gia", "Hữu", "Đức", "Bảo", "Khánh", "Phương", "Anh"];
const GIVEN = ["An", "Bình", "Châu", "Dũng", "Giang", "Hà", "Hải", "Hạnh", "Hiếu", "Hùng", "Huy", "Khoa", "Lan", "Linh", "Long", "Mai", "Minh", "My", "Nam", "Ngân", "Nhung", "Phát", "Phong", "Phúc", "Quân", "Quỳnh", "Tâm", "Thảo", "Thắng", "Trang", "Trinh", "Trung", "Tú", "Tuấn", "Uyên", "Vy", "Yến", "Khôi", "Duy", "Thư"];
const FOREIGN = ["Kim Ji-woo", "Park Min-seo", "Tanaka Yuki", "Sato Haruto", "Lee Seo-yeon", "Daniel Moore", "Sophie Martin", "Chen Wei", "Lukas Becker", "Emma Wilson"];
function personName(random: Random, used: Set<string>) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const name = random.chance(0.06) ? random.pick(FOREIGN)
      : `${random.weighted(FAMILY, item => FAMILY_WEIGHT[FAMILY.indexOf(item)])} ${random.pick(MIDDLE)} ${random.pick(GIVEN)}`;
    if (!used.has(name)) { used.add(name); return name; }
  }
  const fallback = `${random.pick(FAMILY)} ${random.pick(MIDDLE)} ${random.pick(GIVEN)} ${used.size}`;
  used.add(fallback); return fallback;
}

// ---------- catalog ----------
interface Subtype {
  key: string; category: Category; weight: number; season?: "hot" | "rain"; assetKind?: string;
  titles: string[]; details: string[]; priority: [number, number, number, number]; workHours: [number, number]; wait: number
}
const SUBTYPES: Subtype[] = [
  { key: "ac_not_cold", category: "appliances", weight: 16, season: "hot", assetKind: "AC", priority: [5, 72, 23, 0], workHours: [3, 1], wait: 0.3,
    titles: ["Điều hòa không lạnh", "Máy lạnh chạy nhưng không mát", "Điều hòa {room} yếu", "may lanh ko lanh"],
    details: ["Bật điều hòa {room} hơn một tiếng mà phòng vẫn nóng, quạt vẫn chạy bình thường.", "Máy lạnh {room} chỉ thổi gió, không ra hơi lạnh từ {since}.", "Điều hòa kêu to và không mát, đặt 18 độ vẫn nóng.", "dh phong ngu ko lanh tu {since}, nho ky thuat qua kiem tra giup"] },
  { key: "ac_leak", category: "appliances", weight: 7, season: "hot", assetKind: "AC", priority: [10, 70, 20, 0], workHours: [2, 0.6], wait: 0.25,
    titles: ["Điều hòa chảy nước", "Dàn lạnh nhỏ nước xuống sàn", "Máy lạnh rò nước {room}"],
    details: ["Dàn lạnh {room} nhỏ nước thành vệt trên tường, phải đặt thau hứng.", "Điều hòa chảy nước xuống giường từ {since}.", "Ống thoát nước máy lạnh hình như bị nghẹt, nước tràn ra sàn."] },
  { key: "heater", category: "appliances", weight: 8, assetKind: "WH", priority: [5, 65, 28, 2], workHours: [3, 0.8], wait: 0.35,
    titles: ["Bình nóng lạnh không nóng", "Không có nước nóng", "Bình nước nóng bị rò"],
    details: ["Bật bình nóng lạnh 30 phút nhưng nước vẫn lạnh, đèn báo không sáng.", "Bình nóng lạnh có nước rỉ ở đáy, đã tắt aptomat bình.", "Nước nóng lúc có lúc không từ {since}."] },
  { key: "washer", category: "appliances", weight: 5, priority: [20, 70, 10, 0], workHours: [4, 0.8], wait: 0.4,
    titles: ["Máy giặt báo lỗi", "Máy giặt không vắt", "Máy giặt rung mạnh"],
    details: ["Máy giặt báo lỗi E21, nước không xả ra được.", "Máy giặt chạy đến bước vắt thì dừng.", "Máy giặt rung và di chuyển khi vắt, tiếng rất to."] },
  { key: "fridge", category: "appliances", weight: 3, priority: [10, 60, 30, 0], workHours: [4, 0.8], wait: 0.4,
    titles: ["Tủ lạnh không lạnh", "Tủ lạnh chảy nước"],
    details: ["Ngăn mát tủ lạnh không lạnh, đồ ăn bị hỏng.", "Tủ lạnh đọng nước ở đáy và kêu to từ {since}."] },
  { key: "leak_pipe", category: "water", weight: 9, season: "rain", priority: [0, 45, 45, 10], workHours: [2.5, 0.7], wait: 0.2,
    titles: ["Rò nước dưới bồn rửa", "Ống nước {room} bị rỉ", "Nước rò từ trần nhà tắm", "ro nuoc tran"],
    details: ["Dưới bồn rửa chén có nước rỉ liên tục, sàn tủ bếp ướt.", "Trần nhà tắm có vệt ố và nhỏ giọt từ {since}.", "Ống cấp nước sau bồn cầu rò, đã khóa van tổng của căn.", "tran wc nho nuoc xuong, nhieu nhat luc mua"] },
  { key: "clog", category: "water", weight: 8, priority: [10, 75, 15, 0], workHours: [1.5, 0.6], wait: 0.15,
    titles: ["Tắc bồn cầu", "Thoát sàn nhà tắm chậm", "Bồn rửa bị nghẹt"],
    details: ["Nước thoát sàn nhà tắm rất chậm, tắm xong đọng nước.", "Bồn cầu xả không trôi, đã thử thông nhưng không được.", "Bồn rửa chén nghẹt, nước đọng và có mùi."] },
  { key: "low_pressure", category: "water", weight: 5, priority: [5, 70, 25, 0], workHours: [2, 0.7], wait: 0.2,
    titles: ["Nước yếu", "Vòi sen chảy yếu", "nuoc yeu qua"],
    details: ["Nước ở vòi sen và bồn rửa đều yếu từ {since}.", "Chỉ vòi sen chảy yếu, vòi bếp bình thường.", "nuoc chay nho giot, ko tam duoc"] },
  { key: "seepage", category: "water", weight: 4, season: "rain", priority: [10, 60, 30, 0], workHours: [6, 0.8], wait: 0.5,
    titles: ["Tường bị thấm", "Cửa sổ bị hắt nước mưa"],
    details: ["Sau mỗi trận mưa tường phòng ngủ ẩm và bong sơn.", "Mưa lớn nước tràn qua khe cửa sổ vào phòng khách."] },
  { key: "breaker", category: "electrical", weight: 7, priority: [0, 40, 50, 10], workHours: [2, 0.7], wait: 0.15,
    titles: ["Aptomat nhảy liên tục", "Mất điện một phần căn hộ", "Cầu dao tự ngắt"],
    details: ["Cứ bật bếp từ cùng lò vi sóng là aptomat tổng tự ngắt.", "Các ổ cắm phòng khách mất điện, đèn vẫn sáng.", "Cầu dao nhảy khi trời mưa, đã thử bật lại nhiều lần."] },
  { key: "light", category: "electrical", weight: 6, priority: [35, 60, 5, 0], workHours: [1, 0.5], wait: 0.15,
    titles: ["Đèn {room} không sáng", "Bóng đèn chập chờn", "Công tắc bị lỏng"],
    details: ["Đèn {room} không sáng dù đã thay bóng mới.", "Đèn nhà tắm chớp tắt liên tục từ {since}.", "Công tắc đèn hành lang căn lỏng, bấm nhiều lần mới ăn."] },
  { key: "socket", category: "electrical", weight: 3, priority: [5, 50, 40, 5], workHours: [1.2, 0.5], wait: 0.15,
    titles: ["Ổ cắm có mùi khét", "Ổ cắm bếp không có điện"],
    details: ["Ổ cắm cạnh tủ lạnh nóng và có mùi khét, đã rút điện các thiết bị.", "Ổ cắm khu bếp không có điện, các ổ khác bình thường."] },
  { key: "wifi", category: "internet", weight: 11, assetKind: "ROUTER", priority: [10, 70, 20, 0], workHours: [1.5, 0.7], wait: 0.1,
    titles: ["Wi-Fi chập chờn", "Mất mạng buổi tối", "Mạng chậm không làm việc được", "wifi yeu"],
    details: ["Wi-Fi rớt liên tục từ khoảng {time}, các thiết bị đều bị.", "Mạng rất chậm vào buổi tối, không họp online được.", "Phòng ngủ gần như không bắt được Wi-Fi, phòng khách thì được.", "wifi tang minh yeu lam, load trang ko noi"] },
  { key: "lan", category: "internet", weight: 3, priority: [20, 70, 10, 0], workHours: [1.5, 0.6], wait: 0.2,
    titles: ["Cổng mạng LAN không hoạt động", "Không đăng nhập được Wi-Fi"],
    details: ["Cắm dây mạng vào cổng âm tường nhưng máy tính không nhận.", "Đổi điện thoại mới không vào được Wi-Fi căn hộ, cần cấp lại thông tin."] },
  { key: "door_lock", category: "access_security", weight: 6, assetKind: "LOCK", priority: [5, 55, 35, 5], workHours: [1, 0.6], wait: 0.15,
    titles: ["Khóa từ không nhận thẻ", "Khóa cửa báo pin yếu", "Không mở được cửa căn"],
    details: ["Quẹt thẻ nhiều lần khóa mới nhận, đôi khi không mở.", "Khóa điện tử kêu bíp báo pin yếu từ {since}.", "Khóa cửa bị kẹt, phải dùng chìa cơ mới mở được."] },
  { key: "access_card", category: "access_security", weight: 4, priority: [20, 70, 10, 0], workHours: [0.8, 0.5], wait: 0.15,
    titles: ["Cấp thêm thẻ ra vào", "Thẻ thang máy không quẹt được", "Mất thẻ ra vào"],
    details: ["Cần cấp thêm một thẻ ra vào cho người ở cùng.", "Thẻ không quẹt được ở thang máy, cổng chính thì bình thường.", "Tôi làm mất thẻ ra vào tối qua, nhờ khóa thẻ cũ."] },
  { key: "noise", category: "general_support", weight: 4, priority: [30, 65, 5, 0], workHours: [3, 0.7], wait: 0.3,
    titles: ["Tiếng ồn từ căn bên cạnh", "Tiếng máy bơm kêu ban đêm"],
    details: ["Căn bên cạnh mở nhạc lớn sau 23 giờ nhiều đêm liền.", "Có tiếng máy chạy ầm ầm vọng lên vào ban đêm."] },
  { key: "cleaning", category: "general_support", weight: 4, priority: [50, 50, 0, 0], workHours: [2, 0.6], wait: 0.1,
    titles: ["Hành lang có rác", "Yêu cầu vệ sinh khu chung", "Côn trùng trong căn"],
    details: ["Rác để ở hành lang tầng nhiều ngày chưa dọn.", "Phòng rác tầng có mùi, nhờ vệ sinh giúp.", "Thấy nhiều gián ở bếp, nhờ phun thuốc định kỳ."] },
  { key: "furniture", category: "general_support", weight: 3, priority: [45, 55, 0, 0], workHours: [4, 0.8], wait: 0.45,
    titles: ["Cửa tủ quần áo bị lệch", "Rèm cửa bị gãy ray", "Ghế sofa hỏng chân"],
    details: ["Bản lề cửa tủ bung, không đóng lại được.", "Ray rèm phòng ngủ bị gãy, rèm rơi xuống.", "Một chân ghế sofa bị gãy, ngồi bị nghiêng."] }
];
const CATEGORY_LABEL: Record<Category, string> = {
  water: "Cấp thoát nước", electrical: "Điện", internet: "Internet", appliances: "Thiết bị căn hộ",
  access_security: "Ra vào và an ninh", general_support: "Hỗ trợ chung"
};
const PRIORITY_LABEL: Record<Priority, string> = { low: "thấp", normal: "bình thường", high: "cao", urgent: "khẩn cấp" };
const ROOMS = ["phòng ngủ", "phòng khách", "phòng ngủ nhỏ", "phòng làm việc"];
const SINCE = ["sáng nay", "tối qua", "hôm qua", "hai hôm nay", "đầu tuần", "chiều nay"];
const TIMES = ["19 giờ", "20 giờ", "21 giờ", "7 giờ sáng", "giờ trưa"];

function seasonFactor(season: Subtype["season"], month: number) {
  if (season === "hot") return ({ 4: 1.7, 5: 1.8, 6: 1.5, 7: 1.2, 8: 1.1, 9: 1, 10: 0.9, 11: 0.75, 12: 0.6 } as Record<number, number>)[month] ?? 0.8;
  if (season === "rain") return ({ 5: 1.1, 6: 1.4, 7: 1.5, 8: 1.6, 9: 1.7, 10: 1.6, 11: 1, 12: 0.6 } as Record<number, number>)[month] ?? 0.5;
  return 1;
}
function stripDiacritics(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}
function fill(template: string, random: Random) {
  return template.replace("{room}", random.pick(ROOMS)).replace("{since}", random.pick(SINCE)).replace("{time}", random.pick(TIMES));
}

// ---------- structure ----------
const PROPERTIES: SimProperty[] = [
  { code: "SIM-Q7", prefix: "Q7", name: "Căn hộ dịch vụ Sông Xanh (mô phỏng)", address: "Địa chỉ giả lập khu Nam, không phải địa chỉ thật", floors: 10, unitsPerFloor: 4 },
  { code: "SIM-BT", prefix: "BT", name: "Căn hộ dịch vụ Cầu Mới (mô phỏng)", address: "Địa chỉ giả lập khu trung tâm, không phải địa chỉ thật", floors: 8, unitsPerFloor: 5 },
  { code: "SIM-TD", prefix: "TD", name: "Căn hộ dịch vụ Đồi Thông (mô phỏng)", address: "Địa chỉ giả lập khu Đông, không phải địa chỉ thật", floors: 10, unitsPerFloor: 4 }
];

export function generateRentalDataset(options: DatasetOptions = {}): RentalDataset {
  const seed = options.seed || DATASET_TAG;
  const now = options.now || new Date();
  const days = options.days ?? 180;
  const start = localMidnight(new Date(now.getTime() - days * DAY));
  const random = new Random(`${seed}`);
  const usedNames = new Set<string>();

  // Staff come from the fixed organisation chart; rentalSetup.ts creates their accounts.
  const users: SimUser[] = STAFF.map(member => ({ key: member.key, email: STAFF_EMAILS[member.key], name: member.name, role: member.role,
    team: member.team, title: member.title, skills: member.skills, active: true, joinedAt: null, employeeCode: member.employeeCode }));
  for (const user of users) usedNames.add(user.name);
  const staffByKey = new Map(users.map(user => [user.key, user]));
  const coordinators = ["head_ops", "care_lead"].map(key => staffByKey.get(key)!);
  const receptionists = ["care_1", "care_2", "care_lead"].map(key => staffByKey.get(key)!);
  const agents = users.filter(user => user.role === "agent");
  // Reserve staff and scripted demo resident addresses/names so generated residents never collide with them.
  const allocateEmail = createEmailAllocator([...Object.values(STAFF_EMAILS), ...Object.values(DEMO_RESIDENT_EMAILS)]);
  for (const person of DEMO_RESIDENTS) usedNames.add(person.name);

  // Units and assets
  const units: SimUnit[] = [];
  const assets: SimAsset[] = [];
  for (const property of PROPERTIES) {
    for (let floor = 1; floor <= property.floors; floor++) {
      const floorCode = String(floor + 1).padStart(2, "0");
      for (let index = 1; index <= property.unitsPerFloor; index++) {
        const code = `${property.prefix}-${floorCode}${String(index).padStart(2, "0")}`;
        units.push({ propertyCode: property.code, code, floor: floorCode, residentKeys: [], occupancyStatus: "vacant", readinessStatus: "ready", availableFrom: null, statusNote: "", statusUpdatedAt: null });
        const acCount = random.chance(0.3) ? 2 : 1;
        for (let ac = 1; ac <= acCount; ac++) assets.push({ code: `${code}-AC${ac}`, propertyCode: property.code, unitCode: code, name: `Điều hòa ${ac === 1 ? "phòng ngủ" : "phòng khách"} ${code}`, category: "appliances", kind: "AC", ageYears: random.int(1, 9) });
        assets.push({ code: `${code}-WH`, propertyCode: property.code, unitCode: code, name: `Bình nóng lạnh ${code}`, category: "appliances", kind: "WH", ageYears: random.int(1, 9) });
        assets.push({ code: `${code}-LOCK`, propertyCode: property.code, unitCode: code, name: `Khóa từ ${code}`, category: "access_security", kind: "LOCK", ageYears: random.int(1, 6) });
      }
    }
    for (let pump = 1; pump <= 2; pump++) assets.push({ code: `${property.prefix}-PUMP-${pump}`, propertyCode: property.code, unitCode: "", name: `Bơm cấp nước số ${pump}`, category: "water", kind: "PUMP", ageYears: random.int(2, 10) });
    for (let lift = 1; lift <= 2; lift++) assets.push({ code: `${property.prefix}-ELEV-${lift}`, propertyCode: property.code, unitCode: "", name: `Thang máy số ${lift}`, category: "general_support", kind: "ELEV", ageYears: random.int(3, 12) });
    assets.push({ code: `${property.prefix}-GEN`, propertyCode: property.code, unitCode: "", name: "Máy phát điện dự phòng", category: "electrical", kind: "GEN", ageYears: random.int(3, 10) });
    assets.push({ code: `${property.prefix}-FIRE`, propertyCode: property.code, unitCode: "", name: "Tủ báo cháy trung tâm", category: "access_security", kind: "FIRE", ageYears: random.int(2, 8) });
    for (let floor = 1; floor <= property.floors; floor += 2) {
      const first = String(floor + 1).padStart(2, "0"); const second = String(Math.min(floor + 2, property.floors + 1)).padStart(2, "0");
      assets.push({ code: `${property.prefix}-ROUTER-${first}${second}`, propertyCode: property.code, unitCode: "", name: `Bộ phát Wi-Fi tầng ${Number(first)}–${Number(second)}`, category: "internet", kind: "ROUTER", ageYears: random.int(1, 5) });
    }
  }
  const unitAssets = new Map<string, SimAsset[]>();
  for (const asset of assets) if (asset.unitCode) unitAssets.set(asset.unitCode, [...(unitAssets.get(asset.unitCode) || []), asset]);
  const routerFor = (unit: SimUnit) => {
    const prefix = unit.code.split("-")[0];
    return assets.find(asset => asset.kind === "ROUTER" && asset.code.startsWith(`${prefix}-`)
      && Number(asset.code.slice(-4, -2)) <= Number(unit.floor) && Number(unit.floor) <= Number(asset.code.slice(-2)))!;
  };

  // Tenancies: who lived where and when
  const tenancies: SimTenancy[] = [];
  let residentCount = 0;
  const newResident = (active: boolean, joined: Date) => {
    residentCount++;
    const key = `resident.${String(residentCount).padStart(3, "0")}`;
    const name = personName(random, usedNames);
    users.push({ key, email: allocateEmail(name, RESIDENT_EMAIL_DOMAIN), name, role: "requester", team: "",
      title: "Người thuê", skills: [], active, joinedAt: joined, employeeCode: `${DATASET_RESIDENT_CODE_PREFIX}${String(residentCount).padStart(3, "0")}` });
    return key;
  };
  for (const unit of units) {
    const occupiedNow = random.chance(0.8);
    const hadFormer = random.chance(occupiedNow ? 0.2 : 0.75);
    let currentStart = new Date(now.getTime() - random.int(30, 1000) * DAY);
    if (hadFormer) {
      const moveOut = new Date(start.getTime() + random.between(0.05, 0.85) * (now.getTime() - start.getTime()));
      const key = newResident(false, new Date(moveOut.getTime() - random.int(200, 700) * DAY));
      tenancies.push({ residentKey: key, unitCode: unit.code, propertyCode: unit.propertyCode, start: users.at(-1)!.joinedAt!, end: moveOut, activity: random.logNormal(1, 0.6) });
      currentStart = new Date(moveOut.getTime() + random.int(5, 25) * DAY);
    }
    if (occupiedNow && currentStart < now) {
      const people = random.chance(0.22) ? 2 : 1;
      for (let person = 0; person < people; person++) {
        const key = newResident(true, currentStart);
        unit.residentKeys.push(key);
        tenancies.push({ residentKey: key, unitCode: unit.code, propertyCode: unit.propertyCode, start: currentStart, end: null, activity: random.logNormal(person ? 0.5 : 1, 0.6) });
      }
    }
  }
  // Unit board state: tenants decide occupancy; turnover and repairs decide readiness.
  for (const unit of units) {
    const lastMoveOut = tenancies.filter(item => item.unitCode === unit.code && item.end).reduce<Date | null>((latest, item) => (!latest || item.end! > latest ? item.end : latest), null);
    unit.statusUpdatedAt = lastMoveOut && lastMoveOut > now ? now : lastMoveOut || new Date(now.getTime() - random.int(3, 60) * DAY);
    if (unit.residentKeys.length) {
      unit.occupancyStatus = random.chance(0.08) ? "notice" : "occupied";
      unit.readinessStatus = random.chance(0.04) ? "under_repair" : "ready";
      if (unit.occupancyStatus === "notice") { unit.availableFrom = new Date(localMidnight(now).getTime() + random.int(5, 30) * DAY); unit.statusNote = "Khách báo trả căn cuối kỳ"; }
      if (unit.readinessStatus === "under_repair") unit.statusNote = "Sửa chữa khi khách vẫn ở (hẹn giờ vào căn)";
      continue;
    }
    const daysEmpty = lastMoveOut ? (now.getTime() - lastMoveOut.getTime()) / DAY : 999;
    const roll = random.float();
    if (daysEmpty < 4 || roll < 0.15) { unit.readinessStatus = "needs_cleaning"; unit.statusNote = "Khách vừa trả căn, chờ buồng phòng dọn"; }
    else if (roll < 0.35) { unit.readinessStatus = "under_repair"; unit.statusNote = random.pick(["Sơn lại tường phòng khách", "Thay bồn cầu và vòi sen", "Thay sàn gỗ phòng ngủ", "Bảo dưỡng tổng thể sau kỳ thuê dài"]);
      unit.availableFrom = new Date(localMidnight(now).getTime() + random.int(3, 21) * DAY); }
    else if (roll < 0.5) { unit.readinessStatus = "cleaned"; unit.statusNote = "Đã dọn, chờ kiểm tra thiết bị"; }
    else if (roll < 0.65) { unit.occupancyStatus = "reserved"; unit.readinessStatus = "ready"; unit.statusNote = "Khách đã đặt cọc";
      unit.availableFrom = new Date(localMidnight(now).getTime() + random.int(2, 20) * DAY); }
    else { unit.readinessStatus = "ready"; unit.statusNote = "Sẵn sàng cho thuê"; }
  }
  const residentName = (key: string) => users.find(user => user.key === key)!.name;
  const activeTenancies = (at: Date) => tenancies.filter(item => item.start <= at && (!item.end || item.end > at));

  // Case lifecycle simulation
  const cases: SimCase[] = [];
  const workload = new Map<string, number>();
  const assetFailures = new Map<string, number[]>();
  let sequence = 0;
  // Work goes to the department that owns the category, balanced by open workload.
  const teamAgents = (category: Category) => agents.filter(agent => agent.team === TEAM_BY_CATEGORY[category]);
  const pickAgent = (category: Category) =>
    random.weighted(teamAgents(category), agent => (agent.skills.includes(category) ? 2 : 1) / (1 + (workload.get(agent.key) || 0) * 0.05));
  const choosePriority = (weights: [number, number, number, number]) =>
    random.weighted(["low", "normal", "high", "urgent"] as const, item => weights[["low", "normal", "high", "urgent"].indexOf(item)]);

  function simulateCase(input: {
    createdAt: Date; subtype: Subtype; tenancy: SimTenancy; assetCode: string; priority?: Priority;
    incidentCode?: string | null; resolveBy?: Date | null; title?: string; description?: string
  }) {
    const { createdAt, subtype, tenancy } = input;
    sequence++;
    const local = new Date(createdAt.getTime() + VN_OFFSET);
    const code = `${DATASET_CASE_PREFIX}${String(local.getUTCFullYear()).slice(2)}${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(sequence).padStart(4, "0")}`;
    const priority = input.priority || choosePriority(subtype.priority);
    const unit = units.find(item => item.code === tenancy.unitCode)!;
    let title = input.title || fill(random.pick(subtype.titles), random);
    let description = input.description || fill(random.pick(subtype.details), random);
    if (!input.title && random.chance(0.08)) { title = stripDiacritics(title).toLowerCase(); description = stripDiacritics(description); }
    if (!input.description && random.chance(0.3)) description += ` Căn ${unit.code}, tầng ${Number(unit.floor)}.`;
    const channel = random.weighted(["portal", "phone", "email", "walk_in"] as const, item => ({ portal: 70, phone: 18, email: 5, walk_in: 7 })[item]);
    const requesterName = residentName(tenancy.residentKey);
    const intake = channel === "portal" || channel === "email" ? null : random.pick(receptionists);
    const manager = random.pick(coordinators);
    const agent = pickAgent(subtype.category);
    const events: SimEvent[] = [];
    const comments: SimComment[] = [];
    const push = (type: string, label: string, at: Date, actor: SimUser | null, extra: Partial<SimEvent> = {}) => {
      if (at <= now) events.push({ type, label, actorKey: actor?.key || null, actorName: actor?.name || "Hệ thống", internal: false, createdAt: at, ...extra });
    };
    const channelLabel = { portal: "cổng cư dân", phone: "điện thoại", email: "email", walk_in: "quầy lễ tân" }[channel];
    push("created", `Tiếp nhận phản ánh qua ${channelLabel}`, createdAt, intake || null, intake ? {} : { actorKey: tenancy.residentKey, actorName: requesterName });

    // AI triage result
    const misclassified = random.chance(0.09);
    const classification: Category = misclassified ? random.pick((Object.keys(CATEGORY_LABEL) as Category[]).filter(item => item !== subtype.category)) : subtype.category;
    const confidence = Number((misclassified ? random.between(0.34, 0.66) : random.between(0.6, 0.97)).toFixed(2));
    const analyzedAt = later(createdAt, random.between(0.01, 0.05));
    push("ai_triage", `AI gợi ý nhóm ${CATEGORY_LABEL[classification]} (${Math.round(confidence * 100)}%)`, analyzedAt, null, { internal: true });

    // Milestones (wall-clock), then truncated at "now"
    const urgent = priority === "urgent";
    const triageAt = urgent ? later(createdAt, random.between(0.1, 0.6)) : addBusinessHours(createdAt, random.between(0.1, 2.2));
    const assignAt = urgent ? later(triageAt, random.between(0.05, 0.3)) : addBusinessHours(triageAt, random.between(0.05, 1.5));
    const startAt = urgent ? later(assignAt, random.between(0.2, 1)) : addBusinessHours(assignAt, random.between(0.3, priority === "high" ? 3 : 8));
    const hasWait = random.chance(subtype.wait);
    const waitStart = hasWait ? addBusinessHours(startAt, random.between(0.2, 1.5)) : null;
    const waitEnd = waitStart ? later(waitStart, random.logNormal(28, 0.6)) : null;
    const workFrom = waitEnd || startAt;
    const work = random.logNormal(subtype.workHours[0] * (priority === "low" ? 2.4 : priority === "high" ? 0.8 : urgent ? 0.5 : 1.3) * 3, subtype.workHours[1]);
    let resolveAt = urgent ? later(workFrom, work * 0.6) : addBusinessHours(workFrom, work);
    if (input.resolveBy) resolveAt = new Date(Math.max(input.resolveBy.getTime() + random.between(0.2, 6) * HOUR, workFrom.getTime() + HOUR));
    const falseReport = !input.incidentCode && random.chance(0.025);
    if (falseReport) resolveAt = addBusinessHours(triageAt, random.between(0.2, 1));
    // A few recent cases are still waiting for someone to pick them up.
    const stuck = !input.incidentCode && now.getTime() - createdAt.getTime() < 10 * DAY && random.chance(0.15);
    const reopen = !falseReport && random.chance(0.05);
    const confirmClose = random.chance(0.78);
    const closeAt = confirmClose ? later(resolveAt, random.logNormal(20, 0.8)) : null;
    const reopenAt = reopen ? later(resolveAt, random.between(10, 60)) : null;

    let dueAt = addBusinessHours(createdAt, SLA_HOURS);
    let slaPausedHours = 0;
    let slaPausedAt: Date | null = null;
    let status: Status = "new";
    let assigneeKey: string | null = null;
    let transferCount = 0;
    let resolvedAt: Date | null = null;
    let closedAt: Date | null = null;
    const cycles: SimCycle[] = [];
    let reviewStatus: "pending" | "confirmed" | "corrected" = "pending";
    let reviewedAt: Date | null = null;
    let reviewer: SimUser | null = null;
    let satisfaction: number | null = null; let satisfactionAt: Date | null = null; let satisfactionComment = "";

    if (triageAt <= now) {
      status = "triaged"; reviewStatus = misclassified ? "corrected" : "confirmed"; reviewedAt = triageAt; reviewer = manager;
      push("ai_reviewed", misclassified ? `Đã sửa nhãn AI sang ${CATEGORY_LABEL[subtype.category]}` : "Đã xác nhận nhãn AI", triageAt, manager, { internal: true });
      push("status_changed", "Chuyển trạng thái từ new sang triaged", triageAt, manager);
      if (priority !== "normal") push("priority_changed", `Đặt mức ưu tiên ${PRIORITY_LABEL[priority]}`, triageAt, manager);
    }
    if (falseReport && resolveAt <= now) {
      status = "resolved"; resolvedAt = resolveAt;
      comments.push({ authorKey: manager.key, authorName: manager.name, body: "Đã liên hệ lại, người thuê cho biết đã tự xử lý được nên không cần kỹ thuật lên kiểm tra.", internal: false, createdAt: resolveAt });
      push("status_changed", "Chuyển trạng thái từ triaged sang resolved", resolveAt, manager);
      if (closeAt && closeAt <= now) { status = "closed"; closedAt = closeAt; push("closed_by_requester", "Người yêu cầu đã xác nhận đóng hồ sơ", closeAt, null, { actorKey: tenancy.residentKey, actorName: requesterName }); }
    } else if (assignAt <= now && !stuck) {
      assigneeKey = agent.key;
      push("assigned", `Đã giao cho ${agent.name}`, assignAt, manager);
      const other = teamAgents(subtype.category).find(item => item.key !== agent.key);
      if (other && random.chance(0.07) && startAt <= now) {
        assigneeKey = other.key; transferCount = 1;
        push("assigned", `Chuyển giao từ ${agent.name} sang ${other.name}`, later(assignAt, random.between(0.5, 3)), manager, { metadata: { reason: "Điều chỉnh theo lịch trực" } });
      }
      const assignee = staffByKey.get(assigneeKey)!;
      if (startAt <= now) {
        status = "in_progress";
        push("status_changed", "Chuyển trạng thái từ triaged sang in_progress", startAt, assignee);
        if (random.chance(0.55)) comments.push({ authorKey: assignee.key, authorName: assignee.name, internal: false, createdAt: later(startAt, 0.1),
          body: random.pick(["Kỹ thuật đã nhận phiếu, sẽ lên kiểm tra trong khung giờ đã hẹn.", "Anh/chị vui lòng để lại người ở nhà hoặc đồng ý cho kỹ thuật vào căn khi vắng mặt.", "Đã ghi nhận, kỹ thuật sẽ liên hệ trước khi lên căn."]) });
      }
      if (waitStart && waitStart <= now) {
        status = "waiting"; slaPausedAt = waitStart;
        const reason = random.pick(["Chờ người thuê xác nhận giờ hẹn", "Chờ linh kiện thay thế", "Chờ đơn vị bảo hành", "Chờ người thuê có mặt tại căn"]);
        push("status_changed", "Chuyển trạng thái từ in_progress sang waiting", waitStart, assignee, { metadata: { reason } });
        comments.push({ authorKey: assignee.key, authorName: assignee.name, body: `${reason}.`, internal: random.chance(0.4), createdAt: waitStart });
        if (waitEnd && waitEnd <= now) {
          const paused = businessHoursBetween(waitStart, waitEnd);
          slaPausedHours += paused; dueAt = addBusinessHours(dueAt, paused); slaPausedAt = null; status = "in_progress";
          push("status_changed", "Chuyển trạng thái từ waiting sang in_progress", waitEnd, assignee);
        }
      }
      if (status === "in_progress" && resolveAt <= now) {
        status = "resolved"; resolvedAt = resolveAt;
        push("status_changed", "Chuyển trạng thái từ in_progress sang resolved", resolveAt, assignee);
        comments.push({ authorKey: assignee.key, authorName: assignee.name, internal: false, createdAt: resolveAt,
          body: random.pick(["Đã xử lý xong, nhờ anh/chị kiểm tra lại giúp.", "Đã thay linh kiện và chạy thử ổn định.", "Đã vệ sinh, kiểm tra và đo lại, thiết bị hoạt động bình thường.", "Đã khắc phục, nếu còn lỗi anh/chị phản hồi lại trên hồ sơ này."]) });
        if (reopenAt && reopenAt <= now) {
          cycles.push({ cycleNumber: 1, startedAt: createdAt, resolvedAt: resolveAt, closedAt: null, dueAt, slaPausedHours, breached: resolveAt > dueAt, satisfaction: null, satisfactionComment: "", satisfactionAt: null });
          push("reopened_by_requester", "Người yêu cầu đã mở lại hồ sơ", reopenAt, null, { actorKey: tenancy.residentKey, actorName: requesterName });
          comments.push({ authorKey: tenancy.residentKey, authorName: requesterName, body: "Sau một ngày lỗi lại xuất hiện như cũ.", internal: false, createdAt: reopenAt });
          status = "in_progress"; resolvedAt = null; dueAt = addBusinessHours(reopenAt, SLA_HOURS); slaPausedHours = 0;
          const secondResolve = addBusinessHours(reopenAt, random.logNormal(8, 0.5));
          if (secondResolve <= now) {
            status = "resolved"; resolvedAt = secondResolve;
            push("status_changed", "Chuyển trạng thái từ in_progress sang resolved", secondResolve, assignee);
          }
        }
        const finalClose = resolvedAt && closeAt ? new Date(Math.max(closeAt.getTime(), resolvedAt.getTime() + 2 * HOUR)) : null;
        if (status === "resolved" && finalClose && finalClose <= now) {
          status = "closed"; closedAt = finalClose;
          push("closed_by_requester", "Người yêu cầu đã xác nhận đóng hồ sơ", finalClose, null, { actorKey: tenancy.residentKey, actorName: requesterName });
          if (random.chance(0.68)) {
            const breached = resolvedAt! > dueAt;
            satisfaction = random.weighted([1, 2, 3, 4, 5], score => (breached ? [8, 12, 30, 30, 20] : [2, 3, 10, 35, 50])[score - 1]);
            satisfactionAt = later(finalClose, random.between(0, 0.5));
            satisfactionComment = random.chance(0.45) ? random.pick(satisfaction >= 4
              ? ["Kỹ thuật đến đúng hẹn, làm nhanh.", "Cảm ơn ban quản lý hỗ trợ nhiệt tình.", "Xử lý gọn, dọn dẹp sạch sẽ."]
              : ["Phải chờ khá lâu mới có người lên.", "Sửa xong nhưng lần sau mong báo trước giờ đến.", "Lỗi lặp lại nhiều lần."]) : "";
            push("satisfaction", `Người yêu cầu đánh giá ${satisfaction}/5`, satisfactionAt, null, { actorKey: tenancy.residentKey, actorName: requesterName });
          }
        } else if (status === "resolved" && !closeAt && resolvedAt && later(resolvedAt, 7 * 24) <= now) {
          // No confirmation from the tenant: the coordinator closes after a week and records why.
          status = "closed"; closedAt = later(resolvedAt, 7 * 24 + random.between(1, 30));
          push("status_changed", "Chuyển trạng thái từ resolved sang closed", closedAt, manager, { metadata: { reason: "Người thuê không phản hồi sau 7 ngày" } });
          comments.push({ authorKey: manager.key, authorName: manager.name, internal: true, createdAt: closedAt, body: "Đã gọi lại hai lần, người thuê không phản hồi. Đóng hồ sơ, chưa có xác nhận của khách." });
        }
      }
    }
    // SLA is paused while waiting; otherwise breached when unresolved past the due time.
    const slaBreached = status !== "waiting" && dueAt <= now && (resolvedAt || now) > dueAt;
    if (assigneeKey && !["resolved", "closed"].includes(status)) workload.set(assigneeKey, (workload.get(assigneeKey) || 0) + 1);
    const open = !["resolved", "closed"].includes(status);
    const consumed = open ? Math.min(1, businessHoursBetween(createdAt, now) / Math.max(1, SLA_HOURS + slaPausedHours)) : 0;
    const riskFactors = open ? [consumed > 0.75 ? "Đã dùng phần lớn thời hạn SLA" : "", priority === "high" || urgent ? "Mức ưu tiên cao" : "", transferCount ? "Đã chuyển người xử lý" : ""].filter(Boolean) : [];
    const assignee = assigneeKey ? staffByKey.get(assigneeKey)! : null;
    const lastEvent = events.reduce((latest, event) => (event.createdAt > latest ? event.createdAt : latest), createdAt);
    const record: SimCase = {
      code, title, description, category: subtype.category, team: TEAM_BY_CATEGORY[subtype.category], priority, status, channel, requesterKey: tenancy.residentKey, requesterName,
      createdByKey: intake?.key || null, createdByName: intake?.name || "", assigneeKey, assigneeName: assignee?.name || "",
      propertyCode: tenancy.propertyCode, unitCode: tenancy.unitCode, assetCode: input.assetCode, createdAt, updatedAt: minDate(lastEvent, now), dueAt,
      slaStartedAt: cycles.length ? reopenAt! : createdAt, slaPausedAt: status === "waiting" ? slaPausedAt : null, slaPausedHours, slaBreached,
      slaBreachedAt: slaBreached ? dueAt : null, resolvedAt, closedAt, transferCount, reopenCount: cycles.length, cycles,
      satisfaction, satisfactionComment, satisfactionAt,
      ai: { classification, confidence, reviewStatus, humanCorrectedLabel: reviewStatus === "corrected" ? subtype.category : null, reviewedAt,
        reviewedByKey: reviewer?.key || null, reviewedByName: reviewer?.name || "", suggestedPriority: priority, analyzedAt,
        priorityReasons: priority === "urgent" || priority === "high" ? ["Ảnh hưởng chức năng thiết yếu của căn hộ"] : [],
        riskScore: Number(consumed.toFixed(2)), riskFactors, sharedIncidentCandidate: Boolean(input.incidentCode) },
      events: events.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      comments: comments.filter(item => item.createdAt <= now).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      tags: [DATASET_TAG, ...(falseReport ? ["bao-nham"] : [])], incidentCode: input.incidentCode || null
    };
    cases.push(record);
    return record;
  }

  // Background cases, day by day
  const totalWeight = SUBTYPES.reduce((sum, item) => sum + item.weight, 0);
  for (let day = start; day < now; day = new Date(day.getTime() + DAY)) {
    const { month, weekday } = localParts(later(day, 12));
    const occupied = activeTenancies(later(day, 12));
    const occupancyFactor = occupied.length / 140;
    const count = random.poisson(4.8 * occupancyFactor * (weekday === 0 || weekday === 6 ? 1.2 : 1));
    for (let index = 0; index < count; index++) {
      const hour = random.weighted(REPORT_HOURS.map((_, item) => item), item => REPORT_HOURS[item]);
      const createdAt = new Date(day.getTime() + (hour + random.float()) * HOUR);
      if (createdAt >= now) continue;
      const tenantsNow = activeTenancies(createdAt);
      if (!tenantsNow.length) continue;
      const subtype = random.weighted(SUBTYPES, item => item.weight * seasonFactor(item.season, month) / totalWeight);
      let tenancy = random.weighted(tenantsNow, item => item.activity);
      let assetCode = "";
      if (subtype.assetKind === "ROUTER") assetCode = routerFor(units.find(unit => unit.code === tenancy.unitCode)!).code;
      else if (subtype.assetKind) {
        // Older and recently failed equipment breaks more often.
        const candidates = assets.filter(asset => asset.kind === subtype.assetKind && tenantsNow.some(item => item.unitCode === asset.unitCode));
        const asset = random.weighted(candidates, item => (0.5 + item.ageYears / 4) * (1 + 2 * (assetFailures.get(item.code) || []).filter(at => createdAt.getTime() - at < 45 * DAY).length));
        assetCode = asset.code;
        tenancy = random.weighted(tenantsNow.filter(item => item.unitCode === asset.unitCode), item => item.activity);
        assetFailures.set(asset.code, [...(assetFailures.get(asset.code) || []), createdAt.getTime()]);
      }
      simulateCase({ createdAt, subtype, tenancy, assetCode });
    }
  }

  // Shared incidents: several units report the same outage within hours
  const incidents: SimIncident[] = [];
  const incidentKinds = [
    { kind: "pump", subtype: "low_pressure", severity: "high" as const, title: "Mất nước/nước yếu diện rộng", root: "Bơm cấp nước hỏng phớt, áp lực tụt", fix: "Thay phớt bơm, chạy bơm dự phòng và xả khí đường ống", keywords: ["mất nước", "nước yếu", "bơm"], scope: "property" as const },
    { kind: "router", subtype: "wifi", severity: "medium" as const, title: "Mất mạng khu vực tầng", root: "Bộ phát Wi-Fi tầng treo do quá nhiệt", fix: "Thay nguồn bộ phát, bổ sung quạt tủ mạng", keywords: ["wifi", "mất mạng", "tầng"], scope: "floors" as const },
    { kind: "power", subtype: "breaker", severity: "high" as const, title: "Mất điện một phần tòa nhà", root: "Aptomat tổng tầng quá tải", fix: "Thay aptomat tổng tầng và cân lại tải pha", keywords: ["mất điện", "aptomat", "tầng"], scope: "floors" as const },
    { kind: "elevator", subtype: "noise", severity: "medium" as const, title: "Thang máy dừng hoạt động", root: "Cảm biến cửa thang máy lỗi", fix: "Đơn vị bảo trì thay cảm biến cửa và kiểm định lại", keywords: ["thang máy", "kẹt", "dừng"], scope: "property" as const },
    { kind: "roof", subtype: "seepage", severity: "medium" as const, title: "Thấm dột tầng trên sau mưa lớn", root: "Lớp chống thấm sân thượng bong tróc", fix: "Xử lý chống thấm khe co giãn sân thượng", keywords: ["thấm", "dột", "mưa"], scope: "top" as const }
  ];
  const incidentText: Record<string, { titles: string[]; details: string[] }> = {
    pump: { titles: ["Mất nước", "Không có nước", "Nước rất yếu", "mat nuoc"], details: ["Cả căn không có nước từ khoảng {time}.", "Vòi nào cũng chỉ nhỏ giọt, không tắm được.", "mat nuoc tu {since}, ca tang deu bi?"] },
    router: { titles: ["Mất mạng", "Wi-Fi không vào được", "Mạng rớt liên tục"], details: ["Không kết nối được Wi-Fi từ {time}, hàng xóm cũng bị.", "Wi-Fi có sóng nhưng không vào được mạng."] },
    power: { titles: ["Mất điện", "Cúp điện một phần căn", "Mất điện cả tầng"], details: ["Căn mất điện từ {time}, hành lang cũng tối.", "Một nửa căn mất điện, tủ lạnh không chạy."] },
    elevator: { titles: ["Thang máy không chạy", "Thang máy báo lỗi", "Thang dừng giữa tầng"], details: ["Bấm gọi thang không có phản hồi, phải đi bộ.", "Thang máy dừng giữa tầng 5 một lúc rồi mới chạy lại, rất nguy hiểm."] },
    roof: { titles: ["Trần bị dột", "Nước mưa nhỏ từ trần"], details: ["Mưa lớn tối qua trần phòng khách nhỏ nước.", "Trần nhà tắm loang ố và nhỏ giọt khi mưa."] }
  };
  const windowMs = now.getTime() - start.getTime();
  for (let index = 0; index < 15; index++) {
    const spec = incidentKinds[index % incidentKinds.length];
    const property = PROPERTIES[(index * 2 + 1) % PROPERTIES.length];
    // Spread over the window; the last two are still ongoing.
    const offset = index === 13 ? windowMs - random.between(3, 5) * DAY : index === 14 ? windowMs - random.between(0.4, 0.9) * DAY : (index + random.float()) / 13.5 * windowMs * 0.95;
    const detectedAt = new Date(start.getTime() + offset);
    if (detectedAt >= now) continue;
    const propertyUnits = units.filter(unit => unit.propertyCode === property.code);
    const floor = random.int(2, property.floors);
    const affected = propertyUnits.filter(unit => spec.scope === "property" ? true
      : spec.scope === "top" ? Number(unit.floor) >= property.floors - 1 : Math.abs(Number(unit.floor) - floor) <= 1);
    const tenantsNow = activeTenancies(detectedAt).filter(item => affected.some(unit => unit.code === item.unitCode));
    if (tenantsNow.length < 2) continue;
    const ongoing = index >= 13;
    const status: SimIncident["status"] = index === 14 ? "investigating" : index === 13 ? "monitoring" : "resolved";
    const repairHours = spec.kind === "roof" ? random.between(40, 120) : random.between(2, 14);
    const resolvedAt = status === "resolved" ? later(detectedAt, repairHours) : null;
    const code = `${DATASET_INCIDENT_PREFIX}${String(index + 1).padStart(3, "0")}`;
    const owner = pickAgent(SUBTYPES.find(item => item.key === spec.subtype)!.category);
    const reporters = new Set<string>();
    const reportCount = Math.min(tenantsNow.length, random.int(3, spec.scope === "property" ? 10 : 6));
    const caseCodes: string[] = [];
    for (let report = 0; report < reportCount; report++) {
      const tenancy = random.weighted(tenantsNow.filter(item => !reporters.has(item.unitCode)), item => item.activity);
      if (!tenancy) break;
      reporters.add(tenancy.unitCode);
      const createdAt = later(detectedAt, random.between(-0.5, spec.kind === "roof" ? 10 : 3));
      if (createdAt >= now) continue;
      const subtype = SUBTYPES.find(item => item.key === spec.subtype)!;
      const unit = units.find(item => item.code === tenancy.unitCode)!;
      const assetCode = spec.kind === "pump" ? `${property.prefix}-PUMP-1` : spec.kind === "router" ? routerFor(unit).code : spec.kind === "elevator" ? `${property.prefix}-ELEV-1` : "";
      const text = incidentText[spec.kind];
      // Most linked cases recover with the incident; a few keep a separate local fault.
      const keepsLocalFault = random.chance(0.1);
      const record = simulateCase({ createdAt, subtype, tenancy, assetCode, priority: spec.severity === "high" ? "high" : "normal", incidentCode: code,
        resolveBy: resolvedAt && !keepsLocalFault ? resolvedAt : ongoing ? new Date(now.getTime() + 30 * DAY) : null,
        title: fill(random.pick(text.titles), random), description: fill(random.pick(text.details), random) });
      caseCodes.push(record.code);
    }
    if (caseCodes.length < 2) continue;
    const manager = random.pick(coordinators);
    const timeline = [
      { type: "created", label: "Đã tạo sự cố", actorName: manager.name, createdAt: later(detectedAt, random.between(0.3, 1.5)) },
      { type: "linked", label: `Đã liên kết ${caseCodes.length} phản ánh`, actorName: manager.name, createdAt: later(detectedAt, random.between(1.5, 3)) },
      { type: "assigned", label: `Giao ${owner.name} xử lý`, actorName: manager.name, createdAt: later(detectedAt, random.between(1.6, 3.2)) },
      ...(resolvedAt ? [{ type: "resolved", label: "Đã khôi phục, chuyển các phản ánh sang rà soát", actorName: owner.name, createdAt: resolvedAt }] : [])
    ].filter(item => item.createdAt <= now).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    incidents.push({
      code, title: `${spec.title} – ${property.prefix}`, summary: `${caseCodes.length} căn tại ${property.name} báo cùng triệu chứng trong vài giờ.`,
      severity: spec.severity, status, propertyCode: property.code, ownerKey: owner.key, ownerName: owner.name, caseCodes, detectedAt, resolvedAt,
      appointmentAt: ongoing ? later(now, random.between(2, 20)) : null, rootCause: resolvedAt || status === "monitoring" ? spec.root : "",
      resolution: resolvedAt ? spec.fix : status === "monitoring" ? "Đã xử lý tạm, đang theo dõi" : "", keywords: spec.keywords,
      clusterScore: Number(random.between(0.6, 0.9).toFixed(2)), responseTimeline: timeline
    });
  }
  // Orphaned incident cases (incident skipped) keep no incident reference.
  const incidentCodes = new Set(incidents.map(item => item.code));
  for (const record of cases) if (record.incidentCode && !incidentCodes.has(record.incidentCode)) { record.incidentCode = null; record.ai.sharedIncidentCandidate = false; }

  // Maintenance: preventive schedule plus follow-up after incidents
  const tasks: SimTask[] = [];
  const addTask = (key: string, propertyCode: string, assetCode: string, title: string, dueAt: Date, category: Category) => {
    const assignee = random.pick(teamAgents(category));
    const createdAt = new Date(dueAt.getTime() - random.between(7, 21) * DAY);
    const past = dueAt < now;
    const status: SimTask["status"] = past ? (random.chance(0.05) ? "cancelled" : random.chance(0.06) && now.getTime() - dueAt.getTime() < 6 * DAY ? "planned" : "completed")
      : dueAt.getTime() - now.getTime() < 2 * DAY && random.chance(0.3) ? "in_progress" : "planned";
    const completedAt = status === "completed" ? later(dueAt, random.between(-30, 20)) : null;
    tasks.push({ key: `${DATASET_TASK_PREFIX}${key}`, propertyCode, assetCode, title, dueAt, assigneeKey: assignee.key, status,
      result: status === "completed" ? random.pick(["Đã kiểm tra, thông số trong ngưỡng cho phép.", "Đã vệ sinh, bôi trơn và chạy thử ổn định.", "Đã thay vật tư hao mòn, ghi nhận vào sổ thiết bị."]) : status === "cancelled" ? "Hủy do trùng lịch kiểm định của nhà cung cấp." : "",
      completedAt: completedAt && completedAt > now ? now : completedAt, createdAt: createdAt > now ? now : createdAt,
      updatedAt: completedAt ? minDate(completedAt, now) : minDate(createdAt, now) });
  };
  const months: Date[] = [];
  for (let month = new Date(start); month < later(now, 45 * 24); month = new Date(month.getTime() + 30 * DAY)) months.push(month);
  for (const property of PROPERTIES) {
    months.forEach((month, index) => {
      for (const pump of [1, 2]) addTask(`${property.prefix}-pump${pump}-${index}`, property.code, `${property.prefix}-PUMP-${pump}`, `Kiểm tra định kỳ bơm cấp nước số ${pump}`, later(month, random.between(24, 600)), "water");
      for (const lift of [1, 2]) addTask(`${property.prefix}-lift${lift}-${index}`, property.code, `${property.prefix}-ELEV-${lift}`, `Bảo trì định kỳ thang máy số ${lift}`, later(month, random.between(24, 600)), "electrical");
      if (index % 3 === 0) addTask(`${property.prefix}-fire-${index}`, property.code, `${property.prefix}-FIRE`, "Kiểm tra tủ báo cháy và đầu báo khói", later(month, random.between(24, 600)), "access_security");
      if (index % 2 === 0) addTask(`${property.prefix}-gen-${index}`, property.code, `${property.prefix}-GEN`, "Chạy thử máy phát điện dự phòng", later(month, random.between(24, 600)), "electrical");
    });
  }
  const acAssets = assets.filter(asset => asset.kind === "AC");
  for (let index = 0; index < 40; index++) {
    const asset = random.pick(acAssets);
    addTask(`ac-clean-${index}`, asset.propertyCode, asset.code, `Vệ sinh dàn lạnh ${asset.unitCode}`, new Date(start.getTime() + random.float() * (windowMs + 30 * DAY)), "appliances");
  }
  for (const incident of incidents.filter(item => item.resolvedAt)) {
    const first = cases.find(item => item.code === incident.caseCodes[0]);
    if (first?.assetCode) addTask(`followup-${incident.code.toLowerCase()}`, incident.propertyCode, first.assetCode, `Kiểm tra lại sau sự cố ${incident.code}`, later(incident.resolvedAt!, random.between(48, 200)), first.category);
  }

  cases.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return { seed, now, start, properties: PROPERTIES, units, assets, users, tenancies, cases, incidents, tasks };
}
