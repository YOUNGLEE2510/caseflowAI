import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiStudySettings } from "./AiStudySettings";
import { AiHiddenNotice } from "./AiHiddenNotice";
import { api } from "../api";
import type { User } from "../types";

vi.mock("../api", () => ({ api: vi.fn() }));
vi.mock("lucide-react", () => ({ EyeOff: () => null }));
vi.mock("../i18n", () => ({ useLocale: () => ({ text: (vi: string) => vi }) }));
vi.mock("./ConfirmationProvider", () => ({ useConfirmation: () => async () => true }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => { if (root) await act(async () => root!.unmount()); container?.remove(); vi.clearAllMocks(); });

const member = { id: "u1", name: "Điều phối", email: "dp@example.test", role: "manager", team: "", organizationId: "o1",
  organizationName: "", organizationSlug: "", active: true, aiSuggestionsHidden: false, studyCode: "p01" } as unknown as User;

async function render(node: React.ReactNode) {
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(node));
}

describe("AI study controls", () => {
  it("lets an org admin hide AI suggestions with the participant code", async () => {
    vi.mocked(api).mockResolvedValue({});
    const onSaved = vi.fn();
    await render(<AiStudySettings member={member} canChange onSaved={onSaved} />);
    const toggle = container.querySelector<HTMLInputElement>('input[role="switch"]')!;
    await act(async () => { toggle.click(); });
    expect(api).toHaveBeenCalledWith("/users/u1/ai-visibility", { method: "PATCH", body: JSON.stringify({ aiSuggestionsHidden: true, studyCode: "p01" }) });
    expect(onSaved).toHaveBeenCalled();
  });

  it("shows managers the state without any control", async () => {
    await render(<AiStudySettings member={{ ...member, aiSuggestionsHidden: true }} canChange={false} onSaved={() => undefined} />);
    expect(container.querySelector('input[role="switch"]')).toBeNull();
    expect(container.textContent).toContain("Đang ẩn gợi ý AI");
  });

  it("announces that AI suggestions are off without naming any AI value", async () => {
    await render(<AiHiddenNotice />);
    const notice = container.querySelector('[role="status"]')!;
    expect(notice.textContent).toContain("Gợi ý AI đang tắt");
  });
});
