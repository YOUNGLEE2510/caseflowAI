# Rà soát và nâng cấp CaseFlow AI

Ngày: 08/09/2026. Phạm vi: mã nguồn React, Express, FastAPI và cấu hình trong workspace. Báo cáo này không phải chứng nhận an toàn cho môi trường sản xuất.

## 1. Định hướng sản phẩm

CaseFlow là hệ thống tiếp nhận và xử lý yêu cầu dịch vụ có AI hỗ trợ, không phải chatbot độc lập hay website thương mại. Nên triển khai thử tại một trường/khoa hoặc trung tâm hỗ trợ sinh viên trước. Mỗi yêu cầu có người chịu trách nhiệm, thời hạn, phản hồi và lịch sử kiểm tra.

Hệ thống đa tổ chức về cấu trúc dữ liệu, nhưng AI hiện chỉ có sáu nhóm nghiệp vụ giáo dục. Muốn áp dụng sang ngành khác phải bổ sung taxonomy, dữ liệu, tài liệu và quy trình đánh giá tương ứng; thay danh mục dịch vụ chưa đủ để biến mô hình thành đa ngành.

## 2. Các vấn đề đã xử lý trong đợt này

| Nhóm | Vấn đề | Thay đổi |
|---|---|---|
| Quyền riêng tư | Người gửi có thể nhận ghi chú nội bộ qua JSON hồ sơ | Lọc ở API cho danh sách, chi tiết, dashboard và phản hồi bình luận; sự kiện nội bộ cũng bị loại |
| Cách ly dữ liệu | Gợi ý hồ sơ tương tự có thể lộ nội dung người khác | Người gửi chỉ được so sánh với hồ sơ của chính mình; nhân viên trong phạm vi tổ chức |
| Phiên đăng nhập | Token cũ còn hoạt động sau khi khóa tài khoản | Đọc lại tài khoản/tổ chức mỗi request; tokenVersion thu hồi phiên khi đổi thông tin, đặt lại mật khẩu, đăng xuất |
| Phân quyền quản trị | Có thể khóa/hạ quyền tài khoản quản trị, ảnh hưởng hồ sơ đang giao | Bảo vệ tài khoản quản trị; yêu cầu chuyển hồ sơ đang phụ trách trước khi khóa/đổi vai trò/đơn vị |
| Quy trình | Nhảy trực tiếp từ mới sang giải quyết; phân công sai đơn vị | State machine; xác nhận phân luồng; người xử lý phải thuộc đúng đơn vị; chuyển đơn vị xóa phân công cũ |
| Lịch sử thời gian | Đóng hồ sơ làm thay đổi thời điểm giải quyết | Tách resolvedAt/closedAt, xóa khi mở lại và tăng reopenCount |
| Tính nhất quán | Hai lần lưu đồng thời có thể ghi đè | Optimistic concurrency của Mongoose; lỗi xung đột trả 409 |
| Biểu mẫu | Trường bắt buộc chỉ xuất hiện trong cấu hình | Hiển thị theo dịch vụ, kiểm tra ở API và lưu customFields vào MongoDB |
| Dữ liệu | Mã hồ sơ dễ trùng, thống kê ObjectId sai | Mã dùng UUID rút gọn và unique index; aggregate dùng ObjectId; kiểm soát tham số truy vấn/phân trang |
| Quản trị | Nút thêm dịch vụ/thành viên không hoạt động | Tạo, chỉnh sửa, khóa và kích hoạt lại qua UI/API; quản lý chỉ xem, quản trị được sửa |
| Tri thức | Tài liệu chưa duyệt được dùng như nguồn đã kiểm duyệt | Bản nháp/công bố; quản lý phê duyệt; thay đổi nội dung cần duyệt lại; truy xuất chỉ dùng nguồn công bố còn hiệu lực |
| Tệp | Lộ đường dẫn máy chủ, không kiểm tra định dạng, chưa đối chiếu download | Ẩn storagePath, kiểm tra chữ ký đầu tệp, giới hạn body, kiểm soát đường dẫn; test byte-for-byte |
| UI | Không có phân trang, phản hồi tải chậm ghi đè dữ liệu mới | Phân trang thực, hủy request cũ, timeout, xử lý hết phiên và ErrorBoundary |
| Song ngữ | Trạng thái, ngày giờ và phân trang cố định tiếng Việt | Theo ngôn ngữ đã chọn; tiếp tục dùng Open Sans với bộ ký tự tiếng Việt |
| Chỉ số | Hồ sơ chưa được người đánh giá bị tính là AI đúng | Tỷ lệ xác nhận chỉ tính trên hồ sơ đã đánh giá; hiển thị số chờ; không gọi đây là accuracy kiểm định |
| Vận hành | Health luôn báo OK; không có UI audit | Health 503 khi DB mất kết nối; trang Vận hành có trạng thái MongoDB/AI, tệp, quá hạn, bản nháp và audit |
| Kiểm thử | Luồng E2E cũ ghi vào dữ liệu demo | MongoDB tạm riêng cho integration/E2E; không dùng URI Atlas của người dùng |

Các biến động lịch sử không có snapshot đáng tin cậy đã ngừng hiển thị phần trăm. Số liệu hiện tại vẫn hiển thị; không suy ra số liệu quá khứ từ trạng thái hiện tại.

## 3. MongoDB hiện có gì?

Đã có kết nối qua Mongoose, cấu hình URI/database bằng môi trường và các collection: tổ chức, người dùng, dịch vụ, hồ sơ, sự cố, tài liệu, tệp (metadata), thông báo, audit; ngoài ra có schema model registry/SLA snapshot chưa được vận hành đầy đủ.

- URI đang được giữ trong `apps/api/.env`, không được chép vào báo cáo hoặc mã frontend.
- Tệp PDF/ảnh chưa lưu trong MongoDB: chỉ metadata nằm trong database, nội dung nằm ở ổ đĩa API.
- `AUTO_SEED` mặc định false. Không chạy seed:force trên dữ liệu sử dụng thực.
- Không xác nhận backup/PITR, network allowlist, quyền Atlas hoặc giới hạn dung lượng vì chưa có quyền kiểm tra cấu hình quản trị Atlas.
- Thông tin truy cập database từng được gửi trong hội thoại. Cần đổi mật khẩu người dùng Atlas đó, dùng tài khoản ứng dụng quyền tối thiểu và cập nhật `.env` cục bộ. Không tái sử dụng tài khoản quản trị cho ứng dụng.

## 4. Những hệ thống còn thiếu

| Ưu tiên | Hệ thống cần bổ sung | Lý do / phạm vi đề xuất |
|---|---|---|
| P0 trước pilot | Backup và phục hồi MongoDB | Thiết lập lịch sao lưu, giữ bản sao ngoài máy chạy ứng dụng, diễn tập phục hồi. Tách dev/test/production bằng database và tài khoản riêng |
| P0 trước pilot | Lưu tệp bền vững | Object storage tương thích S3 hoặc dịch vụ tương đương; bucket riêng tư, URL tải có hạn, quota theo tổ chức, quét mã độc. Kiểm tra chữ ký hiện tại không thay thế antivirus |
| P0 trước pilot | Tài khoản thật | Tắt lựa chọn/tài khoản demo khi triển khai, quy trình mời người dùng, quên/đổi mật khẩu, xác minh email, MFA cho quản trị; ưu tiên tích hợp SSO trường nếu có |
| P0 trước pilot | HTTPS và quản lý bí mật | Reverse proxy, cấu hình CORS theo hostname thật, secret store/môi trường triển khai, không đưa URI/JWT secret vào log hoặc bản build |
| P1 | Worker và hàng đợi | Lịch cập nhật dự báo SLA, cảnh báo trước/quá hạn, retry, chống gửi trùng; không chạy việc dài trong HTTP request. Hiện nguy cơ AI chủ yếu là dự báo tại lúc tạo, chưa có worker định kỳ |
| P1 | Email / kênh thông báo | Hiện thông báo nằm trong ứng dụng. Bổ sung email giao dịch và theo dõi gửi lỗi; chưa cần SMS/Zalo ở bản đồ án đầu tiên |
| P1 | Giám sát và log | Uptime, request ID, log có cấu trúc/ẩn dữ liệu nhạy cảm, thu thập lỗi frontend/backend, cảnh báo khi DB/AI/worker lỗi. Trang Vận hành hiện tại là chẩn đoán theo request, không thay thế hệ thống giám sát |
| P1 | CI/CD | Chạy build, unit/integration/E2E và audit khi thay đổi code, môi trường staging, quản lý phiên bản triển khai và rollback |
| P1 | Bộ dữ liệu đánh giá AI | Hồ sơ ẩn danh đã được người có chuyên môn gán nhãn, tập train/validation/test tách biệt, baseline và macro-F1/precision/recall; không dùng tỷ lệ nhân viên xác nhận thay accuracy kiểm định |
| P1 | Quản trị tri thức đầy đủ | Lịch sử phiên bản bất biến, lịch hiệu lực/hết hạn có UI, người phê duyệt độc lập khi cần, thu hồi tài liệu; hiện mỗi bản ghi giữ nội dung mới nhất |
| P2 | Sự cố và phát hiện bất thường | Trang hiện tại chủ yếu đọc các sự cố đã có/seed. Cần tạo và quản lý sự cố thật, liên kết/tách cụm, cửa sổ thời gian, tiêu chí cảnh báo, đo precision; không quảng bá là phát hiện thời gian thực |
| P2 | Tích hợp nghiệp vụ | Import danh sách sinh viên/nhân sự, API/webhook có xác thực, chữ ký và retry; triển khai một hệ thống nguồn trước |
| P2 | Cấu hình quy trình nâng cao | Lịch làm việc/ngày nghỉ, SLA theo bước, tạm dừng khi chờ, chuyển cấp, biểu mẫu có kiểu dữ liệu và validation; hiện SLA là giờ liên tục |
| P2 | Audit đáng tin cậy hơn | Audit hiện ghi theo kiểu best-effort, không có transactional outbox. Nếu yêu cầu không mất sự kiện: giao dịch DB + outbox, worker và chính sách lưu trữ chống sửa |

Không cần cài đồng thời mọi sản phẩm hạ tầng. Giai đoạn pilot nhỏ: MongoDB + một nơi lưu tệp + một worker + email + giám sát là đủ khung vận hành. Công việc chính vẫn là làm chắc luồng hồ sơ và chất lượng dữ liệu.

## 5. Giới hạn AI cần trình bày trung thực

- Bộ phân loại hiện là TF-IDF + Logistic Regression với bộ câu ví dụ nhỏ trong mã nguồn; có quy tắc dự phòng khi dịch vụ AI lỗi.
- Dự báo SLA được xây trên dữ liệu tổng hợp, chưa chứng minh chất lượng trên lịch sử vận hành thật.
- Kho tri thức hiện là truy xuất và trích dẫn tài liệu, chưa phải RAG sinh câu trả lời bằng LLM hoàn chỉnh.
- Danh mục/đơn vị/SLA sửa trong UI không đồng nghĩa mô hình đã được huấn luyện lại.
- AI đưa gợi ý; nhân viên xác nhận hoặc điều chỉnh trước khi xử lý. Đây nên là điểm kiểm soát chính của đồ án.

## 6. Nghiệm thu và thứ tự phát triển

Lệnh kiểm tra lặp lại:

```powershell
npm run build
npm test
npm run test:e2e
npm audit
```

E2E khởi tạo database tạm và cổng 5188; mặc định dùng Chrome cài sẵn. Có thể đặt `E2E_BROWSER_CHANNEL=msedge`. Cần tải MongoDB binary ở lần chạy đầu. Các kịch bản lịch sử trong `artifacts/e2e` không thuộc test suite mới.

1. Chốt luồng pilot: sinh viên gửi hồ sơ, nhân viên phân luồng/giao việc, phản hồi công khai và nội bộ, giải quyết/đóng/mở lại.
2. Bổ sung hạ tầng P0 và dữ liệu thật đã được phép sử dụng; chạy thử với một đơn vị phụ trách.
3. Làm worker SLA + email + phiên bản tri thức; đo thời gian xử lý và tỷ lệ phân luồng sai.
4. Khi có đủ dữ liệu mới nâng cấp classifier/embedding/LLM, có đánh giá định lượng so với baseline.
5. Sau pilot mới mở sang tổ chức/ngành khác. Không mở rộng phạm vi chỉ bằng thêm nhiều màn hình CRUD.

Tài liệu cũ chưa có trạng thái phê duyệt sẽ không được coi là nguồn công bố. Quản lý/quản trị mở Kho tri thức, đọc tài liệu và phê duyệt từng nguồn trước khi sinh viên tra cứu. Không có thao tác xóa dữ liệu tri thức cũ trong đợt nâng cấp này.
