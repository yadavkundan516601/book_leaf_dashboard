import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface HelpTipProps {
  /** Accessible name of the trigger button, e.g. "What is SLA?". */
  label: string;
  /** Plain explanatory content (no interactive elements). */
  children: ReactNode;
}

interface Position {
  top: number;
  left: number;
  placement: "top" | "bottom";
  arrow: number;
}

const GAP = 8;
const MARGIN = 8;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(n, Math.max(lo, hi)));

/** "i" button that explains jargon in a tooltip on hover, focus or tap; Esc or outside tap closes it. */
export function HelpTip({ label, children }: HelpTipProps) {
  const tipId = `${useId()}-tip`;
  const btnRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(false);
  const leaveTimer = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Position | null>(null);

  const show = useCallback(() => {
    window.clearTimeout(leaveTimer.current);
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    window.clearTimeout(leaveTimer.current);
    pinnedRef.current = false;
    setOpen(false);
  }, []);
  const scheduleHide = useCallback(() => {
    if (pinnedRef.current) return;
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => setOpen(false), 120);
  }, []);

  const place = useCallback(() => {
    const btn = btnRef.current;
    const tip = tipRef.current;
    if (!btn || !tip) return;
    const r = btn.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const roomAbove = r.top - GAP - MARGIN;
    const roomBelow = vh - r.bottom - GAP - MARGIN;
    // Prefer above; flip below when it does not fit there, picking the roomier side if neither fits.
    const placement = roomAbove >= h || roomAbove >= roomBelow ? "top" : "bottom";
    const rawTop = placement === "top" ? r.top - GAP - h : r.bottom + GAP;
    const center = r.left + r.width / 2;
    const left = clamp(center - w / 2, MARGIN, vw - w - MARGIN);
    setPos({
      top: clamp(rawTop, MARGIN, vh - h - MARGIN),
      left,
      placement,
      arrow: clamp(center - left, 10, w - 10),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !tipRef.current?.contains(t)) close();
    };
    // Lets a hover-opened tip be dismissed without moving the pointer (WCAG 1.4.13).
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="ui-helptip"
        aria-label={label}
        aria-describedby={tipId}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
        onFocus={show}
        onBlur={close}
        onClick={() => {
          if (pinnedRef.current) {
            close();
          } else {
            pinnedRef.current = true;
            show();
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            // Close only the tip, not an enclosing dialog.
            e.stopPropagation();
            close();
          }
        }}
      >
        <span aria-hidden="true">i</span>
      </button>
      {createPortal(
        <div
          ref={tipRef}
          id={tipId}
          role="tooltip"
          className={`ui-helptip__bubble ui-helptip__bubble--${pos?.placement ?? "top"}`}
          hidden={!open}
          style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? undefined : "hidden" }}
          onMouseEnter={show}
          onMouseLeave={scheduleHide}
        >
          {children}
          <span className="ui-helptip__arrow" aria-hidden="true" style={{ left: pos?.arrow ?? 0 }} />
        </div>,
        document.body,
      )}
    </>
  );
}
