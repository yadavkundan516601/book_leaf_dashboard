import type { AttachmentMeta } from "@bookleaf/shared";
import { formatBytes } from "../lib/format";

/** Read-only attachment chips (metadata only; files are not uploaded in this demo). */
export function AttachmentList({ attachments }: { attachments: AttachmentMeta[] }) {
  if (attachments.length === 0) return null;
  return (
    <ul className="chips" aria-label="Attachments">
      {attachments.map((a) => (
        <li key={a.name} className="file-chip" title="File name only; attachments are not uploaded in this demo">
          {a.name} <span className="muted">({formatBytes(a.size)})</span>
        </li>
      ))}
    </ul>
  );
}
