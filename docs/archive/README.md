# Phương án triển khai đã cân nhắc

Các tài liệu trong thư mục này mô tả phương án đã thử hoặc nghiên cứu nhưng **không dùng cho bản bảo vệ**. Phương án chính là Vercel + MongoDB Atlas + Cloudinary ([VERCEL_DEPLOYMENT.md](../VERCEL_DEPLOYMENT.md)).

| Tài liệu | Nội dung | Ghi chú |
|---|---|---|
| `DEPLOYMENT.md` | Docker Compose, Caddy, Prometheus, ClamAV | Vẫn chạy được ở máy cá nhân; là cấu hình duy nhất có quét virus tệp tải lên |
| `ORACLE_DEPLOYMENT.md` | Máy ảo Oracle Cloud | Không dùng |
| `RAILWAY_RESEARCH.md` | Khảo sát Railway | Không dùng |

Các adapter lưu trữ S3 trong mã nguồn chỉ giữ để đọc tệp cũ; Cloudinary là nơi lưu chính.
