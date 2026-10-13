export function allowedWebOrigins(webOrigin: string, mode: "local" | "pilot"): string[] {
  const url = new URL(webOrigin);
  const origins = [url.origin];
  if (mode === "local" && ["localhost", "127.0.0.1"].includes(url.hostname)) {
    url.hostname = url.hostname === "localhost" ? "127.0.0.1" : "localhost";
    origins.push(url.origin);
  }
  return origins;
}
