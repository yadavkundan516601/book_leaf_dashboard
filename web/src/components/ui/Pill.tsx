import type { ReactNode } from "react";
import type { Tone } from "./tone";

export interface PillProps {
  tone?: Tone;
  children: ReactNode;
  /** Tooltip text, e.g. to expand an abbreviation. */
  title?: string;
  className?: string;
}

/** Small rounded status label in one of the shared tones. */
export function Pill({ tone = "neutral", children, title, className }: PillProps) {
  const cls = ["ui-pill", `ui-pill--${tone}`, className].filter(Boolean).join(" ");
  return (
    <span className={cls} title={title}>
      {children}
    </span>
  );
}
