import { Avatar, type AvatarSize } from "./Avatar";

export interface AvatarGroupProps {
  people: readonly { name: string; src?: string }[];
  /** Avatars shown before collapsing the rest into "+N" (default 4). */
  max?: number;
  size?: AvatarSize;
}

/** Overlapping row of avatars with a "+N" overflow bubble; announced as one list of names. */
export function AvatarGroup({ people, max = 4, size = "md" }: AvatarGroupProps) {
  const shown = people.slice(0, Math.max(1, max));
  const hidden = people.length - shown.length;
  const names = shown.map((p) => p.name);
  const label =
    people.length === 0
      ? "No people"
      : hidden > 0
        ? `${names.join(", ")} and ${hidden} more`
        : names.length > 1
          ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
          : (names[0] ?? "");

  return (
    <span className={`ui-avatar-group ui-avatar-group--${size}`} role="img" aria-label={label}>
      {shown.map((p, i) => (
        <Avatar key={i} name={p.name} src={p.src} size={size} decorative />
      ))}
      {hidden > 0 && (
        <span className={`ui-avatar ui-avatar--${size} ui-avatar--more`} aria-hidden="true">
          +{hidden}
        </span>
      )}
    </span>
  );
}
