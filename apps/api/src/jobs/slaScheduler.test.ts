import { afterEach, describe, expect, it, vi } from "vitest";
import { createSlaScheduler } from "./slaScheduler.js";

describe("SLA scheduler", () => {
  afterEach(() => vi.useRealTimers());

  it("runs on startup and on the configured cadence", async () => {
    vi.useFakeTimers();
    const runner = vi.fn(async () => undefined);
    const scheduler = createSlaScheduler(runner, 60_000, true);

    await vi.runAllTicks();
    expect(runner).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runner).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it("does not overlap checks when one run is still pending", async () => {
    vi.useFakeTimers();
    let finish: (() => void) | undefined;
    const runner = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const scheduler = createSlaScheduler(runner, 60_000, false);

    const first = scheduler.runNow();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(runner).toHaveBeenCalledTimes(1);
    finish?.();
    await first;
    scheduler.stop();
  });
});
