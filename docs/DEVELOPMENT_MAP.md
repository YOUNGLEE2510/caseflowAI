# Định hướng phát triển từ cây mapping

Cây mapping trong bản đánh giá mô tả bề rộng công nghệ. Để phát triển thành sản phẩm và luận văn thuyết phục, nên tổ chức lại theo ba trục giá trị thay vì đếm endpoint, model hoặc collection.

## 1. Service Operations

Đây là lõi sản phẩm có thể demo ổn định:

- Tiếp nhận một hồ sơ xuyên suốt nhiều kênh.
- FSM trạng thái, phân công, SLA, timeline và thông báo.
- RBAC, multi-tenant, audit và kho tri thức đã phê duyệt.
- Dashboard ưu tiên công việc thay vì dashboard chỉ để trình bày số liệu.

Hướng nâng cấp: queue nền cho cảnh báo, object storage, SSO/OIDC, tìm kiếm toàn văn và quy tắc SLA theo lịch làm việc. Incident chỉ được nâng thành chức năng chính khi có job phát hiện cụm, màn hình xác nhận và phép đo precision/recall.

## 2. AI Decision Support

AI phải xuất hiện tại điểm ra quyết định của người xử lý:

- Gợi ý dịch vụ và đơn vị, kèm top nhãn và độ tin cậy.
- Trích xuất trường dữ liệu để giảm nhập tay.
- Gợi ý hồ sơ tương tự và bài tri thức có nguồn.
- Cảnh báo SLA kèm yếu tố giải thích.
- Lưu quyết định chấp nhận/sửa/từ chối để tạo feedback loop.

Hướng nâng cấp theo thứ tự: dataset thật đã gán nhãn, calibration/ngưỡng chuyển người, baseline TF-IDF, PhoBERT, embedding retrieval, sau cùng mới là sinh câu trả lời bằng LLM. Không nên gọi mỗi endpoint là một “model”; regex và cosine retrieval là thành phần AI/NLP nhưng không phải model tự train độc lập.

## 3. Evidence & Governance

Đây là phần biến ứng dụng web thành đồ án nghiên cứu ứng dụng:

- Dataset registry, nguồn và giấy phép.
- Version taxonomy/model, model card và experiment run.
- Metric offline, acceptance rate của nhân viên và routing accuracy thực tế.
- Audit quyết định AI, ẩn danh dữ liệu và quy trình rollback.
- Usability test và pilot có nhóm đối chứng.

Các báo cáo thực nghiệm nằm ngoài giao diện demo. Sản phẩm chỉ nên có trang quản trị model tối giản để hiển thị phiên bản đang chạy, ngày triển khai, ngưỡng tin cậy và trạng thái sức khỏe.

## Hướng giao diện

Không sao chép nhận diện của sản phẩm khác. CaseFlow dùng các pattern đã được kiểm chứng:

- **Zendesk Agent Workspace:** một hồ sơ trung tâm, hội thoại theo thời gian và panel ngữ cảnh/tri thức bên cạnh.
- **Atlassian Navigation:** sidebar cho điều hướng nghiệp vụ; top bar dành cho tìm kiếm, tạo mới và tiện ích chung.
- **GOV.UK Design System:** form theo từng bước, ngôn ngữ trực tiếp, summary/error rõ ràng cho cổng sinh viên.
- **IBM Carbon:** bảng dữ liệu dày, sorting/filtering có trạng thái, điều khiển bàn phím và accessibility.

Thiết kế nên tách hai trải nghiệm. Cổng sinh viên nhẹ, dẫn dắt theo tác vụ và ưu tiên tra cứu trước khi tạo hồ sơ. Không gian nhân viên dày hơn, ưu tiên queue, bulk action, keyboard workflow và context panel. Tránh bốn KPI card giống nhau, badge màu tràn lan, mô tả marketing trong màn hình làm việc và mọi section đều đóng khung thành card.

## Roadmap đề xuất

| Giai đoạn | Sản phẩm | AI/nghiên cứu | Kết quả bảo vệ |
|---|---|---|---|
| 1. Ổn định lõi | Case workflow, SLA, RBAC, audit | Baseline tái lập | Demo end-to-end đáng tin cậy |
| 2. Dữ liệu | Feedback correction, dataset registry | 300+ mẫu gán nhãn độc lập | Dataset card và agreement |
| 3. So sánh | Model version và shadow mode | TF-IDF vs PhoBERT | F1, confusion matrix, latency |
| 4. Tri thức | Citation, version, ngày hiệu lực | Embedding + reranking | Hit@K, MRR, refusal rate |
| 5. Pilot | Queue thực, báo cáo vận hành | Đo hiệu quả có/không AI | Thời gian xử lý và routing accuracy |

Ưu tiên đồ án nên dừng ở giai đoạn 4 và pilot nhỏ ở giai đoạn 5. Đây là phạm vi đủ sâu cho hai người mà vẫn có câu chuyện triển khai thực tế.
