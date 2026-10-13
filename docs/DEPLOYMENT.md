# Môi trường container local

Các lệnh tiện dụng: `npm run docker:up`, `npm run docker:stop`, `npm run docker:status`, `npm run docker:logs`. Sau lần cài Docker Desktop đầu tiên, mở lại terminal nếu chưa nhận lệnh `docker`.

Cần Docker Desktop đang chạy. Tại thư mục dự án:

```powershell
npm run docker:up
```

Lệnh tự tạo `.env.docker` với JWT secret và thông tin S3 ngẫu nhiên còn thiếu. File bị Git bỏ qua và secret hiện có được giữ nguyên. Compose dựng Web/Nginx, API, AI, MongoDB, ClamAV và SeaweedFS. Mở `http://localhost:8080`; API được proxy qua `/api`, các dịch vụ còn lại không publish cổng ra máy chủ. Named volumes giữ MongoDB, tệp, chữ ký antivirus và model. ClamAV có thể cần vài phút tải chữ ký trong lần đầu. `AUTO_SEED=true` chỉ phục vụ demo.

```powershell
docker compose --env-file .env.docker logs -f api ai
docker compose --env-file .env.docker down
```

`down` giữ volumes. Chỉ xóa volumes khi chủ động muốn xóa dữ liệu demo.

## Trước khi pilot

- Đổi thành HTTPS qua reverse proxy, cấu hình WEB_ORIGIN và OAuth callback đúng domain.
- Tắt AUTO_SEED, dùng MongoDB có xác thực và mạng riêng, secret do nền tảng triển khai quản lý.
- Sao lưu MongoDB và upload cùng thời điểm; thực hiện thử phục hồi sang môi trường khác và xác minh metadata/tệp khớp nhau.
- Docker đã bật ClamAV và kho S3-compatible. Cấu hình danh tính bucket quyền tối thiểu và theo dõi cập nhật chữ ký khi pilot; chi tiết thiết kế tại [ARCHITECTURE.md](ARCHITECTURE.md).
- Giữ AI chỉ trong mạng riêng. Không publish cổng AI trực tiếp lên Internet.
- Chốt chính sách lưu trữ hồ sơ/audit theo yêu cầu đơn vị và quyền xóa dữ liệu.

CI chỉ xác minh mã nguồn, không tự deploy khi merge. Đích triển khai và quyền truy cập hạ tầng phải được cấu hình riêng.

## HTTPS Cho Máy Chủ Pilot

`compose.https.yml` bổ sung Caddy làm ingress, tự xin chứng chỉ và chuyển HTTP sang HTTPS. Chỉ chạy khi domain đã trỏ đúng IP máy chủ, cổng 80/443 được mở và không có ingress khác chiếm cổng. Không cần bật cho localhost.

Đặt trong file môi trường riêng tư:

```dotenv
PUBLIC_DOMAIN=caseflow.example.edu.vn
WEB_ORIGIN=https://caseflow.example.edu.vn
DEPLOYMENT_MODE=pilot
AUTO_SEED=false
```

Overlay tự đặt WEB_ORIGIN, callback Google/Microsoft theo PUBLIC_DOMAIN và TRUST_PROXY_HOPS=2 cho chuỗi Caddy -> Nginx -> API. Đăng ký các callback HTTPS này tại nhà cung cấp theo `OAUTH_SETUP.md`; không mở API trực tiếp ra Internet. Cổng web 8080 vẫn chỉ bind localhost và không được dùng làm lối vào công khai khi pilot. Kiểm tra tài khoản demo đã bị vô hiệu hóa, rồi chạy:

```powershell
docker compose --env-file .env.docker -f compose.yml -f compose.https.yml up -d --build
```

Lưu volume `caddy-data` để không xin lại chứng chỉ sau mỗi lần triển khai. HSTS chỉ được đặt ở ingress HTTPS. Các dịch vụ nội bộ vẫn ở Docker private network; cấu hình này chưa bật TLS giữa MongoDB, AI và API. Khi triển khai đa máy hoặc qua mạng không tin cậy, cần bổ sung TLS/mTLS riêng cho các kết nối này. Hiện chưa có domain được cấu hình nên chưa xác minh chứng chỉ ngoài Internet.

## Kiểm Soát Bảo Mật

| Ranh giới | Hiện trạng và phạm vi |
| --- | --- |
| Xác thực | JWT có hạn dùng; refresh cookie rotation; ticket OAuth dùng một lần. |
| Phân quyền | Vai trò, tổ chức, quyền theo hồ sơ và đơn vị được kiểm tra phía API. |
| Rate limit | API theo IP; đăng nhập theo IP + tổ chức + email; giới hạn OAuth/reset riêng. Store hiện ở bộ nhớ từng replica, chưa phải limiter phân tán. |
| Kiểm chứng đầu vào | Zod, giới hạn kích thước và từ chối trường JSON dạng operator/prototype, độ sâu trên 30; intake từ chối trường lạ. |
| Mã hóa đầu ra theo ngữ cảnh | React hiển thị text, email escape HTML/URL riêng; CSP ở Nginx. Không coi câu trả lời AI là HTML đáng tin. `style-src` vẫn cho phép inline do chart/style React. |
| TLS | Có ingress HTTPS tùy chọn và guard bắt buộc WEB_ORIGIN HTTPS khi pilot; phải cấu hình domain để sử dụng. |
| Xoay vòng bí mật | Refresh token xoay mỗi lần dùng. API key, DB và SMTP phải đổi tại nhà cung cấp rồi cập nhật môi trường; không tự động đổi trong lúc hệ thống đang chạy. |
| Quyền tối thiểu | Mongo application user riêng; kho tệp riêng tư; AI có internal token và không publish cổng. Quyền bucket của nhà cung cấp phải được kiểm tra riêng. |
| Idempotency | POST /api/cases hỗ trợ Idempotency-Key, được client gửi khi tạo hồ sơ. Ràng buộc unique MongoDB chống hai request đồng thời tạo trùng. Không áp dụng tự động cho mọi endpoint. |
| Audit | Ghi ai làm gì, thời điểm, request ID; bảo vệ log theo quyền. Không ghi mật khẩu/token vào audit. |
| Dependencies | CI audit npm và Python; Dependabot kiểm tra npm, pip, GitHub Actions hàng tuần sau khi cấu hình được push. |
| Lỗi an toàn | Lỗi bất ngờ trả thông báo chung và request ID, không trả stack hoặc nội dung exception. 404 không phản chiếu URL/query của request. |

### Hợp Đồng Idempotency

`Idempotency-Key` là chuỗi 16–128 ký tự gồm chữ, số, `_`, `-`; UUID do trình duyệt tạo là phù hợp. Khóa được hash và scope theo tổ chức + người tạo. Cùng khóa/cùng nội dung trả hồ sơ cũ (HTTP 200, `Idempotency-Replayed: true`); khóa cũ/nội dung khác trả 409. Khóa tùy chọn để giữ tương thích client cũ; client không gửi khóa không có đảm bảo chống tạo trùng. Khóa tồn tại theo vòng đời hồ sơ, không có TTL. Không dùng nó thay cho xác thực, quyền truy cập hoặc CSRF. Audit/thông báo không gửi lại khi replay; vẫn còn giới hạn có sẵn: crash sau khi ghi hồ sơ nhưng trước khi gửi thông báo cần cơ chế outbox riêng để phục hồi side effect.

### Xoay Vòng Bí Mật

Không commit file `.env`, không đưa secret vào frontend hay skill. Khi đổi JWT_SECRET, phiên đăng nhập đang có bị vô hiệu và email outbox mã hóa bằng secret cũ không đọc được; cần xử lý hàng đợi trước khi đổi. Với Mongo/S3/API key, tạo credential mới có quyền tối thiểu, cập nhật ứng dụng và xác minh hoạt động trước khi thu hồi credential cũ. Mật khẩu SMTP/app-password đổi tại nhà cung cấp. Chưa có bộ quản lý secret hay quy trình rotation tự động.
