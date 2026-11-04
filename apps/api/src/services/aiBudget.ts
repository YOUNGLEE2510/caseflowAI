import { AsyncLocalStorage } from "node:async_hooks";

const deadlines = new AsyncLocalStorage<number>();

export function withAiBudget<T>(milliseconds: number, action: () => T): T {
  return deadlines.run(Date.now() + milliseconds, action);
}

export function remainingAiBudget(maximum: number): number {
  const deadline = deadlines.getStore();
  return deadline === undefined ? maximum : Math.max(0, Math.min(maximum, deadline - Date.now()));
}
