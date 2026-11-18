// Organisation structure of the rental sample: departments, named staff and email naming.
// Shared by rentalSetup.ts (creates the accounts) and the synthetic dataset (assigns work).

export type Category = "water" | "electrical" | "internet" | "appliances" | "access_security" | "general_support";

/** `.local` cannot receive real mail, so sample addresses never reach a real person. */
export const STAFF_EMAIL_DOMAIN = "canho.local";
export const RESIDENT_EMAIL_DOMAIN = "cudan.canho.local";

export const DEPARTMENTS = {
  executive: "Ban điều hành",
  residentCare: "Chăm sóc cư dân",
  mep: "Kỹ thuật điện nước",
  hvac: "Kỹ thuật điện lạnh",
  it: "Công nghệ thông tin",
  security: "An ninh",
  housekeeping: "Buồng phòng"
} as const;

/** Each service category is handled by exactly one department (case.team). */
export const TEAM_BY_CATEGORY: Record<Category, string> = {
  water: DEPARTMENTS.mep, electrical: DEPARTMENTS.mep, appliances: DEPARTMENTS.hvac,
  internet: DEPARTMENTS.it, access_security: DEPARTMENTS.security, general_support: DEPARTMENTS.residentCare
};

export const SERVICE_NAMES: Record<Category, string> = {
  water: "Cấp thoát nước", electrical: "Điện", internet: "Internet",
  appliances: "Thiết bị căn hộ", access_security: "Ra vào và an ninh", general_support: "Hỗ trợ chung"
};

export interface StaffMember {
  key: string; name: string; role: "org_admin" | "manager" | "agent"; team: string; title: string;
  skills: Category[]; personnelManager?: boolean; workingDays?: number[]; workStart?: string; workEnd?: string; employeeCode: string
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
// Fixed, fictional names so the sample looks the same on every machine.
export const STAFF: StaffMember[] = [
  { key: "director", name: "Trần Minh Khoa", role: "org_admin", team: DEPARTMENTS.executive, title: "Giám đốc vận hành", skills: [], personnelManager: true, employeeCode: "NV001" },
  { key: "head_ops", name: "Nguyễn Gia Trang", role: "manager", team: DEPARTMENTS.executive, title: "Trưởng phòng vận hành", skills: [], personnelManager: true, employeeCode: "NV002" },
  { key: "care_lead", name: "Phạm Thu Hà", role: "manager", team: DEPARTMENTS.residentCare, title: "Trưởng bộ phận chăm sóc cư dân", skills: ["general_support"], employeeCode: "NV003" },
  { key: "care_1", name: "Lê Ngọc Anh", role: "agent", team: DEPARTMENTS.residentCare, title: "Nhân viên lễ tân – điều phối", skills: ["general_support", "access_security"], workingDays: ALL_DAYS, workStart: "07:00", workEnd: "19:00", employeeCode: "NV004" },
  { key: "care_2", name: "Đỗ Quỳnh Như", role: "agent", team: DEPARTMENTS.residentCare, title: "Nhân viên chăm sóc cư dân", skills: ["general_support"], employeeCode: "NV005" },
  { key: "mep_lead", name: "Vũ Đức Thắng", role: "manager", team: DEPARTMENTS.mep, title: "Tổ trưởng kỹ thuật điện nước", skills: ["water", "electrical"], employeeCode: "NV006" },
  { key: "mep_1", name: "Nguyễn Văn Nam", role: "agent", team: DEPARTMENTS.mep, title: "Kỹ thuật viên điện nước", skills: ["water", "electrical"], employeeCode: "NV007" },
  { key: "mep_2", name: "Hoàng Phương Nam", role: "agent", team: DEPARTMENTS.mep, title: "Kỹ thuật viên điện", skills: ["electrical"], workingDays: [2, 3, 4, 5, 6], employeeCode: "NV008" },
  { key: "mep_3", name: "Bùi Quốc Huy", role: "agent", team: DEPARTMENTS.mep, title: "Kỹ thuật viên cấp thoát nước", skills: ["water"], employeeCode: "NV009" },
  { key: "hvac_lead", name: "Trần Hữu Linh", role: "manager", team: DEPARTMENTS.hvac, title: "Tổ trưởng kỹ thuật điện lạnh", skills: ["appliances"], employeeCode: "NV010" },
  { key: "hvac_1", name: "Hoàng Gia Thư", role: "agent", team: DEPARTMENTS.hvac, title: "Kỹ thuật viên điện lạnh", skills: ["appliances"], employeeCode: "NV011" },
  { key: "hvac_2", name: "Võ Anh Hạnh", role: "agent", team: DEPARTMENTS.hvac, title: "Kỹ thuật viên điện lạnh", skills: ["appliances", "electrical"], workingDays: [2, 3, 4, 5, 6], employeeCode: "NV012" },
  { key: "it_1", name: "Trần Văn Khôi", role: "agent", team: DEPARTMENTS.it, title: "Kỹ thuật viên mạng", skills: ["internet"], employeeCode: "NV013" },
  { key: "sec_lead", name: "Ngô Đình Phúc", role: "manager", team: DEPARTMENTS.security, title: "Đội trưởng an ninh", skills: ["access_security"], workingDays: ALL_DAYS, workStart: "06:00", workEnd: "18:00", employeeCode: "NV014" },
  { key: "sec_1", name: "Nguyễn Văn Uyên", role: "agent", team: DEPARTMENTS.security, title: "Nhân viên an ninh ca ngày", skills: ["access_security"], workingDays: ALL_DAYS, workStart: "06:00", workEnd: "18:00", employeeCode: "NV015" },
  { key: "sec_2", name: "Lý Thành Đạt", role: "agent", team: DEPARTMENTS.security, title: "Nhân viên an ninh ca đêm", skills: ["access_security"], workingDays: ALL_DAYS, workStart: "18:00", workEnd: "23:59", employeeCode: "NV016" },
  { key: "hk_lead", name: "Trần Thị Trinh", role: "manager", team: DEPARTMENTS.housekeeping, title: "Tổ trưởng buồng phòng", skills: [], employeeCode: "NV017" },
  { key: "hk_1", name: "Lê Thị Mai", role: "agent", team: DEPARTMENTS.housekeeping, title: "Nhân viên buồng phòng", skills: [], employeeCode: "NV018" },
  { key: "hk_2", name: "Phan Thị Hồng", role: "agent", team: DEPARTMENTS.housekeeping, title: "Nhân viên buồng phòng", skills: [], employeeCode: "NV019" }
];

export function asciiSlug(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** "Nguyễn Gia Trang" → "nguyen.trang"; foreign names keep family-first order ("Kim Ji-woo" → "kim.jiwoo"). */
export function emailLocalPart(name: string) {
  const parts = name.trim().split(/\s+/);
  const family = asciiSlug(parts[0]);
  const given = asciiSlug(parts.length > 2 && !parts.some(part => part.includes("-")) ? parts[parts.length - 1] : parts.slice(1).join(""));
  return `${family}.${given || "nv"}`;
}

/** Allocates unique addresses: nguyen.nam, nguyen.nam2, ... */
export function createEmailAllocator(taken: Iterable<string> = []) {
  const used = new Set([...taken].map(value => value.toLowerCase()));
  return (name: string, domain: string) => {
    const base = emailLocalPart(name);
    for (let index = 1; ; index += 1) {
      const email = `${index === 1 ? base : `${base}${index}`}@${domain}`;
      if (!used.has(email)) { used.add(email); return email; }
    }
  };
}

/** Staff emails in STAFF order, computed once so every tool agrees. */
export const STAFF_EMAILS: Record<string, string> = (() => {
  const allocate = createEmailAllocator();
  return Object.fromEntries(STAFF.map(member => [member.key, allocate(member.name, STAFF_EMAIL_DOMAIN)]));
})();

/** Scripted sample residents used by QUICKSTART (A301/A302/A303 share PUMP-A; B301 is the control case). */
export const SAMPLE_RESIDENTS = [
  { key: "resident_a301", name: "Đặng Minh Quân", unit: ["TOWER-A", "A301"] },
  { key: "resident_a302", name: "Phạm Thị Lan", unit: ["TOWER-A", "A302"] },
  { key: "resident_a303", name: "Lương Hải Yến", unit: ["TOWER-A", "A303"] },
  { key: "resident_b301", name: "Kim Ji-woo", unit: ["TOWER-B", "B301"] }
] as const;

export const SAMPLE_RESIDENT_EMAILS: Record<string, string> = (() => {
  const allocate = createEmailAllocator(Object.values(STAFF_EMAILS));
  return Object.fromEntries(SAMPLE_RESIDENTS.map(person => [person.key, allocate(person.name, RESIDENT_EMAIL_DOMAIN)]));
})();
