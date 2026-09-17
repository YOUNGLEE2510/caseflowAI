import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { useLocale } from "../../i18n";

export function FileUploadArea({
  files,
  onFilesChange,
  accept = ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg",
  maxSizeMB = 10,
  label = "Đính kèm tài liệu liên quan",
  helperText = `PDF, DOCX, XLSX, PNG hoặc JPG · tối đa ${maxSizeMB} MB mỗi tệp`,
  selectLabel = "Chọn tệp",
  removeLabel = "Xóa tệp"
}: {
  files: File[];
  onFilesChange: (files: File[]) => void;
  accept?: string;
  maxSizeMB?: number;
  label?: string;
  helperText?: string;
  selectLabel?: string;
  removeLabel?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState("");
  const { text } = useLocale();

  function handleFiles(newFiles: FileList | null) {
    if (!newFiles) return;
    const allowed = accept.split(",").map((extension) => extension.trim().toLowerCase());
    const valid = Array.from(newFiles).filter(
      (file) =>
        file.size > 0 &&
        file.size <= maxSizeMB * 1024 * 1024 &&
        allowed.some((extension) => file.name.toLowerCase().endsWith(extension))
    );
    setFileError(
      valid.length !== newFiles.length
        ? text(
            "Một số tệp rỗng, vượt giới hạn hoặc không đúng định dạng.",
            "Some files are empty, too large, or have an unsupported format."
          )
        : ""
    );
    onFilesChange([...files, ...valid]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeFile(index: number) {
    onFilesChange(files.filter((_, i) => i !== index));
  }

  return (
    <div className="file-upload-area">
      <div
        className="file-upload-dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          handleFiles(event.dataTransfer.files);
        }}
      >
        <Upload size={20} />
        <div>
          <strong>{label}</strong>
          <span>{helperText}</span>
        </div>
        <button
          type="button"
          className="button button-secondary button-small"
          onClick={(event) => {
            event.stopPropagation();
            inputRef.current?.click();
          }}
        >
          {selectLabel}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      {fileError ? (
        <p role="alert" className="field-error">
          {fileError}
        </p>
      ) : null}
      {files.length > 0 ? (
        <div className="file-upload-list">
          {files.map((file, i) => (
            <div key={`${file.name}-${i}`} className="file-upload-item">
              <span>{file.name}</span>
              <span className="file-size">{(file.size / 1024).toFixed(0)} KB</span>
              <button
                type="button"
                className="icon-button"
                onClick={(event) => {
                  event.stopPropagation();
                  removeFile(i);
                }}
                aria-label={`${removeLabel}: ${file.name}`}
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
