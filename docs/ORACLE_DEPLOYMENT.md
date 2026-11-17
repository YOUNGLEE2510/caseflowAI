# Triển khai CaseFlow bản căn hộ lên Oracle Always Free

Cập nhật 17/11/2026. Hiện chưa có tài khoản/VM Oracle, chưa tạo tài nguyên cloud, chưa triển khai hoặc thay đổi dữ liệu Atlas. Bộ cấu hình này cần kiểm thử trên VM trước khi coi là triển khai thành công.

## 1. Tạo tài khoản — người dùng tự thực hiện

Mở [Oracle Free Tier](https://www.oracle.com/cloud/free/), đăng ký và tự thực hiện email, mật khẩu, xác minh thẻ, MFA, điều khoản. Không gửi mật khẩu, thông tin thẻ, OTP hay SSH private key vào chat.

Home Region không đổi được sau đăng ký. Chọn khu vực gần Việt Nam trong danh sách Oracle cung cấp cho tài khoản; không mặc định rằng Singapore luôn còn tài nguyên miễn phí. [Hướng dẫn đăng ký chính thức](https://docs.oracle.com/en-us/iaas/Content/GSG/Tasks/signingup_topic-Sign_Up_for_Free_Oracle_Cloud_Promotion.htm).

Không nâng cấp Pay As You Go hoặc tạo tài nguyên chỉ ghi Trial để thay cho Always Free mà chưa kiểm tra chi phí.

## 2. Tạo VM

Trong Oracle Console, vào Compute → Instances → Create instance. Kiểm tra lại giao diện và bảng ước tính trước khi tạo:

- Image Ubuntu ARM64 LTS có nhãn phù hợp miễn phí.
- Shape `VM.Standard.A1.Flex`, 2 OCPU, 12 GB RAM; tổng tài nguyên của tenancy phải trong hạn mức.
- Boot volume khoảng 50 GB, thuộc hạn mức lưu trữ miễn phí hiện tại.
- Không thêm dịch vụ trả phí ngoài ý muốn. Nếu báo hết capacity thì dừng hoặc chờ, không tự chuyển sang shape trả phí.
- Dùng SSH key; giữ private key trên máy cá nhân, chỉ đưa public key lên Oracle. Không bật đăng nhập SSH bằng mật khẩu chỉ để tiện kết nối.
- VM cần public IP và mạng có đường ra Internet; không tạo load balancer trả phí cho bản thử này.

Theo [Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm), hạn mức A1 của Always Free tenancy hiện tương đương 2 OCPU/12 GB và tổng 200 GB boot/block storage. Hết capacity có thể xảy ra; VM idle có thể bị thu hồi. Nhãn miễn phí và ước tính trên tài khoản tại thời điểm tạo là điều kiện phải kiểm tra, không bảo đảm mọi tùy chọn đều miễn phí.

## 3. SSH, firewall và DNS

- Cung cấp IP VM và vị trí private key cục bộ khi đã tạo xong; không đưa nội dung private key vào chat.
- TCP 22 chỉ mở cho IP quản trị cần thiết; HTTP/HTTPS 80/443 mở cho người dùng. Giữ API 4000, AI 8001 và ClamAV 3310 ở mạng Docker riêng.
- Cấu hình cả OCI security list/NSG và firewall trên Ubuntu. Không tắt toàn bộ firewall. Cổng Docker publish có thể tương tác khác với UFW; cần kiểm tra từ ngoài VM.
- Cần hostname kiểm soát được với DNS A trỏ về public IP để dùng cấu hình Caddy hiện tại. Chưa có domain thì dừng trước bước public deployment; không chạy HTTP công khai thay cho HTTPS.
- [Hướng dẫn tạo VM](https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/launchinginstance.htm).

## 4. Chuẩn bị máy chủ và mã nguồn

Cài Docker Engine và Compose plugin theo [Docker Ubuntu](https://docs.docker.com/engine/install/ubuntu/). Máy Linux không cần Docker Desktop. Kiểm tra kiến trúc `aarch64`, `docker version` và `docker compose version`.

Chuyển đúng bản mã đã khôi phục lên máy, gồm các tệp mới chưa có trên GitHub. Không chỉ clone GitHub rồi giả định đã có toàn bộ bản căn hộ. Không đưa `.git`, `.env`, `node_modules`, uploads hay artifacts lên repository công khai.

Giữ `artifacts`/snapshot/dữ liệu nghiên cứu ngoài Docker build context như `.dockerignore` hiện tại. Không copy model `.joblib` không xác minh vào đường dẫn runtime.

## 5. Cấu hình server-only

Đặt `.env.docker` trên VM, quyền đọc hạn chế (ví dụ `chmod 600 .env.docker`), không commit. Chuyển qua SSH đã xác minh host key, không dán secrets vào chat.

Các nhóm bắt buộc:

- `PUBLIC_DOMAIN`: hostname DNS đã trỏ về VM.
- `MONGODB_URI`/`MONGODB_DB`: Atlas application account đúng database, ít quyền. Allowlist IP VM phù hợp; không mặc định cho phép mọi IP.
- Giữ nguyên `JWT_SECRET`, `EMAIL_ENCRYPTION_KEY`, `MFA_ENCRYPTION_KEY` đã dùng với dữ liệu/phiên hiện có. Nếu thiếu MFA key, phải kiểm tra trạng thái MFA và chủ động tạo/ghi nhận khóa mới trước khi bật; không tự thay khóa đang tồn tại.
- `AI_INTERNAL_TOKEN`: dùng nhất quán giữa API và AI.
- Cloudinary server credentials: giữ storage private/authenticated, không đưa vào Vite/browser.
- `DOMAIN_PROFILE=rental`, `AUTO_SEED=false`, `DEPLOYMENT_MODE=pilot` (overlay cũng ép các giá trị này).
- SMTP/OAuth nếu sử dụng: callback và origin phải trỏ domain HTTPS thật; kiểm tra riêng bằng tài khoản được phép.

Pilot validation của API sẽ từ chối khởi động nếu thiếu các khóa hoặc điều kiện bảo vệ bắt buộc. Không tắt scanner, token nội bộ hoặc pilot mode để vượt qua lỗi cấu hình.

## 6. Kiểm tra và khởi chạy — chỉ khi VM/hostname/secrets sẵn sàng

Từ gốc repo trên VM:

```bash
docker compose --env-file .env.docker -f compose.yml -f compose.https.yml -f compose.oracle.yml config --quiet
docker compose --env-file .env.docker -f compose.yml -f compose.https.yml -f compose.oracle.yml build api
docker compose --env-file .env.docker -f compose.yml -f compose.https.yml -f compose.oracle.yml build ai
docker compose --env-file .env.docker -f compose.yml -f compose.https.yml -f compose.oracle.yml build web
docker compose --env-file .env.docker -f compose.yml -f compose.https.yml -f compose.oracle.yml up -d --no-build
docker compose --env-file .env.docker -f compose.yml -f compose.https.yml -f compose.oracle.yml ps
```

Không bật profile `local-db` hoặc `legacy-s3` khi dùng Atlas/Cloudinary. Không chạy seed, `down -v`, volume prune, migration hoặc restore để thử máy chủ. Nếu kết nối database hiện tại, các worker nghiệp vụ bình thường có thể cập nhật SLA/outbox; cần environment/DB riêng cho kiểm thử cô lập trước khi chuyển traffic thật.

`compose.oracle.yml` đặt ARM64, giới hạn RAM container tổng dưới 12 GB, ép rental/pilot/no-seed, giữ ClamAV và nạp nginx dành riêng cho đường vào HTTPS qua Caddy. Giới hạn RAM là điểm bắt đầu, chưa được benchmark; build tuần tự để giảm đỉnh tài nguyên. Giữ nguyên cấu hình local `nginx/default.conf`.

## 7. Xác minh trước khi sử dụng

- Image/requirements build được trên ARM64; nginx/Caddy parse config hợp lệ; mọi service healthy.
- Chứng chỉ HTTPS hợp lệ; chỉ 80/443 và SSH giới hạn được phép truy cập từ ngoài.
- API `/api/health` kết nối đúng DB, AI health báo `domainProfile=rental`; scanner sẵn sàng và upload lỗi khi scanner bị ngắt.
- Refresh cookie, OAuth callback, CORS/CSRF, giới hạn request và IP qua hai proxy đúng.
- Đăng nhập các vai trò thử nghiệm; kiểm tra cách ly tổ chức/quyền âm, yêu cầu → AI → phân công → tiến độ → đánh giá và truy xuất tài liệu có quyền.
- Kiểm tra Cloudinary private, email nếu bật, lưu trữ qua restart và phục hồi từ backup độc lập.
- Xác nhận `AUTO_SEED=false`; không tái tạo tài khoản trường học trong database hiện tại.

Không coi việc Compose parse được hoặc image có ARM64 là đã chứng minh toàn bộ runtime an toàn. Chỉ chuyển sang dùng cloud độc lập sau khi các kiểm tra cần thiết đạt.
