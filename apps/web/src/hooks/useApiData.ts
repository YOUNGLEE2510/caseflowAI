import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { getStoredLocale } from "../i18n";

export function useApiData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const active = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    setError("");
    try {
      const response = await api<T>(path, { signal: controller.signal });
      if (!controller.signal.aborted) setData(response);
    } catch (requestError) {
      if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : getStoredLocale() === "en" ? "Unable to load data." : "Không thể tải dữ liệu.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void reload();
    return () => active.current?.abort();
  }, [reload]);

  return { data, error, loading, reload, setData };
}
