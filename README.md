# CaseFlow AI

Nền tảng quản lý yêu cầu dịch vụ và hồ sơ tác nghiệp có AI hỗ trợ. Bản hiện tại tập trung vào dịch vụ sinh viên và IT helpdesk trong trường đại học. Danh mục, đơn vị và SLA có thể cấu hình; mở sang ngành khác vẫn cần dữ liệu, taxonomy và quy trình đánh giá riêng.

## Giá trị chính

Hệ thống tích hợp bảo mật nâng cao (refresh token rotation với HttpOnly cookie), kiểm tra tệp an toàn với ClamAV, lưu trữ đối tượng S3-compatible riêng tư và model AI có phiên bản được cấu hình sẵn trong Docker.

- Một hồ sơ xuyên suốt từ tiếp nhận, phân loại, giao việc, phản hồi đến đóng yêu cầu.
- Cổng làm việc theo vai trò: người yêu cầu, nhân viên, quản lý và quản trị tổ chức.
- AI tiếng Việt hỗ trợ phân loại, trích xuất thông tin, phát hiện hồ sơ tương tự, truy xuất kho tri thức và dự báo nguy cơ trễ SLA.
- Dashboard vận hành, danh sách sự cố demo, nhật ký xử lý và nguồn trích dẫn phục vụ kiểm soát trách nhiệm. Chưa có phát hiện cụm sự cố tự động hay đầy đủ CRUD incident.
- MongoDB lưu dữ liệu nghiệp vụ tập trung; dịch vụ AI tách riêng để có thể thay model mà không đổi hệ thống lõi.

## Kiến trúc thư mục

```text
apps/
  web/    React + TypeScript + Vite
  api/    Express + TypeScript + MongoDB
  ai/     FastAPI + scikit-learn
docs/
  ARCHITECTURE.md
  AI_AND_DATA.md
  DIAGRAMS.md
  DEPLOYMENT.md
  EXPERIMENT_PROTOCOL.md
  OAUTH_SETUP.md
  QUICKSTART.md
  PROJECT_OVERVIEW_FOR_ADVISOR.md
```

## Chạy dự án

Cấu hình Docker local và hướng dẫn pilot tại [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). CI tự chạy build và kiểm thử API, web, AI khi push hoặc tạo pull request.

Yêu cầu Node.js 20+, npm và Python 3.11+.

```powershell
npm install
python -m pip install -r apps/ai/requirements.txt
if (-not (Test-Path apps/api/.env)) { Copy-Item apps/api/.env.example apps/api/.env }
npm run seed
npm run dev
```

Mở [http://127.0.0.1:5173](http://127.0.0.1:5173). API chạy ở `http://127.0.0.1:4000`, dịch vụ AI chạy ở `http://127.0.0.1:8001`.

File `apps/api/.env` cục bộ đã được cấu hình cho môi trường hiện tại và không được đưa vào Git. Khi triển khai nơi khác, cập nhật `MONGODB_URI`, `JWT_SECRET` và `WEB_ORIGIN`.

## Đăng nhập Google

CaseFlow hỗ trợ đăng nhập Google cho tài khoản **đã được quản trị viên cấp sẵn trong tổ chức**. Hệ thống không tự tạo tài khoản, không tự đổi vai trò và chỉ liên kết Google sau khi xác minh email cùng Google subject (`sub`).

1. Trong Google Cloud Console, tạo OAuth Client loại **Web application**.
2. Khai báo Authorized redirect URI trùng khớp tuyệt đối với `GOOGLE_OAUTH_REDIRECT_URI`, khi chạy local là `http://localhost:4000/api/auth/google/callback`.
3. Điền các biến sau vào `apps/api/.env`, rồi khởi động lại API:

```env
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:4000/api/auth/google/callback
```

Đăng nhập Outlook/Microsoft dùng OAuth authorization code + PKCE. Người dùng liên kết trong Hồ sơ cá nhân sau khi xác nhận mật khẩu CaseFlow; không tự ghép tài khoản theo email. Hướng dẫn cấu hình Google/Microsoft cho local và Docker: [OAUTH_SETUP.md](docs/OAUTH_SETUP.md).

Khi deploy, callback phải dùng HTTPS trên domain do nhóm kiểm soát và phải được khai báo đúng trong Google Cloud. Luồng OAuth dùng state cookie chống CSRF; Google callback chỉ trả về mã nội bộ dùng một lần trong 60 giây, còn JWT CaseFlow được trả qua API nên không nằm trong URL.

## Gửi email đặt lại mật khẩu

Để bật gửi email thật, bật 2-Step Verification cho tài khoản gửi, tạo App Password riêng và đặt trong cấu hình môi trường. Không đưa thông tin tài khoản cá nhân hoặc App Password vào Git hay chat.

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your-sender@gmail.com
SMTP_PASS=your-16-character-app-password
SMTP_FROM=CaseFlow AI <your-sender@gmail.com>
```

Khi chưa có `SMTP_PASS`, email service chủ động chạy log-only và không cố gửi SMTP lỗi. Link reset chỉ dùng một lần, hết hạn sau 30 phút; sau khi đổi mật khẩu, toàn bộ phiên JWT cũ bị vô hiệu hóa.

## Tài khoản demo

Mã đơn vị: `minh-khai-university`

Thông tin đăng nhập demo dành riêng cho môi trường cục bộ: [QUICKSTART.md](docs/QUICKSTART.md). Không sử dụng tài khoản seed khi pilot.

| Vai trò | Email |
|---|---|
| Sinh viên | `student@caseflow.local` |
| Nhân viên CNTT | `agent@caseflow.local` |
| Nhân viên đào tạo | `training@caseflow.local` |
| Quản lý | `manager@caseflow.local` |
| Quản trị tổ chức | `admin@caseflow.local` |

## Kiểm thử

```powershell
npm run build
npm test
npm run evaluate:ai
npm run evaluate:retrieval
npm run test:e2e
npm audit
```

Tài liệu OpenAPI của dịch vụ AI: `http://127.0.0.1:8001/docs`.

Đánh giá SLA trên CSV đã gán nhãn: `python -m apps.ai.evaluate_sla --dataset path/to/sla.csv`. Các cột bắt buộc: `elapsedHours,dueHours,transfers,workload,remainingSteps,priority,breached`. Công cụ không tự tạo dữ liệu để báo cáo kết quả thực tế.

Chuẩn bị dữ liệu phân loại đã được phép sử dụng: `python -m apps.ai.prepare_caseflow_dataset --input path/to/reviewed.csv --output artifacts/caseflow-dataset`. CSV đầu vào cần `text,label`; có thể thêm `group_id,created_at`. Pipeline ẩn email, số điện thoại, mã sinh viên phổ biến, loại bản ghi trùng và chia tập không làm rò rỉ cùng nhóm hồ sơ.

Đánh giá truy xuất RAG: `npm run evaluate:retrieval` chạy fixture tái lập và ghi báo cáo tại `docs/ai-evaluation/retrieval_demo_report.json`. Với dữ liệu pilot, dùng `python -m apps.ai.evaluate_retrieval --articles path/to/knowledge.json --questions path/to/questions.csv --output artifacts/retrieval-evaluation.json`. Bộ câu hỏi dùng cột `id,query,expected_ids,answerable`; `expected_ids` là các mã tài liệu, phân cách bằng dấu `;`. Fixture demo chỉ kiểm tra pipeline, không phải chỉ số RAG thực tế.


`npm run seed` chỉ tạo dữ liệu khi tổ chức demo chưa tồn tại. `npm run seed:force` xóa và tạo lại dữ liệu demo; không dùng lệnh này với database sản xuất.

Integration test và E2E dùng MongoDB tạm, không sử dụng Atlas trong `.env`. E2E dùng Chrome cài sẵn, cổng riêng 5188. `AUTO_SEED` mặc định false. Tài liệu cần được quản lý phê duyệt trong Kho tri thức trước khi xuất hiện với sinh viên hoặc được dùng trong truy xuất AI.

Trang **Vận hành** dành cho quản lý/quản trị hiển thị kết nối MongoDB, AI, cấu hình lưu tệp, hồ sơ quá hạn và nhật ký. MongoDB giữ metadata; nội dung tệp dùng local storage hoặc S3 theo cấu hình. Docker dùng S3 riêng tư qua SeaweedFS.

Tải tệp đính kèm có kiểm tra kích thước, phần mở rộng và chữ ký định dạng. Docker bật quét ClamAV trước khi cho phép sử dụng tệp; nếu scanner lỗi thì từ chối upload. Chế độ local có thể tắt scanner nên cần kiểm tra `MALWARE_SCAN_MODE` trước pilot. Quét malware không bảo đảm phát hiện mọi mã độc.

Docker không tự tạo tài khoản demo mặc định. Với cơ sở dữ liệu mới chỉ phục vụ demo, đặt `AUTO_SEED=true` trong `.env.docker`; không bật ở môi trường pilot/production. `TRUST_PROXY_HOPS=1` chỉ dành cho API nằm sau một nginx không có cổng công khai; nginx ghi đè IP chuyển tiếp để không tin header do khách gửi.

Access token được giữ trong bộ nhớ trình duyệt; phiên được khôi phục bằng refresh cookie HttpOnly. Hồ sơ mới lưu phiên bản phân loại AI và thông tin trích xuất. Mở lại hồ sơ bắt đầu một chu kỳ SLA mới; dữ liệu đánh giá SLA hiện phản ánh chu kỳ mới nhất, chưa phải thống kê từng chu kỳ lịch sử.

API chạy kiểm tra SLA khi khởi động và lặp lại theo `SLA_CHECK_INTERVAL_MINUTES` (mặc định 15 phút). SLA dùng giờ phục vụ Thứ 2–Thứ 6, 08:00–12:00 và 13:00–17:00 theo Việt Nam; ngày nghỉ có thể khai báo tại `Organization.settings.holidayDates` dưới dạng `YYYY-MM-DD`. Job tự hiệu chỉnh hạn của các hồ sơ còn mở sau khi nâng cấp lịch.

Requester có thể xác nhận đóng, mở lại hồ sơ đã giải quyết và gửi đánh giá 1–5 sao kèm nhận xét. Quản lý xem chỉ số tại `/api/analytics/csat`; chỉ số gồm số hồ sơ đủ điều kiện, tỷ lệ phản hồi, điểm trung bình và phân bố sao. Quản trị tổ chức có thể tải `/api/analytics/export/training.csv` để nhận CSV chỉ gồm hồ sơ đã được nhân viên xác nhận/sửa nhãn; tệp đã loại các định danh phổ biến nhưng vẫn phải được kiểm tra thủ công trước khi dùng huấn luyện.


## Luồng demo đề xuất

1. Đăng nhập vai trò sinh viên và tạo một yêu cầu bằng tiếng Việt tự nhiên.
2. Chạy phân tích AI để xem nhãn, độ tin cậy, dữ liệu trích xuất và hồ sơ tương tự.
3. Đăng nhập vai trò nhân viên hoặc quản lý, mở thông báo mới và xác nhận hoặc sửa phân loại AI trước khi giao việc.
4. Tải tệp đính kèm, đổi trạng thái và thêm ghi chú nội bộ để kiểm tra timeline và audit.
5. Mở dashboard để xem hàng đợi có nguy cơ trễ SLA và danh sách sự cố demo.
6. Tìm câu trả lời trong kho tri thức và kiểm tra nguồn trích dẫn trước khi phản hồi.

Để chạy bản demo theo luồng ngắn, xem [docs/QUICKSTART.md](docs/QUICKSTART.md). Chi tiết thiết kế nằm trong [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/AI_AND_DATA.md](docs/AI_AND_DATA.md) và [docs/DIAGRAMS.md](docs/DIAGRAMS.md). Quy trình thu thập dữ liệu, so sánh baseline và tiêu chí đánh giá luận văn nằm trong [docs/EXPERIMENT_PROTOCOL.md](docs/EXPERIMENT_PROTOCOL.md); nguồn dữ liệu AI được kiểm soát tại [apps/ai/data/SOURCES.md](apps/ai/data/SOURCES.md).
