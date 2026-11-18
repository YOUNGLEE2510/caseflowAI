# AI và dữ liệu

## Trạng thái phát hành

Profile căn hộ `DOMAIN_PROFILE=rental` dùng `apps/ai/data/rental_core.json` (60 câu nhóm tự viết) và `rental_train_extra.json` (240 câu do AI hỗ trợ soạn): 300 câu mô phỏng, 6 nhóm water/electrical/internet/appliances/access_security/general_support. Model TF-IDF + Logistic Regression có checksum và phiên bản; registry được tách theo domain trong Docker. Đây là model mẫu chưa hiệu chỉnh độ tin cậy, chưa được xác nhận bằng dữ liệu khách thuê thật.

Kiểm tra nhanh bằng `DOMAIN_PROFILE=rental python -m apps.ai.evaluate_rental` (PowerShell: đặt `$env:DOMAIN_PROFILE="rental"` trước). Báo cáo tại `artifacts/ai-evaluation/rental.json` có confusion matrix, precision/recall/F1 và dự đoán sai trên 12 câu kiểm tra mô phỏng riêng. Bộ này chỉ kiểm tra pipeline, không phải benchmark độc lập.

Các ghi chú tạm hoãn bên dưới áp dụng cho dữ liệu nghiệp vụ thật, không cấm huấn luyện profile căn hộ mẫu theo yêu cầu. Không thu thập tệp riêng tư hay tự sinh thêm dữ liệu qua API.

**Huấn luyện dữ liệu nghiệp vụ đang tạm hoãn.** Corpus PTIT đã bị loại khỏi phạm vi dữ liệu được sử dụng; công cụ crawl/OCR riêng đã được gỡ khỏi mã nguồn sau đợt kiểm tra ngày 01/11/2026: 282 mục gồm 268 mục cần duyệt, 11 trùng và 3 mục cách ly do dấu hiệu định danh; không có yêu cầu đã gán nhãn đủ điều kiện huấn luyện. Kiểm tra ngày 03/11/2026 xác nhận hai thư mục `artifacts/ptit-source` và `artifacts/ocr-build` không còn trên ổ đĩa. Không tự retrain và không gọi API để sinh thêm dữ liệu. Không thay đổi tài liệu nghiệp vụ trên Atlas hoặc Cloudinary.

Model phân loại kèm theo chỉ là baseline mẫu 300 mẫu/6 nhãn (macro-F1 0,95 trên 60 câu kiểm tra mô phỏng, xem EXPERIMENT_PROTOCOL.md), không phải bằng chứng chất lượng triển khai thực tế. SLA học từ dữ liệu mô phỏng chỉ là thử nghiệm; hạn xử lý thực tế do lịch phục vụ và quy tắc nghiệp vụ quyết định. Không công bố độ chính xác ngoài miền thành kết quả CaseFlow.

## Thành phần hiện có

- Local FastAPI: TF-IDF + Logistic Regression, trích xuất có kiểm soát, similarity và truy xuất đoạn tài liệu.
- Word/character/hybrid là các biến thể thực nghiệm, không phải nhiều dịch vụ chạy song song.
- Gợi ý phản ánh căn hộ dùng `hashing-char-context-v1`: HashingVectorizer char_wb không fit IDF trên batch; lọc cơ sở và 48 giờ, kết hợp văn bản với tín hiệu cùng thiết bị/căn. Ngưỡng 0.5 là khởi tạo, chưa được hiệu chỉnh. Mô tả giống nhau không xác minh nguyên nhân chung; chỉ quản lý được liên kết.
- `python -m apps.ai.evaluate_related` chạy 7 kịch bản mô phỏng và xuất false links/missed cases cùng precision/recall/F1. Có hard negative và ca diễn đạt khác bị bỏ sót; không báo điểm này là độ chính xác vận hành thực tế.
- Gợi ý mức ưu tiên (`apps/api/src/services/prioritySuggestion.ts`) là lớp luật giải thích được, đặt trên kết quả ML: tín hiệu nguy hiểm (cháy, khói, gas, kẹt thang máy, ngập), mất dịch vụ thiết yếu, phạm vi nhiều căn, rò rỉ, an ninh; cộng thêm số phản ánh tương tự đang mở (≥ 2 → nâng một mức, có thể là sự cố chung). Mỗi gợi ý kèm lý do; chỉ nhân viên áp dụng, mọi thay đổi ghi vào lịch sử hồ sơ (có đánh dấu "theo gợi ý AI"). Chưa có dữ liệu ưu tiên đã gán nhãn nên đây không phải mô hình học máy và chưa được đo độ chính xác vận hành; khi có nhãn từ quyết định của nhân viên có thể huấn luyện và so sánh với baseline luật này.
- Khi model lỗi, API dùng fallback từ khóa có cờ provider và luôn cần duyệt. Confidence fallback không phải xác suất đã hiệu chỉnh.
- RAG chỉ dùng tài liệu đã công bố, đang hiệu lực, đúng tổ chức; có trích dẫn và phiên bản. Không có nguồn thì từ chối suy diễn.
- LLM API là tùy chọn soạn nháp cho nhân viên, chỉ bật theo allowlist tổ chức. Nội dung vẫn cần con người kiểm tra; có trích dẫn không bảo đảm mọi câu đều được nguồn hỗ trợ.
- Quyết định phân công/trạng thái luôn nằm ở nghiệp vụ và người có quyền, không để model tự thao tác.

## Quyền riêng tư

MongoDB Atlas giữ metadata. PDF/ảnh gốc ở Cloudinary dưới dạng authenticated/private, không công khai CCCD hay hồ sơ người thuê. Tệp đính kèm **không tự động trở thành dữ liệu training**.

Export phục vụ nghiên cứu và payload LLM dùng chung bước che định danh phổ biến. Regex không phải ẩn danh hoàn toàn: họ tên, địa chỉ, thông tin sức khỏe và nội dung tự do vẫn cần kiểm tra. Chỉ dùng dữ liệu đã có căn cứ cho phép và người phụ trách duyệt; không đưa dữ liệu cá nhân hoặc secrets vào Git.

## Điều kiện mở lại huấn luyện

1. Xác nhận nguồn/quyền sử dụng và hiệu lực tài liệu.
2. Kiểm tra dữ liệu cá nhân, loại trùng, cách ly nội dung nhạy cảm; lưu bản dữ liệu được duyệt riêng với raw.
3. Tách corpus RAG, yêu cầu đã gán nhãn và bộ câu hỏi đánh giá.
4. Giữ source/group lineage cho dữ liệu dẫn xuất; chia train/validation/test theo nguồn hoặc vụ việc, không chỉ ngẫu nhiên theo dòng.
5. Có hướng dẫn gán nhãn, kiểm tra độc lập một phần và phân xử bất đồng.
6. So sánh baseline và phân tích lỗi trên test đóng băng; chỉ duyệt candidate tốt mới kích hoạt.

CLI `python -m apps.ai.retrain` yêu cầu xác nhận `--approved-data` trước khi xử lý đầu vào. Cờ này là xác nhận vận hành, không tự chứng minh dữ liệu đã đủ điều kiện. Không cấu hình lịch retrain mặc định. Registry/checksum được giữ để tái lập và rollback, không xây thêm hạ tầng MLOps.

Không kèm crawler, OCR hoặc dữ liệu PTIT thô trong sản phẩm. Khi có nguồn mới được duyệt, nhập qua pipeline dữ liệu có kiểm soát thay vì cào toàn bộ cổng trường. Quy trình thực nghiệm tương lai: [EXPERIMENT_PROTOCOL.md](EXPERIMENT_PROTOCOL.md); danh mục xuất xứ: [SOURCES.md](../apps/ai/data/SOURCES.md).

## Đánh giá

Fixture/test chỉ chứng minh pipeline không hỏng. Khi có dữ liệu phù hợp, đo macro-F1/từng lớp/confusion matrix, retrieval Hit@k/MRR, căn cứ câu trả lời và abstention; đo thời gian/lỗi khi người dùng có và không có AI. Không đặt mục tiêu số lượng mẫu thay cho tính đại diện.
