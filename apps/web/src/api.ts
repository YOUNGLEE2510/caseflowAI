import { getStoredLocale } from "./i18n";

const API_URL = import.meta.env.VITE_API_URL || "/api";
const TOKEN_KEY = "caseflow_token";

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null, remember = true) {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  if (token) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
}

function expireSession(token: string | null) {
  if (token && getToken() === token) {
    setToken(null);
    window.dispatchEvent(new Event("caseflow:session-expired"));
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const timeout = AbortSignal.timeout(30000);
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && path !== "/auth/login") expireSession(token);
      throw new Error(data.message || (getStoredLocale() === "en" ? "Unable to connect to the service." : "Không thể kết nối đến hệ thống."));
    }
    return data as T;
}

export async function apiBlob(path: string): Promise<Blob> {
  const token = getToken();
  const response = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(60000)
  });

  if (!response.ok) {
    if (response.status === 401) expireSession(token);
    const data = await response.json().catch(() => ({}));
    throw new Error(
      data.message ||
        (getStoredLocale() === "en"
          ? "Unable to download this file."
          : "Không thể tải tệp này.")
    );
  }

  return response.blob();
}
