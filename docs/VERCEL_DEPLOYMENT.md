# Bản triển khai Vercel miễn phí

Phạm vi được chọn: web + API + AI trên Vercel Services (beta), không đăng ký/nâng cấp gói trả phí, không tạo daemon thường trực. Bản local và Docker tiếp tục dùng entrypoint hiện có. Chưa coi là đã deploy cho đến khi nhận URL READY và kiểm tra runtime thành công.

## Cấu trúc

- `vercel.json`: frontend Vite, Express qua `apps/api/vercel-server.mjs` (esbuild đóng gói `src/server.ts` và các module nội bộ thành ESM rõ ràng), FastAPI `apps.ai.vercel:app`.
- `/api/*` vào Express, còn lại vào SPA; API giữ nguyên prefix `/api`.
- AI không có public rewrite. Binding của API cấp URL qua `AI_SERVICE_URL`; giữ `AI_INTERNAL_TOKEN` để xác thực ở tầng ứng dụng.
- API serverless chỉ mở kết nối database dùng chung theo instance, không tự seed, migrate hay tạo timer nền. Khởi tạo thất bại trả 503 có request ID và cho phép thử lại request sau.
- Model mẫu AI dùng cache `/tmp`, không phải registry bền vững cho huấn luyện/promotion. Không tự đưa artifact đã recover vào runtime.
- Giữ các security header của web; `.vercelignore` loại toàn bộ `.env`, artifacts, uploads, Git metadata và dependency/build output cục bộ.

## Giới hạn đã chấp nhận

Không có worker chạy liên tục. Thay vào đó `src/serverlessMaintenance.ts` chạy việc nền đến hạn sau khi một request đã trả lời (qua `waitUntil` của Vercel): gửi email/thông báo mỗi 1 phút, kiểm tra SLA theo `SLA_CHECK_INTERVAL_MINUTES`, khôi phục upload mỗi 5 phút. Mỗi tác vụ giữ một lease trong MongoDB với TTL bằng chu kỳ nên toàn hệ thống chỉ chạy một lần mỗi chu kỳ dù có nhiều instance. Giới hạn: khi không có ai truy cập thì không có request kích hoạt, nên email/cảnh báo SLA có thể trễ tới lần truy cập kế tiếp. Triage chạy inline (`CASE_TRIAGE_MODE=inline`). Nếu cần bảo đảm 24/7, thêm lịch gọi định kỳ có xác thực hoặc worker riêng.

Rate limit đăng nhập/đặt lại mật khẩu dùng bộ nhớ của từng instance; trên serverless mỗi instance có bộ đếm riêng. Đặt lại mật khẩu có thêm chống trùng theo người nhận trong MongoDB (tối đa 1 email mỗi 2 phút), không phụ thuộc instance.

Không tắt scanner để cho phép upload. Khi không có ClamAV, giữ chế độ fail-closed, không nhận tệp mới. Vercel Functions còn có giới hạn kích thước request; không giả định mức upload local 25 MB dùng được nguyên trạng.

## Cấu hình server-only

Chỉ đưa các biến cần thiết lên project/environment đích; không đưa file `.env` vào source upload:

- `MONGODB_URI`, `MONGODB_DB`, `JWT_SECRET`, các khóa mã hóa email/MFA cần giữ nhất quán với dữ liệu hiện có.
- `DOMAIN_PROFILE=rental`, `AUTO_SEED=false`, `DEPLOYMENT_MODE=pilot`.
- `WEB_ORIGIN` là HTTPS origin của domain đích; `TRUST_PROXY_HOPS` phù hợp Vercel và được kiểm tra thực tế.
- `AI_INTERNAL_TOKEN`, `AI_REQUEST_TIMEOUT_MS` đủ cho cold start; `AI_SERVICE_URL` do binding sinh, không gán localhost.
- Cloudinary credentials ở server, storage private; `UPLOAD_DIR=/tmp/caseflow-uploads`.
- `MALWARE_SCAN_MODE=clamav`; không công khai scanner endpoint và không tắt quét để bypass lỗi.
- Chỉ bật SMTP/OAuth/LLM khi đã cấu hình và kiểm thử riêng. Callback OAuth hiện tại localhost phải được đổi sang hostname HTTPS đích trước khi dùng.

Nếu `MFA_ENCRYPTION_KEY` trước đây vắng mặt, ứng dụng local dùng khóa SHA-256 dẫn xuất từ `caseflow-mfa:<JWT_SECRET>`. Không tạo khóa ngẫu nhiên khác cho các bản ghi MFA đã tồn tại. Cần bảo toàn khóa tương đương và ghi nhận nguồn dẫn xuất khi chuyển sang pilot; không in khóa ra log/chat.

## Các bước triển khai

1. Xác minh CLI hoặc kết nối Vercel có quyền tạo project trong team đã chọn. Không đổi sang team khác để né lỗi quyền.
2. Link project đích tường minh; xác nhận owner/project trước khi thay đổi biến môi trường hay deploy.
3. Build và kiểm thử local; chỉ tải source cần thiết. Vì nhiều tệp vừa cứu chưa có trên GitHub, không deploy nguyên commit GitHub cũ rồi coi là bản mới.
4. Cấu hình server-only secrets bằng công cụ có quyền; không dán token vào chat hoặc truyền token qua command-line flag.
5. Deploy bản staging/preview phù hợp, lấy URL, xác minh kết nối DB, đăng nhập, cách ly tenant, AI, kho tri thức và security headers.
6. Chỉ gán production khi bản được kiểm tra đạt; giữ nguyên local khi cloud chưa sẵn sàng.

## Kết quả triển khai ngày 17/11/2026

- Production: https://caseflow-rental.vercel.app — READY, project `caseflow-rental`, team `yl-25`, gói Hobby.
- Deployment kiểm tra: `dpl_9pqTqsKjnLt1DAwT2QJPPENaewbg`. Source là working tree đã khôi phục, chưa push GitHub; không đại diện cho một commit sạch.
- Health 200, MongoDB connected; đăng nhập manager 200; catalog căn hộ, danh sách yêu cầu, kho tri thức đều 200. Chưa đăng nhập truy cập yêu cầu trả 401.
- AI intake qua binding riêng trả 200, nhãn `water`, provider `ml-service`. Chưa kiểm thử toàn bộ vòng đời ghi yêu cầu, phân quyền chéo tenant hoặc luồng email/OAuth.
- Endpoint truy xuất tri thức trả 200, chế độ retrieval; truy vấn kiểm tra về nước yếu trả 0 citations với dữ liệu đang có, chưa xác nhận chất lượng truy xuất bằng bộ tài liệu mẫu đầy đủ.
- Kiểm tra giao diện login desktop 1440px và mobile 390px; mobile không tràn ngang. HTTPS/CSP/HSTS và các header bảo vệ được kiểm tra trên domain production công khai.
- Các kiểm thử API tập trung đạt 23; build web/API local đạt. Kiểm thử serverless 2/2 và kiểm tra nạp bundle ESM đạt sau thay đổi đóng gói. Runtime log không có lỗi trong các request thành công vừa kiểm tra; chưa cấu hình hệ thống giám sát ngoài.
- CLI tự tạo automation bypass khi dùng `vercel curl` để kiểm tra deployment staging được bảo vệ. Chỉ domain production đã được kiểm tra bằng request công khai không bypass; không tắt Deployment Protection.

## Nguồn tham khảo

- [Vercel Services](https://vercel.com/docs/services)
- [Service bindings](https://vercel.com/docs/services/bindings)
- [Express](https://vercel.com/docs/frameworks/backend/express)
- [FastAPI](https://vercel.com/docs/frameworks/backend/fastapi)
- [Functions limitations](https://vercel.com/docs/functions/limitations)
