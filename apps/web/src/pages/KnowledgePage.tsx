import { useState } from "react";
import { BookMarked, ExternalLink, Search, Send, Sparkles, Plus, Pencil } from "lucide-react";
import { useAuth } from "../auth";
import { ArticleEditor } from "../components/AdminEditors";
import { Modal } from "../components/Modal";
import { api } from "../api";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "../components/ui";
import { useApiData } from "../hooks/useApiData";
import { useLocale } from "../i18n";
import type { KnowledgeArticle } from "../types";
import { ReadMore } from "../components/ReadMore";

interface SearchResult {
  generation?: { mode: string; reason?: string };
  answer: string;
  citations: Array<{
    id: string;
    title: string;
    sourceLabel: string;
    excerpt: string;
    score: number;
  }>;
}

export function KnowledgePage() {
  const { text } = useLocale();
  const { user } = useAuth();
  const canWrite = user?.role !== "requester";
  const canPublish = Boolean(user && ["manager", "org_admin", "platform_admin"].includes(user.role));
  const [editing, setEditing] = useState<KnowledgeArticle | "new" | null>(null);
  const [opened, setOpened] = useState<KnowledgeArticle | null>(null);
  const { data, loading, error, reload } = useApiData<{ articles: KnowledgeArticle[] }>("/knowledge");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [generate, setGenerate] = useState(false);
  const { data: capabilities } = useApiData<{ generation: boolean }>("/knowledge/capabilities");

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (searching || query.trim().length < 3) return;
    setSearching(true);
    setSearchError("");
    setResult(null);
    try {
      setResult(
        await api<SearchResult>("/knowledge/search", {
          method: "POST",
          body: JSON.stringify({ query, generate: generate && capabilities?.generation })
        })
      );
    } catch (requestError) {
      setSearchError(requestError instanceof Error ? requestError.message : text("Không thể tìm tài liệu.", "We could not search the knowledge base."));
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title={text("Kho tri thức", "Knowledge base")}
        actions={canWrite ? <button className="button button-primary" onClick={() => setEditing("new")}><Plus size={16} />{text("Thêm tài liệu", "Add document")}</button> : undefined}
        description={text(
          "Tra cứu nhanh các quy trình và tài liệu đã được tổ chức kiểm duyệt.",
          "Find answers in procedures and documents reviewed by your organization."
        )}
      />

      <section className="knowledge-search knowledge-search-premium">
        <div className="knowledge-search-heading">
          <span className="ai-label">
            <Sparkles size={14} /> {text("AI có nguồn dẫn", "Grounded AI")}
          </span>
          <h2>{text("Tra cứu nghiệp vụ", "Ask the knowledge base")}</h2>
        </div>
        <form onSubmit={search} className="knowledge-query-bar">
          <Search size={19} />
          <input
            aria-label={text("Câu hỏi tra cứu", "Knowledge query")}
            disabled={searching}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={text("Ví dụ: Sinh viên quên mật khẩu cần làm gì?", "Example: What should a student do after forgetting a password?")}
          />
          <button className="button button-primary" disabled={searching || query.trim().length < 3}>
            {searching ? <span className="spinner spinner-light" /> : <Send size={16} />}
            {text("Tra cứu", "Search")}
          </button>
        </form>
        {searchError ? <ErrorState message={searchError} /> : null}
        {capabilities?.generation ? <label className="checkbox-field"><input type="checkbox" checked={generate} disabled={searching} onChange={(event) => setGenerate(event.target.checked)} />{text("Soạn bản nháp qua dịch vụ AI bên ngoài", "Draft using external AI service")}</label> : null}
        {result ? (
          <div className="knowledge-answer">
            {result.generation?.mode === "generated" ? <strong>{text("Bản nháp · Cần kiểm duyệt", "Draft · Review required")}</strong> : null}
            {result.generation?.reason ? <small>{result.generation.reason === "quota_exhausted"
              ? text("Dịch vụ AI bên ngoài đã hết hạn mức; đang hiển thị kết quả tra cứu nội bộ.", "The external AI service has no remaining quota; showing internal retrieval results.")
              : text("Đang hiển thị kết quả tra cứu nội bộ.", "Showing internal retrieval results.")}</small> : null}
            <p>{result.answer}</p>
            <div className="citation-list">
              {result.citations.map((citation, index) => (
                <article key={citation.id}>
                  <header>
                    <BookMarked size={17} />
                    <strong>[S{index + 1}] {citation.title}</strong>
                    <span>{Math.round(citation.score * 100)}%</span>
                  </header>
                  <p>{citation.excerpt}</p>
                  <footer>{citation.sourceLabel}</footer>
                </article>
              ))}
              {!result.citations.length ? (
                <div className="inline-empty">{text("Không có trích dẫn đủ liên quan để trả lời.", "No sufficiently relevant source was found.")}</div>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">{text("Tài liệu tổ chức", "Organization documents")}</span>
            <h2>{text("Danh mục tài liệu", "Document library")}</h2>
          </div>
          <span className="panel-kpi">{data?.articles.length || 0} {text("tài liệu", "documents")}</span>
        </div>
        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} onRetry={reload} /> : null}
        {!loading && !error && data ? (
          data.articles.length ? (
            <div className="article-list">
              {data.articles.map((article) => (
                <article key={article._id}>
                  <span className="article-icon">
                    <BookMarked size={18} />
                  </span>
                  <div>
                    <span className="article-category">{article.category.replace("_", " ")}</span>
                    <h3>{article.title}</h3>
                    <ReadMore text={article.content} limit={180} className="article-preview" />
                    <footer>
                      <span>{article.sourceLabel}</span>
                      <span>{text("Phiên bản", "Version")} {article.version}</span>
                      {canWrite ? <span>{article.status === "published" ? text("Đã duyệt", "Published") : text("Chờ duyệt", "Draft")}</span> : null}
                    </footer>
                  </div>
                  <button className="icon-button" onClick={() => setOpened(article)} title={text("Mở tài liệu", "Open document")} aria-label={text("Mở tài liệu", "Open document")}>
                    <ExternalLink size={17} />
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title={text("Kho tri thức đang trống", "The knowledge base is empty")}
              detail={text("Quản trị viên chưa thêm tài liệu.", "No documents have been added yet.")}
            />
          )
        ) : null}
      </section>
      {editing ? <ArticleEditor article={editing === "new" ? undefined : editing} canPublish={canPublish} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setResult(null); void reload(); }} /> : null}
      {opened ? <Modal title={opened.title} onClose={() => setOpened(null)}><p>{opened.sourceLabel} · {opened.version}</p><div className="document-content">{opened.content}</div><footer className="editor-actions">{opened.sourceUrl && /^https?:\/\//i.test(opened.sourceUrl) ? <a className="button button-secondary" href={opened.sourceUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />{text("Nguồn gốc", "Original source")}</a> : null}{canPublish || (canWrite && opened.authorId === user?.id) ? <button className="button button-primary" onClick={() => { setEditing(opened); setOpened(null); }}><Pencil size={16} />{text("Sửa / Phê duyệt", "Edit / Approve")}</button> : null}</footer></Modal> : null}
    </div>
  );
}
