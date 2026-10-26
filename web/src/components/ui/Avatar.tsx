import { useState } from "react";

export type AvatarSize = "sm" | "md" | "lg";

export interface AvatarProps {
  name: string;
  size?: AvatarSize;
  /** Photo URL; falls back to initials if missing or it fails to load. */
  src?: string;
  /** Hide from assistive tech when the name is already printed next to the avatar. */
  decorative?: boolean;
}

/** Background colours chosen for at least 4.5:1 contrast against white initials. */
const AVATAR_COLOURS = ["#c2334a", "#2f52c8", "#0b6f86", "#047a6a", "#8a5a00", "#6b46c1"] as const;

/** Initials for a display name: first letters of the first and last words. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = [...words[0]!][0] ?? "";
  const last = words.length > 1 ? ([...words[words.length - 1]!][0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Stable palette colour for a name (same name, same colour, across sessions). */
export function avatarColour(name: string): string {
  let hash = 0;
  for (const ch of name.trim().toLowerCase()) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  return AVATAR_COLOURS[hash % AVATAR_COLOURS.length]!;
}

/** Round avatar showing a photo or coloured initials derived from the name. */
export function Avatar({ name, size = "md", src, decorative = false }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const a11y = decorative ? { "aria-hidden": true as const } : { role: "img", "aria-label": name || "Unknown user" };
  const cls = `ui-avatar ui-avatar--${size}`;

  if (src && !failed) {
    return (
      <span className={cls} {...a11y}>
        <img src={src} alt="" onError={() => setFailed(true)} />
      </span>
    );
  }
  return (
    <span className={cls} style={{ background: avatarColour(name) }} {...a11y}>
      <span aria-hidden="true">{initialsOf(name)}</span>
    </span>
  );
}
