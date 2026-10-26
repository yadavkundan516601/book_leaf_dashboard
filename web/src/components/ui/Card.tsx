import type { HTMLAttributes } from "react";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Element to render; use "section" or "article" when the card is a self-contained unit. */
  as?: "div" | "section" | "article";
  /** Remove the default inner padding (e.g. for edge-to-edge lists). */
  flush?: boolean;
}

/** Surface container with border, radius and shadow from the design tokens. */
export function Card({ as: Tag = "div", flush = false, className, ...rest }: CardProps) {
  const cls = ["ui-card", flush && "ui-card--flush", className].filter(Boolean).join(" ");
  return <Tag className={cls} {...rest} />;
}
