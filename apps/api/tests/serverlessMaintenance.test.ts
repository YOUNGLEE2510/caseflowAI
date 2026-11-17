import { expect, it, vi } from "vitest";
import { createMaintenanceTrigger } from "../src/serverlessMaintenance.js";

function setup(acquired = true) {
  let clock = 0;
  const run = vi.fn(async () => undefined);
  const acquire = vi.fn(async () => acquired ? { ownerId: "x" } : null);
  const defer = vi.fn();
  const trigger = createMaintenanceTrigger([{ key: "sla", intervalMs: 15 * 60_000, run }], { acquire, defer, now: () => clock, logger: { warn: vi.fn() } });
  return { trigger, run, acquire, defer, tick: (ms: number) => { clock += ms; } };
}

it("runs due work once, hands it to waitUntil and throttles the database check per instance", async () => {
  const { trigger, run, acquire, defer, tick } = setup();
  await trigger();
  expect(run).toHaveBeenCalledTimes(1);
  expect(acquire).toHaveBeenCalledWith("serverless:sla", 15 * 60_000);
  expect(defer).toHaveBeenCalledTimes(1);
  expect(trigger()).toBeUndefined(); // same instance, within a minute: no DB round-trip
  tick(60_000);
  await trigger();
  expect(acquire).toHaveBeenCalledTimes(2);
});

it("skips the task when another instance holds the interval lease", async () => {
  const { trigger, run } = setup(false);
  await trigger();
  expect(run).not.toHaveBeenCalled();
});

it("contains task failures", async () => {
  const warn = vi.fn();
  const trigger = createMaintenanceTrigger([{ key: "mail", intervalMs: 60_000, run: async () => { throw new Error("smtp down"); } }],
    { acquire: async () => ({}), logger: { warn } });
  await expect(trigger()).resolves.toBeDefined();
  expect(warn).toHaveBeenCalledWith("[Serverless maintenance] mail unavailable");
});
