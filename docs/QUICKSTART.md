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
$env:RENTAL_SETUP_CONFIRM="caseflow-rental-demo"
npx --workspace @caseflow/api tsx src/rentalSetup.ts
Remove-Item Env:RENTAL_SETUP_CONFIRM
npm run dev
```

Mở `http://127.0.0.1:5173`, đăng nhập với mã tổ chức `caseflow-rental-demo` bằng tài khoản cư dân/quản lý vừa được tạo trong tệp thông tin đăng nhập cục bộ do `rentalSetup.ts` sinh ra. (Lưu ý: `npm run seed` chỉ dùng cho fixture test tự động `minh-khai-university`.)

Seed in ra đường dẫn tệp thông tin đăng nhập trong thư mục tạm của hệ điều hành (`$env:TEMP` trên Windows, `/tmp` trong container). Có thể chỉ định `RENTAL_CREDENTIALS_FILE` tới một tệp riêng trong thư mục đã tồn tại. Tệp có cả tài khoản quản trị đơn vị vận hành; không đưa vào Git hoặc chia sẻ công khai. Chạy lại chỉ thêm dữ liệu còn thiếu, không đặt lại mật khẩu hay sửa hồ sơ hiện có.

`npm run dev:ai` và `dev:ai:watch` đọc riêng `DOMAIN_PROFILE` từ `apps/api/.env` để đồng bộ taxonomy với API; biến môi trường đã đặt trong shell được ưu tiên. Đặt `DOMAIN_PROFILE=rental` cho bản căn hộ. Nếu chạy `python -m uvicorn` trực tiếp, phải tự truyền biến này.

## 3. Luồng demo sáu phút

1. Tạo một yêu cầu mất nước, hỏng điện hoặc sự cố WiFi theo cơ sở/căn hộ bằng tiếng Việt tự nhiên.
2. Chọn phân tích AI, xem nhãn đề xuất, độ tin cậy, thực thể và hồ sơ tương tự.
3. Đăng nhập tài khoản kỹ thuật viên/điều phối viên, xác nhận hoặc sửa phân loại và đổi trạng thái hồ sơ.
4. Mở timeline, ghi chú nội bộ và audit log để xem lịch sử thao tác; hệ thống không ghi mỗi lần xem hồ sơ vào audit.
5. Mở trang Vận hành bằng tài khoản quản lý để xem SLA, hàng đợi và cảnh báo.
6. Tìm trong Kho tri thức, kiểm tra citation trước khi dùng nội dung để phản hồi.

Không dùng tài khoản demo cục bộ cho môi trường pilot hoặc dữ liệu thật.

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

## 5. Thử luồng sự cố chung cho căn hộ

Chạy trong môi trường demo hoặc tổ chức thử nghiệm, không chạy seed lại trên dữ liệu đang sử dụng.

1. Dùng ba hồ sơ mô phỏng `RENTAL-DEMO-001`, `RENTAL-DEMO-002`, `RENTAL-DEMO-005` ở A301/A302/A303, cùng bơm PUMP-A. Hồ sơ `RENTAL-DEMO-003` thuộc TOWER-B là ca đối chứng không được liên kết.
2. Với tài khoản quản lý, vào **Sự cố → Tạo sự cố** và nhập mã hồ sơ gốc. Vào **Điều phối** để xem ứng viên cùng cơ sở trong khoảng 48 giờ quanh thời điểm ghi nhận sự cố, rồi xác nhận liên kết. Điểm tương đồng là tín hiệu xếp hạng, không xác nhận cùng nguyên nhân. Có thể liên kết bằng mã hồ sơ hoặc gỡ liên kết nhầm.
3. Chọn kỹ thuật viên cùng đội, đặt lịch và lưu trạng thái. Khi đã kiểm tra và xử lý, ghi kết quả rồi đánh dấu sự cố đã giải quyết. Người thuê liên quan nhận thông báo trong ứng dụng; hồ sơ riêng không tự đóng.

Bản căn hộ có trang **Cơ sở và thiết bị** để cấu hình cơ sở, căn, người thuê được phép gửi và thiết bị dùng chung/riêng. Mã cơ sở/căn là khóa nghiệp vụ, không có thao tác đổi mã; thiết bị trùng mã ở vị trí khác bị từ chối 409. Nút **Lịch sử** hiển thị phản ánh và phiếu sửa theo thiết bị.

Trong trang này, quản lý tạo phiếu sửa có thiết bị, kỹ thuật viên và hạn. Kỹ thuật viên chỉ xem/đổi trạng thái phiếu được giao: đã lên lịch → đang xử lý → hoàn thành; kết quả bắt buộc khi hoàn thành. Quản lý được hủy kèm lý do. Đây là phiếu thủ công, không phải bộ lập lịch bảo trì định kỳ tự động.

Quản lý mở chi tiết phản ánh để xem gợi ý **Có thể liên quan đến sự cố chung** trước khi tạo Incident. Badge trên hàng đợi xuất hiện sau khi job phân tích có kết quả. Không có gợi ý không đồng nghĩa không có sự cố chung; hệ thống vẫn cho liên kết thủ công.

Sau khi triage lưu thành công một kết quả liên quan, cờ gợi ý được bật cho cả hồ sơ mới và hồ sơ ứng viên còn mở tại cùng cơ sở/đội/tổ chức. Cờ là dấu hiệu bất đồng bộ, không phải danh sách liên kết có hiệu lực; có thể cũ khi tình huống thay đổi. API chi tiết luôn truy vấn lại ứng viên, và badge không hiển thị trên hồ sơ đã giải quyết/đóng.

Model profile căn hộ dùng 60 câu mô phỏng, chưa có dữ liệu thực tế. Không quản lý hợp đồng hay tiền thuê. Tổ chức `caseflow-rental-isolation-demo` là đối chứng cách ly, không phải khách hàng thật.

Tổ chức demo trên Atlas có slug `caseflow-rental-demo`, được thêm riêng, không đổi hoặc xóa hồ sơ trường. Công cụ quản trị `apps/api/src/rentalSetup.ts` mặc định chỉ kiểm kê; chỉ ghi dữ liệu khi biến `RENTAL_SETUP_CONFIRM=caseflow-rental-demo` được đặt rõ ràng. Chạy lại không đặt lại mật khẩu hay ghi đè hồ sơ. Tài khoản mới dùng mật khẩu ngẫu nhiên lưu riêng vào tệp cục bộ, không đưa vào Git hoặc README.
