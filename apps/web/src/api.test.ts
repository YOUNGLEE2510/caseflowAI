import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, getToken, restoreSession, setToken } from "./api";

beforeEach(() => { setToken(null); localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("API session handling", () => {
  it("does not restore a cookie session after a local logout", async () => {
    setToken("current");
    setToken(null);
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(await restoreSession()).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("renews an expired access token and retries once", async () => {
    setToken("expired", false);
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('{"message":"Expired"}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{"token":"renewed","remember":false}'))
      .mockResolvedValueOnce(new Response('{"ok":true}'));
    vi.stubGlobal("fetch", fetcher);
    expect(await api("/cases")).toEqual({ ok: true });
    expect(getToken()).toBe("renewed");
    expect(sessionStorage.getItem("caseflow_token")).toBeNull();
    expect(localStorage.getItem("caseflow_token")).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[1][1].credentials).toBe("include");
  });
  it("does not destroy a session during a temporary refresh outage", async () => {
    setToken("expired");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(new Response("{}", { status: 503 })));
    await expect(api("/cases")).rejects.toThrow();
    expect(getToken()).toBe("expired");
  });
  it("does not delete a newer login when a renewed request fails", async () => {
    setToken("expired");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(new Response('{"token":"renewed","remember":true}'))
      .mockImplementationOnce(async () => {
        setToken("new-login");
        return new Response("{}", { status: 401 });
      }));
    await expect(api("/cases")).rejects.toThrow();
    expect(getToken()).toBe("new-login");
  });
  it("shares one renewal for concurrent unauthorized requests", async () => {
    setToken("expired");
    let completeRefresh!: (response: Response) => void;
    const pendingRefresh = new Promise<Response>((resolve) => { completeRefresh = resolve; });
    let renewals = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string, options: RequestInit) => {
      if (url.endsWith("/auth/refresh")) { renewals += 1; return pendingRefresh; }
      return new Response("{}", { status: new Headers(options.headers).get("Authorization") === "Bearer expired" ? 401 : 200 });
    }));
    const requests = [api("/cases"), api("/knowledge")];
    await vi.waitFor(() => expect(renewals).toBe(1));
    completeRefresh(new Response('{"token":"renewed","remember":true}'));
    await Promise.all(requests);
    expect(renewals).toBe(1);
  });
  it("keeps access tokens only in memory for both remember modes", () => {
    setToken("old");
    setToken("new", false);
    expect(localStorage.getItem("caseflow_token")).toBeNull();
    expect(sessionStorage.getItem("caseflow_token")).toBeNull();
    expect(getToken()).toBe("new");
  });

  it("clears an expired session and emits its notification", async () => {
    setToken("expired");
    const listener = vi.fn();
    window.addEventListener("caseflow:session-expired", listener);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Expired" }), { status: 401 })));
    await expect(api("/cases")).rejects.toThrow("Expired");
    expect(getToken()).toBeNull();
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener("caseflow:session-expired", listener);
  });

  it("does not delete a newer login when an old request fails", async () => {
    setToken("old");
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
      setToken("new");
      return new Response("{}", { status: 401 });
    }));
    await expect(api("/cases")).rejects.toThrow();
    expect(getToken()).toBe("new");
  });

  it("keeps the session on a failed login attempt", async () => {
    setToken("current");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    await expect(api("/auth/login")).rejects.toThrow();
    expect(getToken()).toBe("current");
  });
  it("keeps an existing session when Google ticket exchange fails", async () => {
    setToken("current");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    await expect(api("/auth/google/exchange", { method: "POST" })).rejects.toThrow();
    expect(getToken()).toBe("current");
  });
});
