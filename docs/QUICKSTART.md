# Chạy Demo Nhanh

Tài liệu này dành cho giảng viên hoặc thành viên nhóm muốn chạy bản demo trong vài phút. Dữ liệu demo hoàn toàn cục bộ; không cần dùng Atlas để chạy integration test hoặc E2E.

## 1. Cài đặt một lần

Yêu cầu Node.js 22+, Python 3.11+ và npm.

```powershell
npm install
python -m pip install -r apps/ai/requirements.txt
if (-not (Test-Path apps/api/.env)) { Copy-Item apps/api/.env.example apps/api/.env }
```

Điền `MONGODB_URI` trỏ Mongo local dùng riêng cho demo và `JWT_SECRET` trong `apps/api/.env`; giữ `DEPLOYMENT_MODE=local`. Không seed Atlas hay database chứa dữ liệu thật. Không commit file này. Nếu chỉ muốn xem code và chạy test, không cần cấu hình Google OAuth hay Gmail SMTP.

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
4. Mở timeline, ghi chú nội bộ và audit log để xem lịch sử thao tác; hệ thống không ghi mỗi lần xem hồ sơ vào audit.
5. Mở trang Vận hành bằng `manager@caseflow.local` để xem SLA, hàng đợi và cảnh báo.
6. Tìm trong Kho tri thức, kiểm tra citation trước khi dùng nội dung để phản hồi.

Tài khoản demo cục bộ: `student@caseflow.local`, `agent@caseflow.local`, `manager@caseflow.local`, `admin@caseflow.local`; mật khẩu `Demo123!`. Không dùng các tài khoản này cho pilot.

## 4. Kiểm tra chất lượng

```powershell
npm run build
npm test
npm run evaluate:ai
npm run evaluate:retrieval
npm run test:e2e
```

`npm run test:e2e` tự dựng MongoDB tạm, API và web server; không chạy `seed:force` với cơ sở dữ liệu đang dùng. `evaluate:ai` và `evaluate:retrieval` dùng fixture demo để kiểm thử tính tái lập của pipeline, không phải kết quả chất lượng triển khai thực tế.

Với bản Docker đã cấu hình Atlas/Cloudinary, chạy `npm run release:check -- --smtp` trước buổi demo. Có thể kiểm thử snapshot metadata hiện tại bằng `npm run docker:verify-snapshot -- --live`; thao tác đọc Atlas rồi khôi phục vào Mongo tạm, không ghi đè dữ liệu thật. Cloudinary và consent OAuth thật được kiểm tra riêng theo [DEPLOYMENT.md](DEPLOYMENT.md) và [OAUTH_SETUP.md](OAUTH_SETUP.md).
