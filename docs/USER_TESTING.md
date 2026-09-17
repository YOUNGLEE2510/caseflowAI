# Thử nghiệm người dùng

Trạng thái: chưa tổ chức khảo sát, chưa có kết quả SUS hoặc số liệu thời gian thực tế.

## Kịch bản

Mời 5-10 người gồm sinh viên và nhân viên xử lý. Mỗi người thực hiện tạo hồ sơ, bổ sung thông tin, tra cứu tri thức; nhân viên thực hiện thêm phân loại, phân công và đóng hồ sơ. Dùng cùng tác vụ khi so sánh phiên bản có AI và không có AI; đảo thứ tự giữa người tham gia để giảm hiệu ứng học.

Ghi mã người tham gia đã ẩn danh, vai trò, tác vụ, phiên bản, thời gian bắt đầu/kết thúc, thành công, số lỗi, số lần cần trợ giúp và phản hồi. Lưu bản thô ngoài repository nếu chứa thông tin cá nhân. Tổng hợp tỷ lệ hoàn thành và trung vị thời gian theo vai trò/tác vụ; không chỉ báo cáo trung bình chung.

## SUS

Dùng bảng SUS chuẩn gồm 10 phát biểu, thang 1-5. Với câu lẻ trừ 1; với câu chẵn lấy 5 trừ điểm; cộng các giá trị và nhân 2,5. Ghi rõ ngôn ngữ bảng hỏi và thời điểm khảo sát. Không tự điền kết quả khi chưa có người tham gia.

## Mẫu dữ liệu

```csv
participant_id,role,task,variant,duration_seconds,completed,errors,help_requests
```

Kết quả và nhận xét được cập nhật sau khi thử nghiệm thực tế.
