/**
 * Serverless deployments have no long-lived process for setInterval workers.
 * Instead, each finished request may trigger due maintenance in the background:
 * - a per-instance throttle keeps the database out of the hot path;
 * - a non-released database lease (TTL = interval) makes each task run at most
 *   once per interval across all instances.
 */
export interface MaintenanceTask {
  key: string;
  intervalMs: number;
  run: () => Promise<unknown>;
}
export interface MaintenanceOptions {
  acquire: (key: string, ttlMs: number) => Promise<unknown | null>;
  defer?: (work: Promise<unknown>) => void;
  now?: () => number;
  logger?: Pick<Console, "warn">;
}

/** Keeps a serverless invocation alive for work started after the response (Vercel request context). */
export function vercelWaitUntil(work: Promise<unknown>) {
  const store = (globalThis as Record<symbol, { get?: () => { waitUntil?: (promise: Promise<unknown>) => void } } | undefined>)[Symbol.for("@vercel/request-context")];
  store?.get?.()?.waitUntil?.(work);
}

export function createMaintenanceTrigger(tasks: MaintenanceTask[], options: MaintenanceOptions) {
  const now = options.now ?? Date.now;
  const logger = options.logger ?? console;
  const lastAttempt = new Map<string, number>();
  const running = new Set<string>();
  return function trigger() {
    const due = tasks.filter(task => !running.has(task.key) && now() - (lastAttempt.get(task.key) ?? -Infinity) >= Math.min(task.intervalMs, 60_000));
    if (!due.length) return undefined;
    for (const task of due) { lastAttempt.set(task.key, now()); running.add(task.key); }
    const work = Promise.all(due.map(async task => {
      try {
        if (!await options.acquire(`serverless:${task.key}`, task.intervalMs)) return;
        await task.run();
      } catch {
        logger.warn(`[Serverless maintenance] ${task.key} unavailable`);
      } finally {
        running.delete(task.key);
      }
    }));
    options.defer?.(work);
    return work;
  };
}
