# Chạy và triển khai

## Cấu hình chính: Atlas + Cloudinary

Điền vào `.env.docker` (được Git ignore), không gửi secrets vào chat:

```dotenv
MONGODB_URI=mongodb+srv://USER:PASSWORD@HOST/?appName=CaseFlow
MONGODB_DB=caseflow_ai
STORAGE_PROVIDER=cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud
CLOUDINARY_API_KEY=your-key
CLOUDINARY_API_SECRET=your-secret
WEB_ORIGIN=http://localhost:8080
AUTO_SEED=false
```

Tạo Atlas database user riêng với quyền tối thiểu trên database dự án, giới hạn IP nguồn kết nối, không dùng credential quản trị cloud. Mật khẩu có ký tự đặc biệt phải URL-encode trong URI. Cloudinary credentials chỉ ở API, không đưa vào Vite/browser.

```powershell
npm run docker:up
npm run docker:status
```

Wrapper tự bật `local-db` khi không có MONGODB_URI và chỉ bật `legacy-s3` khi STORAGE_PROVIDER=s3. Với Atlas/Cloudinary, mặc định không cần Mongo cục bộ, SeaweedFS, Prometheus, OCR hoặc backup S3. Web mở tại http://localhost:8080.

Yêu cầu Docker Compose có hỗ trợ optional depends_on (`required: false`). Xác minh cú pháp mà không in secrets:

```powershell
docker compose --env-file .env.docker config --quiet
```

## Chuyển dữ liệu cũ

Thêm URI Atlas không phải migration: không tự sao chép database Docker lên Atlas. Kiểm kê database và attachment.storageProvider trước khi chuyển. Giữ nguồn cũ cho đến khi đối chiếu document count, ID, quyền truy cập, metadata và tải lại tệp thành công. Không chạy `down -v`, prune volume hoặc seed để chuyển dữ liệu.

Nếu vẫn có tệp S3 cũ, giữ dịch vụ legacy trong thời gian chuyển:

```powershell
docker compose --env-file .env.docker --profile legacy-s3 up -d object-storage
```

Adapter S3 được giữ chỉ để đọc/xóa tệp cũ; không xóa volume tự động. Cloudinary cần dùng authenticated/private, không public URL cho hồ sơ cá nhân. `npm run docker:verify-cloudinary` kiểm tra synthetic upload/download/private/delete, không thay cho chứng nhận bảo mật toàn hệ thống.

### Công cụ đối soát trước khi đổi API sang Atlas

`node docker/reconcile-atlas.mjs` đọc database mà API Docker cũ đang dùng và Atlas đích, tạo inventory cùng snapshot mã hóa ở `artifacts/atlas-migration`. Chỉ dùng khi API nguồn vẫn trỏ Mongo local; công cụ từ chối lấy nguồn sau khi API đã dùng Atlas. `--apply` nhập bổ sung, giữ tài khoản/cấu hình Atlas theo slug/email/key, giữ hai hồ sơ trùng mã bằng hậu tố MIG, chuyển tệp S3/local sang Cloudinary sau khi đối chiếu byte. Không di chuyển refresh/reset/OAuth sessions và không xóa nguồn.

Phải dừng giao diện và kiểm soát mọi writer trong cửa sổ chuyển dữ liệu; đây không phải migration online/PITR. Snapshot AES-256-GCM dùng khóa dẫn xuất từ EMAIL_ENCRYPTION_KEY; tệp gồm nonce 12 byte, authentication tag 16 byte rồi ciphertext EJSON. Giữ khóa riêng tư để còn khôi phục snapshot, không commit snapshot hoặc .env. Công cụ có thể tiếp tục khi bị gián đoạn, nhưng luôn đọc báo cáo lỗi/đối chiếu trước khi cho người dùng vào lại.

`node docker/verify-atlas-migration.mjs` kiểm tra tham chiếu, đọc tệp private, dung lượng và truy cập ẩn danh sau chuyển. Không tự ghi đè hoặc xóa database thật để “thử restore”.

`npm run docker:verify-snapshot` giải mã hai snapshot chuyển dữ liệu gần nhất vào Mongo tạm, đối chiếu số lượng/nội dung và kiểm tra bản mã bị sửa phải bị từ chối. Không kết nối Atlas và không gửi email. Đây là kiểm thử snapshot metadata tại thời điểm chuyển, không thay cho backup Atlas định kỳ, index/TTL hoặc khôi phục byte tệp Cloudinary. Cần giữ chính sách phục hồi của nhà cung cấp trước khi chạy pilot.

Thêm `-- --live` để đọc metadata hiện tại từ Atlas, lưu snapshot AES-GCM cục bộ rồi khôi phục vào Mongo tạm. Phạm vi gồm 9 collection nghiệp vụ, không gồm refresh/reset/OAuth tickets, outbox hoặc indexes. Giữ EMAIL_ENCRYPTION_KEY riêng để giải mã và không commit file .enc. Không chạy worker thu hồi upload trên một bản restore thử đang dùng chung namespace Cloudinary với hệ thống thật. Khôi phục tệp gốc và backup ngoài máy vẫn là bước riêng.

`npm run release:check -- --smtp` kiểm tra API, ping Mongo, seed, cấu hình storage, redirect bắt đầu Google/Microsoft và kết nối SMTP mà không gửi thư. OAuth chưa cấu hình được báo là mục tùy chọn chưa đạt, không bị che bởi kết quả tổng; luồng đăng nhập/consent thực tế vẫn phải thử bằng tài khoản hợp lệ. Callback, state và secret không được in ra kết quả.

## Local demo

Không có Atlas thì `npm run docker:up` dùng Mongo local qua profile `local-db`. Chỉ bật AUTO_SEED=true trên database demo mới, sau đó tắt lại. `seed:force` bị vô hiệu hóa để tránh xóa nhầm dữ liệu. Muốn làm mới demo dùng database dùng một lần, không dùng database thật.

## Pilot

Đặt DEPLOYMENT_MODE=pilot, WEB_ORIGIN và OAuth callbacks là HTTPS, cấu hình JWT/MFA/email encryption keys, scanner và internal AI token. Giữ ClamAV và kiểm tra quyền tải tệp; không tắt bảo mật để giảm RAM. OAuth/SMTP: [OAUTH_SETUP.md](OAUTH_SETUP.md).

Không bật seed ở pilot. Không đổi secret hoặc encryption key khi chưa hiểu ảnh hưởng đến phiên và dữ liệu đã mã hóa. Backup S3/offsite đã loại khỏi dự án. Trước lưu dữ liệu thật, chọn khả năng phục hồi phù hợp gói Atlas và chính sách tệp Cloudinary; không giả định metadata backup sẽ khôi phục được tệp gốc.

## Xác minh

```powershell
npm run build
npm test
npm run test:audit
```

Các test dùng database tạm, không seed Atlas. Kiểm thử thực tế OAuth, SMTP, scanner, Cloudinary và phục hồi là các bước riêng có xác nhận; báo đúng ngày/version đã chạy. Huấn luyện nghiệp vụ vẫn để chờ dữ liệu được duyệt, xem [AI_AND_DATA.md](AI_AND_DATA.md).

E2E tắt SMTP/LLM và dùng kho tệp local cô lập. Server test có kênh đóng riêng trên localhost với token ngẫu nhiên; không nằm trong API sản phẩm. Teardown chờ xác nhận đã đóng Vite/API, Mongo tạm và dọn upload, tối đa 12 giây; thiếu xác nhận làm suite thất bại. Không dựa vào SIGTERM trên Windows. Bài manager-stability kiểm tra nạp lại trang nhiều lần; lỗi render được đính kèm trong artifacts để phân tích, không coi một lần chạy lại xanh là bằng chứng đã tìm được nguyên nhân gốc.

## Dung lượng

`artifacts`, uploads, node_modules và .env đã bị loại khỏi Docker context. Không cần tải thêm model nặng hoặc bật OCR/monitoring mặc định. Dọn output test lặp theo đợt sau khi giữ một bộ bằng chứng; không xóa corpus, backup hoặc tệp gốc duy nhất. Database/volumes cũ giữ nguyên cho đến khi hoàn tất migration.
