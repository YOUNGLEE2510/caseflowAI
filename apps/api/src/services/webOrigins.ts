/**
 * Origins allowed to call the API with credentials (CORS, refresh-cookie origin check).
 * On Vercel each deployment is also reachable at its own URLs (deployment URL, branch alias),
 * e.g. when opened from the Vercel dashboard. Vercel exposes those as system environment
 * variables of that same deployment, so they are trusted exactly, never by wildcard.
 */
export function allowedWebOrigins(webOrigin: string, mode: "local" | "pilot", env: Record<string, string | undefined> = process.env): string[] {
  const url = new URL(webOrigin);
  const origins = [url.origin];
  if (mode === "local" && ["localhost", "127.0.0.1"].includes(url.hostname)) {
    url.hostname = url.hostname === "localhost" ? "127.0.0.1" : "localhost";
    origins.push(url.origin);
  }
  if (env.VERCEL === "1") {
    for (const host of [env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL]) {
      if (host && /^[a-z0-9.-]+\.vercel\.app$/i.test(host)) origins.push(`https://${host.toLowerCase()}`);
    }
  }
  return [...new Set(origins)];
}
