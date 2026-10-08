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
