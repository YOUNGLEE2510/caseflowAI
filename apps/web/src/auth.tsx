import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { api, getToken, restoreSession, setToken } from "./api";
import type { User } from "./types";
import { ErrorState } from "./components/ui";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (organizationSlug: string, email: string, password: string, remember?: boolean) => Promise<void>;
  loginWithGoogle: (ticket: string) => Promise<void>;
  loginWithMicrosoft: (ticket: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const oauthExchanges = new Map<string, Promise<{ token: string; user: User; remember: boolean }>>();
function exchangeOAuth(provider: "google" | "microsoft", ticket: string) {
  const key = `${provider}:${ticket}`;
  const current = oauthExchanges.get(key);
  if (current) return current;
  const pending = api<{ token: string; user: User; remember: boolean }>(`/auth/${provider}/exchange`, {
    method: "POST", body: JSON.stringify({ ticket })
  }).finally(() => oauthExchanges.delete(key));
  oauthExchanges.set(key, pending);
  return pending;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    setAuthError("");
    (async () => {
      if (!getToken() && !(await restoreSession())) return null;
      return api<{ user: User }>("/auth/me");
    })()
      .then((response) => { if (current && response) setUser(response.user); })
      .catch((error) => {
        if (current && getToken()) setAuthError(error instanceof Error ? error.message : "Connection failed");
      })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [attempt]);

  useEffect(() => {
    const expired = () => setUser(null);
    window.addEventListener("caseflow:session-expired", expired);
    return () => window.removeEventListener("caseflow:session-expired", expired);
  }, []);

  const login = useCallback(async (organizationSlug: string, email: string, password: string, remember = true) => {
    const response = await api<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ organizationSlug, email, password, remember })
    });
    setToken(response.token, remember);
    setUser(response.user);
  }, []);

  const loginWithGoogle = useCallback(async (ticket: string) => {
    const response = await exchangeOAuth("google", ticket);
    setToken(response.token, response.remember);
    setUser(response.user);
  }, []);

  const logout = useCallback(() => {
    void api("/auth/logout", { method: "POST" }).catch(() => undefined);
    setToken(null);
    setUser(null);
  }, []);

  const loginWithMicrosoft = useCallback(async (ticket: string) => {
    const response = await exchangeOAuth("microsoft", ticket);
    setToken(response.token, response.remember);
    setUser(response.user);
  }, []);

  const value = useMemo(() => ({ user, loading, login, loginWithGoogle, loginWithMicrosoft, logout }), [user, loading, login, loginWithGoogle, loginWithMicrosoft, logout]);
  return <AuthContext.Provider value={value}>{authError ? <div className="boot-screen"><ErrorState message={authError} onRetry={() => { setLoading(true); setAttempt((value) => value + 1); }} /></div> : children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
