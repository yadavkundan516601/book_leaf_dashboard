import { useId, type ReactElement, type ReactNode } from "react";

interface FormFieldProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  /** Receives the id and aria props to spread onto the control. */
  children: (control: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => ReactElement;
}

export function FormField({ label, error, hint, children }: FormFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={error ? "field field--error" : "field"}>
      <label htmlFor={id}>{label}</label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": describedBy })}
      {hint && (
        <div id={hintId} className="field__hint">
          {hint}
        </div>
      )}
      {error && (
        <div id={errorId} className="field__error">
          {error}
        </div>
      )}
    </div>
  );
}

/** Flattens zod issues / API field details into { field: firstMessage }. */
export function toFieldErrors(issues: { path?: PropertyKey[]; field?: string; message: string }[]) {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.field ?? String(issue.path?.[0] ?? "");
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}
