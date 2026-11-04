import { afterEach, expect, it, vi } from "vitest";
import { remainingAiBudget, withAiBudget } from "../src/services/aiBudget.js";

afterEach(() => vi.useRealTimers());

it("shares one deadline across sequential AI operations", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  await withAiBudget(5000, async () => {
    expect(remainingAiBudget(10000)).toBe(5000);
    vi.setSystemTime(4000);
    await Promise.resolve();
    expect(remainingAiBudget(10000)).toBe(1000);
    vi.setSystemTime(5100);
    expect(remainingAiBudget(10000)).toBe(0);
  });
  expect(remainingAiBudget(10000)).toBe(10000);
});

it("keeps concurrent request budgets isolated", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const values = await Promise.all([
    withAiBudget(5000, async () => { await Promise.resolve(); return remainingAiBudget(10000); }),
    withAiBudget(1000, async () => { await Promise.resolve(); return remainingAiBudget(10000); })
  ]);
  expect(values).toEqual([5000, 1000]);
});
