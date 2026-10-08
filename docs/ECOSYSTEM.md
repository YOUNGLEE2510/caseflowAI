# Định hướng mở rộng nghiệp vụ

CaseFlow AI được thiết kế theo mô hình lõi dùng chung (core domain) và có thể cấu hình linh hoạt theo từng lĩnh vực nghiệp vụ. Trong phạm vi đồ án tốt nghiệp, hệ thống tập trung hoàn thiện nghiệp vụ dịch vụ sinh viên và IT helpdesk trong trường đại học.

## So sánh với hệ thống quản lý thủ công

| Hệ thống quản lý truyền thống | CaseFlow AI |
|---|---|
| Người dùng tự chọn đúng biểu mẫu và phòng ban | Nhập ngôn ngữ tự nhiên, AI phân loại đề xuất dịch vụ và đơn vị |
| Mỗi đơn vị quản lý một danh sách riêng | Một hồ sơ xuyên suốt toàn bộ vòng đời, có timeline và phân công rõ ràng |
| Tra cứu thủ công hoặc theo từ khóa chính xác | Gợi ý tài liệu liên quan kèm nguồn trích dẫn và phát hiện hồ sơ tương tự |
| Nhắc hạn theo mốc cố định | Ước tính rủi ro quá hạn SLA dựa trên tiến độ và khối lượng công việc |
| Báo cáo tổng hợp định kỳ thủ công | Dashboard vận hành và danh sách ưu tiên theo thời gian thực |

## Khả năng cấu hình đa lĩnh vực

Lõi hệ thống bao gồm: quản lý tổ chức, người dùng, hồ sơ, quy trình trạng thái (FSM), SLA, phân quyền vai trò (RBAC), lịch sử xử lý (timeline & audit), kho tri thức và cổng AI. Khi chuyển đổi hoặc mở rộng sang lĩnh vực khác, hệ thống chỉ cần cập nhật danh mục dịch vụ (taxonomy), quy tắc SLA và dữ liệu kho tri thức mà không cần thay đổi kiến trúc lõi.
