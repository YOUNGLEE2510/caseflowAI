import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreferenceMenu } from "./PreferenceMenu";

vi.mock("lucide-react", () => ({ Check: () => null, ChevronDown: () => null }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => { if (root) await act(async () => root!.unmount()); container?.remove(); });

async function render(onChange: (value: string) => void) {
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(<PreferenceMenu label="Giao diện" value="light" onChange={onChange} buttonContent="T"
    options={[{ value: "system", label: "Theo hệ thống" }, { value: "light", label: "Sáng" }, { value: "dark", label: "Tối" }]} />));
  return container.querySelector<HTMLButtonElement>(".preference-menu-button")!;
}
const key = (target: Element, name: string) => act(async () => { target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true })); });

describe("PreferenceMenu", () => {
  it("opens a list below the button, marks the current choice and selects one", async () => {
    const onChange = vi.fn();
    const button = await render(onChange);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    await act(async () => button.click());
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const items = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
    expect(items.map(item => item.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    expect(document.activeElement).toBe(items[1]);
    await act(async () => items[2].click());
    expect(onChange).toHaveBeenCalledWith("dark");
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("moves with the arrow keys and closes on Escape without changing the value", async () => {
    const onChange = vi.fn();
    const button = await render(onChange);
    await key(button, "ArrowDown");
    const menu = container.querySelector('[role="menu"]')!;
    await key(menu, "ArrowDown");
    expect(document.activeElement?.textContent).toBe("Tối");
    await key(menu, "Escape");
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
