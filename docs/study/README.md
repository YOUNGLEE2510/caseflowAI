# Bộ công cụ thử nghiệm người dùng và gán nhãn

Các tệp ở đây do **người thật** điền. Công cụ không tự sinh số liệu; mọi kết quả trong báo cáo phải đến từ dữ liệu bạn thu được. Không ghi họ tên thật, số điện thoại hay email vào tệp — dùng mã `p01`, `p02`… và giữ bảng đối chiếu riêng, ngoài repository.

| Tệp | Ai điền | Dùng để |
|---|---|---|
| `annotations_template.csv` | Hai người gán nhãn, làm **độc lập**, không xem gợi ý AI | Đo độ đồng thuận (Cohen's kappa) trên 60 câu kiểm tra |
| `human_test_template.csv` | Người không tham gia viết dữ liệu huấn luyện | Tập kiểm tra cuối do người thật viết |
| `timing_template.csv` | Người điều phối buổi thử | Thời gian xử lý khi có/không có gợi ý AI |
| `sus_template.csv` | Người tham gia, sau buổi thử | Điểm khả dụng SUS |

## 1. Gán nhãn độc lập (kappa)

1. Sao chép `annotations_template.csv` thành `annotations.csv`. Người A điền cột `annotator_a`, người B điền cột `annotator_b`, mỗi người làm trên bản riêng rồi ghép lại.
2. Nhãn hợp lệ: `water`, `electrical`, `internet`, `appliances`, `access_security`, `general_support` (định nghĩa trong `docs/EXPERIMENT_PROTOCOL.md`).
3. Chạy `python -m apps.ai.analyze_study agreement docs/study/annotations.csv`. Kappa từ 0,61 trở lên thường được coi là đồng thuận khá; các câu bất đồng được liệt kê để hai người thảo luận và chốt nhãn cuối.

## 2. Tập kiểm tra do người thật viết

1. Nhờ 5–10 người (đóng vai người thuê) mỗi người viết 6–12 phản ánh theo cách họ thường nhắn, mỗi câu một dòng trong `human_test_template.csv` (`text`, để trống `label`, `writer` là mã người viết, `written_at` là ngày).
2. Hai người gán nhãn như bước 1, chốt cột `label`.
3. Chỉ giữ hai cột `text,label`, rồi chạy `python apps/ai/evaluate.py --dataset docs/study/human_test.csv --output artifacts/ai-evaluation/human-test`. Đây là con số nên đưa vào báo cáo; điểm trên tập mô phỏng chỉ để so sánh tương đối.

## 3. Thử nghiệm có/không gợi ý AI

- 5–8 người đóng vai nhân viên điều phối. Mỗi người xử lý hai nhóm phiếu tương đương (`scenario_group` g1, g2): một nhóm ở điều kiện `manual` (ẩn gợi ý AI, tự chọn dịch vụ và mức ưu tiên), một nhóm ở `assisted` (xem gợi ý AI). Một nửa số người làm `manual` trước, nửa còn lại làm `assisted` trước.
- Gợi ý phiếu: lấy từ tập kiểm tra do người thật viết; mỗi nhóm 8–10 phiếu, cân bằng nhóm dịch vụ và có 1–2 phiếu khẩn cấp.
- Mỗi phiếu ghi một dòng: thời điểm mở phiếu (`started_at`), thời điểm xác nhận phân loại và ưu tiên (`confirmed_at`, ISO có múi giờ, ví dụ `2026-11-20T09:15:00+07:00`), phân loại cuối có đúng nhãn chốt không (`classification_correct`), số đầu việc tạo trùng và số liên kết sự cố sai.
- Chạy `python -m apps.ai.analyze_study timing docs/study/timing.csv`. Báo cáo trung vị, khoảng tứ phân vị và kiểm định Wilcoxon cặp (cần ít nhất 5 người ở cả hai điều kiện); không chỉ báo phần trăm cải thiện.
- **Chuẩn bị tài khoản và phiếu:** chép `pilot_cases_template.csv` thành `pilot_cases.csv` (không đưa vào Git), thay hai dòng ví dụ bằng 8–10 phản ánh mỗi nhóm `g1`, `g2` lấy từ tập do người thật viết. Trong `apps/api`, chạy thử trước rồi mới ghi:
  `npm run pilot:setup -- --org <slug> --cases ../../docs/study/pilot_cases.csv --participants 8` (chỉ in kế hoạch), thêm `--apply` để ghi. Script tạo tài khoản `pilot.p01@canho.local`… (vai trò quản lý, tên ẩn danh, có mã `pNN`), một người thuê pilot không đăng nhập được, và **một bản riêng mỗi phiếu cho từng người** (mã `PL-P01-G1-01`…, tiếp nhận ở "Hỗ trợ chung" để người tham gia tự phân luồng), rồi chạy phân tích AI như phiếu thường. Thứ tự điều kiện và nhóm phiếu được cân bằng: p01 thủ công→g1, p02 có AI→g1, p03 thủ công→g2, p04 có AI→g2, lặp lại; công tắc của mỗi tài khoản được đặt sẵn theo điều kiện đầu. Mật khẩu chỉ ghi vào `artifacts/pilot/pilot-accounts-<slug>.csv` (đã bị Git bỏ qua), không in ra màn hình. Chạy lại an toàn: tài khoản và phiếu đã có được giữ nguyên; `--reset-passwords` cấp lại mật khẩu. Kiểm tra `aiProcessing` trong kết quả: phiếu `failed` nghĩa là dịch vụ AI không chạy, nhóm có AI sẽ thiếu gợi ý. **Sao lưu Atlas trước khi chạy với `--apply`.**
- **Trong buổi thử:** người tham gia lọc danh sách hồ sơ bằng mã của mình (ví dụ `PL-P01-G1`) và xử lý hết nhóm đầu; người điều phối đổi công tắc trên trang Thành viên rồi người tham gia làm nhóm còn lại.
- **Bật/tắt điều kiện:** quản trị tổ chức vào Thành viên → chọn nhân viên → nhập mã người tham gia (`p01`…) và bật "Ẩn gợi ý AI" (`manual`) hoặc tắt (`assisted`). Máy chủ giữ lại mọi gợi ý AI cho tài khoản đang ẩn; AI vẫn chạy và lưu kết quả bình thường.
- **Xuất tự động:** quản trị tổ chức bấm "Xuất dữ liệu thử nghiệm" (trang Thành viên), có thể lọc theo khoảng ngày và mã người tham gia. Hệ thống ghi lần mở phiếu đầu tiên và lần xác nhận phân luồng đầu tiên của mỗi tài khoản có mã. Tệp CSV có đúng 8 cột của `timing_template.csv`, thêm `case_code`, `final_category`, `final_priority`, `ai_category`, `ai_priority` để chấm `classification_correct` theo nhãn chốt (cột này để trống, người điều phối điền). `condition` lấy theo trạng thái công tắc **tại lúc xác nhận**, không phải lúc xuất. `duplicate_jobs` đếm đầu việc bảo trì người đó tạo cho phiếu ngoài đầu việc đầu tiên; `false_links` đếm liên kết sự cố người đó tạo rồi bị gỡ. Tệp không chứa họ tên, email, số điện thoại hay nội dung phản ánh; ô bắt đầu bằng `= + - @` được thêm dấu `'` để tránh công thức. Mỗi lần xuất được ghi nhật ký kiểm toán.
- Hệ thống cũng tự ghi tỷ lệ nhân viên xác nhận hay sửa nhãn AI (trang Tổng quan → Kiểm duyệt AI; xuất CSV tại `/api/analytics/export/training.csv`).

## 4. Bảng hỏi SUS (sau buổi thử, thang 1–5: 1 = rất không đồng ý, 5 = rất đồng ý)

1. Tôi nghĩ tôi sẽ muốn dùng hệ thống này thường xuyên.
2. Tôi thấy hệ thống phức tạp không cần thiết.
3. Tôi thấy hệ thống dễ sử dụng.
4. Tôi nghĩ tôi cần người kỹ thuật hỗ trợ mới dùng được hệ thống.
5. Tôi thấy các chức năng của hệ thống được kết hợp tốt với nhau.
6. Tôi thấy hệ thống có quá nhiều điểm không nhất quán.
7. Tôi nghĩ hầu hết mọi người sẽ học dùng hệ thống rất nhanh.
8. Tôi thấy hệ thống rất rườm rà khi sử dụng.
9. Tôi cảm thấy tự tin khi dùng hệ thống.
10. Tôi phải học nhiều thứ trước khi dùng được hệ thống.

Điền vào `sus_template.csv` (cột `q1`…`q10`), chạy `python -m apps.ai.analyze_study sus docs/study/sus.csv`.

## Lưu ý đạo đức

Thông báo cho người tham gia mục đích thử nghiệm, dữ liệu thu thập và quyền dừng bất cứ lúc nào; chỉ dùng tài khoản và dữ liệu mẫu, không dùng thông tin thật của người thuê.
