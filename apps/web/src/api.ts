import { getStoredLocale } from "./i18n";

const API_URL = import.meta.env.VITE_API_URL || "/api";
const TOKEN_KEY = "caseflow_token";
const LOGGED_OUT_KEY = "caseflow_logged_out";
let sessionGeneration = 0;
let refreshing: Promise<boolean> | null = null;
let lastRenewal: { from: string | null; to: string } | null = null;
let accessToken: string | null = null;

// Remove tokens persisted by older clients; refresh cookies restore the session.
localStorage.removeItem(TOKEN_KEY);
sessionStorage.removeItem(TOKEN_KEY);

export function getToken() {
  return accessToken;
}

export function setToken(token: string | null, _remember = true) {
  accessToken = token;
  sessionGeneration += 1;
  lastRenewal = null;
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  if (token) {
    localStorage.removeItem(LOGGED_OUT_KEY);
  } else localStorage.setItem(LOGGED_OUT_KEY, "true");
}

export async function restoreSession(): Promise<boolean> {
  if (localStorage.getItem(LOGGED_OUT_KEY) === "true") return false;
  if (refreshing) return refreshing;
  const generation = sessionGeneration;
  const previousToken = getToken();
  const renew = async () => {
    const response = await fetch(apiUrl("/auth/refresh"), {
      method: "POST", credentials: "include", signal: AbortSignal.timeout(30000)
    });
    if (response.status === 401) return false;
    if (!response.ok) throw new Error(getStoredLocale() === "en" ? "Unable to renew session." : "Không thể gia hạn phiên đăng nhập.");
    const data = await response.json();
    if (generation !== sessionGeneration || typeof data.token !== "string") return false;
    setToken(data.token, Boolean(data.remember));
    lastRenewal = { from: previousToken, to: data.token };
    return true;
  };
  refreshing = (async () => navigator.locks ? await navigator.locks.request("caseflow:refresh", renew) : await renew())()
    .finally(() => { refreshing = null; });
  return refreshing;
}

async function authenticatedFetch(path: string, options: RequestInit, token: string | null) {
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response = await fetch(apiUrl(path), { ...options, headers, credentials: "include" });
  if (response.status === 401 && token && (!path.startsWith("/auth/") || path === "/auth/me")) {
    const alreadyRenewed = lastRenewal?.from === token && lastRenewal.to === getToken();
    if (alreadyRenewed || getToken() === token && await restoreSession()) {
      const retryToken = getToken();
      headers.set("Authorization", `Bearer ${retryToken}`);
      response = await fetch(apiUrl(path), { ...options, headers, credentials: "include" });
      if (response.status === 401) expireSession(retryToken);
    } else expireSession(token);
  }
  return response;
}

export function apiUrl(path: string) {
  return `${API_URL}${path}`;
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
    const response = await authenticatedFetch(path, {
      ...options,
      headers,
      signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
    }, token);

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && (!path.startsWith("/auth/") || path === "/auth/me")) expireSession(token);
      throw new Error(data.message || (getStoredLocale() === "en" ? "Unable to connect to the service." : "Không thể kết nối đến hệ thống."));
    }
    return data as T;
}

export async function apiBlob(path: string): Promise<Blob> {
  const token = getToken();
  const response = await authenticatedFetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(60000)
  }, token);

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
