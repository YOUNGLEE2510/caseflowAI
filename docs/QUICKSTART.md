# Chạy Demo Nhanh

Tài liệu này dành cho giảng viên hoặc thành viên nhóm muốn chạy bản demo trong vài phút. Dữ liệu demo hoàn toàn cục bộ; không cần dùng Atlas để chạy integration test hoặc E2E.

## 1. Cài đặt một lần

Yêu cầu Node.js 20+, Python 3.11+ và npm.

```powershell
npm install
python -m pip install -r apps/ai/requirements.txt
if (-not (Test-Path apps/api/.env)) { Copy-Item apps/api/.env.example apps/api/.env }
```

Điền `MONGODB_URI` và `JWT_SECRET` trong `apps/api/.env`. Không commit file này. Nếu chỉ muốn xem code và chạy test, không cần cấu hình Google OAuth hay Gmail SMTP.

## 2. Tạo dữ liệu và mở hệ thống

```powershell
npm run seed
npm run dev
```

Mở `http://127.0.0.1:5173`, đăng nhập với mã tổ chức `minh-khai-university`, tài khoản `student@caseflow.local`, mật khẩu `Demo123!`.

## 3. Luồng demo sáu phút

1. Tạo một yêu cầu WiFi hoặc học phí bằng tiếng Việt tự nhiên.
2. Chọn phân tích AI, xem nhãn đề xuất, độ tin cậy, thực thể và hồ sơ tương tự.
3. Đăng nhập `agent@caseflow.local`, xác nhận hoặc sửa phân loại và đổi trạng thái hồ sơ.
4. Mở timeline, ghi chú nội bộ và audit log để xem lịch sử truy cập/thao tác.
5. Mở trang Vận hành bằng `manager@caseflow.local` để xem SLA, hàng đợi và cảnh báo.
6. Tìm trong Kho tri thức, kiểm tra citation trước khi dùng nội dung để phản hồi.

Tài khoản demo đều dùng mật khẩu `Demo123!`. Danh sách đầy đủ nằm trong [README.md](../README.md).

## 4. Kiểm tra chất lượng

```powershell
npm run build
npm test
npm run evaluate:ai
npm run evaluate:retrieval
npm run test:e2e
```

`npm run test:e2e` tự dựng MongoDB tạm, API và web server; không chạy `seed:force` với cơ sở dữ liệu đang dùng. `evaluate:ai` và `evaluate:retrieval` dùng fixture demo để kiểm thử tính tái lập của pipeline, không phải kết quả chất lượng triển khai thực tế.
