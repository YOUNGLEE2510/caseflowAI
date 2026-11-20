# Danh mục nguồn dữ liệu AI

Không có dữ liệu trực tuyến nào được tự động đưa vào model production. Mỗi nguồn phải qua bốn cổng: xác minh xuất xứ, kiểm tra giấy phép, mapping nhãn và kiểm tra chất lượng. Dữ liệu định danh hoặc dữ liệu người dùng thật không được tải về hay commit vào repository.

## Nguồn mở đã xem xét, không dùng

Đã xem các bộ dữ liệu intent/hỏi đáp tiếng Việt công khai (PhoATIS, MTOP Intent VN, UIT-ViQuAD) và một số bộ phản hồi khách hàng. Không bộ nào có phản ánh của người thuê căn hộ gán theo 6 nhóm của CaseFlow, nên không bộ nào được dùng để huấn luyện hay đánh giá. Các bộ thuộc đề tài trước (dữ liệu giáo dục, MASSIVE) đã được gỡ khỏi mã nguồn ngày 20/11/2026.

Dataset mở không cung cấp nhãn SLA thực của CaseFlow. Không suy diễn thời hạn xử lý hoặc kết quả quá hạn từ câu văn để làm ground truth.

## Dữ liệu mô phỏng miền căn hộ (đang dùng)

| Tệp | Nội dung | Người soạn | Dùng cho |
|---|---|---|---|
| `rental_core.json` | 60 câu phản ánh, 10/nhãn | Nhóm thực hiện tự viết | Huấn luyện |
| `rental_train_extra.json` | 240 câu phản ánh, 40/nhãn | Trợ lý AI (Claude) soạn ngày 2026-11-18, ghi trong trường `_provenance` | Huấn luyện |
| `rental_knowledge.json` | 28 quy trình vận hành căn hộ | Quy trình mô phỏng do nhóm soạn với trợ lý AI; không phải quy định của đơn vị thật | Kho tri thức, đánh giá truy xuất |
| `rental_retrieval_dev.csv` | 36 câu hỏi | Như trên | Chỉ hiệu chỉnh ngưỡng truy xuất |
| `rental_retrieval_questions.csv` | 64 câu hỏi | Như trên, khóa trước khi hiệu chỉnh | Kiểm tra truy xuất |

Không có câu nào lấy từ hội thoại hay phản ánh thật của người thuê. Điểm đánh giá trên các bộ này chỉ để so sánh tương đối; kết quả báo cáo cuối cần tập kiểm tra do người thật viết theo `docs/study/README.md`.

## Quy tắc nhập nguồn

1. Lưu URL gốc, đơn vị phát hành, ngày truy cập, phiên bản và license.
2. Tính checksum cho file thô; không sửa file nguồn.
3. Chuẩn hóa vào dataset dẫn xuất có script và nhật ký mapping.
4. Kiểm tra trùng lặp, mất cân bằng nhãn, PII và leakage trước khi train.
5. Tách `train/validation/test` theo người gửi hoặc thời gian.
6. Lưu model card nêu rõ nguồn nào được dùng, nguồn nào chỉ benchmark.

Classifier điều phối cần câu yêu cầu đã được chuyên viên gán vào taxonomy của CaseFlow. Dữ liệu intent trên mạng chỉ giúp benchmark hoặc transfer learning; tự động đổi nhãn của chúng sang `it_access`, `finance` hay `academic_records` sẽ tạo ground truth giả.
