import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, SearchCheck, Sparkles, TriangleAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { ErrorState, FileUploadArea, PageHeader } from "../components/ui";
import { useApiData } from "../hooks/useApiData";
import { useLocale } from "../i18n";
import type { ServiceDefinition } from "../types";

interface IntakeAnalysis {
  classification: {
    label: string;
    confidence: number;
    summary: string;
    extracted: Record<string, string>;
    topCandidates: Array<{ label: string; score: number }>;
    provider: string;
  };
  similar: Array<{ id: string; title: string; score: number }>;
  service?: ServiceDefinition;
  needsReview: boolean;
}

export function NewCasePage() {
  const navigate = useNavigate();
  const { text } = useLocale();
  const { data: serviceData } = useApiData<{ services: ServiceDefinition[] }>("/services");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [serviceKey, setServiceKey] = useState("");
  const [customFields, setCustomFields] = useState<Record<string, string>>({});
  const selectedService = serviceData?.services.find((service) => service.key === serviceKey);
  const [priority, setPriority] = useState("normal");
  const [channel, setChannel] = useState("portal");
  const [files, setFiles] = useState<File[]>([]);
  const [analysis, setAnalysis] = useState<IntakeAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const analysisRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    analysisRequest.current?.abort();
    setAnalysis(null);
    setAnalyzing(false);
    return () => analysisRequest.current?.abort();
  }, [title, description]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [citations, setCitations] = useState<Array<{ id: string; title: string; excerpt: string; sourceLabel: string }>>([]);
  useEffect(() => {
    let current = true;
    setCitations([]);
    if (description.trim().length < 30) return;
    const timer = window.setTimeout(() => {
      void api<{ citations: typeof citations }>("/knowledge/search", { method: "POST", body: JSON.stringify({ query: description.slice(0, 1000) }) })
        .then(result => { if (current) setCitations(result.citations.slice(0, 3)); })
        .catch(() => { if (current) setCitations([]); });
    }, 700);
    return () => { current = false; window.clearTimeout(timer); };
  }, [description]);

  async function analyze() {
    if (description.trim().length < 12) {
      setError(text("Mô tả cần có ít nhất 12 ký tự.", "Please enter at least 12 characters."));
      return;
    }
    analysisRequest.current?.abort();
    const controller = new AbortController();
    analysisRequest.current = controller;
    setAnalyzing(true);
    setError("");
    try {
      const result = await api<IntakeAnalysis>("/ai/analyze-intake", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({ text: `${title}. ${description}` })
      });
      if (controller.signal.aborted) return;
      setAnalysis(result);
      if (!result.needsReview && result.service?.key) setServiceKey(result.service.key);
    } catch (requestError) {
      if (controller.signal.aborted) return;
      setError(requestError instanceof Error ? requestError.message : text("Không thể phân tích yêu cầu.", "We could not analyze this request."));
    } finally {
      if (!controller.signal.aborted) setAnalyzing(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await api<{ case: { _id: string } }>("/cases", {
        method: "POST",
        body: JSON.stringify({ title, description, serviceKey: serviceKey || undefined, priority, channel, customFields })
      });
      const failedUploads: string[] = [];
      for (const file of files) {
        try {
          await api(`/cases/${response.case._id}/attachments`, {
            method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "X-Filename": encodeURIComponent(file.name)
          },
            body: file
          });
        } catch {
          failedUploads.push(file.name);
        }
      }
      navigate(`/cases/${response.case._id}`, {
        state: failedUploads.length
          ? {
              uploadWarning: text(
                `Hồ sơ đã được tạo nhưng chưa tải được: ${failedUploads.join(", ")}.`,
                `The request was created, but these files could not be uploaded: ${failedUploads.join(", ")}.`
              )
            }
          : { created: true }
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : text("Không thể tạo yêu cầu.", "We could not create this request."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title={text("Tiếp nhận yêu cầu mới", "Create a new request")}
        description={text(
          "Ghi lại vấn đề như cách bạn vẫn trao đổi. Hệ thống sẽ gợi ý nơi tiếp nhận phù hợp.",
          "Describe the issue in your own words. The system will suggest the right service team."
        )}
      />

      <form className="intake-layout" onSubmit={submit}>
        <section className="panel intake-form">
          <div className="section-heading">
            <span className="step-index">01</span>
            <div>
              <h2>{text("Nội dung yêu cầu", "Request details")}</h2>
              <p>{text("Chỉ cần những thông tin giúp người xử lý hiểu đúng vấn đề.", "Share what the service team needs to understand the issue.")}</p>
            </div>
          </div>
          <div className="form-grid">
            <label className="field field-wide">
              <span>{text("Tiêu đề", "Title")}</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={text("Ví dụ: Không đăng nhập được cổng sinh viên", "Example: I cannot sign in to the student portal")}
                maxLength={160}
              />
            </label>
            <label className="field field-wide">
              <span>{text("Mô tả chi tiết", "Details")}</span>
              <textarea
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value);
                  setAnalysis(null);
                }}
                placeholder={text(
                  "Mô tả vấn đề, thời điểm xảy ra và kết quả bạn mong muốn...",
                  "Describe what happened, when it happened, and the outcome you need..."
                )}
                rows={8}
                required
                minLength={12}
                maxLength={5000}
              />
              <small>{description.length}/5,000 {text("ký tự", "characters")}</small>
            </label>
            <label className="field">
              <span>{text("Kênh tiếp nhận", "Intake channel")}</span>
              <select value={channel} onChange={(event) => setChannel(event.target.value)}>
                <option value="portal">{text("Cổng trực tuyến", "Portal")}</option>
                <option value="phone">{text("Điện thoại", "Phone")}</option>
                <option value="email">Email</option>
                <option value="walk_in">{text("Tiếp nhận trực tiếp", "Walk-in")}</option>
                <option value="api">{text("Hệ thống tích hợp", "Integrated system")}</option>
              </select>
            </label>
            <label className="field">
              <span>{text("Mức ưu tiên", "Priority")}</span>
              <select value={priority} onChange={(event) => setPriority(event.target.value)}>
                <option value="low">{text("Thấp", "Low")}</option>
                <option value="normal">{text("Bình thường", "Normal")}</option>
                <option value="high">{text("Cao", "High")}</option>
                <option value="urgent">{text("Khẩn cấp", "Urgent")}</option>
              </select>
            </label>
            <label className="field field-wide">
              <span>{text("Dịch vụ", "Service")}</span>
              <select aria-label={text("Dịch vụ", "Service")} value={serviceKey} onChange={(event) => setServiceKey(event.target.value)}>
                <option value="">{text("Tiếp nhận chung", "General intake")}</option>
                {serviceData?.services.map((service) => (
                  <option key={service.key} value={service.key}>
                    {service.name} · {service.team}
                  </option>
                ))}
              </select>
            </label>
            {selectedService?.requiredFields.map((field) => <label className="field" key={field}><span>{field}</span><input required maxLength={2000} value={customFields[field] || ""} onChange={(event) => setCustomFields({ ...customFields, [field]: event.target.value })} /></label>)}
          </div>
          <FileUploadArea
            files={files}
            onFilesChange={setFiles}
            label={text("Tài liệu đính kèm", "Attachments")}
            helperText={text(
              "PDF, DOCX, XLSX, PNG hoặc JPG · tối đa 10 MB mỗi tệp",
              "PDF, DOCX, XLSX, PNG or JPG · up to 10 MB per file"
            )}
            selectLabel={text("Chọn tệp", "Choose files")}
            removeLabel={text("Xóa tệp", "Remove file")}
          />
          {error ? <ErrorState message={error} /> : null}
          <div className="form-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={analyze}
              disabled={analyzing || description.trim().length < 12}
            >
              {analyzing ? <span className="spinner" /> : <Sparkles size={17} />}
              {analyzing ? text("Đang phân tích", "Analyzing") : text("Phân tích bằng AI", "Analyze with AI")}
            </button>
            <button className="button button-primary" disabled={submitting || description.trim().length < 12}>
              {submitting ? <span className="spinner spinner-light" /> : null}
              {text("Tạo hồ sơ", "Create request")}
              {!submitting ? <ArrowRight size={17} /> : null}
            </button>
          </div>
        </section>

        <aside className="panel ai-preview">
          {citations.length > 0 && <section className="analysis-content">
            <h2>{text("Tài liệu liên quan", "Related guidance")}</h2>
            {citations.map(item => <details key={item.id}><summary>{item.title}</summary><p>{item.excerpt}</p><small>{item.sourceLabel}</small></details>)}
          </section>}
          <div className="panel-heading">
            <div>
              <span className="eyebrow">{text("Gợi ý tiếp nhận", "Intake guidance")}</span>
              <h2>{text("Kết quả phân tích", "Analysis result")}</h2>
            </div>
            <span className="ai-label">
              <Sparkles size={14} /> AI
            </span>
          </div>
          {analysis ? (
            <div className="analysis-content">
              <div className="confidence-block">
                <div>
                  <span>{text("Phân loại đề xuất", "Suggested category")}</span>
                  <strong>{analysis.service?.name || analysis.classification.label}</strong>
                </div>
                <span>{Math.round(analysis.classification.confidence * 100)}%</span>
              </div>
              <div className="confidence-track">
                <span style={{ width: `${analysis.classification.confidence * 100}%` }} />
              </div>
              <div className="analysis-item">
                <CheckCircle2 size={17} />
                <div>
                  <strong>{text("Đơn vị tiếp nhận", "Service team")}</strong>
                  <span>{analysis.service?.team || text("Trung tâm Dịch vụ", "Service Center")}</span>
                </div>
              </div>
              <div className="analysis-item">
                <SearchCheck size={17} />
                <div>
                  <strong>{text("Thông tin trích xuất", "Extracted details")}</strong>
                  <span>
                    {Object.keys(analysis.classification.extracted).length
                      ? Object.values(analysis.classification.extracted).join(" · ")
                      : text("Chưa phát hiện trường dữ liệu đặc biệt", "No additional fields detected")}
                  </span>
                </div>
              </div>
              <div className="analysis-item">
                <TriangleAlert size={17} />
                <div>
                  <strong>{text("Yêu cầu tương tự", "Similar requests")}</strong>
                  <span>
                    {analysis.similar.length
                      ? text(
                          `${analysis.similar.length} hồ sơ đang mở có nội dung gần giống`,
                          `${analysis.similar.length} open request${analysis.similar.length === 1 ? "" : "s"} with similar content`
                        )
                      : text("Không có cụm trùng đáng kể", "No meaningful duplicate cluster found")}
                  </span>
                </div>
              </div>
              {analysis.similar.length ? (
                <div className="similar-list">
                  {analysis.similar.slice(0, 3).map((item) => (
                    <div key={item.id}>
                      <span>{Math.round(item.score * 100)}%</span>
                      <strong>{item.title}</strong>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="model-note">
                {text("Nguồn phân tích", "Analysis source")}: {analysis.classification.provider === "ml-service"
                  ? text("mô hình ML", "ML model")
                  : text("bộ phân loại dự phòng", "fallback classifier")}
              </div>
              {analysis.needsReview ? (
                <div className="analysis-review-note">
                  <TriangleAlert size={16} />
                  <span>{text("Độ tin cậy chưa đủ để tự chọn dịch vụ. Nhân viên sẽ xác nhận phân luồng.", "Confidence is too low for automatic routing. A staff member will review it.")}</span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="ai-placeholder">
              <Sparkles size={28} />
              <strong>{text("Chưa có kết quả", "No analysis yet")}</strong>
              <span>{text("Nhập mô tả rồi chạy phân tích để xem gợi ý.", "Add a description, then run the analysis to see guidance.")}</span>
            </div>
          )}
        </aside>
      </form>
    </div>
  );
}
