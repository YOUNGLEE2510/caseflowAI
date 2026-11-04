import { useEffect, useState } from "react";
import { BookMarked, ExternalLink, Search, Send, Sparkles, Plus, Pencil } from "lucide-react";
import { useAuth } from "../auth";
import { ArticleEditor } from "../components/AdminEditors";
import { Modal } from "../components/Modal";
import { api } from "../api";
import { EmptyState, ErrorState, LoadingState, PageHeader, Pagination } from "../components/ui";
import { useApiData } from "../hooks/useApiData";
import { useLocale } from "../i18n";
import type { KnowledgeArticle } from "../types";
import { ReadMore } from "../components/ReadMore";
import { categoryLabels } from "../utils/labels";

interface SearchResult {
  generation?: { mode: string; reason?: string };
  answer: string;
  citations: Array<{
    id: string;
    version?: string;
    title: string;
    sourceLabel: string;
    excerpt: string;
    score: number;
  }>;
}

export function KnowledgePage() {
  const { locale, text } = useLocale();
  const { user } = useAuth();
  const canWrite = user?.role !== "requester";
  const canPublish = Boolean(user && ["manager", "org_admin", "platform_admin"].includes(user.role));
  const [editing, setEditing] = useState<KnowledgeArticle | "new" | null>(null);
  const [opened, setOpened] = useState<KnowledgeArticle | null>(null);
  const [page, setPage] = useState(1);
  const [libraryQuery, setLibraryQuery] = useState("");
  const { data, loading, error, reload } = useApiData<{ articles: KnowledgeArticle[]; total: number }>(`/knowledge?page=${page}&limit=20&search=${encodeURIComponent(libraryQuery)}`);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [generate, setGenerate] = useState(false);
  const filteredArticles = data?.articles || [];
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLibraryQuery(query.trim().slice(0, 160));
      setPage(1);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [query]);
  const { data: capabilities } = useApiData<{ generation: boolean }>("/knowledge/capabilities");

  async function openSource(id: string, version?: string) {
    if (version) {
      try {
        const response = await api<{ article: KnowledgeArticle }>(`/knowledge/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}`);
        setOpened(response.article);
      } catch { setSearchError(text("Không thể mở phiên bản nguồn.", "Unable to open source version.")); }
      return;
    }
    const article = data?.articles.find(item => item._id === id);
    if (article) setOpened(article);
    else {
      try {
        const response = await api<{ articles: KnowledgeArticle[] }>(`/knowledge?id=${encodeURIComponent(id)}`);
        if (!response.articles[0]) throw new Error("Source unavailable");
        setOpened(response.articles[0]);
      } catch { setSearchError(text("Không thể mở tài liệu nguồn.", "Unable to open source.")); }
    }
  }

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (searching || query.trim().length < 3) return;
    setLibraryQuery(query.trim().slice(0, 160));
    setPage(1);
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

      <section className="knowledge-search knowledge-search-premium" aria-label={text("Tra cứu tài liệu", "Search documents")}>
        <form onSubmit={search} className="knowledge-query-bar">
          <Search size={19} />
          <input
            aria-label={text("Câu hỏi tra cứu", "Knowledge query")}
            disabled={searching}
            maxLength={1000}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setResult(null); setSearchError(""); }}
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
                    <span>{text("Liên quan", "Relevance")} {Math.round(citation.score * 100)}%</span>
                  </header>
                  <p>{citation.excerpt}</p>
                  <footer>{citation.sourceLabel}<button type="button" className="text-link" onClick={() => openSource(citation.id, citation.version)}>{text("Mở nguồn", "Open source")}</button></footer>
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
          <span className="panel-kpi">{filteredArticles.length} / {data?.total || 0} {text("tài liệu", "documents")}</span>
        </div>
        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} onRetry={reload} /> : null}
        {!loading && !error && data ? (
          filteredArticles.length ? (
            <div className="article-list">
              {filteredArticles.map((article) => (
                <article key={article._id}>
                  <span className="article-icon">
                    <BookMarked size={18} />
                  </span>
                  <div>
                    <span className="article-category">{categoryLabels[article.category]?.[locale] || article.category}</span>
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
              title={query.trim() ? text("Không có tài liệu khớp từ khóa", "No matching documents") : text("Kho tri thức đang trống", "The knowledge base is empty")}
              detail={query.trim() ? text("Thử từ khóa khác hoặc gửi câu hỏi tra cứu.", "Try another keyword or submit a search question.") : text("Chưa có tài liệu đã được duyệt và công bố cho bạn. Bạn vẫn có thể gửi yêu cầu hỗ trợ.", "No approved documents are published for you yet. You can still submit a support request.")}
            />
          )
        ) : null}
      </section>
      <nav aria-label={text("Phân trang tài liệu", "Document pages")}>
        <Pagination page={page} totalPages={Math.max(1, Math.ceil((data?.total || 0) / 20))} total={data?.total || 0} limit={20} onPageChange={setPage} />
      </nav>
      {editing ? <ArticleEditor article={editing === "new" ? undefined : editing} canPublish={canPublish} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setResult(null); void reload(); }} /> : null}
      {opened ? <Modal title={opened.title} onClose={() => setOpened(null)}><p>{opened.sourceLabel} · {opened.version}</p><div className="document-content">{opened.content}</div><footer className="editor-actions">{opened.sourceUrl && /^https?:\/\//i.test(opened.sourceUrl) ? <a className="button button-secondary" href={opened.sourceUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />{text("Nguồn gốc", "Original source")}</a> : null}{!opened.archived && (canPublish || (canWrite && opened.authorId === user?.id)) ? <button className="button button-primary" onClick={() => { setEditing(opened); setOpened(null); }}><Pencil size={16} />{text("Sửa / Phê duyệt", "Edit / Approve")}</button> : null}</footer></Modal> : null}
    </div>
  );
}
