# AI và dữ liệu

## Trạng thái phát hành

**Huấn luyện dữ liệu nghiệp vụ đang tạm hoãn.** Corpus PTIT đã bị loại khỏi phạm vi dữ liệu được sử dụng; công cụ crawl/OCR riêng đã được gỡ khỏi mã nguồn sau đợt kiểm tra ngày 01/11/2026: 282 mục gồm 268 mục cần duyệt, 11 trùng và 3 mục cách ly do dấu hiệu định danh; không có yêu cầu đã gán nhãn đủ điều kiện huấn luyện. Kiểm tra ngày 03/11/2026 xác nhận hai thư mục `artifacts/ptit-source` và `artifacts/ocr-build` không còn trên ổ đĩa. Không tự retrain và không gọi API để sinh thêm dữ liệu. Không thay đổi tài liệu nghiệp vụ trên Atlas hoặc Cloudinary.

Model phân loại kèm theo chỉ là baseline demo 60 mẫu/6 nhãn, không phải bằng chứng chất lượng triển khai tại trường. SLA học từ dữ liệu mô phỏng chỉ là thử nghiệm; hạn xử lý thực tế do lịch phục vụ và quy tắc nghiệp vụ quyết định. Không công bố độ chính xác ngoài miền thành kết quả CaseFlow.

## Thành phần hiện có

- Local FastAPI: TF-IDF + Logistic Regression, trích xuất có kiểm soát, similarity và truy xuất đoạn tài liệu.
- Word/character/hybrid là các biến thể thực nghiệm, không phải nhiều dịch vụ chạy song song.
- Khi model lỗi, API dùng fallback từ khóa có cờ provider và luôn cần duyệt. Confidence fallback không phải xác suất đã hiệu chỉnh.
- RAG chỉ dùng tài liệu đã công bố, đang hiệu lực, đúng tổ chức; có trích dẫn và phiên bản. Không có nguồn thì từ chối suy diễn.
- LLM API là tùy chọn soạn nháp cho nhân viên, chỉ bật theo allowlist tổ chức. Nội dung vẫn cần con người kiểm tra; có trích dẫn không bảo đảm mọi câu đều được nguồn hỗ trợ.
- Quyết định phân công/trạng thái luôn nằm ở nghiệp vụ và người có quyền, không để model tự thao tác.

## Quyền riêng tư

MongoDB Atlas giữ metadata. PDF/ảnh gốc ở Cloudinary dưới dạng authenticated/private, không công khai CCCD hay hồ sơ sinh viên. Tệp đính kèm **không tự động trở thành dữ liệu training**.

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
