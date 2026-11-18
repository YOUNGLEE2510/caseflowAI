import { useSyncExternalStore } from "react";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "caseflow.theme";
const listeners = new Set<() => void>();
const darkQuery = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

let preference: ThemePreference = readPreference();

function resolve(value: ThemePreference): ResolvedTheme {
  if (value !== "system") return value;
  return darkQuery?.matches ? "dark" : "light";
}

function apply() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (preference === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", preference);
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", resolve(preference) === "dark" ? "#0b1c18" : "#102d28");
}

function emit() {
  apply();
  listeners.forEach(listener => listener());
}

darkQuery?.addEventListener?.("change", () => { if (preference === "system") emit(); });
apply();

export function setThemePreference(next: ThemePreference) {
  preference = next;
  try {
    if (next === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  } catch { /* The choice still applies for this visit when storage is unavailable. */ }
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Current preference and the theme actually shown (system resolved). */
export function useTheme() {
  const current = useSyncExternalStore(subscribe, () => preference, () => "system" as ThemePreference);
  const resolved = useSyncExternalStore(subscribe, () => resolve(preference), () => "light" as ResolvedTheme);
  return { preference: current, resolved, setPreference: setThemePreference };
}
