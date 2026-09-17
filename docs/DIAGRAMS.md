# Sơ đồ hệ thống

Các sơ đồ phản ánh phạm vi đã triển khai. Thành phần phát hiện cụm sự cố tự động và mô hình AI nâng cao là hướng phát triển, không được thể hiện như chức năng đã hoàn tất.

## Kiến trúc thành phần

```mermaid
flowchart LR
  R[Người yêu cầu] --> WEB[React Web]
  A[Nhân viên] --> WEB
  M[Quản lý và quản trị] --> WEB
  WEB -->|REST + JWT| API[Express API]
  API --> AUTH[Xác thực và phân quyền]
  API --> CASE[Quản lý hồ sơ và SLA]
  API --> KB[Kho tri thức]
  API --> ADMIN[Quản trị danh mục]
  AUTH --> DB[(MongoDB)]
  CASE --> DB
  KB --> DB
  ADMIN --> DB
  API -->|HTTP nội bộ| AI[FastAPI AI Service]
  AI --> CLS[Phân loại và trích xuất]
  AI --> RET[Hồ sơ tương tự và retrieval]
  AI --> SLA[Dự báo rủi ro SLA]
  API --> FILES[(Lưu tệp cục bộ POC)]
```

## Use case theo vai trò

```mermaid
flowchart TB
  REQ[Người yêu cầu] --> UC1[Tạo và theo dõi hồ sơ]
  REQ --> UC2[Phản hồi và tải tệp]
  REQ --> UC3[Tra cứu tri thức]
  AGENT[Nhân viên] --> UC4[Xác nhận gợi ý AI]
  AGENT --> UC5[Nhận, xử lý và chuyển hồ sơ]
  AGENT --> UC6[Ghi chú nội bộ]
  MANAGER[Quản lý] --> UC7[Theo dõi SLA và vận hành]
  MANAGER --> UC8[Phê duyệt tri thức]
  ADMIN[Quản trị tổ chức] --> UC9[Quản lý người dùng và dịch vụ]
  ADMIN --> UC10[Xem audit và trạng thái hệ thống]
```

## Luồng xử lý chính

```mermaid
sequenceDiagram
  actor U as Người yêu cầu
  participant W as Web
  participant A as API
  participant I as AI Service
  participant D as MongoDB
  actor S as Nhân viên
  U->>W: Nhập nội dung yêu cầu
  W->>A: Gửi yêu cầu phân tích
  A->>I: Phân loại, trích xuất, tìm tương tự
  I-->>A: Gợi ý + độ tin cậy + nguồn
  A-->>W: Hiển thị để người dùng kiểm tra
  U->>W: Xác nhận và gửi hồ sơ
  W->>A: Tạo hồ sơ
  A->>D: Lưu hồ sơ, SLA và timeline
  A-->>S: Đưa vào hàng đợi xử lý
  S->>A: Xác nhận hoặc sửa phân loại
  A->>D: Lưu quyết định con người và audit
  S->>A: Cập nhật trạng thái, phản hồi
  A->>D: Cập nhật timeline
  A-->>U: Thông báo tiến độ
```

## Mô hình dữ liệu khái quát

```mermaid
erDiagram
  ORGANIZATION ||--o{ USER : contains
  ORGANIZATION ||--o{ SERVICE_DEFINITION : configures
  ORGANIZATION ||--o{ CASE_RECORD : owns
  USER ||--o{ CASE_RECORD : requests
  USER ||--o{ CASE_RECORD : handles
  SERVICE_DEFINITION ||--o{ CASE_RECORD : classifies
  CASE_RECORD ||--o{ ATTACHMENT : includes
  CASE_RECORD ||--o{ NOTIFICATION : triggers
  CASE_RECORD }o--o{ INCIDENT : relates_to
  ORGANIZATION ||--o{ KNOWLEDGE_ARTICLE : owns
  USER ||--o{ AUDIT_LOG : performs
```

## Ranh giới AI và nghiệp vụ

AI chỉ tạo gợi ý. API quyết định quyền truy cập, trạng thái hợp lệ, thời hạn SLA và việc ghi audit. Nhân viên chịu trách nhiệm xác nhận hoặc sửa kết quả trước khi điều phối. Thiết kế này cho phép đo mức đóng góp của AI mà không đặt tính đúng đắn của quy trình vào một mô hình xác suất.
