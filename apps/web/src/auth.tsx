import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { api, getToken, setToken } from "./api";
import type { User } from "./types";
import { ErrorState } from "./components/ui";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (organizationSlug: string, email: string, password: string, remember?: boolean) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    setAuthError("");
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api<{ user: User }>("/auth/me")
      .then((response) => { if (current) setUser(response.user); })
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
      body: JSON.stringify({ organizationSlug, email, password })
    });
    setToken(response.token, remember);
    setUser(response.user);
  }, []);

  const logout = useCallback(() => {
    void api("/auth/logout", { method: "POST" }).catch(() => undefined);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{authError ? <div className="boot-screen"><ErrorState message={authError} onRetry={() => { setLoading(true); setAttempt((value) => value + 1); }} /></div> : children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
