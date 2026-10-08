# Google và Outlook / Microsoft

## Google

Tạo OAuth client dạng Web application trong Google Cloud. Với Docker:

```env
GOOGLE_OAUTH_CLIENT_ID=your-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8080/api/auth/google/callback
```

Authorized JavaScript origin: `http://localhost:8080`. Authorized redirect URI phải khớp tuyệt đối dòng trên. Tài khoản Google cần email đã xác minh và khớp tài khoản CaseFlow đang hoạt động trong tổ chức đã chọn.

## Outlook / Microsoft

Đăng nhập bằng Microsoft hỗ trợ tài khoản Outlook cá nhân và tài khoản trường/cơ quan Microsoft 365. Không truy cập hộp thư, không yêu cầu quyền gửi email.

1. Trong Microsoft Entra admin center, tạo App registration. Chọn hỗ trợ organizational directories và personal Microsoft accounts nếu muốn dùng cả Outlook cá nhân và tài khoản trường.
2. Authentication: thêm nền tảng **Web**, redirect URI `http://localhost:8080/api/auth/microsoft/callback`. Không bật implicit flow; hệ thống dùng authorization code + PKCE.
3. Certificates & secrets: tạo client secret. Lưu **Value**, không phải Secret ID, vào tệp `.env.docker` cục bộ.

```env
MICROSOFT_OAUTH_CLIENT_ID=application-client-id
MICROSOFT_OAUTH_CLIENT_SECRET=client-secret-value
MICROSOFT_OAUTH_REDIRECT_URI=http://localhost:8080/api/auth/microsoft/callback
MICROSOFT_OAUTH_TENANT=common
```

`common`: cá nhân và trường/cơ quan; `consumers`: cá nhân; `organizations`: trường/cơ quan; GUID tenant: chỉ một tenant. Lựa chọn phải phù hợp supported account types của App registration. Khi triển khai HTTPS, đổi origin và callback tương ứng; cookie OAuth sẽ bật Secure.

4. Chạy `npm run docker:up`. Không gửi secret vào chat và không commit tệp môi trường.
5. Người dùng đăng nhập CaseFlow bằng mật khẩu, vào **Hồ sơ cá nhân → Liên kết Outlook / Microsoft**, xác nhận mật khẩu CaseFlow rồi chọn tài khoản Microsoft.
6. Lần sau dùng nút **Tiếp tục với Outlook / Microsoft** ở màn hình đăng nhập, cùng mã tổ chức.

Hệ thống liên kết bằng cặp ID bất biến `tid` + `oid`, không tự ghép theo `email` hoặc `preferred_username`. Không tạo người dùng hay cấp vai trò từ thông tin Microsoft. Một Microsoft identity không thể gắn cho hai người dùng trong cùng tổ chức. Thay liên kết hiện cần hỗ trợ quản trị; chưa có nút tự unlink. Luồng liên kết bị từ chối nếu phiên/password bị thu hồi trong lúc OAuth diễn ra.

Nếu chưa có credentials, giao diện báo chưa cấu hình. Kiểm thử tự động dùng token ký bằng khóa thử nghiệm và môi trường mock, không chứng minh đăng nhập thật với Microsoft/Google khi chưa có credentials.

Kiểm chứng triển khai ngày 08/10/2026: build thành công; 91 kiểm thử API, 10 kiểm thử web, 7 E2E đều qua. Ca giao diện được chạy lại sau sửa viền cuối cùng và qua ở desktop/mobile. API/web Docker đã cập nhật, 6 dịch vụ healthy; Google/Microsoft hiện vẫn cần credentials thật.

## Logo

Logo được lưu cục bộ từ tài nguyên chính thức, không cần truy cập dịch vụ ngoài khi render:

- Google: https://developers.google.com/identity/branding-guidelines
- Microsoft: https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-branding-in-apps
- Kiểm tra danh tính Microsoft: https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference
