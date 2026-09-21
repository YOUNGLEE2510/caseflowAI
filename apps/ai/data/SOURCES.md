# Danh mục nguồn dữ liệu AI

Không có dữ liệu trực tuyến nào được tự động đưa vào model production. Mỗi nguồn phải qua bốn cổng: xác minh xuất xứ, kiểm tra giấy phép, mapping nhãn và kiểm tra chất lượng. Dữ liệu định danh hoặc dữ liệu người dùng thật không được tải về hay commit vào repository.

| Nguồn | Mục đích phù hợp | Giấy phép/xuất xứ | Quyết định |
|---|---|---|---|
| [PhoBERT](https://github.com/VinAIResearch/PhoBERT) | Pretrained encoder để so sánh classifier tiếng Việt | VinAI; bản base có MIT, base-v2 có AGPL-3.0 | Được phép thử nghiệm sau khi khóa dataset nội bộ |
| [PhoATIS](https://huggingface.co/datasets/SEACrowd/phoatis) | Benchmark intent/slot tiếng Việt và kiểm tra pipeline | Public benchmark; miền hàng không, không trùng taxonomy CaseFlow | Chỉ benchmark, không trộn vào train điều phối |
| [MTOP Intent VN](https://huggingface.co/datasets/GreenNode/mtop-intent-vn) | Pretraining/benchmark intent đa miền | CC BY-NC-SA 4.0; dữ liệu dịch, 113 intent | Chỉ dùng nghiên cứu phi thương mại và phải ghi attribution |
| [UIT-ViQuAD](https://aclanthology.org/2020.coling-main.233/) | Benchmark đọc hiểu/truy xuất tiếng Việt | Công bố học thuật; hơn 23.000 cặp hỏi đáp từ Wikipedia | Benchmark QA, không dùng làm knowledge base trường học |
| [VBPL - Thông tư 08/2021/TT-BGDĐT](https://vbpl.vn/bogiaoducdaotao/Pages/vbpq-thuoctinh.aspx?ItemID=147704&Keyword=&dvid=317) | Nguồn tri thức có phiên bản và tình trạng hiệu lực | Cơ sở dữ liệu văn bản pháp luật chính thức | Có thể lập chỉ mục retrieval kèm URL, ngày hiệu lực và phạm vi |

## Nguồn kiểm tra bổ sung ngày 10/09/2026

- [Amazon MASSIVE](https://huggingface.co/datasets/AmazonScience/massive): publisher Amazon Science, CC BY 4.0. Script tải bản 1.1 từ [kho phát hành của Amazon](https://amazon-massive-nlu-dataset.s3.amazonaws.com/amazon-massive-dataset-1.1.tar.gz), trích riêng `vi-VN`, giữ train/dev/test gốc (đổi tên dev thành validation), loại trùng văn bản chuẩn hóa và lưu SHA-256. Đã nhập 10.784 câu train, 1.969 validation, 2.928 test sau loại trùng. Chạy `python -m apps.ai.open_data prepare` rồi `python -m apps.ai.open_data benchmark`. Kết quả test benchmark: accuracy 0,8299 và macro-F1 0,7810 với char TF-IDF + Logistic Regression; đây là kết quả trên nhãn gốc MASSIVE, không phải độ chính xác điều phối CaseFlow. Attribution và dataset card lưu trong `artifacts/open-data/massive-vi/raw/README.md`; báo cáo và model nghiên cứu ở `artifacts/open-data/massive-vi/`.
- [NEU-ESC](https://huggingface.co/datasets/hung20gg/NEU-ESC): dữ liệu bình luận giáo dục có nhãn chủ đề và cảm xúc, trang dữ liệu ghi Apache 2.0 nhưng yêu cầu đăng nhập và chấp thuận điều kiện để truy cập. Chưa nhập; nhãn không trùng taxonomy điều phối CaseFlow.
- [Bitext customer support](https://huggingface.co/datasets/bitext/Bitext-customer-support-llm-chatbot-training-dataset): tiếng Anh, 26.872 cặp, 27 intent; publisher ghi rõ hybrid synthetic và CDLA-Sharing-1.0. Có thể nghiên cứu mẫu hội thoại/intent, nhưng không coi là hội thoại khách hàng thật, không tự dịch rồi coi là dữ liệu tiếng Việt đã gán nhãn chuẩn. Chưa nhập.
- [UIT-VSFC của tác giả](https://github.com/kietnv/uit-vsfc): phản hồi sinh viên, phù hợp sentiment/topic, không phải nhãn điều phối hồ sơ. Chưa nhập; cần xác minh điều kiện cấp dữ liệu và sử dụng trước khi huấn luyện.

Dataset mở không cung cấp nhãn SLA thực của CaseFlow. Không suy diễn thời hạn xử lý hoặc kết quả quá hạn từ câu văn để làm ground truth.

## Quy tắc nhập nguồn

1. Lưu URL gốc, đơn vị phát hành, ngày truy cập, phiên bản và license.
2. Tính checksum cho file thô; không sửa file nguồn.
3. Chuẩn hóa vào dataset dẫn xuất có script và nhật ký mapping.
4. Kiểm tra trùng lặp, mất cân bằng nhãn, PII và leakage trước khi train.
5. Tách `train/validation/test` theo người gửi hoặc thời gian.
6. Lưu model card nêu rõ nguồn nào được dùng, nguồn nào chỉ benchmark.

Classifier điều phối cần câu yêu cầu đã được chuyên viên gán vào taxonomy của CaseFlow. Dữ liệu intent trên mạng chỉ giúp benchmark hoặc transfer learning; tự động đổi nhãn của chúng sang `it_access`, `finance` hay `academic_records` sẽ tạo ground truth giả.
