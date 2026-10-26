import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ConfirmDialog, type ConfirmOptions } from "./ConfirmDialog";

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

interface Pending {
  options: ConfirmOptions;
  resolve: (ok: boolean) => void;
}

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Hosts one ConfirmDialog for the subtree; mount once near the app root. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const current = useRef<Pending | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (options) =>
      new Promise<boolean>((resolve) => {
        // A newer request supersedes an unanswered one, which counts as cancelled.
        current.current?.resolve(false);
        const next = { options, resolve };
        current.current = next;
        setPending(next);
      }),
    [],
  );

  const settle = useCallback((ok: boolean) => {
    current.current?.resolve(ok);
    current.current = null;
    setPending(null);
  }, []);

  useEffect(() => () => current.current?.resolve(false), []);

  return (
    <ConfirmContext value={confirm}>
      {children}
      {pending && (
        <ConfirmDialog {...pending.options} open onConfirm={() => settle(true)} onCancel={() => settle(false)} />
      )}
    </ConfirmContext>
  );
}

/** Promise-based confirm: `if (await confirm({ title, tone: "danger" })) …`. Needs a ConfirmProvider above. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside ConfirmProvider");
  return ctx;
}
