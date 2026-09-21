import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Download,
  MessageSquareText,
  Paperclip,
  Send,
  Sparkles,
  Star,
  RotateCcw,
  UserRound,
  UsersRound
} from "lucide-react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api, apiBlob } from "../api";
import { useAuth } from "../auth";
import {
  ErrorState,
  FileUploadArea,
  formatDate,
  formatRelative,
  LoadingState,
  PriorityBadge,
  RiskBadge,
  StatusBadge
} from "../components/ui";
import { useApiData } from "../hooks/useApiData";
import { AssignmentSuggestions } from "../components/AssignmentSuggestions";
import { useLocale } from "../i18n";
import type { Attachment, CaseRecord, CaseStatus, ServiceDefinition, User } from "../types";

const statusOptions: Array<{ value: CaseStatus; vi: string; en: string }> = [
  { value: "new", vi: "Mới", en: "New" },
  { value: "triaged", vi: "Đã phân loại", en: "Triaged" },
  { value: "in_progress", vi: "Đang xử lý", en: "In progress" },
  { value: "waiting", vi: "Đang chờ", en: "Waiting" },
  { value: "resolved", vi: "Đã giải quyết", en: "Resolved" },
  { value: "closed", vi: "Đã đóng", en: "Closed" }
];
const transitions: Record<CaseStatus, CaseStatus[]> = {
  new: ["triaged"],
  triaged: ["in_progress", "waiting"],
  in_progress: ["waiting", "resolved"],
  waiting: ["in_progress", "resolved"],
  resolved: ["closed", "in_progress"],
  closed: ["in_progress"]
};

const channelLabels: Record<string, { vi: string; en: string }> = {
  portal: { vi: "Cổng trực tuyến", en: "Portal" },
  phone: { vi: "Điện thoại", en: "Phone" },
  email: { vi: "Email", en: "Email" },
  walk_in: { vi: "Tiếp nhận trực tiếp", en: "Walk-in" },
  api: { vi: "Hệ thống tích hợp", en: "Integrated system" }
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function CaseDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const { locale, text } = useLocale();
  const { data, loading, error, reload, setData } = useApiData<{ case: CaseRecord }>(`/cases/${id}`);
  const {
    data: attachmentData,
    error: attachmentLoadError,
    reload: reloadAttachments
  } = useApiData<{ attachments: Attachment[] }>(`/cases/${id}/attachments`);
  const [agents, setAgents] = useState<User[]>([]);
  const [services, setServices] = useState<ServiceDefinition[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [comment, setComment] = useState("");
  const [internal, setInternal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachmentError, setAttachmentError] = useState("");
  const [actionError, setActionError] = useState("");
  const [satisfactionComment, setSatisfactionComment] = useState("");
  const canOperate = user?.role !== "requester";

  useEffect(() => {
    if (!canOperate) return;
    Promise.all([
      api<{ users: User[] }>("/users"),
      api<{ services: ServiceDefinition[] }>("/services")
    ])
      .then(([userResponse, serviceResponse]) => {
        setAgents(userResponse.users.filter((item) => item.role === "agent"));
        setServices(serviceResponse.services);
      })
      .catch(() => {
        setAgents([]);
        setServices([]);
      });
  }, [canOperate]);

  if (loading) return <LoadingState label={text("Đang tải hồ sơ", "Loading request")} />;
  if (error || !data) return <ErrorState message={error || text("Không tìm thấy hồ sơ.", "Request not found.")} onRetry={reload} />;

  const record = data.case;
  const aiReviewPending = !record.ai.reviewStatus || record.ai.reviewStatus === "pending";
  const uploadWarning = (location.state as { uploadWarning?: string } | null)?.uploadWarning;

  async function updateCase(payload: Record<string, unknown>) {
    if (saving) return;
    setSaving(true);
    setActionError("");
    try {
      const response = await api<{ case: CaseRecord }>(`/cases/${record._id}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      setData(response);
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : text("Không thể cập nhật hồ sơ.", "We could not update this request."));
    } finally {
      setSaving(false);
    }
  }

  async function addComment(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !comment.trim()) return;
    setSaving(true);
    setActionError("");
    try {
      const response = await api<{ case: CaseRecord }>(`/cases/${record._id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: comment, internal })
      });
      setData(response);
      setComment("");
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : text("Không thể gửi phản hồi.", "We could not send your reply."));
    } finally {
      setSaving(false);
    }
  }

  async function requesterAction(action: "close" | "reopen" | "satisfaction", payload?: Record<string, unknown>) {
    if (saving) return;
    setSaving(true);
    setActionError("");
    try {
      const response = await api<{ case: CaseRecord }>(`/cases/${record._id}/${action}`, {
        method: "POST",
        ...(payload ? { body: JSON.stringify(payload) } : {})
      });
      setData(response);
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : text("Không thể cập nhật hồ sơ.", "We could not update this request."));
    } finally {
      setSaving(false);
    }
  }

  async function uploadAttachments() {
    if (!files.length) return;
    setUploading(true);
    setAttachmentError("");
    try {
      const failed: string[] = [];
      for (const file of files) {
        try {
          await api(`/cases/${record._id}/attachments`, {
            method: "POST",
            headers: {
              "Content-Type": "application/octet-stream",
              "X-Filename": encodeURIComponent(file.name)
            },
            body: file
          });
        } catch {
          failed.push(file.name);
        }
      }
      setFiles([]);
      await Promise.all([reloadAttachments(), reload()]);
      if (failed.length) {
        setAttachmentError(
          text(
            `Không thể tải lên: ${failed.join(", ")}.`,
            `Unable to upload: ${failed.join(", ")}.`
          )
        );
      }
    } catch (requestError) {
      setAttachmentError(
        requestError instanceof Error
          ? requestError.message
          : text("Không thể làm mới danh sách tệp.", "Unable to refresh the file list.")
      );
    } finally {
      setUploading(false);
    }
  }

  async function downloadAttachment(attachment: Attachment) {
    setAttachmentError("");
    try {
      const blob = await apiBlob(`/attachments/${attachment._id}/download`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = attachment.originalName;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (requestError) {
      setAttachmentError(
        requestError instanceof Error
          ? requestError.message
          : text("Không thể tải tệp.", "Unable to download the file.")
      );
    }
  }

  return (
    <div className="page-stack">
      <div className="detail-header">
        <div>
          <Link to="/cases" className="back-link">
            <ArrowLeft size={17} />
            {text("Quay lại hàng đợi", "Back to queue")}
          </Link>
          <div className="detail-title-row">
            <span className="case-code">{record.code}</span>
            <StatusBadge status={record.status} />
          </div>
          <h1>{record.title}</h1>
          <p>
            {text("Tạo bởi", "Created by")} {record.requesterName} · {formatDate(record.createdAt)}
          </p>
        </div>
        <div className="detail-header-actions">
          <PriorityBadge priority={record.priority} />
          <RiskBadge score={record.ai.riskScore} />
        </div>
      </div>

      {canOperate ? (
        <section className="action-bar">
          <label>
            <span>{text("Trạng thái", "Status")}</span>
            <select
              value={record.status}
              aria-label={text("Trạng thái", "Status")}
              onChange={(event) => updateCase({ status: event.target.value })}
              disabled={saving}
            >
              {statusOptions.filter((option) => option.value === record.status || (!aiReviewPending && transitions[record.status].includes(option.value) && (!["in_progress", "resolved"].includes(option.value) || Boolean(record.assigneeId)))).map((option) => (
                <option key={option.value} value={option.value}>
                  {option[locale]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{text("Dịch vụ", "Service")}</span>
            <select
              value={record.serviceKey}
              aria-label={text("Dịch vụ", "Service")}
              onChange={(event) => updateCase({ serviceKey: event.target.value })}
              disabled={saving}
            >
              {services.map((service) => (
                <option key={service.key} value={service.key}>
                  {service.name} · {service.team}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{text("Người xử lý", "Assignee")}</span>
            <select
              value={record.assigneeId || ""}
              aria-label={text("Người xử lý", "Assignee")}
              onChange={(event) => updateCase({ assigneeId: event.target.value || null })}
              disabled={saving}
            >
              <option value="">{text("Chưa phân công", "Unassigned")}</option>
              {agents
                .filter((agent) => !record.team || agent.team === record.team || agent.id === record.assigneeId)
                .map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name} · {agent.team}
                  </option>
                ))}
            </select>
          </label>
          <span className="action-spacer" />
          {aiReviewPending ? (
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={() => updateCase({ confirmAi: true })}
              disabled={saving}
            >
              <CheckCircle2 size={16} />
              {text("Xác nhận phân luồng", "Confirm routing")}
            </button>
          ) : null}
          {saving ? <span className="saving-label"><span className="spinner" /> {text("Đang lưu", "Saving")}</span> : null}
        </section>
      ) : null}

      {actionError ? <ErrorState message={actionError} /> : null}
      {uploadWarning ? <ErrorState message={uploadWarning} /> : null}
      {(location.state as { created?: boolean } | null)?.created ? <div role="status" className="analysis-review-note">{text("Đã tiếp nhận hồ sơ. Bạn có thể theo dõi tiến độ và bổ sung thông tin tại đây.", "Request received. Track progress and add information here.")}</div> : null}

      <div className="case-detail-grid">
        <div className="case-main-column">
          <section className="panel case-description">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">{text("Nội dung", "Request")}</span>
                <h2>{text("Mô tả yêu cầu", "Request details")}</h2>
              </div>
              <span className="channel-label">{channelLabels[record.channel]?.[locale] || record.channel.replace("_", " ")}</span>
            </div>
            <p>{record.description}</p>
            {Object.keys(record.customFields || {}).length ? <dl className="case-custom-fields">{Object.entries(record.customFields || {}).map(([field, value]) => <div key={field}><dt>{field}</dt><dd>{value}</dd></div>)}</dl> : null}
          </section>

          {!canOperate && ["resolved", "closed"].includes(record.status) ? (
            <section className="panel requester-resolution-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">{text("Hoàn tất yêu cầu", "Request completion")}</span>
                  <h2>{text("Kết quả xử lý", "Resolution outcome")}</h2>
                </div>
                <CheckCircle2 size={19} className="muted-icon" />
              </div>
              <p>{text("Xác nhận khi vấn đề đã được xử lý, hoặc mở lại để nhân viên tiếp tục hỗ trợ.", "Confirm when the issue is resolved, or reopen it for further support.")}</p>
              {record.status === "resolved" ? (
                <div className="button-row">
                  <button type="button" className="button button-primary button-small" onClick={() => requesterAction("close")} disabled={saving}>
                    <CheckCircle2 size={16} />{text("Xác nhận đóng", "Confirm close")}
                  </button>
                  <button type="button" className="button button-secondary button-small" onClick={() => requesterAction("reopen")} disabled={saving}>
                    <RotateCcw size={16} />{text("Yêu cầu mở lại", "Reopen request")}
                  </button>
                </div>
              ) : (
                <div className="button-row">
                  <button type="button" className="button button-secondary button-small" onClick={() => requesterAction("reopen")} disabled={saving}>
                    <RotateCcw size={16} />{text("Mở lại yêu cầu", "Reopen request")}
                  </button>
                </div>
              )}
              <div className="satisfaction-form">
                <strong>{text("Mức độ hài lòng", "Satisfaction")}</strong>
                <div className="rating-buttons" aria-label={text("Đánh giá mức độ hài lòng", "Rate your satisfaction")}>
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <button key={rating} type="button" className={`icon-button ${record.satisfaction === rating ? "is-selected" : ""}`} onClick={() => requesterAction("satisfaction", { rating, comment: satisfactionComment })} disabled={saving} title={`${rating}/5`} aria-label={`${rating}/5`}>
                      <Star size={18} fill={record.satisfaction && record.satisfaction >= rating ? "currentColor" : "none"} />
                    </button>
                  ))}
                </div>
                <textarea value={satisfactionComment} onChange={(event) => setSatisfactionComment(event.target.value)} rows={2} maxLength={1000} placeholder={text("Nhận xét thêm (không bắt buộc)", "Optional feedback")} />
                {record.satisfaction ? <small>{text(`Bạn đã đánh giá ${record.satisfaction}/5. Có thể chọn lại để cập nhật.`, `You rated this ${record.satisfaction}/5. Select another rating to update.`)}</small> : null}
              </div>
            </section>
          ) : null}

          <section className="panel attachment-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">{text("Tài liệu", "Files")}</span>
                <h2>{text("Tệp đính kèm", "Attachments")}</h2>
              </div>
              <Paperclip size={19} className="muted-icon" />
            </div>
            {attachmentData?.attachments.length ? (
              <div className="attachment-list">
                {attachmentData.attachments.map((attachment) => (
                  <article key={attachment._id}>
                    <span className="attachment-file-icon"><Paperclip size={16} /></span>
                    <div>
                      <strong>{attachment.originalName}</strong>
                      <span>
                        {formatFileSize(attachment.size)} · {attachment.uploaderName} · {formatRelative(attachment.createdAt)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => downloadAttachment(attachment)}
                      title={text("Tải tệp", "Download file")}
                      aria-label={`${text("Tải tệp", "Download file")}: ${attachment.originalName}`}
                    >
                      <Download size={17} />
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="inline-empty">{text("Chưa có tệp đính kèm.", "No files have been attached.")}</div>
            )}
            <div className="attachment-upload">
              <FileUploadArea
                files={files}
                onFilesChange={setFiles}
                label={text("Thêm tài liệu", "Add files")}
                helperText={text(
                  "PDF, DOCX, XLSX, PNG hoặc JPG · tối đa 10 MB mỗi tệp",
                  "PDF, DOCX, XLSX, PNG or JPG · up to 10 MB per file"
                )}
                selectLabel={text("Chọn tệp", "Choose files")}
                removeLabel={text("Xóa tệp", "Remove file")}
              />
              <button
                type="button"
                className="button button-secondary button-small"
                onClick={uploadAttachments}
                disabled={!files.length || uploading}
              >
                {uploading ? <span className="spinner" /> : <Paperclip size={16} />}
                {uploading ? text("Đang tải lên", "Uploading") : text("Tải tệp lên", "Upload files")}
              </button>
            </div>
            {attachmentLoadError || attachmentError ? (
              <div className="form-error" role="alert">{attachmentError || attachmentLoadError}</div>
            ) : null}
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">{text("Trao đổi", "Conversation")}</span>
                <h2>{text("Phản hồi và ghi chú", "Replies and notes")}</h2>
              </div>
              <MessageSquareText size={19} className="muted-icon" />
            </div>
            <div className="comment-list">
              {record.comments?.map((item) => (
                <article className={`comment ${item.internal ? "comment-internal" : ""}`} key={item._id}>
                  <div>
                    <strong>{item.authorName}</strong>
                    {item.internal ? <span>{text("Ghi chú nội bộ", "Internal note")}</span> : null}
                    <time>{formatRelative(item.createdAt)}</time>
                  </div>
                  <p>{item.body}</p>
                </article>
              ))}
              {!record.comments?.length ? (
                <div className="inline-empty">{text("Chưa có phản hồi trong hồ sơ này.", "There are no replies yet.")}</div>
              ) : null}
            </div>
            <form className="comment-form" onSubmit={addComment}>
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder={text("Nhập phản hồi hoặc cập nhật tiến độ...", "Write a reply or share a progress update...")}
                rows={3}
              />
              <div>
                {canOperate ? (
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={internal}
                      onChange={(event) => setInternal(event.target.checked)}
                    />
                    <span>{text("Ghi chú nội bộ", "Internal note")}</span>
                  </label>
                ) : (
                  <span />
                )}
                <button className="button button-primary button-small" disabled={saving || !comment.trim()}>
                  <Send size={16} />
                  {text("Gửi", "Send")}
                </button>
              </div>
            </form>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">{text("Dòng thời gian", "Timeline")}</span>
                <h2>{text("Lịch sử xử lý", "Request history")}</h2>
              </div>
              <Clock3 size={19} className="muted-icon" />
            </div>
            <ol className="timeline">
              {[...(record.events || [])]
                .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
                .map((event) => (
                  <li key={event._id || `${event.type}-${event.createdAt}`}>
                    <span className="timeline-marker">
                      {event.type === "resolved" ? <CheckCircle2 size={14} /> : <span />}
                    </span>
                    <div>
                      <strong>{event.label}</strong>
                      <span>{event.actorName}</span>
                    </div>
                    <time>{formatDate(event.createdAt)}</time>
                  </li>
                ))}
            </ol>
          </section>
        </div>

        <aside className="case-side-column">
          {canOperate && !["resolved", "closed"].includes(record.status) ? <AssignmentSuggestions caseId={record._id} revision={record.updatedAt} saving={saving} onAssign={(assigneeId) => updateCase({ assigneeId })} /> : null}
          <section className="panel ai-insight-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">{text("Tín hiệu hỗ trợ", "Service signals")}</span>
                <h2>{text("Phân tích AI", "AI analysis")}</h2>
              </div>
              <span className="ai-label">
                <Sparkles size={14} /> AI
              </span>
            </div>
            <div className="risk-score-block">
              <div
                className="risk-ring"
                style={{ "--risk": `${record.ai.riskScore * 360}deg` } as React.CSSProperties}
              >
                <span>{Math.round(record.ai.riskScore * 100)}%</span>
              </div>
              <div>
                <strong>{text("Nguy cơ trễ SLA", "SLA breach risk")}</strong>
                <span>
                  {record.ai.riskScore >= 0.7
                    ? text("Cần can thiệp sớm", "Early action recommended")
                    : record.ai.riskScore >= 0.4
                      ? text("Cần tiếp tục theo dõi", "Keep monitoring")
                      : text("Đang trong giới hạn", "Within target")}
                </span>
              </div>
            </div>
            <div className="ai-summary">
              <BrainCircuit size={17} />
              <p>{record.ai.summary}</p>
            </div>
            <div className="factor-list">
              <strong>{text("Yếu tố ảnh hưởng", "Contributing factors")}</strong>
              {record.ai.riskFactors?.length ? (
                record.ai.riskFactors.map((factor) => (
                  <div key={factor}>
                    <span />
                    {factor}
                  </div>
                ))
              ) : (
                <small>{text("Chưa phát hiện yếu tố rủi ro đáng kể.", "No significant risk factors detected.")}</small>
              )}
            </div>
            <div className="confidence-row">
              <span>{text("Độ tin cậy phân loại", "Classification confidence")}</span>
              <strong>{Math.round(record.ai.confidence * 100)}%</strong>
            </div>
            <div className={`ai-review-row ai-review-${record.ai.reviewStatus || "pending"}`}>
              <CheckCircle2 size={15} />
              <div>
                <strong>
                  {aiReviewPending
                    ? text("Đang chờ xác nhận", "Awaiting review")
                    : record.ai.reviewStatus === "corrected"
                      ? text("Đã được điều chỉnh", "Corrected by staff")
                      : text("Đã được xác nhận", "Confirmed by staff")}
                </strong>
                <span>
                  {aiReviewPending
                    ? text("AI chỉ đưa ra đề xuất, chưa tự giao hồ sơ.", "AI has suggested a route but has not assigned the request.")
                    : record.ai.reviewedByName || text("Nhân viên xử lý", "Service staff")}
                </span>
              </div>
            </div>
          </section>

          <section className="panel case-metadata">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">{text("Thông tin xử lý", "Handling details")}</span>
                <h2>{text("Chi tiết hồ sơ", "Request information")}</h2>
              </div>
            </div>
            <dl>
              <div>
                <dt><UsersRound size={16} /> {text("Đơn vị", "Team")}</dt>
                <dd>{record.team}</dd>
              </div>
              <div>
                <dt><UserRound size={16} /> {text("Người xử lý", "Assignee")}</dt>
                <dd>{record.assigneeName || text("Chưa phân công", "Unassigned")}</dd>
              </div>
              <div>
                <dt><CalendarClock size={16} /> {text("Hạn xử lý", "Due date")}</dt>
                <dd>{formatDate(record.dueAt)}</dd>
              </div>
              <div>
                <dt><Clock3 size={16} /> {text("Còn lại", "Time remaining")}</dt>
                <dd>{formatRelative(record.dueAt)}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
