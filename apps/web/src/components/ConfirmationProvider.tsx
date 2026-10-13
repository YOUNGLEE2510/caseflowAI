import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

type Confirmation = { title: string; message: ReactNode; danger?: boolean; confirmLabel?: string };
const Context = createContext<((options: Confirmation) => Promise<boolean>) | null>(null);

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<Confirmation | null>(null);
  const resolve = useRef<((value: boolean) => void) | null>(null);
  const finish = useCallback((value: boolean) => {
    resolve.current?.(value);
    resolve.current = null;
    setOptions(null);
  }, []);
  const confirm = useCallback((next: Confirmation) => {
    resolve.current?.(false);
    setOptions(next);
    return new Promise<boolean>(done => { resolve.current = done; });
  }, []);
  useEffect(() => () => { resolve.current?.(false); }, []);
  return <Context.Provider value={confirm}>{children}{options ? <ConfirmDialog open {...options} onConfirm={() => finish(true)} onCancel={() => finish(false)} /> : null}</Context.Provider>;
}

export function useConfirmation() {
  const confirm = useContext(Context);
  if (!confirm) throw new Error("ConfirmationProvider is required");
  return confirm;
}
