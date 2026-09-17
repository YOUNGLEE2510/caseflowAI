# Tiến độ triển khai kế hoạch

## Đã triển khai

- Tách CSS thành các phần theo section, giữ thứ tự cascade qua index.css.
- Tách 11 schema MongoDB thành domain modules; giữ models.ts làm compatibility export.
- Tách AI service thành app, schemas, config, models và routers.
- Đưa 60 mẫu training có sẵn vào JSON. Đây vẫn là dữ liệu minh họa, không phải dữ liệu thu thập trên mạng.
- Tách component UI theo nhóm badges, cards, feedback, forms, layout, overlays và formatters.
- Thêm biểu đồ phân bố trạng thái và workload từ API dashboard.
- Kết nối trang profile vào router và avatar; đổi mật khẩu yêu cầu đăng nhập lại.
- Thêm nhật ký cá nhân giới hạn theo người dùng và tổ chức.
- Thêm gợi ý tri thức khi nhập mô tả với debounce 700 ms, hủy kết quả cũ khi nội dung thay đổi; thông báo tiếp nhận sau khi tạo hồ sơ.
- Thêm baseline LinearSVC vào đánh giá phân loại.
- Thêm evaluate_sla.py so sánh model với luật elapsed >= 80%, xuất ROC-AUC, average precision, Brier score và đường precision-recall.
- Thêm quy trình khảo sát người dùng; giữ trạng thái chưa có kết quả.

## Còn cần triển khai hoặc dữ liệu

- Tùy chọn thông báo.
- Intake nhiều bước đầy đủ.
- Biểu đồ xu hướng theo tuần và theo danh mục cần mở rộng API aggregation.
- Bộ seed mở rộng chỉ dành môi trường demo biệt lập; chưa sửa dữ liệu Atlas.
- Dataset 200-300 yêu cầu được xác minh và gán nhãn, huấn luyện PhoBERT, pilot và khảo sát thật.

Các đề xuất thêm comment giả, giả kết quả thí nghiệm hoặc tạo lịch sử phát triển không có thật không được thực hiện. Tài liệu này ghi đúng các thay đổi đã làm.
