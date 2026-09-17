# AI và dữ liệu

## Mục tiêu AI

AI không thay thế quy trình nghiệp vụ. Nó giảm thời gian đọc và điều phối hồ sơ, còn trạng thái, phân quyền, SLA, lịch sử và trách nhiệm vẫn do hệ thống lõi quản lý.

## Các mô hình đã triển khai

| Bài toán | Baseline hiện tại | Đầu ra |
|---|---|---|
| Phân loại yêu cầu | TF-IDF word n-gram + Logistic Regression | Nhãn, độ tin cậy, top 3 nhãn |
| Trích xuất dữ liệu | Pattern tiếng Việt có kiểm soát | Mã sinh viên, phòng, thời hạn |
| Hồ sơ tương tự | TF-IDF + cosine similarity | Top hồ sơ và điểm tương đồng |
| Tra cứu tri thức | Retrieval TF-IDF + cosine similarity | Danh sách trích dẫn và đoạn liên quan |
| Rủi ro SLA | Logistic Regression trên dữ liệu mô phỏng | Điểm rủi ro, mức rủi ro, yếu tố giải thích |

Phân loại hiện được huấn luyện khi service khởi động trên 60 câu mẫu thuộc 6 nhóm của gói giáo dục. Mô hình SLA dùng 2.500 bản ghi mô phỏng với seed cố định. Đây là baseline có thể tái lập để chứng minh kiến trúc, không phải chất lượng sẵn sàng cho sản xuất.

## Dữ liệu cần thu thập cho luận văn

Mỗi mẫu phân loại nên có:

- Nội dung gốc đã ẩn danh.
- Nhãn dịch vụ và đơn vị xử lý đúng do chuyên viên xác nhận.
- Mức ưu tiên, kênh tiếp nhận và các thực thể cần trích xuất.
- Thời gian tạo, thời gian hoàn thành, số lần chuyển bộ phận và kết quả SLA.
- Cờ trùng lặp/sự cố nếu hồ sơ thuộc một cụm đã được xác minh.

Không đưa họ tên, số điện thoại, email, mã sinh viên thật hoặc nội dung nhạy cảm vào tập huấn luyện nếu chưa có cơ sở pháp lý và quy trình ẩn danh.

## Kế hoạch training hợp lý

1. Chốt taxonomy 7-12 nhóm, mô tả rõ tiêu chí vào/ra của từng nhãn.
2. Thu tối thiểu 300-500 mẫu đã ẩn danh cho mỗi nhóm; ưu tiên dữ liệu thật đã được người nghiệp vụ duyệt.
3. Chia train/validation/test theo thời gian hoặc người gửi để giảm rò rỉ câu gần trùng.
4. Dùng baseline hiện tại làm mốc, sau đó so sánh PhoBERT hoặc sentence-transformer tiếng Việt.
5. Đánh giá macro F1, precision/recall từng nhóm, confusion matrix và tỷ lệ chuyển đúng bộ phận.
6. Chọn ngưỡng human-in-the-loop: dưới ngưỡng chỉ đề xuất, không tự giao hồ sơ.
7. Theo dõi drift, phản hồi sửa nhãn và tái huấn luyện có phiên bản.

## Đánh giá từng chức năng

- Phân loại: macro F1 và routing accuracy; báo cáo riêng các nhóm ít dữ liệu.
- Trích xuất: precision, recall, F1 theo từng loại thực thể.
- Tìm tương tự: Recall@K, Precision@K và đánh giá của chuyên viên.
- Kho tri thức: tỷ lệ trích dẫn đúng, groundedness và tỷ lệ từ chối khi không có nguồn.
- SLA: ROC-AUC, PR-AUC, calibration error và recall ở nhóm thực sự trễ.

Pipeline đánh giá phân loại có thể chạy bằng `npm run evaluate:ai`. Mặc định pipeline dùng 30 câu demo độc lập với 60 câu huấn luyện để kiểm tra khả năng tái lập, đồng thời so sánh word TF-IDF và character TF-IDF. Điểm số của bộ demo không được dùng để kết luận chất lượng production hoặc làm kết quả thực nghiệm chính của luận văn. Quy trình thu thập tập test thật và tiêu chí nghiệm thu được mô tả trong [EXPERIMENT_PROTOCOL.md](EXPERIMENT_PROTOCOL.md).

## Nâng cấp RAG

Baseline hiện tại chỉ truy xuất và trả nguồn, chưa sinh câu trả lời tự do. Phiên bản tiếp theo nên:

1. Tách tài liệu thành chunk có metadata, phiên bản và ngày hiệu lực.
2. Dùng embedding tiếng Việt và vector index.
3. Rerank top kết quả trước khi đưa vào LLM.
4. Bắt buộc câu trả lời gắn citation; thiếu căn cứ thì từ chối trả lời.
5. Thêm bộ câu hỏi chuẩn để đo retrieval và hallucination sau mỗi lần cập nhật.

## MLOps tối thiểu

- Version dataset, taxonomy, code huấn luyện và artifact model.
- Lưu metric, confusion matrix, ngưỡng quyết định và ngày triển khai.
- Có shadow mode trước khi cho model tự động điều phối.
- Ghi lại dự đoán, độ tin cậy và quyết định cuối của con người để audit.
- Không dùng dữ liệu production để huấn luyện lại tự động khi chưa kiểm duyệt.
