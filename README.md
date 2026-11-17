# CaseFlow AI

Nền tảng quản lý yêu cầu dịch vụ và hồ sơ tác nghiệp có AI hỗ trợ. Hướng ứng dụng hiện tại là tiếp nhận phản ánh và điều phối sửa chữa cho chuỗi căn hộ cho thuê: quản lý cơ sở/căn/thiết bị, quyền gửi theo căn, liên kết phản ánh vào sự cố chung, giao kỹ thuật và lịch hẹn. Sản phẩm chỉ còn một miền nghiệp vụ là căn hộ cho thuê; chế độ trường học đã được gỡ khỏi mã, dữ liệu và test.

Bộ phân loại dùng TF-IDF + Logistic Regression huấn luyện từ 60 câu mô phỏng viết tay, không phải dữ liệu khách thuê thật. Gợi ý liên quan kết hợp vị trí, cửa sổ thời gian và độ tương đồng; quản lý quyết định liên kết. Chưa chứng minh hiệu quả trên dữ liệu vận hành thực tế.

## Giá trị chính

Hệ thống dùng refresh token HttpOnly, quét tệp với ClamAV, MongoDB Atlas cho metadata và Cloudinary cho PDF/ảnh riêng tư. AI local là baseline demo; huấn luyện nghiệp vụ đang chờ dữ liệu được duyệt.

- Một hồ sơ xuyên suốt từ tiếp nhận, phân loại, giao việc, phản hồi đến đóng yêu cầu.
- Cổng làm việc theo vai trò: người yêu cầu, nhân viên, quản lý và quản trị tổ chức.
- AI tiếng Việt hỗ trợ phân loại, trích xuất thông tin, phát hiện hồ sơ tương tự, truy xuất kho tri thức và dự báo nguy cơ trễ SLA.
- Quản lý tạo sự cố, liên kết/gỡ phản ánh, giao người phụ trách, đặt lịch và cập nhật kết quả; có audit và thông báo. AI chỉ gợi ý các phản ánh có thể liên quan, không tự xác nhận nguyên nhân chung hoặc đóng hồ sơ riêng.
- MongoDB Atlas lưu dữ liệu nghiệp vụ và metadata; Cloudinary lưu PDF/ảnh gốc riêng tư. Dịch vụ AI tách riêng khỏi hệ thống lõi.

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

Mã đơn vị căn hộ: `caseflow-rental-demo`. Tổ chức `caseflow-rental-isolation-demo` dùng kiểm tra cách ly, không phải khách hàng thật.

Mật khẩu ngẫu nhiên được giữ trong tệp cục bộ `artifacts/rental-setup/credentials.json`, không được commit hay công khai. Xem [luồng căn hộ](docs/QUICKSTART.md#5-thử-luồng-sự-cố-chung-cho-căn-hộ). Không dùng tài khoản demo khi pilot.

Nhân sự chia theo 7 bộ phận; email dạng `ho.ten@canho-demo.local` (đuôi `.local` không nhận thư thật), chức vụ và bộ phận nằm trong hồ sơ nhân sự. Danh sách đầy đủ ở `apps/api/src/demo/rentalOrg.ts`.

| Bộ phận | Người đại diện | Email | Phụ trách |
|---|---|---|---|
| Ban điều hành | Trần Minh Khoa – Giám đốc vận hành (quản trị) | `tran.khoa@canho-demo.local` | Toàn bộ tổ chức |
| Ban điều hành | Nguyễn Gia Trang – Trưởng phòng vận hành | `nguyen.trang@canho-demo.local` | Điều phối, quản lý nhân sự |
| Chăm sóc cư dân | Phạm Thu Hà – Trưởng bộ phận | `pham.ha@canho-demo.local` | Hỗ trợ chung, lễ tân |
| Kỹ thuật điện nước | Vũ Đức Thắng – Tổ trưởng | `vu.thang@canho-demo.local` | Cấp thoát nước, điện |
| Kỹ thuật điện lạnh | Trần Hữu Linh – Tổ trưởng | `tran.linh@canho-demo.local` | Thiết bị căn hộ |
| Công nghệ thông tin | Trần Văn Khôi – Kỹ thuật viên mạng | `tran.khoi@canho-demo.local` | Internet |
| An ninh | Ngô Đình Phúc – Đội trưởng | `ngo.phuc@canho-demo.local` | Ra vào và an ninh |
| Buồng phòng | Trần Thị Trinh – Tổ trưởng | `tran.trinh@canho-demo.local` | Dọn căn, sẵn sàng cho thuê |
| Người thuê A301 | Đặng Minh Quân | `dang.quan@cudan.canho-demo.local` | — |

Trang **Căn hộ** theo dõi mỗi căn trên hai trục: tình trạng thuê (Trống / Đã đặt cọc / Đang cho thuê / Sắp trả căn) và tình trạng sẵn sàng (Chờ dọn / Đã dọn / Đang tu sửa / Sẵn sàng). Căn **cho thuê được** khi trống, sẵn sàng và không còn người thuê. Nhân viên chỉ cập nhật dọn dẹp/sửa chữa; quản lý đổi tình trạng thuê và làm thủ tục trả căn (gỡ người thuê, chuyển sang chờ dọn). Mỗi thay đổi có ghi chú và lịch sử.

Để có dữ liệu vận hành đủ lớn khi demo (3 cơ sở, 120 căn, khoảng 900 phản ánh trong 6 tháng), chạy `npm run rental:dataset` sau bước setup căn hộ; xem [dữ liệu mô phỏng](docs/QUICKSTART.md#dữ-liệu-vận-hành-mô-phỏng-quy-mô-vừa). Toàn bộ là dữ liệu giả lập, không dùng để đánh giá AI.

`npm run seed` chỉ dùng cho database local/E2E: tạo tổ chức `caseflow-rental-local` với cùng cơ cấu nhân sự, mật khẩu thử nghiệm `Demo123!`, và từ chối chạy trên Atlas hoặc chế độ pilot.

## Kiểm thử

```powershell
npm run build
npm test
npm run evaluate:ai
npm run evaluate:retrieval
npm run test:e2e
npm run test:audit
npm audit
```

Tài liệu OpenAPI của dịch vụ AI: `http://127.0.0.1:8001/docs`.

`npm run test:audit` chạy thêm các hợp đồng sản phẩm và xuất danh sách lỗi tại `artifacts/product-audit/ISSUES.md`. Lệnh trả exit code khác 0 khi còn lỗi, không che các ca thất bại bằng skip/expected failure. Xem phạm vi, điều kiện chạy và giới hạn tại [tests/audit/README.md](tests/audit/README.md).

`npm run test:audit:docker` kiểm tra riêng các kết nối của stack Docker đang chạy, không ghi dữ liệu nghiệp vụ hoặc gọi dịch vụ AI trả phí.

Đánh giá SLA trên CSV đã gán nhãn: `python -m apps.ai.evaluate_sla --dataset path/to/sla.csv`. Các cột bắt buộc: `elapsedHours,dueHours,transfers,workload,remainingSteps,priority,breached`. Công cụ không tự tạo dữ liệu để báo cáo kết quả thực tế.

Chuẩn bị dữ liệu phân loại đã được phép sử dụng: `python -m apps.ai.prepare_caseflow_dataset --input path/to/reviewed.csv --output artifacts/caseflow-dataset`. CSV đầu vào cần `text,label`; có thể thêm `group_id,created_at`. Pipeline ẩn email, số điện thoại, mã sinh viên phổ biến, loại bản ghi trùng và chia tập không làm rò rỉ cùng nhóm hồ sơ.

Đánh giá truy xuất RAG: `npm run evaluate:retrieval` chạy fixture tái lập và ghi kết quả tại `artifacts/ai-evaluation/retrieval_demo_report.json`. Với dữ liệu pilot, dùng `python -m apps.ai.evaluate_retrieval --articles path/to/knowledge.json --questions path/to/questions.csv --output artifacts/retrieval-evaluation.json`. Bộ câu hỏi dùng cột `id,query,expected_ids,answerable`; `expected_ids` là các mã tài liệu, phân cách bằng dấu `;`. Fixture demo chỉ kiểm tra pipeline, không phải chỉ số chất lượng thực tế.


`npm run seed` chỉ tạo dữ liệu demo ở local. `seed:force` bị vô hiệu hóa; khi cần làm mới hãy dùng database demo dùng một lần, không dùng database thật.

Integration test và E2E dùng MongoDB tạm, không sử dụng Atlas trong `.env`. E2E dùng Chrome cài sẵn, cổng riêng 5188. `AUTO_SEED` mặc định false. Tài liệu cần được quản lý phê duyệt trong Kho tri thức trước khi xuất hiện với người gửi yêu cầu hoặc được dùng trong truy xuất AI.

Trang **Vận hành** hiển thị kết nối, hồ sơ quá hạn và nhật ký. Atlas giữ metadata, Cloudinary giữ PDF/ảnh authenticated. S3 chỉ còn adapter tương thích với tệp cũ và không cần chạy mặc định.

Tải tệp đính kèm có kiểm tra kích thước, phần mở rộng và chữ ký định dạng. Docker bật quét ClamAV trước khi cho phép sử dụng tệp; nếu scanner lỗi thì từ chối upload. Chế độ local có thể tắt scanner nên cần kiểm tra `MALWARE_SCAN_MODE` trước pilot. Quét malware không bảo đảm phát hiện mọi mã độc.

Docker không tự tạo tài khoản demo mặc định. Giữ `AUTO_SEED=false`; dữ liệu căn hộ được thêm riêng bằng công cụ quản trị có bước xác nhận mô tả trong QUICKSTART, không bật seed trường trên Atlas. `TRUST_PROXY_HOPS=1` chỉ dành cho API nằm sau một nginx không có cổng công khai; nginx ghi đè IP chuyển tiếp để không tin header do khách gửi.

Access token ở bộ nhớ trình duyệt; refresh cookie HttpOnly khôi phục phiên. Hồ sơ ghi phiên bản AI và quyết định con người. Mở lại hồ sơ tạo chu kỳ SLA mới; analytics có tổng hợp lịch sử chu kỳ. Không dùng KPI này để tự động xếp loại nhân viên.

API chạy kiểm tra SLA khi khởi động và lặp lại theo `SLA_CHECK_INTERVAL_MINUTES` (mặc định 15 phút). SLA dùng giờ phục vụ Thứ 2–Thứ 6, 08:00–12:00 và 13:00–17:00 theo Việt Nam; ngày nghỉ có thể khai báo tại `Organization.settings.holidayDates` dưới dạng `YYYY-MM-DD`. Job tự hiệu chỉnh hạn của các hồ sơ còn mở sau khi nâng cấp lịch.

Requester có thể xác nhận đóng, mở lại hồ sơ đã giải quyết và gửi đánh giá 1–5 sao kèm nhận xét. Quản lý xem chỉ số tại `/api/analytics/csat`; chỉ số gồm số hồ sơ đủ điều kiện, tỷ lệ phản hồi, điểm trung bình và phân bố sao. Quản trị tổ chức có thể tải `/api/analytics/export/training.csv` để nhận CSV chỉ gồm hồ sơ đã được nhân viên xác nhận/sửa nhãn; tệp đã loại các định danh phổ biến nhưng vẫn phải được kiểm tra thủ công trước khi dùng huấn luyện.


## Luồng demo đề xuất

Model căn hộ 60 mẫu và bộ kịch bản liên kết đều là dữ liệu mô phỏng, không chứng minh chất lượng thực tế. Huấn luyện bằng dữ liệu vận hành thật vẫn chờ nguồn phù hợp được duyệt; xem [AI_AND_DATA.md](docs/AI_AND_DATA.md).

1. Dùng phản ánh ở A301/A302/A303 cùng cơ sở TOWER-A; giữ ca TOWER-B làm đối chứng. Người thuê chỉ gửi cho căn được gán.
2. Chạy phân loại; quản lý xác nhận hoặc sửa nhãn, xem gợi ý liên quan ở chi tiết hồ sơ.
3. Sau khi kiểm tra, liên kết ba phản ánh vào một Incident; không gộp/xóa các hồ sơ riêng và không liên kết ca ở cơ sở B.
4. Giao kỹ thuật, đặt lịch, tạo phiếu sửa theo PUMP-A; kỹ thuật ghi kết quả và hoàn thành phiếu.
5. Quản lý cập nhật sự cố để gửi thông báo cho người liên quan. Hoàn thành sự cố không tự đóng từng phản ánh.
6. Trên hồ sơ riêng, đi qua phân loại/phân công/xử lý trước khi giải quyết; người thuê xác nhận đóng hoặc phản hồi/mở lại nếu vẫn còn lỗi. Kiểm tra lịch sử thiết bị và audit.

Để chạy bản demo theo luồng ngắn, xem [docs/QUICKSTART.md](docs/QUICKSTART.md). Chi tiết thiết kế nằm trong [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/AI_AND_DATA.md](docs/AI_AND_DATA.md) và [docs/DIAGRAMS.md](docs/DIAGRAMS.md). Quy trình thu thập dữ liệu, so sánh baseline và tiêu chí đánh giá luận văn nằm trong [docs/EXPERIMENT_PROTOCOL.md](docs/EXPERIMENT_PROTOCOL.md); nguồn dữ liệu AI được kiểm soát tại [apps/ai/data/SOURCES.md](apps/ai/data/SOURCES.md).
