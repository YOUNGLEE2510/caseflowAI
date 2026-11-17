# Phạm vi sản phẩm

Phạm vi ứng dụng hiện tại tập trung vào tiếp nhận phản ánh và điều phối sự cố cho đơn vị vận hành chuỗi căn hộ cho thuê (cơ sở, căn, thiết bị, sự cố chung, phiếu sửa chữa). Hệ thống không làm quản lý hợp đồng thuê, thu tiền hay HRM đầy đủ. Kiến trúc được mô tả tại [ARCHITECTURE.md](ARCHITECTURE.md); trạng thái AI/dữ liệu tại [AI_AND_DATA.md](AI_AND_DATA.md).

## So sánh với quy trình tiếp nhận thủ công

| Tiếp nhận rời rạc (Zalo / bảng tính) | CaseFlow AI |
|---|---|
| Cư dân nhắn tự do, thiếu mã căn/thiết bị, dễ sót tin | Tiếp nhận chuẩn hóa theo cơ sở, căn hộ, thiết bị được phân quyền |
| Nhiều căn báo cùng một lỗi nhưng giao việc trùng cho nhiều thợ | Gợi ý phản ánh liên quan cùng cơ sở và liên kết vào một sự cố chung |
| Không rõ đơn nào sắp quá hạn | Theo dõi vòng đời FSM, hạn SLA và cảnh báo hồ sơ rủi ro cao |
| Khó tra lại lịch sử hỏng hóc của từng thiết bị | Lưu lịch sử phản ánh và phiếu sửa chữa gắn với từng mã thiết bị |
| Cập nhật tiến độ thủ công cho từng người thuê | Cập nhật một lần trên sự cố chung, hệ thống gửi thông báo tới các căn liên quan |

## Khả năng mở rộng đa lĩnh vực

Lõi gồm tổ chức, tài khoản, hồ sơ, FSM, SLA, quyền truy cập, lịch sử và cổng AI. Áp dụng sang lĩnh vực khác cần taxonomy, dữ liệu đánh giá và quy trình phân quyền riêng; không chỉ đổi nhãn hiển thị.
