import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type ToastTone = "success" | "error";

export interface ToastOptions {
  /** One follow-up button, e.g. { label: "Undo", onClick: revert }; clicking it also dismisses the toast. */
  action?: { label: string; onClick: () => void };
  /** Auto-dismiss delay in ms (default 4s for success, 7s for errors, at least 8s when there is an action). */
  duration?: number;
}

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
  action?: ToastOptions["action"];
  duration: number;
}

interface ToastApi {
  success: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
let nextId = 1;
const MAX_VISIBLE = 4;

function defaultDuration(tone: ToastTone, hasAction: boolean): number {
  const base = tone === "error" ? 7000 : 4000;
  return hasAction ? Math.max(base, 8000) : base;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  const push = useCallback((tone: ToastTone, message: string, options?: ToastOptions) => {
    const item: ToastItem = {
      id: nextId++,
      tone,
      message,
      action: options?.action,
      duration: options?.duration ?? defaultDuration(tone, Boolean(options?.action)),
    };
    setToasts((all) => [...all.slice(-(MAX_VISIBLE - 1)), item]);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({ success: (m, o) => push("success", m, o), error: (m, o) => push("error", m, o) }),
    [push],
  );

  return (
    <ToastContext value={api}>
      {children}
      <div className="ui-toasts" aria-live="polite">
        {toasts.map((t) => (
          <ToastView key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext>
  );
}

/** One toast; its auto-dismiss timer pauses while hovered or while focus is inside it. */
function ToastView({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef(toast.duration);
  const paused = hovered || focused;

  useEffect(() => {
    if (paused) return;
    const startedAt = Date.now();
    const timer = window.setTimeout(() => onDismiss(toast.id), Math.max(remaining.current, 0));
    return () => {
      window.clearTimeout(timer);
      remaining.current -= Date.now() - startedAt;
    };
  }, [paused, onDismiss, toast.id]);

  return (
    <div
      className={`ui-toast ui-toast--${toast.tone}`}
      role={toast.tone === "error" ? "alert" : "status"}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
    >
      <span className="ui-toast__icon" aria-hidden="true">
        {toast.tone === "error" ? "!" : "✓"}
      </span>
      <span className="ui-toast__message">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          className="ui-toast__action"
          onClick={() => {
            toast.action?.onClick();
            onDismiss(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" className="ui-toast__close" aria-label="Dismiss notification" onClick={() => onDismiss(toast.id)}>
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
