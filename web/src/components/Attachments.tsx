import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_FILES, type AttachmentMeta } from "@bookleaf/shared";
import { useId, useRef, useState, type DragEvent, type Ref } from "react";
import { formatBytes } from "../lib/format";
import "../styles/author-tickets.css";
import { ClipIcon } from "./icons";

/** Read-only attachment chips (metadata only; files are not uploaded in this demo). */
export function AttachmentList({ attachments, label = "Attachments" }: { attachments: AttachmentMeta[]; label?: string }) {
  if (attachments.length === 0) return null;
  return (
    <ul className="chips att-chips" aria-label={label}>
      {attachments.map((a) => (
        <li key={a.name} className="file-chip" title="File name only; attachments are not uploaded in this demo">
          <span className="att-chips__icon" aria-hidden="true">
            <ClipIcon />
          </span>
          <span className="att-chips__name">{a.name}</span> <span className="muted">({formatBytes(a.size)})</span>
        </li>
      ))}
    </ul>
  );
}

interface AttachmentPickerProps {
  value: AttachmentMeta[];
  onChange: (next: AttachmentMeta[]) => void;
  /** Validation message from the form (e.g. server-side), shown with the picker's own messages. */
  error?: string;
  /** Points at the (programmatically focusable) wrapper, e.g. for an error summary link. */
  ref?: Ref<HTMLDivElement>;
}

/**
 * Drag-and-drop zone plus a "Choose files" button. UI only: the file names, sizes and types are recorded and the
 * files themselves are not uploaded. Enforces the shared count and size limits with plain-language messages.
 */
export function AttachmentPicker({ value, onChange, error, ref }: AttachmentPickerProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const full = value.length >= ATTACHMENT_MAX_FILES;
  const limitText = `Up to ${ATTACHMENT_MAX_FILES} files, ${formatBytes(ATTACHMENT_MAX_BYTES)} each.`;

  function add(files: File[]) {
    const next = [...value];
    const issues: string[] = [];
    for (const f of files) {
      if (next.some((a) => a.name === f.name)) {
        issues.push(`“${f.name}” is already attached.`);
      } else if (f.size > ATTACHMENT_MAX_BYTES) {
        issues.push(`“${f.name}” is ${formatBytes(f.size)}. Files can be up to ${formatBytes(ATTACHMENT_MAX_BYTES)} each.`);
      } else if (next.length >= ATTACHMENT_MAX_FILES) {
        issues.push(`“${f.name}” wasn't added: you can attach up to ${ATTACHMENT_MAX_FILES} files.`);
      } else {
        next.push({ name: f.name, size: f.size, type: f.type });
      }
    }
    setProblems(issues);
    if (next.length !== value.length) onChange(next);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    add(Array.from(e.dataTransfer.files));
  }

  const messages = [...problems, ...(error ? [error] : [])];

  return (
    <div className="att-picker" ref={ref} tabIndex={-1} role="group" aria-labelledby={`${id}-label`}>
      <div className="att-picker__head">
        <span className="att-picker__label" id={`${id}-label`}>
          Attachments <span className="field__optional">(optional)</span>
        </span>
        <span className="field__count">
          {value.length}/{ATTACHMENT_MAX_FILES} files
        </span>
      </div>
      <div
        className={["att-drop", dragging && "att-drop--active", full && "att-drop--full"].filter(Boolean).join(" ")}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = full ? "none" : "copy";
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <span className="att-drop__icon" aria-hidden="true">
          <ClipIcon />
        </span>
        <p className="att-drop__text">
          {full ? "You've attached the maximum number of files." : "Drag photos or screenshots here, or"}
        </p>
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => inputRef.current?.click()}
          disabled={full}
          aria-describedby={`${id}-hint`}
        >
          Choose files
        </button>
        <input
          ref={inputRef}
          id={`${id}-input`}
          type="file"
          multiple
          hidden
          aria-labelledby={`${id}-label`}
          onChange={(e) => {
            add(Array.from(e.target.files ?? []));
            e.target.value = ""; // allow picking the same file again after removing it
          }}
        />
      </div>
      <p id={`${id}-hint`} className="field__hint">
        {full ? `Remove a file to add a different one. ` : `${limitText} `}
        Files aren't uploaded in this demo: only their names and sizes are shared with our team.
      </p>
      {messages.length > 0 && (
        <ul className="att-picker__errors field__error" role="alert">
          {messages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      {value.length > 0 && (
        <ul className="att-list" aria-label="Attached files">
          {value.map((a) => (
            <li key={a.name} className="att-list__item">
              <span className="att-chips__icon" aria-hidden="true">
                <ClipIcon />
              </span>
              <span className="att-list__name">{a.name}</span>
              <span className="att-list__size">{formatBytes(a.size)}</span>
              <button
                type="button"
                className="btn btn--ghost btn--sm att-list__remove"
                aria-label={`Remove ${a.name}`}
                onClick={() => {
                  onChange(value.filter((x) => x.name !== a.name));
                  setProblems([]);
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
