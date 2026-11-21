# Đăng nhập Google

## Google

Tạo OAuth client dạng Web application trong Google Cloud. Với Docker:

```env
GOOGLE_OAUTH_CLIENT_ID=your-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8080/api/auth/google/callback
```

Authorized JavaScript origin: `http://localhost:8080`. Authorized redirect URI phải khớp tuyệt đối dòng trên. Tài khoản Google cần email đã xác minh và khớp tài khoản CaseFlow đang hoạt động trong tổ chức đã chọn.

Để chỉ chấp nhận Google Workspace của đơn vị, đặt `GOOGLE_OAUTH_HOSTED_DOMAINS` thành danh sách miền được đơn vị xác nhận, phân cách dấu phẩy, hoặc cấu hình `Organization.settings.googleHostedDomains` theo từng tổ chức. Backend so khớp chính xác claim `hd` trong ID token đã xác minh; không suy luận từ đuôi email và không coi tham số `hd` trên trang đăng nhập là kiểm soát bảo mật. Danh sách riêng của tổ chức được ưu tiên hơn biến môi trường. Để trống giữ chính sách tài khoản cá nhân đã được cấp sẵn, không tự tạo tài khoản. [Tài liệu Google](https://developers.google.com/identity/openid-connect/openid-connect).

Nếu chưa có credentials, nút Google không hiện ở trang đăng nhập. Kiểm thử tự động dùng token ký bằng khóa thử nghiệm và môi trường mock, không chứng minh đăng nhập thật với Google khi chưa có credentials.

Chạy `npm run release:check -- --require-oauth` để kiểm tra cấu hình và redirect khởi tạo của Google. Lệnh không thay thế đăng nhập thật, không xác nhận secret còn hiệu lực ở bước đổi authorization code và không chứng minh consent của tổ chức đã được cấp.

## Logo

Logo được lưu cục bộ từ tài nguyên chính thức, không cần truy cập dịch vụ ngoài khi render:

- Google: https://developers.google.com/identity/branding-guidelines

Đăng nhập Outlook/Microsoft đã được gỡ ngày 20/11/2026 để thu gọn phạm vi; tài khoản từng liên kết Microsoft vẫn đăng nhập bằng mật khẩu hoặc Google.
