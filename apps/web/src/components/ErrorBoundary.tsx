import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { getStoredLocale } from "../i18n";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage?: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error in component tree:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const isEn = getStoredLocale() === "en";

    return (
      <main className="boot-screen">
        <div role="alert" className="empty-state">
          <h1>{isEn ? "Unable to display this page" : "Không thể hiển thị trang"}</h1>
          <p style={{ color: "var(--muted)", maxWidth: 460, margin: "0.5rem auto 1rem" }}>
            {isEn
              ? "An unexpected error occurred. Please try reloading the application."
              : "Đã xảy ra lỗi ngoài dự kiến. Vui lòng tải lại trang hoặc thử lại sau."}
          </p>
          <button className="button button-primary" onClick={this.handleReload}>
            <RefreshCw size={17} />
            {isEn ? "Reload application" : "Tải lại trang"}
          </button>
        </div>
      </main>
    );
  }
}
