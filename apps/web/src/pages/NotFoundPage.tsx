import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { useLocale } from "../i18n";

export function NotFoundPage() {
  const { text } = useLocale();
  return <main className="boot-screen">
    <div role="status">
      <p>404</p>
      <h1>{text("Không tìm thấy trang", "Page not found")}</h1>
      <p>{text("Đường dẫn không tồn tại hoặc đã được thay đổi.", "This address does not exist or has changed.")}</p>
      <Link className="button button-primary" to="/overview">
        <ArrowLeft size={16} aria-hidden="true" /> {text("Về tổng quan", "Back to overview")}
      </Link>
    </div>
  </main>;
}
