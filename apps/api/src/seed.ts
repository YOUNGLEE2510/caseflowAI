import bcrypt from "bcryptjs";
import { connectDatabase } from "./db.js";
import {
  CaseRecord,
  Incident,
  KnowledgeArticle,
  Organization,
  ServiceDefinition,
  User
} from "./models.js";

const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000);
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);

export async function seedDatabase(force = false) {
  let existing = await Organization.findOne({ slug: "minh-khai-university" });
  if (existing && !force) return existing;

  if (force) {
    await Promise.all([
      Organization.deleteMany({}),
      User.deleteMany({}),
      ServiceDefinition.deleteMany({}),
      CaseRecord.deleteMany({}),
      Incident.deleteMany({}),
      KnowledgeArticle.deleteMany({})
    ]);
    existing = null;
  }

  const organization =
    existing ||
    (await Organization.create({
      name: "Trường Đại học Minh Khai",
      slug: "minh-khai-university",
      settings: { locale: "vi-VN", timezone: "Asia/Ho_Chi_Minh" }
    }));

  const passwordHash = await bcrypt.hash("Demo123!", 10);
  const users = await User.insertMany([
    {
      organizationId: organization._id,
      name: "Nguyễn Minh Anh",
      email: "student@caseflow.local",
      passwordHash,
      role: "requester",
      title: "Sinh viên K68",
      avatarColor: "#2f6d91"
    },
    {
      organizationId: organization._id,
      name: "Trần Quốc Minh",
      email: "student2@caseflow.local",
      passwordHash,
      role: "requester",
      title: "Sinh viên K67",
      avatarColor: "#7b5d9b"
    },
    {
      organizationId: organization._id,
      name: "Lê Hoàng Nam",
      email: "agent@caseflow.local",
      passwordHash,
      role: "agent",
      team: "Trung tâm CNTT",
      title: "Chuyên viên hỗ trợ",
      avatarColor: "#155c4d"
    },
    {
      organizationId: organization._id,
      name: "Phạm Thu Lan",
      email: "training@caseflow.local",
      passwordHash,
      role: "agent",
      team: "Phòng Đào tạo",
      title: "Chuyên viên đào tạo",
      avatarColor: "#b7791f"
    },
    {
      organizationId: organization._id,
      name: "Vũ Đức Long",
      email: "facilities@caseflow.local",
      passwordHash,
      role: "agent",
      team: "Phòng Quản trị",
      title: "Chuyên viên cơ sở vật chất",
      avatarColor: "#8a5a44"
    },
    {
      organizationId: organization._id,
      name: "Đỗ Mai Thảo",
      email: "manager@caseflow.local",
      passwordHash,
      role: "manager",
      team: "Trung tâm Dịch vụ",
      title: "Trưởng trung tâm",
      avatarColor: "#b13b3b"
    },
    {
      organizationId: organization._id,
      name: "Nguyễn Quang Huy",
      email: "admin@caseflow.local",
      passwordHash,
      role: "org_admin",
      team: "Ban Chuyển đổi số",
      title: "Quản trị tổ chức",
      avatarColor: "#3d665f"
    }
  ]);

  const [student, student2, itAgent, trainingAgent, facilitiesAgent] = users;

  await ServiceDefinition.insertMany([
    {
      organizationId: organization._id,
      key: "it_access",
      name: "Tài khoản và truy cập",
      description: "Đăng nhập, mật khẩu, email, Wi-Fi và quyền truy cập hệ thống.",
      category: "it_access",
      team: "Trung tâm CNTT",
      slaHours: 8,
      requiredFields: ["Mã sinh viên"]
    },
    {
      organizationId: organization._id,
      key: "academic_records",
      name: "Đào tạo và học vụ",
      description: "Đăng ký học phần, bảng điểm, điều kiện tiên quyết và đồ án.",
      category: "academic_records",
      team: "Phòng Đào tạo",
      slaHours: 24,
      requiredFields: ["Mã sinh viên", "Mã học phần"]
    },
    {
      organizationId: organization._id,
      key: "student_services",
      name: "Dịch vụ sinh viên",
      description: "Xác nhận sinh viên, học bổng, thẻ và hoạt động rèn luyện.",
      category: "student_services",
      team: "Phòng Công tác sinh viên",
      slaHours: 48,
      requiredFields: ["Mã sinh viên"]
    },
    {
      organizationId: organization._id,
      key: "facilities",
      name: "Cơ sở vật chất",
      description: "Phòng học, điện, nước, điều hòa và thiết bị dùng chung.",
      category: "facilities",
      team: "Phòng Quản trị",
      slaHours: 12,
      requiredFields: ["Địa điểm"]
    },
    {
      organizationId: organization._id,
      key: "finance",
      name: "Học phí và thanh toán",
      description: "Học phí, công nợ, biên lai, hoàn tiền và đối soát.",
      category: "finance",
      team: "Phòng Tài chính",
      slaHours: 36,
      requiredFields: ["Mã sinh viên", "Kỳ thanh toán"]
    },
    {
      organizationId: organization._id,
      key: "general_support",
      name: "Hỗ trợ chung",
      description: "Các yêu cầu chưa thuộc danh mục dịch vụ chuyên biệt.",
      category: "general_support",
      team: "Trung tâm Dịch vụ",
      slaHours: 24,
      requiredFields: []
    }
  ]);

  const baseEvents = (actorId: unknown, actorName: string, createdAt: Date) => [
    { type: "created", label: "Hồ sơ được tạo", actorId, actorName, createdAt },
    { type: "ai_triage", label: "AI đã phân loại và đề xuất điều phối", actorName: "CaseFlow AI", createdAt }
  ];

  const cases = await CaseRecord.insertMany([
    {
      organizationId: organization._id,
      code: "CF-2026-0001",
      title: "Không đăng nhập được cổng sinh viên",
      description: "Tài khoản SIS báo sai mật khẩu dù em đã đặt lại hai lần.",
      serviceKey: "it_access",
      category: "it_access",
      priority: "high",
      status: "in_progress",
      channel: "portal",
      requesterId: student._id,
      requesterName: student.name,
      assigneeId: itAgent._id,
      assigneeName: itAgent.name,
      team: "Trung tâm CNTT",
      dueAt: hoursFromNow(2),
      createdAt: hoursAgo(6),
      updatedAt: hoursAgo(1),
      ai: {
        classification: "it_access",
        confidence: 0.94,
        summary: "Sinh viên không thể đăng nhập SIS sau nhiều lần đặt lại mật khẩu.",
        riskScore: 0.78,
        riskFactors: ["Đã sử dụng 76% thời gian SLA", "Cụm sự cố đăng nhập đang tăng"],
        analyzedAt: new Date()
      },
      events: [
        ...baseEvents(student._id, student.name, hoursAgo(6)),
        {
          type: "assigned",
          label: "Đã giao cho Lê Hoàng Nam",
          actorId: itAgent._id,
          actorName: "Hệ thống",
          createdAt: hoursAgo(5)
        }
      ]
    },
    {
      organizationId: organization._id,
      code: "CF-2026-0002",
      title: "Cổng đăng ký học phần bị treo",
      description: "Trang đăng ký học phần quay liên tục và không lưu môn đã chọn.",
      serviceKey: "it_access",
      category: "it_access",
      priority: "urgent",
      status: "triaged",
      channel: "email",
      requesterId: student2._id,
      requesterName: student2.name,
      assigneeId: itAgent._id,
      assigneeName: itAgent.name,
      team: "Trung tâm CNTT",
      dueAt: hoursFromNow(1),
      createdAt: hoursAgo(7),
      updatedAt: hoursAgo(1),
      ai: {
        classification: "it_access",
        confidence: 0.91,
        summary: "Cổng đăng ký học phần không lưu lựa chọn của sinh viên.",
        riskScore: 0.86,
        riskFactors: ["Sự cố ảnh hưởng nhiều người dùng", "Thời hạn còn dưới 2 giờ"],
        analyzedAt: new Date()
      },
      events: baseEvents(student2._id, student2.name, hoursAgo(7))
    },
    {
      organizationId: organization._id,
      code: "CF-2026-0003",
      title: "Chưa cập nhật điểm học phần",
      description: "Điểm môn Cấu trúc dữ liệu đã có trên lớp nhưng chưa xuất hiện trong bảng điểm.",
      serviceKey: "academic_records",
      category: "academic_records",
      priority: "normal",
      status: "waiting",
      channel: "portal",
      requesterId: student._id,
      requesterName: student.name,
      assigneeId: trainingAgent._id,
      assigneeName: trainingAgent.name,
      team: "Phòng Đào tạo",
      dueAt: hoursFromNow(9),
      createdAt: hoursAgo(18),
      updatedAt: hoursAgo(2),
      ai: {
        classification: "academic_records",
        confidence: 0.89,
        summary: "Điểm học phần chưa đồng bộ lên bảng điểm cá nhân.",
        riskScore: 0.61,
        riskFactors: ["Đang chờ dữ liệu từ giảng viên", "Đã chuyển trạng thái hai lần"],
        analyzedAt: new Date()
      },
      events: baseEvents(student._id, student.name, hoursAgo(18))
    },
    {
      organizationId: organization._id,
      code: "CF-2026-0004",
      title: "Điều hòa phòng D5-301 không hoạt động",
      description: "Điều hòa phòng học D5-301 không mát từ tiết 2, lớp có hơn 60 sinh viên.",
      serviceKey: "facilities",
      category: "facilities",
      priority: "high",
      status: "in_progress",
      channel: "phone",
      requesterId: student2._id,
      requesterName: student2.name,
      assigneeId: facilitiesAgent._id,
      assigneeName: facilitiesAgent.name,
      team: "Phòng Quản trị",
      dueAt: hoursFromNow(4),
      createdAt: hoursAgo(3),
      updatedAt: hoursAgo(1),
      ai: {
        classification: "facilities",
        confidence: 0.96,
        summary: "Điều hòa phòng D5-301 hỏng, ảnh hưởng lớp học đông sinh viên.",
        riskScore: 0.42,
        riskFactors: ["Mức độ ảnh hưởng cao"],
        analyzedAt: new Date()
      },
      events: baseEvents(student2._id, student2.name, hoursAgo(3))
    },
    {
      organizationId: organization._id,
      code: "CF-2026-0005",
      title: "Xin giấy xác nhận sinh viên vay vốn",
      description: "Em cần giấy xác nhận sinh viên để hoàn thiện hồ sơ vay vốn trước thứ sáu.",
      serviceKey: "student_services",
      category: "student_services",
      priority: "normal",
      status: "new",
      channel: "walk_in",
      requesterId: student._id,
      requesterName: student.name,
      team: "Phòng Công tác sinh viên",
      dueAt: hoursFromNow(42),
      createdAt: hoursAgo(2),
      updatedAt: hoursAgo(2),
      ai: {
        classification: "student_services",
        confidence: 0.93,
        summary: "Yêu cầu giấy xác nhận sinh viên phục vụ hồ sơ vay vốn.",
        riskScore: 0.18,
        riskFactors: [],
        analyzedAt: new Date()
      },
      events: baseEvents(student._id, student.name, hoursAgo(2))
    },
    {
      organizationId: organization._id,
      code: "CF-2026-0006",
      title: "Đề nghị cấp lại biên lai học phí",
      description: "Em đã thanh toán học phí nhưng làm mất biên lai điện tử của học kỳ này.",
      serviceKey: "finance",
      category: "finance",
      priority: "normal",
      status: "resolved",
      channel: "portal",
      requesterId: student2._id,
      requesterName: student2.name,
      team: "Phòng Tài chính",
      dueAt: hoursAgo(4),
      resolvedAt: hoursAgo(9),
      createdAt: hoursAgo(31),
      updatedAt: hoursAgo(9),
      ai: {
        classification: "finance",
        confidence: 0.9,
        summary: "Sinh viên cần cấp lại biên lai học phí điện tử.",
        riskScore: 0.12,
        riskFactors: [],
        analyzedAt: hoursAgo(12)
      },
      events: [
        ...baseEvents(student2._id, student2.name, hoursAgo(31)),
        {
          type: "resolved",
          label: "Đã gửi lại biên lai điện tử",
          actorName: "Phòng Tài chính",
          createdAt: hoursAgo(9)
        }
      ]
    }
  ]);

  // Đợt 2: thêm cases đa dạng hơn để dashboard có đủ dữ liệu hiển thị
  const extraCases = await CaseRecord.insertMany([
    {
      organizationId: organization._id,
      code: "CF-2026-0007", title: "Wi-Fi tòa B mất kết nối liên tục",
      description: "Sinh viên phản ánh Wi-Fi tầng 3 tòa B bị ngắt liên tục trong giờ học sáng.",
      serviceKey: "it_access", category: "it_access", priority: "high", status: "in_progress", channel: "portal",
      requesterId: student._id, requesterName: student.name,
      assigneeId: itAgent._id, assigneeName: itAgent.name, team: "Trung tâm CNTT",
      dueAt: hoursFromNow(3), createdAt: hoursAgo(5), updatedAt: hoursAgo(1),
      ai: { classification: "it_access", confidence: 0.92, summary: "Sự cố Wi-Fi tầng 3 tòa B.", riskScore: 0.71, riskFactors: ["Ảnh hưởng nhiều sinh viên"], analyzedAt: new Date() },
      events: baseEvents(student._id, student.name, hoursAgo(5))
    },
    {
      organizationId: organization._id,
      code: "CF-2026-0008", title: "Đăng ký bổ sung học phần Mạng máy tính",
      description: "Lớp đã đủ sĩ số nhưng em cần đăng ký vì là môn tiên quyết cho đồ án.",
      serviceKey: "academic_records", category: "academic_records", priority: "normal", status: "triaged", channel: "portal",
      requesterId: student2._id, requesterName: student2.name,
      assigneeId: trainingAgent._id, assigneeName: trainingAgent.name, team: "Phòng Đào tạo",
      dueAt: hoursFromNow(18), createdAt: hoursAgo(8), updatedAt: hoursAgo(4),
      ai: { classification: "academic_records", confidence: 0.87, summary: "Đăng ký bổ sung học phần Mạng máy tính.", riskScore: 0.33, riskFactors: [], analyzedAt: new Date() },
      events: baseEvents(student2._id, student2.name, hoursAgo(8))
    },
    {
      organizationId: organization._id,
      code: "CF-2026-0009", title: "Máy chiếu phòng A3-205 bị nhòe hình",
      description: "Máy chiếu trong phòng A3-205 bị mờ nửa bên phải, giảng viên không thể dạy.",
      serviceKey: "facilities", category: "facilities", priority: "urgent", status: "in_progress", channel: "phone",
      requesterId: student._id, requesterName: student.name,
      assigneeId: facilitiesAgent._id, assigneeName: facilitiesAgent.name, team: "Phòng Quản trị",
      dueAt: hoursFromNow(1), createdAt: hoursAgo(4), updatedAt: hoursAgo(0.5),
      ai: { classification: "facilities", confidence: 0.95, summary: "Máy chiếu phòng A3-205 hỏng.", riskScore: 0.82, riskFactors: ["Thời hạn SLA gần hết", "Ảnh hưởng giảng dạy"], analyzedAt: new Date() },
      events: baseEvents(student._id, student.name, hoursAgo(4))
    },
    {
      organizationId: organization._id,
      code: "CF-2026-0010", title: "Thanh toán học phí bị trừ hai lần",
      description: "Em đóng học phí qua VNPay chiều qua, bị trừ 2 giao dịch giống nhau.",
      serviceKey: "finance", category: "finance", priority: "high", status: "triaged", channel: "email",
      requesterId: student2._id, requesterName: student2.name,
      team: "Phòng Tài chính",
      dueAt: hoursFromNow(28), createdAt: hoursAgo(8), updatedAt: hoursAgo(6),
      ai: { classification: "finance", confidence: 0.93, summary: "Giao dịch học phí bị trùng lặp.", riskScore: 0.55, riskFactors: ["Liên quan tài chính cần xử lý sớm"], analyzedAt: new Date() },
      events: baseEvents(student2._id, student2.name, hoursAgo(8))
    },
    {
      organizationId: organization._id,
      code: "CF-2026-0011", title: "Cần giấy giới thiệu đi thực tập",
      description: "Em đã có thư tiếp nhận của công ty, cần giấy giới thiệu từ trường.",
      serviceKey: "student_services", category: "student_services", priority: "normal", status: "new", channel: "walk_in",
      requesterId: student._id, requesterName: student.name,
      team: "Phòng Công tác sinh viên",
      dueAt: hoursFromNow(40), createdAt: hoursAgo(3), updatedAt: hoursAgo(3),
      ai: { classification: "student_services", confidence: 0.91, summary: "Yêu cầu giấy giới thiệu thực tập.", riskScore: 0.15, riskFactors: [], analyzedAt: new Date() },
      events: baseEvents(student._id, student.name, hoursAgo(3))
    },
    {
      organizationId: organization._id,
      code: "CF-2026-0012", title: "Email trường không nhận thư từ Gmail",
      description: "Từ đầu tuần em không nhận được email gửi từ Gmail vào mail trường.",
      serviceKey: "it_access", category: "it_access", priority: "normal", status: "resolved", channel: "portal",
      requesterId: student2._id, requesterName: student2.name,
      assigneeId: itAgent._id, assigneeName: itAgent.name, team: "Trung tâm CNTT",
      dueAt: hoursAgo(10), resolvedAt: hoursAgo(14), createdAt: hoursAgo(48), updatedAt: hoursAgo(14),
      ai: { classification: "it_access", confidence: 0.88, summary: "Email trường không nhận thư từ bên ngoài.", riskScore: 0.08, riskFactors: [], analyzedAt: hoursAgo(48) },
      events: [...baseEvents(student2._id, student2.name, hoursAgo(48)), { type: "resolved", label: "Đã kiểm tra và khắc phục bộ lọc spam", actorName: itAgent.name, createdAt: hoursAgo(14) }]
    },
    {
      organizationId: organization._id,
      code: "CF-2026-0013", title: "Lịch thi trùng hai môn trong cùng buổi",
      description: "Lịch thi Toán cao cấp 2 và Xác suất thống kê bị xếp cùng buổi sáng thứ Hai.",
      serviceKey: "academic_records", category: "academic_records", priority: "urgent", status: "in_progress", channel: "portal",
      requesterId: student._id, requesterName: student.name,
      assigneeId: trainingAgent._id, assigneeName: trainingAgent.name, team: "Phòng Đào tạo",
      dueAt: hoursFromNow(5), createdAt: hoursAgo(20), updatedAt: hoursAgo(2),
      ai: { classification: "academic_records", confidence: 0.95, summary: "Trùng lịch thi hai môn.", riskScore: 0.74, riskFactors: ["Cần giải quyết trước ngày thi"], analyzedAt: new Date() },
      events: baseEvents(student._id, student.name, hoursAgo(20))
    },
    {
      organizationId: organization._id,
      code: "CF-2026-0014", title: "Bàn ghế phòng C2-104 bị hỏng",
      description: "3 bộ bàn ghế ở hàng cuối phòng C2-104 bị gãy chân, không ngồi được.",
      serviceKey: "facilities", category: "facilities", priority: "normal", status: "closed", channel: "portal",
      requesterId: student2._id, requesterName: student2.name,
      assigneeId: facilitiesAgent._id, assigneeName: facilitiesAgent.name, team: "Phòng Quản trị",
      dueAt: hoursAgo(72), resolvedAt: hoursAgo(80), closedAt: hoursAgo(72), createdAt: hoursAgo(120), updatedAt: hoursAgo(72),
      ai: { classification: "facilities", confidence: 0.94, summary: "Bàn ghế phòng C2-104 hỏng.", riskScore: 0.05, riskFactors: [], analyzedAt: hoursAgo(120) },
      events: baseEvents(student2._id, student2.name, hoursAgo(120))
    },
    {
      organizationId: organization._id,
      code: "CF-2026-0015", title: "Điểm rèn luyện chưa cập nhật hoạt động tình nguyện",
      description: "Em đã tham gia hiến máu và hoạt động tình nguyện tháng trước nhưng điểm rèn luyện chưa cộng.",
      serviceKey: "student_services", category: "student_services", priority: "low", status: "waiting", channel: "portal",
      requesterId: student._id, requesterName: student.name,
      team: "Phòng Công tác sinh viên",
      dueAt: hoursFromNow(30), createdAt: hoursAgo(72), updatedAt: hoursAgo(24),
      ai: { classification: "student_services", confidence: 0.86, summary: "Điểm rèn luyện chưa ghi nhận hoạt động.", riskScore: 0.22, riskFactors: [], analyzedAt: hoursAgo(72) },
      events: baseEvents(student._id, student.name, hoursAgo(72))
    },
    {
      organizationId: organization._id,
      code: "CF-2026-0016", title: "Công nợ hiển thị sai sau khi đã nộp học phí",
      description: "Em đã nộp đủ học phí kỳ này nhưng hệ thống vẫn báo còn nợ 2 triệu.",
      serviceKey: "finance", category: "finance", priority: "high", status: "in_progress", channel: "portal",
      requesterId: student2._id, requesterName: student2.name,
      team: "Phòng Tài chính",
      dueAt: hoursFromNow(12), createdAt: hoursAgo(30), updatedAt: hoursAgo(5),
      ai: { classification: "finance", confidence: 0.91, summary: "Công nợ hiển thị không đúng sau thanh toán.", riskScore: 0.63, riskFactors: ["Ảnh hưởng đăng ký học phần kỳ sau"], analyzedAt: new Date() },
      events: baseEvents(student2._id, student2.name, hoursAgo(30))
    },
    {
      organizationId: organization._id,
      code: "CF-2026-0017", title: "Xin cấp lại thẻ sinh viên bị mất",
      description: "Em bị mất thẻ sinh viên tuần trước, cần cấp lại để vào thư viện.",
      serviceKey: "student_services", category: "student_services", priority: "normal", status: "resolved", channel: "walk_in",
      requesterId: student._id, requesterName: student.name,
      team: "Phòng Công tác sinh viên",
      dueAt: hoursAgo(24), resolvedAt: hoursAgo(30), createdAt: hoursAgo(96), updatedAt: hoursAgo(30),
      ai: { classification: "student_services", confidence: 0.94, summary: "Cấp lại thẻ sinh viên bị mất.", riskScore: 0.06, riskFactors: [], analyzedAt: hoursAgo(96) },
      events: [...baseEvents(student._id, student.name, hoursAgo(96)), { type: "resolved", label: "Đã cấp thẻ mới", actorName: "Phòng Công tác sinh viên", createdAt: hoursAgo(30) }]
    },
    {
      organizationId: organization._id,
      code: "CF-2026-0018", title: "Không vào được hệ thống LMS",
      description: "Hệ thống LMS báo 'session expired' liên tục dù đã xóa cache trình duyệt.",
      serviceKey: "it_access", category: "it_access", priority: "normal", status: "new", channel: "email",
      requesterId: student2._id, requesterName: student2.name,
      team: "Trung tâm CNTT",
      dueAt: hoursFromNow(6), createdAt: hoursAgo(2), updatedAt: hoursAgo(2),
      ai: { classification: "it_access", confidence: 0.90, summary: "Lỗi session LMS.", riskScore: 0.30, riskFactors: [], analyzedAt: new Date() },
      events: baseEvents(student2._id, student2.name, hoursAgo(2))
    },
    {
      organizationId: organization._id,
      code: "CF-2026-0019", title: "Cần kiểm tra điều kiện xét tốt nghiệp",
      description: "Em sắp hết học kỳ cuối, muốn kiểm tra xem đã đủ tín chỉ tốt nghiệp chưa.",
      serviceKey: "academic_records", category: "academic_records", priority: "normal", status: "resolved", channel: "portal",
      requesterId: student._id, requesterName: student.name,
      assigneeId: trainingAgent._id, assigneeName: trainingAgent.name, team: "Phòng Đào tạo",
      dueAt: hoursAgo(48), resolvedAt: hoursAgo(52), createdAt: hoursAgo(168), updatedAt: hoursAgo(52),
      ai: { classification: "academic_records", confidence: 0.88, summary: "Kiểm tra điều kiện tốt nghiệp.", riskScore: 0.04, riskFactors: [], analyzedAt: hoursAgo(168) },
      events: [...baseEvents(student._id, student.name, hoursAgo(168)), { type: "resolved", label: "Đã gửi bảng rà soát tín chỉ", actorName: trainingAgent.name, createdAt: hoursAgo(52) }]
    },
    {
      organizationId: organization._id,
      code: "CF-2026-0020", title: "Nhà vệ sinh tầng 2 tòa A không có nước",
      description: "Nhà vệ sinh nam tầng 2 tòa A bị mất nước từ sáng nay.",
      serviceKey: "facilities", category: "facilities", priority: "high", status: "resolved", channel: "phone",
      requesterId: student2._id, requesterName: student2.name,
      assigneeId: facilitiesAgent._id, assigneeName: facilitiesAgent.name, team: "Phòng Quản trị",
      dueAt: hoursAgo(1), resolvedAt: hoursAgo(3), createdAt: hoursAgo(10), updatedAt: hoursAgo(3),
      ai: { classification: "facilities", confidence: 0.97, summary: "Nhà vệ sinh tòa A mất nước.", riskScore: 0.09, riskFactors: [], analyzedAt: hoursAgo(10) },
      events: [...baseEvents(student2._id, student2.name, hoursAgo(10)), { type: "resolved", label: "Đã sửa van nước", actorName: facilitiesAgent.name, createdAt: hoursAgo(3) }]
    },
    {
      organizationId: organization._id,
      code: "CF-2026-0021", title: "Hỏi hạn nộp học phí kỳ 2",
      description: "Em muốn biết hạn nộp học phí kỳ 2 năm nay để sắp xếp tài chính.",
      serviceKey: "finance", category: "finance", priority: "low", status: "closed", channel: "portal",
      requesterId: student._id, requesterName: student.name,
      team: "Phòng Tài chính",
      dueAt: hoursAgo(96), resolvedAt: hoursAgo(100), closedAt: hoursAgo(96), createdAt: hoursAgo(200), updatedAt: hoursAgo(96),
      ai: { classification: "finance", confidence: 0.85, summary: "Hỏi thời hạn nộp học phí.", riskScore: 0.03, riskFactors: [], analyzedAt: hoursAgo(200) },
      events: baseEvents(student._id, student.name, hoursAgo(200))
    },
    {
      organizationId: organization._id,
      code: "CF-2026-0022", title: "Phản ánh chất lượng căn tin",
      description: "Thức ăn ở căn tin tầng 1 tòa B bị lạnh và ít lựa chọn hơn trước.",
      serviceKey: "general_support", category: "general_support", priority: "low", status: "new", channel: "portal",
      requesterId: student2._id, requesterName: student2.name,
      team: "Trung tâm Dịch vụ",
      dueAt: hoursFromNow(20), createdAt: hoursAgo(4), updatedAt: hoursAgo(4),
      ai: { classification: "general_support", confidence: 0.72, summary: "Phản ánh chất lượng căn tin.", riskScore: 0.10, riskFactors: [], analyzedAt: new Date() },
      events: baseEvents(student2._id, student2.name, hoursAgo(4))
    },
    {
      organizationId: organization._id,
      code: "CF-2026-0023", title: "Xin cấp quyền truy cập phòng lab",
      description: "Em cần quyền truy cập phòng lab CNTT ngoài giờ để làm đồ án.",
      serviceKey: "it_access", category: "it_access", priority: "normal", status: "waiting", channel: "portal",
      requesterId: student._id, requesterName: student.name,
      assigneeId: itAgent._id, assigneeName: itAgent.name, team: "Trung tâm CNTT",
      dueAt: hoursFromNow(4), createdAt: hoursAgo(15), updatedAt: hoursAgo(6),
      ai: { classification: "it_access", confidence: 0.83, summary: "Yêu cầu quyền truy cập lab.", riskScore: 0.45, riskFactors: ["Đang chờ phê duyệt quản lý"], analyzedAt: hoursAgo(15) },
      events: baseEvents(student._id, student.name, hoursAgo(15))
    },
    {
      organizationId: organization._id,
      code: "CF-2026-0024", title: "Đèn hành lang tòa D tầng 4 bị cháy",
      description: "Hành lang tầng 4 tòa D tối khi tan học buổi tối, 3 bóng đèn bị cháy.",
      serviceKey: "facilities", category: "facilities", priority: "normal", status: "triaged", channel: "portal",
      requesterId: student2._id, requesterName: student2.name,
      team: "Phòng Quản trị",
      dueAt: hoursFromNow(8), createdAt: hoursAgo(6), updatedAt: hoursAgo(3),
      ai: { classification: "facilities", confidence: 0.93, summary: "Đèn hành lang tòa D hỏng.", riskScore: 0.28, riskFactors: [], analyzedAt: new Date() },
      events: baseEvents(student2._id, student2.name, hoursAgo(6))
    },
    {
      organizationId: organization._id,
      code: "CF-2026-0025", title: "Hỗ trợ thủ tục bảo hiểm y tế",
      description: "Em cần nộp bảo hiểm y tế nhưng không biết nộp ở đâu và cần giấy tờ gì.",
      serviceKey: "student_services", category: "student_services", priority: "low", status: "resolved", channel: "walk_in",
      requesterId: student._id, requesterName: student.name,
      team: "Phòng Công tác sinh viên",
      dueAt: hoursAgo(12), resolvedAt: hoursAgo(18), createdAt: hoursAgo(60), updatedAt: hoursAgo(18),
      ai: { classification: "student_services", confidence: 0.80, summary: "Hướng dẫn thủ tục BHYT.", riskScore: 0.05, riskFactors: [], analyzedAt: hoursAgo(60) },
      events: [...baseEvents(student._id, student.name, hoursAgo(60)), { type: "resolved", label: "Đã hướng dẫn và tiếp nhận hồ sơ", actorName: "Phòng Công tác sinh viên", createdAt: hoursAgo(18) }]
    },
    {
      organizationId: organization._id,
      code: "CF-2026-0026", title: "Muốn hủy học phần đã đăng ký",
      description: "Em muốn hủy môn Kinh tế vĩ mô vì bị trùng lịch làm thêm.",
      serviceKey: "academic_records", category: "academic_records", priority: "normal", status: "closed", channel: "portal",
      requesterId: student2._id, requesterName: student2.name,
      assigneeId: trainingAgent._id, assigneeName: trainingAgent.name, team: "Phòng Đào tạo",
      dueAt: hoursAgo(150), resolvedAt: hoursAgo(156), closedAt: hoursAgo(148), createdAt: hoursAgo(336), updatedAt: hoursAgo(148),
      ai: { classification: "academic_records", confidence: 0.92, summary: "Hủy đăng ký học phần.", riskScore: 0.02, riskFactors: [], analyzedAt: hoursAgo(336) },
      events: baseEvents(student2._id, student2.name, hoursAgo(336))
    },
    {
      organizationId: organization._id,
      code: "CF-2026-0027", title: "Không biết gửi yêu cầu cho bộ phận nào",
      description: "Tôi muốn xin gia hạn thời gian nộp báo cáo thực tập nhưng không biết liên hệ ai.",
      serviceKey: "general_support", category: "general_support", priority: "normal", status: "triaged", channel: "email",
      requesterId: student._id, requesterName: student.name,
      team: "Trung tâm Dịch vụ",
      dueAt: hoursFromNow(16), createdAt: hoursAgo(10), updatedAt: hoursAgo(7),
      ai: { classification: "general_support", confidence: 0.68, summary: "Yêu cầu chưa xác định bộ phận xử lý.", riskScore: 0.20, riskFactors: [], analyzedAt: new Date() },
      events: baseEvents(student._id, student.name, hoursAgo(10))
    },
    {
      organizationId: organization._id,
      code: "CF-2026-0028", title: "Ổ điện phòng B1-303 có tia lửa",
      description: "Khi cắm laptop vào ổ điện bên trái phòng B1-303 thì thấy tia lửa nhỏ.",
      serviceKey: "facilities", category: "facilities", priority: "urgent", status: "resolved", channel: "phone",
      requesterId: student2._id, requesterName: student2.name,
      assigneeId: facilitiesAgent._id, assigneeName: facilitiesAgent.name, team: "Phòng Quản trị",
      dueAt: hoursAgo(2), resolvedAt: hoursAgo(4), createdAt: hoursAgo(8), updatedAt: hoursAgo(4),
      ai: { classification: "facilities", confidence: 0.96, summary: "Ổ điện nguy hiểm phòng B1-303.", riskScore: 0.10, riskFactors: [], analyzedAt: hoursAgo(8) },
      events: [...baseEvents(student2._id, student2.name, hoursAgo(8)), { type: "resolved", label: "Đã ngắt nguồn và thay ổ điện", actorName: facilitiesAgent.name, createdAt: hoursAgo(4) }]
    },
    {
      organizationId: organization._id,
      code: "CF-2026-0029", title: "Xin xác nhận đã hoàn thành học phí",
      description: "Em cần giấy xác nhận đã hoàn thành nghĩa vụ tài chính để làm hồ sơ tốt nghiệp.",
      serviceKey: "finance", category: "finance", priority: "normal", status: "new", channel: "portal",
      requesterId: student._id, requesterName: student.name,
      team: "Phòng Tài chính",
      dueAt: hoursFromNow(30), createdAt: hoursAgo(1), updatedAt: hoursAgo(1),
      ai: { classification: "finance", confidence: 0.89, summary: "Xác nhận hoàn thành học phí cho tốt nghiệp.", riskScore: 0.12, riskFactors: [], analyzedAt: new Date() },
      events: baseEvents(student._id, student.name, hoursAgo(1))
    },
    {
      organizationId: organization._id,
      code: "CF-2026-0030", title: "Tài khoản email bị khóa sau nhiều lần nhập sai",
      description: "Tài khoản email trường bị khóa vì nhập sai mật khẩu 5 lần liên tiếp.",
      serviceKey: "it_access", category: "it_access", priority: "normal", status: "closed", channel: "portal",
      requesterId: student2._id, requesterName: student2.name,
      assigneeId: itAgent._id, assigneeName: itAgent.name, team: "Trung tâm CNTT",
      dueAt: hoursAgo(36), resolvedAt: hoursAgo(40), closedAt: hoursAgo(36), createdAt: hoursAgo(72), updatedAt: hoursAgo(36),
      ai: { classification: "it_access", confidence: 0.95, summary: "Mở khóa tài khoản email.", riskScore: 0.03, riskFactors: [], analyzedAt: hoursAgo(72) },
      events: baseEvents(student2._id, student2.name, hoursAgo(72))
    },
    {
      organizationId: organization._id,
      code: "CF-2026-0031", title: "Thang máy tòa E dừng hoạt động",
      description: "Thang máy tòa E bị kẹt ở tầng 3 từ sáng nay, sinh viên phải đi thang bộ.",
      serviceKey: "facilities", category: "facilities", priority: "high", status: "in_progress", channel: "phone",
      requesterId: student._id, requesterName: student.name,
      assigneeId: facilitiesAgent._id, assigneeName: facilitiesAgent.name, team: "Phòng Quản trị",
      dueAt: hoursFromNow(6), createdAt: hoursAgo(3), updatedAt: hoursAgo(1),
      ai: { classification: "facilities", confidence: 0.97, summary: "Thang máy tòa E hỏng.", riskScore: 0.58, riskFactors: ["Thiết bị ảnh hưởng nhiều người"], analyzedAt: new Date() },
      events: baseEvents(student._id, student.name, hoursAgo(3))
    }
  ]);

  // Incidents — gom nhóm sự cố có pattern tương đồng
  await Incident.insertMany([
    {
      organizationId: organization._id,
      code: "INC-2026-001",
      title: "Gián đoạn cổng thông tin sinh viên",
      summary: "Nhiều yêu cầu tương đồng về đăng nhập và đăng ký học phần xuất hiện trong thời gian ngắn.",
      severity: "high", status: "investigating", team: "Trung tâm CNTT",
      caseIds: [cases[0]._id, cases[1]._id, extraCases[0]._id],
      affectedCount: 47,
      signal: { clusterScore: 0.88, growthRate: 2.4, keywords: ["đăng nhập", "cổng sinh viên", "đăng ký học phần"] },
      detectedAt: hoursAgo(5)
    },
    {
      organizationId: organization._id,
      code: "INC-2026-002",
      title: "Sự cố điện tầng 3-4 tòa B",
      summary: "Nhiều phòng học tầng 3-4 tòa B bị mất điện cục bộ, ảnh hưởng thiết bị và điều hòa.",
      severity: "medium", status: "mitigated", team: "Phòng Quản trị",
      caseIds: [cases[3]._id],
      affectedCount: 12,
      signal: { clusterScore: 0.72, growthRate: 1.1, keywords: ["điện", "tòa B", "phòng học"] },
      detectedAt: hoursAgo(8)
    },
    {
      organizationId: organization._id,
      code: "INC-2026-003",
      title: "Lỗi đồng bộ dữ liệu thanh toán VNPay",
      summary: "Một số giao dịch qua VNPay bị ghi nhận trùng hoặc không đồng bộ về hệ thống tài chính.",
      severity: "high", status: "investigating", team: "Phòng Tài chính",
      caseIds: [extraCases[3]._id],
      affectedCount: 5,
      signal: { clusterScore: 0.65, growthRate: 0.8, keywords: ["học phí", "thanh toán", "trùng", "VNPay"] },
      detectedAt: hoursAgo(6)
    }
  ]);

  await KnowledgeArticle.insertMany([
    {
      organizationId: organization._id,
      title: "Khôi phục tài khoản cổng thông tin sinh viên",
      content: "Sinh viên sử dụng chức năng Quên mật khẩu bằng email trường. Nếu không nhận được thư sau 10 phút, kiểm tra thư rác và liên hệ Trung tâm CNTT kèm mã sinh viên. Không cung cấp mật khẩu qua điện thoại.",
      category: "it_access", tags: ["tài khoản", "mật khẩu", "SIS"],
      sourceLabel: "Quy trình hỗ trợ CNTT 2026", version: "2.1"
    },
    {
      organizationId: organization._id,
      title: "Quy trình điều chỉnh điểm học phần",
      content: "Yêu cầu điều chỉnh điểm cần có mã học phần, học kỳ, lớp học và minh chứng từ giảng viên. Phòng Đào tạo tiếp nhận và phản hồi trong ba ngày làm việc kể từ khi đủ hồ sơ.",
      category: "academic_records", tags: ["điểm", "học phần", "đào tạo"],
      sourceLabel: "Quy chế đào tạo đại học", version: "2026.1"
    },
    {
      organizationId: organization._id,
      title: "Cấp giấy xác nhận sinh viên",
      content: "Sinh viên có thể đề nghị giấy xác nhận cho mục đích vay vốn, thực tập hoặc thủ tục hành chính. Hồ sơ cần ghi rõ mục đích và được xử lý trong hai ngày làm việc.",
      category: "student_services", tags: ["xác nhận", "vay vốn", "giấy tờ"],
      sourceLabel: "Sổ tay dịch vụ sinh viên", version: "1.4"
    },
    {
      organizationId: organization._id,
      title: "Tiếp nhận sự cố cơ sở vật chất",
      content: "Sự cố ảnh hưởng an toàn, điện, nước hoặc toàn bộ lớp học được ưu tiên cao. Người tiếp nhận phải ghi rõ tòa nhà, phòng, thời điểm phát hiện và mức độ ảnh hưởng.",
      category: "facilities", tags: ["phòng học", "điện", "điều hòa"],
      sourceLabel: "Quy trình vận hành cơ sở vật chất", version: "3.0"
    },
    {
      organizationId: organization._id,
      title: "Hướng dẫn thanh toán học phí trực tuyến",
      content: "Sinh viên đăng nhập cổng SIS, chọn mục Thanh toán học phí, chọn kỳ thanh toán. Hỗ trợ thanh toán qua VNPay, chuyển khoản ngân hàng và ví điện tử. Nếu giao dịch bị treo, chờ 30 phút trước khi thử lại.",
      category: "finance", tags: ["học phí", "thanh toán", "VNPay"],
      sourceLabel: "Hướng dẫn tài chính sinh viên", version: "2.0"
    },
    {
      organizationId: organization._id,
      title: "Kết nối Wi-Fi campus",
      content: "Sử dụng SSID 'MinhKhai-Student' với tài khoản SIS. Nếu không kết nối được: quên mạng cũ, đăng nhập lại. Một số tòa nhà cũ có vùng phủ sóng yếu — liên hệ CNTT kèm vị trí cụ thể.",
      category: "it_access", tags: ["wifi", "mạng", "kết nối"],
      sourceLabel: "Hướng dẫn CNTT cho sinh viên", version: "1.2"
    },
    {
      organizationId: organization._id,
      title: "Quy trình đăng ký và hủy học phần",
      content: "Đăng ký bổ sung hoặc hủy học phần chỉ được thực hiện trong tuần đầu tiên của học kỳ. Sau thời hạn này cần đơn xin đặc biệt có xác nhận của cố vấn học tập.",
      category: "academic_records", tags: ["đăng ký", "hủy", "học phần"],
      sourceLabel: "Quy chế đào tạo đại học", version: "2026.1"
    }
  ]);

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

