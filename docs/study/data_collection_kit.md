# Bộ thu dữ liệu do người thật viết

Dùng cho việc #10 (tập kiểm tra) và tập dev để sửa luật ưu tiên (việc #16). Mục tiêu: 15–20 người viết, mỗi người 8–10 phản ánh, tổng khoảng 150 câu; sau khi lọc còn khoảng **60 câu kiểm tra** và **40 câu dev**.

## 1. Ai viết

- Người từng hoặc đang thuê trọ, chung cư, ký túc xá: bạn bè, người thân, nhóm lớp.
- **Không** mời: hai thành viên nhóm, người đã đọc `apps/ai/data/`, người gán nhãn ở bước sau.
- Mỗi người nhận một mã `w01`, `w02`… do người điều phối gán. Không thu họ tên, số điện thoại, email, địa chỉ.

## 2. Câu đồng ý (đặt đầu biểu mẫu, bắt buộc tích)

> Bạn được mời viết vài tin nhắn báo sự cố giống như khi nhắn cho quản lý tòa nhà. Các câu bạn viết được dùng để kiểm tra một hệ thống phân loại yêu cầu trong đồ án tốt nghiệp. Chúng tôi không thu họ tên, số điện thoại hay địa chỉ; nếu bạn lỡ ghi thông tin cá nhân, chúng tôi sẽ xoá trước khi dùng. Câu trả lời chỉ dùng cho đồ án, không chia sẻ cho bên khác. Bạn có thể dừng bất cứ lúc nào và có thể nhờ chúng tôi xoá câu trả lời của mình bằng cách báo mã người viết trước ngày 30/11/2026.
>
> ☐ Tôi đồng ý tham gia.

## 3. Hướng dẫn cho người viết (hiển thị ngay sau câu đồng ý)

> Với mỗi tình huống, hãy viết **đúng như bạn sẽ nhắn** cho quản lý tòa nhà hoặc chủ nhà qua Zalo/Messenger. Viết ngắn hay dài tùy bạn. Được viết tắt, viết không dấu, sai chính tả, dùng tiếng lóng. Đừng cố viết cho "chuẩn". Không ghi tên thật, số điện thoại hay địa chỉ thật; nếu cần, dùng số căn tự đặt như "căn 1205".

Không giải thích cho người viết rằng có 6 nhóm dịch vụ hay có mức ưu tiên; không dùng các từ "phân loại", "khẩn cấp", "danh mục" trong biểu mẫu.

## 4. Câu hỏi nền (tùy chọn, không định danh)

1. Bạn đã từng thuê nhà/phòng chưa? (Đang thuê / Đã từng / Chưa)
2. Bạn thường báo hỏng hóc cho chủ nhà qua đâu? (Zalo / Gọi điện / Gặp trực tiếp / Ứng dụng của tòa nhà / Khác)

## 5. Thẻ tình huống

Cột "Nhóm dự kiến" và "Khẩn" **chỉ dành cho người điều phối** để cân bằng bộ thẻ, không hiện cho người viết, không dùng làm nhãn: nhãn cuối do hai người gán độc lập (bước 7). 7/30 thẻ là tình huống nguy hiểm (khoảng 23%).

| Mã | Tình huống (hiện cho người viết) | Nhóm dự kiến | Khẩn |
|---|---|---|---|
| T01 | Tối về bạn thấy sàn bếp ướt, nước rỉ ra từ phía dưới bồn rửa bát. | water | |
| T02 | Sáng dậy mở vòi trong căn không có giọt nào, hôm qua vẫn bình thường. | water | |
| T03 | Trần nhà vệ sinh có vệt ố vàng, mỗi lần tầng trên tắm lại nhỏ giọt xuống. | water | |
| T04 | Bồn cầu xả không trôi, nước dâng lên gần mép. | water | |
| T05 | Nước từ hành lang tràn vào căn, ngập tới mắt cá chân, gần chỗ ổ cắm dưới sàn. | water | có |
| T06 | Một nửa số đèn trong căn tự nhiên tắt, nửa còn lại vẫn sáng. | electrical | |
| T07 | Ổ cắm cạnh giường nóng lên và có mùi khét mỗi khi cắm sạc. | electrical | có |
| T08 | Cứ bật bếp từ và ấm siêu tốc cùng lúc là cả căn mất điện. | electrical | |
| T09 | Đèn hành lang ngay trước cửa căn chập chờn mấy hôm nay. | electrical | |
| T10 | Công tắc trong phòng tắm có tiếng lách tách và lóe tia lửa khi bật. | electrical | có |
| T11 | Wi-Fi ở phòng ngủ trong cùng rất yếu, phòng khách thì bình thường. | internet | |
| T12 | Từ sáng không vào được mạng, đèn trên cục phát Wi-Fi chuyển màu đỏ. | internet | |
| T13 | Bạn đang họp online thì mạng rớt, cứ khoảng 5 phút lại mất một lần. | internet | |
| T14 | Bạn muốn đổi mật khẩu Wi-Fi vì người thuê trước vẫn còn biết. | internet | |
| T15 | Cắm dây mạng vào laptop nhưng máy báo không có kết nối. | internet | |
| T16 | Điều hòa vẫn chạy nhưng không mát, cục bên ngoài không thấy quay. | appliances | |
| T17 | Điều hòa phòng ngủ chảy nước thành vệt xuống tường. | appliances | |
| T18 | Bật bình nóng lạnh cả tiếng mà nước vẫn lạnh. | appliances | |
| T19 | Máy giặt kêu rất to và rung lắc mạnh khi vắt. | appliances | |
| T20 | Bình nóng lạnh rỉ nước và chạm vào vỏ thấy tê tay. | appliances | có |
| T21 | Thẻ ra vào sảnh không quẹt được, phải nhờ bảo vệ mở cửa. | access_security | |
| T22 | Đi làm về thấy ổ khóa cửa có vết cạy, cửa không khóa lại được. | access_security | có |
| T23 | Một người lạ đi theo bạn vào thang máy và hỏi bạn ở căn nào. | access_security | |
| T24 | Khóa số ở cửa báo hết pin rồi không mở được nữa, bạn đang đứng ngoài. | access_security | |
| T25 | Cửa thoát hiểm ở tầng bạn bị ai đó khóa bằng xích. | access_security | |
| T26 | Căn bên cạnh hát karaoke sau 11 giờ đêm mấy tối liền. | general_support | |
| T27 | Bạn đang kẹt trong thang máy, thang dừng giữa hai tầng. | general_support | có |
| T28 | Bạn muốn hỏi thủ tục đăng ký tạm trú cho người thân đến ở cùng. | general_support | |
| T29 | Rác ở khu tập kết của tầng ba ngày chưa ai thu, bốc mùi. | general_support | |
| T30 | Trần phòng khách xuất hiện vết nứt dài và có chỗ hơi võng xuống. | general_support | có |

Thêm 2 câu tự do cuối biểu mẫu:

- F1. Kể lại một lần bạn phải báo hỏng hóc cho chủ nhà hoặc quản lý: bạn đã nhắn gì?
- F2. Nếu có một chuyện ở chỗ thuê làm bạn khó chịu mà chưa báo, bạn sẽ nhắn thế nào?

## 6. Chia biểu mẫu thành 4 phiên bản

Mỗi người chỉ viết 8 thẻ để không mệt và để mỗi thẻ có nhiều cách diễn đạt. Tạo 4 bản Google Form (A–D), gán phiên bản theo mã người viết (w01→A, w02→B, w03→C, w04→D, w05→A…). Mỗi bản có đủ 6 nhóm và ít nhất 1 thẻ nguy hiểm; thứ tự thẻ trong mỗi bản đã trộn sẵn.

| Bản | Thẻ |
|---|---|
| A | T02, T13, T22, T07, T26, T17, T04, T29 |
| B | T11, T05, T19, T24, T08, T28, T30, T15 |
| C | T16, T21, T03, T10, T14, T27, T06, T25 |
| D | T09, T18, T23, T01, T12, T20, T26, T03 |

T03 và T26 xuất hiện hai lần để đủ 8 thẻ/bản. Mỗi bản cộng thêm F1, F2.

## 7. Sau khi thu

1. Xuất câu trả lời về `docs/study/collected_reports.csv` theo mẫu `collected_reports_template.csv` (**không đưa vào Git**). Xoá mọi tên, số điện thoại, địa chỉ lỡ có trong câu, giữ nguyên lỗi chính tả và không dấu.
2. Bỏ câu trống, câu không phải báo sự cố (ví dụ "không có gì").
3. **Chia theo người viết, không chia theo câu**: chọn ngẫu nhiên khoảng 60% người viết vào tập kiểm tra, 40% vào tập dev. Câu của cùng một người chỉ nằm ở một tập, để không lọt giọng văn.
4. Tập kiểm tra: hai người gán nhãn độc lập (Cương và một tình nguyện viên ngoài nhóm) theo định nghĩa ở `docs/EXPERIMENT_PROTOCOL.md` mục 1, gán cả nhóm dịch vụ và mức ưu tiên; tính kappa, thảo luận câu bất đồng, chốt nhãn; rồi mới chạy đánh giá. **Không** sửa mô hình hay luật sau khi đã xem kết quả trên tập này.
5. Tập dev: dùng để sửa luật ưu tiên (việc #16) và chọn ngưỡng. Sau khi sửa, đánh giá lại một lần trên tập kiểm tra.
6. Ghi vào báo cáo: số người viết, số câu, cách chia, kappa, và rằng nhãn "Nhóm dự kiến" của thẻ không được dùng làm nhãn thật.
