import { useId, type ReactElement, type ReactNode } from "react";

interface FormFieldProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  /** Character counter or similar status shown at the right of the label row (also read with the field). */
  counter?: ReactNode;
  /** Adds "(optional)" after the label. */
  optional?: boolean;
  className?: string;
  /** Receives the id and aria props to spread onto the control. */
  children: (control: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => ReactElement;
}

export function FormField({ label, error, hint, counter, optional = false, className, children }: FormFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const counterId = `${id}-counter`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null, counter !== undefined ? counterId : null].filter(Boolean).join(" ") ||
    undefined;
  const cls = ["field", error && "field--error", className].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      {counter !== undefined ? (
        <div className="field__label-row">
          <label htmlFor={id}>
            {label}
            {optional && <span className="field__optional"> (optional)</span>}
          </label>
          <span id={counterId} className="field__count">
            {counter}
          </span>
        </div>
      ) : (
        <label htmlFor={id}>
          {label}
          {optional && <span className="field__optional"> (optional)</span>}
        </label>
      )}
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
