export type SlaCheckRunner = () => Promise<unknown>;

export interface SlaScheduler {
  stop(): void;
  runNow(): Promise<void>;
}

export function createSlaScheduler(
  runner: SlaCheckRunner,
  intervalMs: number,
  runOnStart: boolean,
  logger: Pick<Console, "error"> = console
): SlaScheduler {
  let running = false;

  const runNow = async () => {
    if (running) return;
    running = true;
    try {
      await runner();
    } catch (error) {
      logger.error("[SLA Scheduler] Check failed", error);
    } finally {
      running = false;
    }
  };

  if (runOnStart) void runNow();
  const timer = setInterval(() => void runNow(), intervalMs);
  timer.unref();

  return {
    stop: () => clearInterval(timer),
    runNow
  };
}
