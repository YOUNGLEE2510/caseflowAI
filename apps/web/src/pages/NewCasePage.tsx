import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, FileText, Gauge, SearchCheck, Sparkles, TriangleAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { ErrorState, FileUploadArea, PageHeader } from "../components/ui";
import { useApiData } from "../hooks/useApiData";
import { useLocale } from "../i18n";
import type { ServiceDefinition } from "../types";
import { useAuth } from "../auth";
import { useConfirmation } from "../components/ConfirmationProvider";
import { categoryLabels } from "../utils/labels";
import { RecommendationPanel } from "../components/RecommendationPanel";
import { retainServiceFields } from "../utils/serviceFields";
import { AiHiddenNotice } from "../components/AiHiddenNotice";

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
  prioritySuggestion?: { priority: "low" | "normal" | "high" | "urgent"; reasons: string[] };
  service?: ServiceDefinition;
  needsReview: boolean;
}

type CaseDraft = { title: string; description: string; serviceKey: string; customFields: Record<string, string>; propertyCode: string;
  unitCode: string; assetCode: string; priority: string; channel: string; requesterId: string; savedAt: string };

function readDraft(key: string): CaseDraft | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || "null") as Partial<CaseDraft> | null;
    if (!value || typeof value !== "object") return null;
    const str = (input: unknown) => (typeof input === "string" ? input : "");
    const fields = value.customFields && typeof value.customFields === "object"
      ? Object.fromEntries(Object.entries(value.customFields).filter(([, item]) => typeof item === "string")) as Record<string, string> : {};
    return { title: str(value.title).slice(0, 200), description: str(value.description).slice(0, 5000), serviceKey: str(value.serviceKey), customFields: fields,
      propertyCode: str(value.propertyCode), unitCode: str(value.unitCode), assetCode: str(value.assetCode), priority: str(value.priority) || "normal",
      channel: str(value.channel) || "portal", requesterId: str(value.requesterId), savedAt: str(value.savedAt) };
  } catch {
    return null;
  }
}

export function NewCasePage() {
  const navigate = useNavigate();
  const { locale, text } = useLocale();
  const { user } = useAuth();
  const confirm = useConfirmation();
  const { data: serviceData } = useApiData<{ services: ServiceDefinition[] }>("/services");
  // The draft lives in this tab's sessionStorage: it survives moving between pages and is gone when the tab closes.
  const draftKey = `caseflow.draft.new-case.${user?.id || "anonymous"}`;
  const aiHidden = Boolean(user?.aiSuggestionsHidden && user.role !== "requester");
  const [initialDraft] = useState(() => readDraft(draftKey));
  const [title, setTitle] = useState(initialDraft?.title || "");
  const [description, setDescription] = useState(initialDraft?.description || "");
  const [serviceKey, setServiceKey] = useState(initialDraft?.serviceKey || "");
  const [customFields, setCustomFields] = useState<Record<string, string>>(initialDraft?.customFields || {});
  const [propertyCode, setPropertyCode] = useState(initialDraft?.propertyCode || "");
  const [unitCode, setUnitCode] = useState(initialDraft?.unitCode || "");
  const [assetCode, setAssetCode] = useState(initialDraft?.assetCode || "");
  const [draftRestoredAt, setDraftRestoredAt] = useState(initialDraft?.savedAt || "");
  const { data: catalog } = useApiData<{
    properties: { code: string; name: string }[];
    units: { propertyCode: string; code: string }[];
    assets: { propertyCode: string; unitCode: string; code: string; name: string }[];
  }>("/rental/catalog");
  // A resident linked to exactly one unit does not need to pick it every time.
  useEffect(() => {
    if (user?.role !== "requester" || propertyCode || unitCode || catalog?.units.length !== 1) return;
    setPropertyCode(catalog.units[0].propertyCode);
    setUnitCode(catalog.units[0].code);
  }, [user?.role, catalog, propertyCode, unitCode]);
  const selectedService = serviceData?.services.find((service) => service.key === serviceKey);
  function changeService(key: string) {
    setServiceKey(key);
    const allowed = serviceData?.services.find(service => service.key === key)?.requiredFields || [];
    setCustomFields(current => retainServiceFields(current, allowed));
  }
  const [priority, setPriority] = useState(initialDraft?.priority || "normal");
  const [channel, setChannel] = useState(initialDraft?.channel || "portal");
  const [requesterId, setRequesterId] = useState(initialDraft?.requesterId || "");
  const [requesterSearch, setRequesterSearch] = useState("");
  const [requesterOptions, setRequesterOptions] = useState<Array<{ _id: string; name: string }>>([]);
  useEffect(() => {
    if (user?.role === "requester" || requesterSearch.trim().length < 2) { setRequesterOptions([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void api<{ users: Array<{ _id: string; name: string }> }>(`/cases/requester-options?search=${encodeURIComponent(requesterSearch.trim())}`, { signal: controller.signal })
        .then(result => { if (!controller.signal.aborted) setRequesterOptions(result.users); })
        .catch(() => { if (!controller.signal.aborted) setRequesterOptions([]); });
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [requesterSearch, user?.role]);
  const [files, setFiles] = useState<File[]>([]);
  const hasDraft = Boolean(title.trim() || description.trim() || Object.values(customFields).some(value => value.trim()));
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        if (!hasDraft) { sessionStorage.removeItem(draftKey); return; }
        sessionStorage.setItem(draftKey, JSON.stringify({ title, description, serviceKey, customFields, propertyCode, unitCode, assetCode,
          priority, channel, requesterId, savedAt: new Date().toISOString() } satisfies CaseDraft));
      } catch { /* Storage can be unavailable; the form still works. */ }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [draftKey, hasDraft, title, description, serviceKey, customFields, propertyCode, unitCode, assetCode, priority, channel, requesterId]);
  useEffect(() => {
    // Closing or reloading the tab would lose attached files and the draft itself.
    if (!hasDraft) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasDraft]);
  function discardDraft() {
    try { sessionStorage.removeItem(draftKey); } catch { /* ignore */ }
    setTitle(""); setDescription(""); setServiceKey(""); setCustomFields({}); setPropertyCode(""); setUnitCode(""); setAssetCode("");
    setPriority("normal"); setChannel("portal"); setRequesterId(""); setDraftRestoredAt("");
  }
  const submission = useRef<{ body: string; key: string } | null>(null);
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
    } catch (requestError) {
      if (controller.signal.aborted) return;
      setError(requestError instanceof Error ? requestError.message : text("Không thể phân tích yêu cầu.", "We could not analyze this request."));
    } finally {
      if (!controller.signal.aborted) setAnalyzing(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!await confirm({ title: text("Gửi yêu cầu?", "Submit request?"), message: <><p>{title || description.slice(0, 120)}</p><p>{selectedService?.name || text("Tiếp nhận chung", "General intake")} · {files.length} {text("tệp đính kèm", "attachments")}</p></> })) return;
    setSubmitting(true);
    setError("");
    try {
      const body = JSON.stringify({ title, description, serviceKey: serviceKey || undefined, priority, channel, customFields,
        propertyCode: propertyCode.trim() || undefined, unitCode: unitCode.trim() || undefined,
        assetCode: assetCode || undefined,
        ...(requesterId ? { requesterId } : {}) });
      if (submission.current?.body !== body) submission.current = { body, key: crypto.randomUUID() };
      const response = await api<{ case: { _id: string } }>("/cases", {
        method: "POST",
        headers: { "Idempotency-Key": submission.current.key },
        body
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
      try { sessionStorage.removeItem(draftKey); } catch { /* ignore */ }
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

      {draftRestoredAt ? <div className="draft-notice" role="status">
        <span>{text(`Đã khôi phục bản nháp lưu lúc ${new Date(draftRestoredAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}. Tệp đính kèm cần chọn lại.`,
          `Restored the draft saved at ${new Date(draftRestoredAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}. Attach files again.`)}</span>
        <button type="button" className="button button-secondary button-small" onClick={discardDraft}>{text("Xoá nháp", "Discard draft")}</button>
      </div> : null}
      <form className="intake-layout" onSubmit={submit}>
        <section className="panel intake-form">
          <div className="section-heading">
            <span className="step-index"><FileText size={20} aria-hidden="true" /></span>
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
                placeholder={text("Ví dụ: Nước yếu tại căn A301 từ sáng nay", "Example: Low water pressure in unit A301 since this morning")}
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
            {user?.role !== "requester" ? <label className="field">
              <span>{text("Kênh tiếp nhận", "Intake channel")}</span>
              <select value={channel} onChange={(event) => setChannel(event.target.value)}>
                <option value="portal">{text("Cổng trực tuyến", "Portal")}</option>
                <option value="phone">{text("Điện thoại", "Phone")}</option>
                <option value="email">Email</option>
                <option value="walk_in">{text("Tiếp nhận trực tiếp", "Walk-in")}</option>
                <option value="api">{text("Hệ thống tích hợp", "Integrated system")}</option>
              </select>
            </label> : null}
            {user?.role !== "requester" ? <label className="field">
              <span>{text("Mức ưu tiên", "Priority")}</span>
              <select value={priority} onChange={(event) => setPriority(event.target.value)}>
                <option value="low">{text("Thấp", "Low")}</option>
                <option value="normal">{text("Bình thường", "Normal")}</option>
                <option value="high">{text("Cao", "High")}</option>
                <option value="urgent">{text("Khẩn cấp", "Urgent")}</option>
              </select>
            </label> : null}
            {user?.role !== "requester" ? <div className="field field-wide">
              <label htmlFor="requester-search">{text("Tìm người yêu cầu", "Find requester")}</label>
              <input id="requester-search" maxLength={80} value={requesterSearch} onChange={event => { setRequesterSearch(event.target.value); setRequesterId(""); }} />
              <select aria-label={text("Người yêu cầu", "Requester")} required={channel !== "portal"} value={requesterId} onChange={event => setRequesterId(event.target.value)}>
                <option value="">{text("Chính tôi", "Myself")}</option>
                {requesterOptions.map(person => <option key={person._id} value={person._id}>{person.name}</option>)}
              </select>
            </div> : null}
            <label className="field field-wide">
              <span>{text("Dịch vụ", "Service")}</span>
              <select aria-label={text("Dịch vụ", "Service")} value={serviceKey} onChange={(event) => changeService(event.target.value)}>
                <option value="">{text("Tiếp nhận chung", "General intake")}</option>
                {serviceData?.services.map((service) => (
                  <option key={service.key} value={service.key}>
                    {service.name} · {service.team}
                  </option>
                ))}
              </select>
            </label>
            <label className="field"><span>{text("Cơ sở", "Property")}</span>{catalog?.properties.length ?
              <select aria-label={text("Cơ sở", "Property")} required value={propertyCode} onChange={event => { setPropertyCode(event.target.value); setUnitCode(""); setAssetCode(""); }}>
                <option value="">{text("Chọn cơ sở", "Select property")}</option>{catalog.properties.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
              </select> : <input required={Boolean(unitCode)} maxLength={32} pattern="[A-Za-z0-9\-]{1,32}" value={propertyCode} onChange={event => setPropertyCode(event.target.value)} />}</label>
            <label className="field"><span>{text("Căn hộ", "Unit")}</span>{catalog?.properties.length ?
              <select aria-label={text("Căn hộ", "Unit")} required={user?.role === "requester"} value={unitCode} onChange={event => { setUnitCode(event.target.value); setAssetCode(""); }}>
                <option value="">{text("Khu vực chung / Chọn căn", "Common area / Select unit")}</option>
                {catalog.units.filter(item => item.propertyCode === propertyCode).map(item => <option key={item.code} value={item.code}>{item.code}</option>)}
              </select> : <input maxLength={32} pattern="[A-Za-z0-9\-]{1,32}" value={unitCode} onChange={event => setUnitCode(event.target.value)} />}</label>
            {catalog?.properties.length ? <p className="field-wide" role="note">{text("Có nguy hiểm trực tiếp: liên hệ đầu mối khẩn cấp của cơ sở; không chờ phản hồi trên web. Có cháy: gọi 114 từ nơi an toàn.", "Immediate danger: contact the property's emergency contact; do not wait for a web response. In a fire, call 114 from a safe location.")}</p> : null}
            {catalog?.properties.length ? <label className="field field-wide"><span>{text("Thiết bị liên quan", "Related asset")}</span>
              <select value={assetCode} onChange={event => setAssetCode(event.target.value)}><option value="">{text("Không rõ / Không áp dụng", "Unknown / Not applicable")}</option>
                {catalog.assets.filter(item => item.propertyCode === propertyCode && (!item.unitCode || item.unitCode === unitCode))
                  .map(item => <option key={item.code} value={item.code}>{item.name} · {item.code}</option>)}</select></label> : null}
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
            {!aiHidden && user?.role !== "requester" ? <button
              type="button"
              className="button button-secondary"
              title={description.trim().length < 12 ? text("Nhập mô tả ít nhất 12 ký tự để phân tích.", "Enter at least 12 characters to analyze.") : undefined}
              onClick={analyze}
              disabled={analyzing || description.trim().length < 12}
            >
              {analyzing ? <span className="spinner" /> : <Sparkles size={17} />}
              {analyzing ? text("Đang phân tích", "Analyzing") : text("Phân tích bằng AI", "Analyze with AI")}
            </button> : null}
            <button className="button button-primary" disabled={submitting || description.trim().length < 12}>
              {submitting ? <span className="spinner spinner-light" /> : null}
              {text("Tạo hồ sơ", "Create request")}
              {!submitting ? <ArrowRight size={17} /> : null}
            </button>
          </div>
        </section>

        <div className="page-stack" style={{ minWidth: 0 }}>
        {aiHidden ? <AiHiddenNotice /> : user?.role === "requester"
          ? <RecommendationPanel autoSuggest description={description} serviceKey={serviceKey} customFields={customFields} /> : null}
        {analysis && !aiHidden ? <aside className="panel ai-preview">
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
                  <strong>{analysis.service?.name || categoryLabels[analysis.classification.label]?.[locale] || analysis.classification.label}</strong>
                  {analysis.service && analysis.service.key !== serviceKey ? <button type="button" className="text-link" onClick={() => changeService(analysis.service!.key)}>{text("Chọn dịch vụ gợi ý", "Use suggested service")}</button> : null}
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
              {analysis.prioritySuggestion ? (
                <div className="analysis-item">
                  <Gauge size={17} />
                  <div>
                    <strong>{text("Mức ưu tiên gợi ý", "Suggested priority")}: {{
                      low: text("Thấp", "Low"), normal: text("Bình thường", "Normal"), high: text("Cao", "High"), urgent: text("Khẩn cấp", "Urgent")
                    }[analysis.prioritySuggestion.priority]}</strong>
                    <span>{analysis.prioritySuggestion.reasons.join(" · ")}</span>
                    {user?.role !== "requester" && analysis.prioritySuggestion.priority !== priority ? (
                      <button type="button" className="text-link" onClick={() => setPriority(analysis.prioritySuggestion!.priority)}>
                        {text("Dùng mức ưu tiên gợi ý", "Use suggested priority")}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
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
        </aside> : null}
        </div>
      </form>
    </div>
  );
}
