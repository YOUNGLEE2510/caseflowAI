# Đánh giá Railway cho CaseFlow AI bản vận hành căn hộ

Ngày kiểm tra: 17/11/2026. Phạm vi: nghiên cứu tài liệu chính thức và đối chiếu mã nguồn đã khôi phục; chưa triển khai, chưa tạo tài nguyên hoặc phát sinh chi phí cloud.

## Kết luận

Railway có thể chạy kiến trúc hiện tại, chuyển phần vận hành khỏi máy cá nhân. Điểm thuận lợi là giữ được Express, FastAPI và các tiến trình nền chạy liên tục. Tuy nhiên, không nên dự toán toàn bộ stack chỉ 5 USD/tháng: tiền RAM của ClamAV và giới hạn SMTP/địa chỉ IP đầu ra ảnh hưởng đáng kể đến lựa chọn gói.

Railway không chạy nguyên file Docker Compose như một máy chủ Docker. Mỗi mục `services` phải được ánh xạ thành một Railway service; volume, biến môi trường và địa chỉ kết nối được cấu hình tương ứng. Nguồn: [hướng dẫn chuyển Compose](https://railway.com/guides/docker-compose), [dịch vụ Railway](https://docs.railway.com/services).

## Kiến trúc đề xuất

| Thành phần | Cách triển khai | Truy cập |
|---|---|---|
| Web/nginx | Build từ `Dockerfile.web` | Domain HTTPS công khai |
| API Express | Build từ `Dockerfile.api`; ban đầu một replica | Qua reverse proxy web hoặc domain API được cấu hình riêng |
| AI FastAPI | Build từ `Dockerfile.ai` | Mạng nội bộ, giữ `AI_INTERNAL_TOKEN` |
| ClamAV | Container image riêng | Mạng nội bộ, không mở scanner ra Internet |
| MongoDB | Tiếp tục MongoDB Atlas | Tài khoản DB ít quyền, quy tắc mạng phù hợp |
| Tệp đính kèm | Tiếp tục Cloudinary private | Giữ cơ chế cấp quyền tải hiện tại |

Railway có mạng riêng theo project/environment với DNS dạng `SERVICE_NAME.railway.internal`. Có region Singapore; chọn vị trí cần xét cùng vị trí Atlas và đo độ trễ thực tế. Nguồn: [private networking](https://docs.railway.com/networking/private-networking), [regions](https://docs.railway.com/deployments/regions).

Không cần thêm MongoDB container chỉ để chuyển sang Railway vì dự án đã dùng Atlas. Không công khai AI hay ClamAV nếu chỉ API sử dụng.

## Chi phí và cách đọc hóa đơn

Hobby có mức tối thiểu 5 USD/tháng gồm 5 USD usage; Pro có mức tối thiểu 20 USD/tháng gồm 20 USD usage. Usage vượt mức được tính thêm. Ví dụ usage 8 USD trên Hobby cho tổng 8 USD, không phải 13 USD. Dịch vụ vẫn tiêu thụ tài nguyên khi chạy mà không có người truy cập. Nguồn: [hiểu hóa đơn](https://docs.railway.com/pricing/understanding-your-bill).

Đơn giá đọc từ [trang giá Railway](https://railway.com/pricing):

| Tài nguyên | Đơn giá công bố |
|---|---:|
| RAM | 0,00000386 USD/GB/giây |
| CPU | 0,00000772 USD/vCPU/giây |
| Volume | 0,00000006 USD/GB/giây |
| Network egress của service | 0,05 USD/GB |

Ví dụ minh họa, **không phải RAM/CPU đã đo của CaseFlow**. Với 30 ngày chạy liên tục = 2.592.000 giây:

| Giả định tổng các service | RAM | CPU trung bình | Volume | Tổng trước egress |
|---|---:|---:|---:|---:|
| 4 GB RAM, 0,1 vCPU, 2 GB volume | 40,02 USD | 2,00 USD | 0,31 USD | 42,33 USD |
| 6 GB RAM, 0,1 vCPU, 2 GB volume | 60,03 USD | 2,00 USD | 0,31 USD | 62,34 USD |

Các tổng này đã vượt minimum Hobby/Pro, nên không cộng thêm lần nữa 5 hoặc 20 USD. Chưa gồm thuế, Atlas, Cloudinary, nhà cung cấp email, domain, LLM bên ngoài hoặc các hạng mục tính phí khác. Tháng dài/ngắn và thời gian chạy thực tế làm thay đổi số tiền.

ClamAV khuyến nghị khoảng 3–4 GiB RAM; đây là yêu cầu cấp phát tham khảo, không phải số đo RAM trung bình để tính hóa đơn. Do đó cần đo stack thực tế trước khi chốt ngân sách. Nguồn: [ClamAV Docker](https://docs.clamav.net/manual/Installing/Docker.html), [ClamAV introduction](https://docs.clamav.net/).

Free giới hạn 0,5 GB RAM/service sau trial theo bảng giá đang công bố, không phù hợp chạy đủ stack với ClamAV. Cần kiểm tra lại bảng giá khi đăng ký vì hạn mức có thể thay đổi.

## Những điểm quan trọng với ứng dụng hiện tại

1. **SMTP:** Free/Trial/Hobby chặn SMTP đầu ra. Email Nodemailer/SMTP hiện tại cần Pro trở lên, hoặc phải bổ sung adapter gửi email qua HTTPS API. Đổi tên biến môi trường không tự chuyển SMTP sang HTTPS. Nguồn: [outbound networking](https://docs.railway.com/networking/outbound-networking).
2. **Atlas và IP:** static outbound IP là tính năng Pro. Nếu muốn allowlist địa chỉ đầu ra ổn định cho Atlas, phải tính đến điều này; không mặc định mở DB cho mọi IP để tránh cấu hình mạng. Nguồn: [outbound networking](https://docs.railway.com/networking/outbound-networking).
3. **Sleep:** API hiện có timer xử lý triage mỗi 2 giây, delivery/email mỗi 10 giây, upload recovery mỗi 60 giây và SLA theo chu kỳ. Railway xét inactivity qua outbound traffic; kết nối DB/polling có thể cản sleep. Nếu service ngủ thì timer bên trong không tiếp tục chạy. Vì vậy ban đầu nên để API chạy liên tục. Nguồn nền tảng: [serverless](https://docs.railway.com/deployments/serverless); nguồn ứng dụng: `apps/api/src/index.ts`.
4. **Volume:** dữ liệu cần tồn tại qua deploy/restart phải đặt trên volume hoặc kho ngoài; volume không có trong bước build. Xem xét `/app/model-store` cho AI, `/var/lib/clamav` cho chữ ký và `/app/uploads` cho staging/recovery của API nếu luồng hiện tại cần giữ tệp qua restart. Cloudinary lưu bản gốc không tự loại bỏ nhu cầu staging. Nguồn: [volumes](https://docs.railway.com/volumes), [Compose migration](https://railway.com/guides/docker-compose).
5. **Kiểm soát tiền:** có cảnh báo mềm và hard limit. Đạt hard limit sẽ đưa workload offline; chọn mức này đồng nghĩa chấp nhận ngừng dịch vụ để chặn tiêu thụ thêm. Nguồn: [cost control](https://docs.railway.com/pricing/cost-control).

## Các thay đổi kỹ thuật cần chuẩn bị, chưa thực hiện

- Giữ build context tại gốc monorepo; Dockerfile web/API đang COPY root lockfile và cả hai workspace manifest. Chọn đúng Dockerfile cho mỗi service.
- Sửa `nginx/default.conf`: hiện dùng DNS resolver Docker `127.0.0.11` và upstream `http://api:4000`; không dùng nguyên trạng trên Railway. Có thể giữ mô hình cùng origin để đơn giản cookie/CORS.
- Kiểm tra port thực tế và interface bind của từng service; AI đang bind `0.0.0.0:8001`, API dùng `config.PORT`, nginx dùng 80. Cấu hình Railway target port tương ứng hoặc hỗ trợ biến `PORT` phù hợp; không đổi port theo phỏng đoán.
- Thiết lập `DOMAIN_PROFILE=rental`, `AUTO_SEED=false`, HTTPS public origin và môi trường pilot đáp ứng các kiểm tra cấu hình hiện có.
- Kiểm tra trusted proxy và forwarded HTTPS: Railway kết thúc TLS ở proxy; cấu hình nginx hiện chuyển `$scheme` xuống API. Không tin tùy ý header do khách gửi, đồng thời phải để cookie/OAuth biết đúng origin HTTPS.
- Thiết lập OAuth callback trên domain thật và kiểm tra refresh cookie, CORS/CSRF, session, phân quyền/cách ly tenant, upload scanner fail-closed.
- Đưa secret vào Railway Variables; giữ JWT, khóa mã hóa email/MFA và token nội bộ nhất quán với dữ liệu đã có. Không commit `.env`, `credentials.json` hoặc các snapshot/model private.
- Chỉ dùng một API replica ở lượt đầu; đánh giá lease/khóa và các job nền trước khi nhân bản.
- Khi thử triển khai, dùng environment/DB thử nghiệm độc lập. Không seed hoặc restore vào Atlas hiện tại để kiểm tra deployment.

## Cách thử có kiểm soát

1. Chốt ngân sách/thời gian chạy và yêu cầu email trước khi chọn Hobby hay Pro.
2. Chuẩn bị cấu hình Railway trong repo, review local; chưa cần tạo tài nguyên trả phí.
3. Khi được yêu cầu triển khai, dựng environment thử nghiệm với secret riêng và mạng riêng.
4. Đo RAM/CPU thực tế, cold start AI, thời gian tải chữ ký ClamAV và dung lượng volume.
5. Kiểm tra luồng đăng nhập → yêu cầu → phân loại → phân công → xử lý → truy xuất tri thức, upload và cách ly quyền.
6. Sau khi đạt kiểm tra mới chuyển domain/dữ liệu theo kế hoạch. Khi cloud hoạt động độc lập, máy cá nhân có thể tắt tiến trình local; việc dọn image/cache/ổ đĩa Docker là thao tác riêng.

Railway là lựa chọn đáng cân nhắc nếu ưu tiên ít quản trị máy chủ. Nếu mục tiêu chính là chi phí thấp khi chạy toàn bộ ClamAV liên tục, cần so sánh với VPS cùng cấu hình trên số đo thực tế trước khi cam kết.
