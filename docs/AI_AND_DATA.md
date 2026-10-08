# AI và dữ liệu

## Mục tiêu AI

Pipeline có artifact/manifest, checksum và tái sử dụng model khi khởi động. Dữ liệu hiện tại là tập mẫu chuẩn hóa phục vụ kiểm thử và tái lập pipeline; việc đánh giá chất lượng thực tế cần bộ dữ liệu độc lập có chuyên viên gán nhãn.

AI không thay thế quy trình nghiệp vụ. Nó giảm thời gian đọc và điều phối hồ sơ, còn trạng thái, phân quyền, SLA, lịch sử và trách nhiệm vẫn do hệ thống lõi quản lý.

## Các mô hình đã triển khai

| Bài toán | Baseline hiện tại | Đầu ra |
|---|---|---|
| Phân loại yêu cầu | Word TF-IDF + Logistic Regression mặc định; character/hybrid là ứng viên thử nghiệm | Nhãn, độ tin cậy, top 3 nhãn, modelVersion |
| Trích xuất dữ liệu | Pattern tiếng Việt có kiểm soát | Mã sinh viên, phòng, thời hạn |
| Hồ sơ tương tự | TF-IDF + cosine similarity | Top hồ sơ và điểm tương đồng |
| Tra cứu tri thức | Retrieval TF-IDF + cosine similarity trên đoạn tài liệu; tái sử dụng chỉ mục cho tập tài liệu không đổi | Danh sách trích dẫn và đoạn liên quan |
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

Khi có CSV từ pilot, chạy `python -m apps.ai.prepare_caseflow_dataset --input reviewed.csv --output artifacts/caseflow-dataset` trước khi đánh giá. Pipeline loại bản ghi trùng, che email/số điện thoại/mã sinh viên phổ biến và giữ các bản ghi cùng `group_id` trong một split. Đây là hàng rào kỹ thuật, không thay thế việc cán bộ kiểm tra ẩn danh và thống nhất nhãn. CSV huấn luyện chỉ nên lấy từ endpoint xuất các hồ sơ đã được nhân viên xác nhận hoặc sửa nhãn.

Bộ [MASSIVE vi-VN](https://huggingface.co/datasets/AmazonScience/massive) đã được xác minh giấy phép CC BY 4.0 và tải từ gói phát hành gốc. Script `python -m apps.ai.open_data prepare` giữ tập train/dev/test và checksum; `python -m apps.ai.open_data benchmark` huấn luyện ba baseline, chọn theo macro-F1 trên validation rồi đánh giá một lần trên test. Model chọn được lưu riêng trong `artifacts/open-data/massive-vi/selected_model.joblib`, không nạp vào API phân loại yêu cầu vì nhãn MASSIVE thuộc tác vụ trợ lý giọng nói. Kết quả test của lần chạy 18/09/2026: accuracy 0,8299; macro-F1 0,7810 với char TF-IDF + Logistic Regression. Đây không phải kết quả định tuyến hồ sơ CaseFlow.

## Nâng cấp RAG

Baseline hiện tại truy xuất đoạn tài liệu và trả nguồn. Có nhánh tạo bản nháp bằng LLM khi đã cấu hình API; bản nháp cần người xử lý duyệt. Phiên bản tiếp theo nên:

1. Chuyển việc tách đoạn tại thời điểm truy vấn sang chỉ mục lưu bền có metadata, phiên bản và ngày hiệu lực.
2. Dùng embedding tiếng Việt và vector index.
3. Rerank top kết quả trước khi đưa vào LLM.
4. Bắt buộc câu trả lời gắn citation; thiếu căn cứ thì từ chối trả lời.
5. Thêm bộ câu hỏi chuẩn để đo retrieval và hallucination sau mỗi lần cập nhật.

Framework đo retrieval đã có tại `python -m apps.ai.evaluate_retrieval`. Bộ benchmark phải dùng tài liệu đã phê duyệt và câu hỏi có `expected_ids` do chuyên viên xác nhận; báo cáo Hit@1, Hit@3, Recall@5, MRR và refusal rate. Evaluator từ chối câu hỏi tham chiếu tài liệu không tồn tại, nhãn `answerable` không hợp lệ, hoặc câu hỏi không thể trả lời nhưng vẫn có nhãn nguồn, nhờ đó tránh báo cáo sai do ground truth bị lỗi.

Repository có fixture `apps/ai/tests/fixtures/retrieval_demo_*` và lệnh `npm run evaluate:retrieval` để kiểm thử pipeline có thể tái lập. Báo cáo được ghi tại `docs/ai-evaluation/retrieval_demo_report.json`; fixture chỉ chứa nội dung mô phỏng, không được dùng làm kết quả RAG của luận văn. Khi pilot, thay hai file đầu vào bằng tài liệu đã phê duyệt và 50-100 câu hỏi được chuyên viên khóa trước khi đánh giá.

## MLOps tối thiểu

- Version dataset, taxonomy, code huấn luyện và artifact model.
- Lưu metric, confusion matrix, ngưỡng quyết định và ngày triển khai.
- Có shadow mode trước khi cho model tự động điều phối.
- Ghi lại dự đoán, độ tin cậy và quyết định cuối của con người để audit.
- Không dùng dữ liệu production để huấn luyện lại tự động khi chưa kiểm duyệt.
