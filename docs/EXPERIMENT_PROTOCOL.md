# Quy trình thực nghiệm

Trạng thái hiện tại: **kế hoạch, chưa dùng dữ liệu PTIT/raw để huấn luyện**. Chỉ thực hiện sau khi nguồn, quyền sử dụng, dữ liệu cá nhân, nhãn và cách chia nhóm được duyệt. Không diễn giải các ngưỡng/mục tiêu trong tài liệu thành kết quả đã đạt.

Tài liệu này định nghĩa cách đánh giá các thành phần AI của CaseFlow AI cho đồ án tốt nghiệp. Bộ dữ liệu demo trong repository chỉ dùng để kiểm tra pipeline; kết quả từ dữ liệu này không đại diện cho chất lượng triển khai thực tế.

## Câu hỏi nghiên cứu

1. AI có tăng tỷ lệ điều phối đúng đơn vị so với luật từ khóa hoặc thao tác thủ công không?
2. Truy xuất kho tri thức có đưa đúng tài liệu vào top kết quả và giúp chuyên viên trả lời nhanh hơn không?
3. Điểm rủi ro SLA có nhận diện được hồ sơ sắp trễ đủ sớm để can thiệp không?
4. Người dùng có hoàn thành quy trình nhanh hơn và ít lỗi hơn so với cách tiếp nhận phân tán không?

## Dữ liệu phân loại

- Thu thập tối thiểu 300 mẫu độc lập cho thử nghiệm ban đầu; mục tiêu tốt hơn là 300-500 mẫu cho mỗi nhãn.
- Mỗi mẫu phải được ẩn danh và có nhãn dịch vụ, đơn vị xử lý, mức ưu tiên do người nghiệp vụ xác nhận.
- Hai người gán nhãn độc lập trên ít nhất 20% dữ liệu. Báo cáo Cohen's kappa và quy tắc xử lý bất đồng.
- Loại bản ghi trùng hoặc gần trùng trước khi chia dữ liệu.
- Chia train/validation/test theo thời gian hoặc người gửi. Không chia ngẫu nhiên các câu của cùng một hồ sơ sang nhiều tập.
- Khóa tập test trước khi tinh chỉnh mô hình và chỉ đánh giá cuối cùng một lần.

## Thí nghiệm phân loại

So sánh tối thiểu ba mức:

1. Luật từ khóa hoặc nhãn phổ biến nhất.
2. TF-IDF + Logistic Regression hiện tại.
3. PhoBERT hoặc sentence-transformer tiếng Việt khi đã có đủ dữ liệu và tài nguyên.

Báo cáo accuracy, macro precision, macro recall, macro F1, F1 từng nhãn, confusion matrix và thời gian suy luận. Macro F1 là chỉ số chính vì dữ liệu nghiệp vụ thường mất cân bằng. Ngoài điểm số offline, đo tỷ lệ chuyên viên chấp nhận gợi ý và tỷ lệ phải chuyển lại đơn vị.

Chạy pipeline hiện tại:

```powershell
npm run evaluate:ai
```

Để dùng tập dữ liệu đã gán nhãn:

```powershell
python apps/ai/evaluate.py --dataset path\to\heldout.csv --output artifacts\ai-evaluation-real
```

CSV phải có hai cột `text,label`. Không đưa dữ liệu định danh vào repository.

## Đánh giá truy xuất tri thức

- Chuẩn bị 50-100 câu hỏi thật và danh sách tài liệu hoặc đoạn văn được chuyên viên xác nhận là liên quan.
- Đo Hit@1, Hit@3, Recall@5 và MRR.
- Với câu hỏi không có đáp án trong kho, đo tỷ lệ hệ thống từ chối thay vì trả kết quả không có căn cứ.
- Nếu bổ sung LLM, đánh giá riêng độ đúng trích dẫn và groundedness; không gộp retrieval với chất lượng câu văn.

## Đánh giá SLA

Mô hình SLA hiện dùng dữ liệu mô phỏng nên chỉ chứng minh luồng kỹ thuật. Khi có lịch sử thật, chia dữ liệu theo thời gian và báo cáo ROC-AUC, PR-AUC, Brier score, calibration curve, recall của hồ sơ thực sự trễ và độ sớm trung bình của cảnh báo. So sánh với baseline đơn giản dựa trên phần trăm thời gian SLA đã tiêu thụ.

## Thử nghiệm người dùng

- Tuyển 5-8 người yêu cầu và 5-8 chuyên viên cho vòng usability đầu tiên.
- Cho họ hoàn thành cùng một bộ tác vụ trên quy trình cũ và CaseFlow AI.
- Đo thời gian hoàn thành, số lỗi, số lần cần trợ giúp, tỷ lệ hoàn thành và SUS.
- Pilot ít nhất 50 hồ sơ thật đã được đồng ý sử dụng; ghi nhận thời gian phản hồi đầu tiên, tỷ lệ đúng SLA, tỷ lệ chuyển sai và mức chấp nhận gợi ý AI.

## Tiêu chí nghiệm thu đề xuất

| Thành phần | Tiêu chí ban đầu |
|---|---|
| Phân loại | Macro F1 cao hơn baseline luật; không nhãn quan trọng nào có recall dưới 0,70 |
| Điều phối | Giảm tỷ lệ chuyển lại đơn vị so với quy trình đối chứng |
| Retrieval | Hit@3 từ 0,80 trên bộ câu hỏi đã khóa |
| SLA | Tốt hơn baseline thời gian ở PR-AUC và calibration |
| Nghiệp vụ | Giảm thời gian xử lý trung vị mà không tăng lỗi |
| Usability | SUS từ 68 trở lên và không có lỗi chặn tác vụ chính |

Các ngưỡng trên là mục tiêu nghiên cứu, không phải kết quả đã đạt. Mọi báo cáo phải ghi phiên bản dữ liệu, taxonomy, mã nguồn, seed và ngày chạy.
## Thực nghiệm bổ sung cho bối cảnh căn hộ

- Dữ liệu mô phỏng: `apps/ai/tests/fixtures/rental_related_scenarios.json`; chia theo kịch bản gốc, không để câu diễn đạt lại của một ca lọt sang cả train và test. Bộ hiện tại chỉ có 7 kịch bản, chưa đủ để kết luận tổng quát.
- So sánh lọc cơ sở + 48 giờ với `hashing-char-context-v1`. Thuật toán mới không fit IDF trên từng batch; tín hiệu cùng thiết bị/căn chỉ bổ trợ. Ngưỡng khởi tạo 0.5 chưa hiệu chỉnh. Chỉ chọn ngưỡng trên tập validation độc lập sau này, không tinh chỉnh bằng các ca test này.
- Chạy `python -m apps.ai.evaluate_related`; báo cáo precision/recall/F1 theo cặp, false links và ca bỏ sót tại `artifacts/ai-evaluation/rental-related.json`. Không dùng kết quả của bộ nhỏ này để tuyên bố giảm thời gian hay hiệu quả vận hành.
- Thí nghiệm người dùng: hai người luân phiên vai người xử lý; đối trọng thứ tự A/B, dùng bộ ca gốc tương đương nhưng không lặp lại cùng ca. A không gợi ý, B có gợi ý. Ghi thời gian từ lúc thấy phiếu đến khi xác nhận phân loại/đầu việc, nhãn cuối, số đầu việc trùng, liên kết sai và thao tác sửa gợi ý. Không tính thời gian chờ dịch vụ AI riêng thành thời gian con người làm việc.
- Hai người gán nhãn độc lập trước khi xem gợi ý, giữ cả hai bản nhãn và phân xử chỗ bất đồng. Chỉ hai tác giả tự thử là pilot có thiên lệch, không thay thế khảo sát người vận hành.
- Chưa thực hiện thí nghiệm thời gian; không điền số giả. Dùng CSV với cột `participant,scenario_group,condition,started_at,confirmed_at,classification_correct,duplicate_jobs,false_links`. Ngày giờ ISO có múi giờ; điều kiện `manual` hoặc `assisted`. Báo số lượt, trung vị và khoảng phân tán, không chỉ phần trăm cải thiện.
