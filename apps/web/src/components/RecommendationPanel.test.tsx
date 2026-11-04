import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecommendationPanel } from "./RecommendationPanel";
import { api } from "../api";

vi.mock("../api", () => ({ api: vi.fn() }));
vi.mock("lucide-react", () => ({ Check: () => null, Sparkles: () => null, X: () => null }));
vi.mock("react-router-dom", () => ({ Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a> }));
vi.mock("../i18n", () => ({ useLocale: () => ({ text: (vi: string) => vi }) }));
vi.mock("./ConfirmationProvider", () => ({ useConfirmation: () => async () => true }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => { if (root) await act(async () => root!.unmount()); container?.remove(); vi.clearAllMocks(); });

describe("recommendation feedback", () => {
  it("loads self-service guidance after typing stops without creating a case", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(api).mockResolvedValue({ recommendation: { _id: "r2", items: [], citations: [] } });
      container = document.createElement("div"); document.body.append(container); root = createRoot(container);
      await act(async () => root!.render(<RecommendationPanel autoSuggest description="Em cần hướng dẫn làm thủ tục xác nhận sinh viên đang học." />));
      expect(api).not.toHaveBeenCalled();
      await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
      expect(vi.mocked(api).mock.calls[0][0]).toBe("/recommendations");
      expect(vi.mocked(api).mock.calls.some(call => call[0] === "/cases")).toBe(false);
    } finally { vi.useRealTimers(); }
  });
  it("only applies a draft after acceptance and never sends a case mutation", async () => {
    const onDraft = vi.fn();
    const onAction = vi.fn();
    const recommendation = { _id: "r1", citations: [], items: [{ _id: "i1", action: "draft_reply", reason: "Review this draft", content: "Draft response", decision: "pending" }] };
    vi.mocked(api).mockResolvedValueOnce({ recommendation }).mockResolvedValueOnce({ recommendation: { ...recommendation, items: [{ ...recommendation.items[0], decision: "accepted" }] } });
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root!.render(<RecommendationPanel caseId="case1" onDraft={onDraft} onAction={onAction} />));
    const click = async (label: string) => { const button = [...container.querySelectorAll("button")].find(item => item.textContent === label)!; expect(button).toBeTruthy(); await act(async () => button.click()); };
    await click("Lấy gợi ý");
    expect(onDraft).not.toHaveBeenCalled();
    await click("Chấp nhận");
    expect(onDraft).toHaveBeenCalledWith("Draft response");
    expect(onAction).toHaveBeenCalledWith("draft_reply");
    expect(vi.mocked(api).mock.calls.map(call => call[0])).toEqual(["/recommendations", "/recommendations/r1/items/i1"]);
  });
});
