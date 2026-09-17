import { useState, type ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useLocale } from "../i18n";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string | ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  loading: externalLoading,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const { text } = useLocale();
  const [internalLoading, setInternalLoading] = useState(false);
  const loading = externalLoading || internalLoading;

  if (!open) return null;

  async function handleConfirm() {
    setInternalLoading(true);
    try {
      await onConfirm();
    } finally {
      setInternalLoading(false);
    }
  }

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
        <div className="confirm-header">
          {danger ? <AlertTriangle size={22} className="confirm-icon-danger" /> : null}
          <h3>{title}</h3>
          <button className="icon-button" onClick={onCancel} aria-label={text("Đóng", "Close")}>
            <X size={18} />
          </button>
        </div>
        <div className="confirm-body">
          {typeof message === "string" ? <p>{message}</p> : message}
        </div>
        <div className="confirm-actions">
          <button
            className="button button-secondary"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel || text("Hủy", "Cancel")}
          </button>
          <button
            className={`button ${danger ? "button-danger" : "button-primary"}`}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? <span className="spinner spinner-light" /> : null}
            {confirmLabel || text("Xác nhận", "Confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
