import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useLocale } from "../i18n";

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { text } = useLocale();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} className="editor-dialog" aria-labelledby={titleId} onCancel={onClose}>
    <header className="editor-heading"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" aria-label={text("Đóng", "Close")} title={text("Đóng", "Close")} onClick={onClose}><X size={20} /></button></header>
    {children}
  </dialog>;
}
