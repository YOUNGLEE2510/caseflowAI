# Quy trình thực nghiệm

Đề tài: *Hệ thống quản lý yêu cầu dịch vụ tích hợp AI hỗ trợ phân loại và truy xuất tri thức của đơn vị vận hành chuỗi căn hộ cho thuê.*

Tài liệu này định nghĩa cách đánh giá các thành phần AI và hiệu quả nghiệp vụ, kèm kết quả đã đo được đến ngày 2026-11-18. **Toàn bộ dữ liệu hiện có là mô phỏng**; các con số dưới đây chứng minh pipeline đánh giá và so sánh tương đối giữa phương pháp, không phải độ chính xác khi triển khai thật. Không diễn giải mục tiêu thành kết quả đã đạt.

## 1. Phạm vi "yêu cầu dịch vụ"

Yêu cầu dịch vụ gồm phản ánh của người thuê (gửi qua cổng, mã QR trong căn) và yêu cầu do nhân viên tiếp nhận hộ (điện thoại, email, quầy lễ tân). Tất cả đi vào một hàng đợi, ghi kênh tiếp nhận, và được bộ phận phụ trách xử lý nội bộ. Sáu nhóm dịch vụ và bộ phận phụ trách:

| Nhãn | Nhóm dịch vụ | Bộ phận |
|---|---|---|
| `water` | Cấp thoát nước: nước yếu/mất nước, rò rỉ, tắc nghẽn, thấm dột | Kỹ thuật điện nước |
| `electrical` | Điện: mất điện, aptomat, ổ cắm, đèn, dây điện | Kỹ thuật điện nước |
| `internet` | Internet: Wi-Fi, mạng dây, modem, mạng diện rộng | Công nghệ thông tin |
| `appliances` | Thiết bị trong căn: điều hòa, bình nóng lạnh, máy giặt, tủ lạnh, bếp | Kỹ thuật điện lạnh |
| `access_security` | Ra vào và an ninh: thẻ, khóa, người lạ, cửa thoát hiểm, camera | An ninh |
| `general_support` | Hỗ trợ chung: hỏi thủ tục, lịch hẹn, tiếng ồn, vệ sinh, thang máy, nội thất | Chăm sóc cư dân |

## 2. Câu hỏi nghiên cứu

1. Mô hình phân loại có gán đúng nhóm dịch vụ tốt hơn luật từ khóa (phương án dự phòng hiện có) không?
2. Truy xuất kho tri thức có đưa đúng quy trình vào top kết quả, và có biết từ chối khi kho không có căn cứ không?
3. Gợi ý mức ưu tiên có nhận ra các ca khẩn cấp không (lỗi bỏ sót nguy hiểm hơn lỗi xếp dư)?
4. Gợi ý phản ánh liên quan có giúp phát hiện sự cố chung mà không liên kết nhầm không?
5. Với gợi ý AI, nhân viên có xử lý nhanh hơn và thống nhất hơn so với làm thủ công không?

## 3. Dữ liệu

| Bộ | Kích thước | Nguồn | Vai trò |
|---|---|---|---|
| `apps/ai/data/rental_demo.json` | 60 câu (10/nhãn) | Nhóm tự viết | Huấn luyện |
| `apps/ai/data/rental_train_extra.json` | 240 câu (40/nhãn) | Trợ lý AI (Claude) soạn, có ghi nguồn trong tệp | Huấn luyện |
| `apps/ai/tests/fixtures/evaluation_demo.csv` | 60 câu (10/nhãn) | Viết riêng, kiểm tra không trùng tập huấn luyện | Kiểm tra mô phỏng |
| `docs/study/human_test_template.csv` | chưa có | **Người thật viết**, hai người gán nhãn | Kiểm tra cuối (cần thu) |
| `apps/ai/data/rental_knowledge.json` | 28 quy trình | Quy trình mô phỏng do nhóm soạn | Kho tri thức |
| `apps/ai/data/rental_retrieval_dev.csv` | 28 có đáp án + 8 ngoài phạm vi | Viết riêng | Chỉ dùng để hiệu chỉnh ngưỡng |
| `apps/ai/data/rental_retrieval_questions.csv` | 52 có đáp án + 12 ngoài phạm vi | Viết riêng, khóa trước khi hiệu chỉnh | Kiểm tra truy xuất |
| `apps/api/src/evaluation/priority_scenarios.json` | 60 tình huống | Trợ lý AI soạn theo định nghĩa ưu tiên | Kiểm tra gợi ý ưu tiên |
| `apps/ai/tests/fixtures/rental_related_scenarios.json` | 7 kịch bản | Nhóm tự viết | Kiểm tra gợi ý liên quan |

Rủi ro chính: tập huấn luyện và tập kiểm tra mô phỏng do cùng nhóm/công cụ viết nên có "giọng văn" giống nhau, làm điểm cao hơn thực tế. Vì vậy kết quả cuối phải lấy trên tập do người thật viết (mục 6). Dữ liệu thật của người thuê, nếu có, phải được ẩn danh bằng `python -m apps.ai.prepare_caseflow_dataset` và chia theo thời gian hoặc theo người gửi, không chia ngẫu nhiên các câu của cùng một hồ sơ.

## 4. Thí nghiệm và kết quả hiện có

Tái lập: `npm run evaluate:ai`, `npm run evaluate:retrieval`, `npm run evaluate:priority`, `python -m apps.ai.evaluate_related`. Báo cáo ghi tại `artifacts/ai-evaluation/`.

### 4.1 Phân loại nhóm dịch vụ (60 câu kiểm tra mô phỏng, huấn luyện 300 câu)

| Mô hình | Accuracy | Macro-F1 | Recall thấp nhất của một nhãn | Thời gian/câu |
|---|---|---|---|---|
| Đoán nhãn phổ biến nhất | 0,17 | 0,05 | 0,00 | <0,01 ms |
| Luật từ khóa (phương án dự phòng của API) | 0,53 | 0,54 | 0,10 | <0,01 ms |
| TF-IDF từ + SVM | 0,92 | 0,92 | 0,80 | 0,04 ms |
| TF-IDF từ + Logistic Regression | 0,93 | 0,93 | 0,80 | 0,03 ms |
| TF-IDF ký tự + Logistic Regression | 0,93 | 0,93 | 0,80 | 0,04 ms |
| **TF-IDF lai (từ + ký tự) + LR — mô hình đang dùng** | **0,95** | **0,95** | 0,80 | 0,11 ms |

Ảnh hưởng kích thước dữ liệu (mô hình lai, cùng tập kiểm tra): 60 câu → macro-F1 0,80; 180 câu → 0,92; 300 câu → 0,95.

Chỉ số chính là macro-F1 vì dữ liệu nghiệp vụ thật thường lệch nhãn. PhoBERT hoặc sentence-transformer tiếng Việt là bước so sánh tiếp theo khi có tập kiểm tra thật và đủ tài nguyên (mô hình cần 0,5–1,5 GB).

### 4.2 Truy xuất kho tri thức (28 quy trình)

Ngưỡng điểm tối thiểu để coi một đoạn là căn cứ được chọn **chỉ trên bộ dev** (0,15; trước đây 0,03), sau đó đánh giá một lần trên bộ kiểm tra:

| Ngưỡng | Hit@1 | Hit@3 | Recall@5 | MRR | Từ chối đúng câu ngoài phạm vi |
|---|---|---|---|---|---|
| 0,03 (cũ) | 0,77 | 0,88 | 0,90 | 0,83 | 0,00 |
| **0,15 (hiện tại)** | **0,77** | **0,85** | **0,85** | **0,80** | **0,75** |

Ngưỡng mới đánh đổi một chút độ bao phủ để không trích dẫn tài liệu không liên quan khi kho thiếu căn cứ. Giới hạn: tìm kiếm theo từ (TF-IDF) nhầm khi câu hỏi dùng từ đồng nghĩa hoặc không dấu trùng âm (ví dụ "do" trong "đỗ xe" và "chế độ"); cải tiến kế tiếp là embedding tiếng Việt hoặc kết hợp BM25 + embedding, đánh giá lại trên cùng bộ kiểm tra.

### 4.3 Gợi ý mức ưu tiên (60 tình huống)

Gợi ý ưu tiên là **bộ luật giải thích được** (tín hiệu nguy hiểm, mất dịch vụ thiết yếu, nhiều căn bị ảnh hưởng, rò rỉ, an ninh, số phản ánh tương tự đang mở), không phải mô hình học máy, vì chưa có nhãn ưu tiên thật.

| Accuracy | Macro-F1 | Recall khẩn cấp | Precision khẩn cấp | Xếp thấp hơn thực tế | Xếp cao hơn thực tế |
|---|---|---|---|---|---|
| 0,83 | 0,84 | 0,79 (11/14) | 1,00 | 12% | 5% |

Ba ca khẩn cấp bị bỏ sót: trần nứt võng diễn đạt theo thứ tự "trần … nứt", "cạy cửa", và "khói" viết không dấu. Luật chưa được sửa theo chính bộ này để tránh kết quả lạc quan giả; khi sửa cần một bộ tình huống mới độc lập để đánh giá lại. Khi có nhãn ưu tiên do nhân viên xác nhận trong hệ thống, có thể huấn luyện mô hình và so sánh với bộ luật này.

### 4.4 Gợi ý phản ánh liên quan (7 kịch bản)

| Phương pháp | Precision | Recall | F1 |
|---|---|---|---|
| Chỉ lọc cùng cơ sở + 48 giờ | 0,43 | 1,00 | 0,60 |
| `hashing-char-context-v1` (văn bản + cùng thiết bị/căn) | 0,67 | 0,67 | 0,67 |

Bộ quá nhỏ để kết luận; ngưỡng 0,5 chưa hiệu chỉnh. Cần mở rộng lên ít nhất 30 kịch bản, chia theo kịch bản gốc, chọn ngưỡng trên tập validation riêng.

## 5. Tiêu chí nghiệm thu đề xuất

| Thành phần | Tiêu chí | Hiện trạng (dữ liệu mô phỏng) |
|---|---|---|
| Phân loại | Macro-F1 trên tập người thật viết cao hơn luật từ khóa; không nhãn nào có recall dưới 0,70 | Mô phỏng: 0,95 vs 0,54; recall thấp nhất 0,80. **Chưa có tập thật** |
| Truy xuất | Hit@3 ≥ 0,80 và từ chối đúng ≥ 0,70 trên bộ câu hỏi khóa | 0,85 và 0,75 (bộ mô phỏng) |
| Ưu tiên | Recall khẩn cấp ≥ 0,95 | 0,79 — **chưa đạt** |
| Liên quan | F1 ≥ 0,80 trên ≥ 30 kịch bản | Chưa đủ kịch bản |
| Đồng thuận nhãn | Cohen's kappa ≥ 0,61 | Chưa đo |
| Nghiệp vụ | Thời gian trung vị giảm khi có gợi ý AI mà độ đúng không giảm (Wilcoxon cặp) | Chưa đo |
| Khả dụng | SUS ≥ 68, không có lỗi chặn tác vụ chính | Chưa đo |

## 6. Phần cần người thật thực hiện

Bộ công cụ và mẫu biểu ở `docs/study/` (`README.md` hướng dẫn chi tiết):

1. **Gán nhãn độc lập** 60 câu kiểm tra bởi hai người → `python -m apps.ai.analyze_study agreement …` (kappa, danh sách bất đồng).
2. **Tập kiểm tra do người thật viết** (5–10 người, 60–100 câu) → `python apps/ai/evaluate.py --dataset … --output …`. Đây là kết quả nên báo cáo cho câu hỏi 1.
3. **Thử nghiệm có/không gợi ý AI** với 5–8 người đóng vai điều phối, đối trọng thứ tự → `python -m apps.ai.analyze_study timing …` (trung vị, IQR, Wilcoxon cặp).
4. **Bảng hỏi SUS** sau buổi thử → `python -m apps.ai.analyze_study sus …`.

Mọi báo cáo ghi phiên bản dữ liệu, mã nguồn (commit), ngày chạy và nêu rõ dữ liệu nào là mô phỏng. Không điền số giả cho các mục chưa đo.
