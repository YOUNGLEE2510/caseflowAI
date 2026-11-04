# Phạm vi sản phẩm

Phạm vi hiện tại là yêu cầu hỗ trợ sinh viên và IT helpdesk. Chưa cam kết triển khai đa ngành hay HRM đầy đủ. Kiến trúc và phần đã hoàn thiện được mô tả tại [ARCHITECTURE.md](ARCHITECTURE.md); trạng thái AI/dữ liệu tại [AI_AND_DATA.md](AI_AND_DATA.md).

## So sánh với hệ thống quản lý thủ công

| Hệ thống quản lý truyền thống | CaseFlow AI |
|---|---|
| Người dùng tự chọn đúng biểu mẫu và phòng ban | Nhập ngôn ngữ tự nhiên, AI phân loại đề xuất dịch vụ và đơn vị |
| Mỗi đơn vị quản lý một danh sách riêng | Một hồ sơ xuyên suốt toàn bộ vòng đời, có timeline và phân công rõ ràng |
| Tra cứu thủ công hoặc theo từ khóa chính xác | Gợi ý tài liệu liên quan kèm nguồn trích dẫn và phát hiện hồ sơ tương tự |
| Nhắc hạn thủ công | Cảnh báo theo hạn và tải; model SLA mô phỏng chỉ là thử nghiệm |
| Báo cáo tổng hợp định kỳ thủ công | Dashboard vận hành và danh sách ưu tiên theo thời gian thực |

## Khả năng cấu hình đa lĩnh vực

Lõi gồm tổ chức, tài khoản, hồ sơ, FSM, SLA, quyền truy cập, lịch sử, tri thức và cổng AI. Mở rộng ngành khác cần khảo sát quy trình, quyền, dữ liệu và thực nghiệm riêng; không chỉ đổi danh mục. Chưa triển khai mở rộng này trong release hiện tại.
