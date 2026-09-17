# CaseFlow AI

Nền tảng quản lý yêu cầu dịch vụ và hồ sơ tác nghiệp có AI hỗ trợ. Bản hiện tại tập trung vào dịch vụ sinh viên và IT helpdesk trong trường đại học. Danh mục, đơn vị và SLA có thể cấu hình; mở sang ngành khác vẫn cần dữ liệu, taxonomy và quy trình đánh giá riêng.

## Giá trị chính

- Một hồ sơ xuyên suốt từ tiếp nhận, phân loại, giao việc, phản hồi đến đóng yêu cầu.
- Cổng làm việc theo vai trò: người yêu cầu, nhân viên, quản lý và quản trị tổ chức.
- AI tiếng Việt hỗ trợ phân loại, trích xuất thông tin, phát hiện hồ sơ tương tự, truy xuất kho tri thức và dự báo nguy cơ trễ SLA.
- Dashboard vận hành, cụm sự cố, nhật ký xử lý và nguồn trích dẫn phục vụ kiểm soát trách nhiệm.
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
  DEVELOPMENT_MAP.md
  EXPERIMENT_PROTOCOL.md
  ECOSYSTEM.md
```

## Chạy dự án

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

## Tài khoản demo

Mã đơn vị: `minh-khai-university`

Mật khẩu chung: `Demo123!`

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
npm run test:e2e
npm audit
```

Tài liệu OpenAPI của dịch vụ AI: `http://127.0.0.1:8001/docs`.

Đánh giá SLA trên CSV đã gán nhãn: `python -m apps.ai.evaluate_sla --dataset path/to/sla.csv`. Các cột bắt buộc: `elapsedHours,dueHours,transfers,workload,remainingSteps,priority,breached`. Công cụ không tự tạo dữ liệu để báo cáo kết quả thực tế.


`npm run seed` chỉ tạo dữ liệu khi tổ chức demo chưa tồn tại. `npm run seed:force` xóa và tạo lại dữ liệu demo; không dùng lệnh này với database sản xuất.

Integration test và E2E dùng MongoDB tạm, không sử dụng Atlas trong `.env`. E2E dùng Chrome cài sẵn, cổng riêng 5188. `AUTO_SEED` mặc định false. Tài liệu cần được quản lý phê duyệt trong Kho tri thức trước khi xuất hiện với sinh viên hoặc được dùng trong truy xuất AI.

Trang **Vận hành** dành cho quản lý/quản trị hiển thị kết nối MongoDB, AI, lưu tệp, hồ sơ quá hạn và nhật ký. Tệp hiện nằm trên ổ đĩa cục bộ; MongoDB chỉ giữ metadata.


## Luồng demo đề xuất

1. Đăng nhập vai trò sinh viên và tạo một yêu cầu bằng tiếng Việt tự nhiên.
2. Chạy phân tích AI để xem nhãn, độ tin cậy, dữ liệu trích xuất và hồ sơ tương tự.
3. Đăng nhập vai trò nhân viên hoặc quản lý, mở thông báo mới và xác nhận hoặc sửa phân loại AI trước khi giao việc.
4. Tải tệp đính kèm, đổi trạng thái và thêm ghi chú nội bộ để kiểm tra timeline và audit.
5. Mở dashboard để xem hàng đợi có nguy cơ trễ SLA và cụm sự cố.
6. Tìm câu trả lời trong kho tri thức và kiểm tra nguồn trích dẫn trước khi phản hồi.

Chi tiết thiết kế nằm trong [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/AI_AND_DATA.md](docs/AI_AND_DATA.md) và [docs/DIAGRAMS.md](docs/DIAGRAMS.md). Quy trình thu thập dữ liệu, so sánh baseline và tiêu chí đánh giá luận văn nằm trong [docs/EXPERIMENT_PROTOCOL.md](docs/EXPERIMENT_PROTOCOL.md). Cây năng lực được chuyển thành roadmap sản phẩm tại [docs/DEVELOPMENT_MAP.md](docs/DEVELOPMENT_MAP.md); nguồn dữ liệu AI được kiểm soát tại [apps/ai/data/SOURCES.md](apps/ai/data/SOURCES.md).
