import {
  DRAFT_CUSTOM_INSTRUCTION_MAX,
  EMPTY_DRAFT_GROUNDING,
  checkDraft,
  type DraftGrounding,
  type DraftRefineInstruction,
  type DraftWarning,
  type DraftWarningSeverity,
} from "@bookleaf/shared";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { HelpTip, Pill, type Tone } from "../../../components/ui";

const PRESETS: { instruction: Exclude<DraftRefineInstruction, "custom">; label: string }[] = [
  { instruction: "shorter", label: "Shorter" },
  { instruction: "warmer", label: "Warmer" },
  { instruction: "clearer", label: "Clearer" },
  { instruction: "add_next_steps", label: "Add next steps" },
];

interface ToolbarProps {
  /** Why refining is unavailable right now, shown under the buttons; null when it is available. */
  blockedReason: string | null;
  /** The instruction being applied, if a refinement is in flight. */
  pending: DraftRefineInstruction | null;
  onRefine: (instruction: DraftRefineInstruction, customInstruction?: string) => void;
}

/** Rewrite the current reply with the AI: four one-click presets plus a free-text instruction. */
export function RefineToolbar({ blockedReason, pending, onRefine }: ToolbarProps) {
  const id = useId();
  const reasonId = `${id}-reason`;
  const customId = `${id}-custom`;
  const customHintId = `${id}-custom-hint`;
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const disabled = blockedReason !== null || pending !== null;
  const customEmpty = !custom.trim();
  const describedBy = blockedReason ? reasonId : undefined;

  const openCustom = () => {
    setCustomOpen((open) => !open);
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  const applyCustom = () => {
    if (disabled || customEmpty) return;
    onRefine("custom", custom.trim());
  };
  const onCustomKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyCustom();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setCustomOpen(false);
    }
  };

  return (
    <div className="aw-refine" role="group" aria-labelledby={`${id}-label`}>
      <div className="aw-refine__bar">
        <span id={`${id}-label`} className="aw-refine__label">
          Rewrite with AI
        </span>
        <HelpTip label="What does Rewrite with AI do?">
          Rewrites the text in the reply box, keeping the author's figures. Your current text is replaced; use Undo in the
          message that appears to get it back.
        </HelpTip>
        {PRESETS.map((p) => (
          <button
            key={p.instruction}
            type="button"
            className="btn btn--sm"
            aria-busy={pending === p.instruction}
            disabled={disabled}
            aria-describedby={describedBy}
            onClick={() => onRefine(p.instruction)}
          >
            <span>{p.label}</span>
          </button>
        ))}
        <button
          type="button"
          className="btn btn--sm"
          aria-expanded={customOpen}
          aria-controls={customId}
          disabled={pending !== null}
          onClick={openCustom}
        >
          <span>Custom…</span>
        </button>
      </div>

      {customOpen && (
        <div id={customId} className="aw-refine__custom">
          <label htmlFor={`${customId}-input`} className="aw-refine__custom-label">
            How should the reply change?
          </label>
          <div className="aw-refine__custom-row">
            <input
              id={`${customId}-input`}
              ref={inputRef}
              type="text"
              value={custom}
              maxLength={DRAFT_CUSTOM_INSTRUCTION_MAX}
              placeholder="e.g. Mention the royalty dashboard"
              aria-describedby={customHintId}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={onCustomKey}
            />
            <button
              type="button"
              className="btn btn--sm btn--primary"
              aria-busy={pending === "custom"}
              disabled={disabled || customEmpty}
              aria-describedby={[customHintId, describedBy].filter(Boolean).join(" ")}
              onClick={applyCustom}
            >
              <span>Apply</span>
            </button>
            <button type="button" className="btn btn--sm btn--ghost" disabled={pending === "custom"} onClick={() => setCustomOpen(false)}>
              <span>Cancel</span>
            </button>
          </div>
          <span id={customHintId} className="field__hint">
            {customEmpty
              ? "Describe the change first, then press Apply."
              : `${custom.length} / ${DRAFT_CUSTOM_INSTRUCTION_MAX} characters. Enter applies, Esc closes.`}
          </span>
        </div>
      )}

      {pending ? (
        <p className="aw-refine__reason" role="status">
          Rewriting your reply…
        </p>
      ) : (
        blockedReason && (
          <p id={reasonId} className="aw-refine__reason">
            {blockedReason}
          </p>
        )
      )}
    </div>
  );
}

const SEVERITY: Record<DraftWarningSeverity, { tone: Tone; label: string }> = {
  high: { tone: "danger", label: "Check" },
  medium: { tone: "warning", label: "Review" },
  low: { tone: "neutral", label: "Minor" },
};

const CHECK_DELAY_MS = 250;

interface CheckProps {
  body: string;
  /** From the last draft response; null until one has arrived, in which case figures are not checked. */
  grounding: DraftGrounding | null;
  /** Select the warning's snippet in the reply box. */
  onSelect: (warning: DraftWarning) => void;
}

/** Live "check before sending": figures the author's records don't back, plus the house-style checklist. */
export function DraftCheckPanel({ body, grounding, onSelect }: CheckProps) {
  const id = useId();
  const [checked, setChecked] = useState(body);
  useEffect(() => {
    const timer = window.setTimeout(() => setChecked(body), CHECK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [body]);

  const result = useMemo(() => checkDraft(checked, grounding ?? EMPTY_DRAFT_GROUNDING), [checked, grounding]);
  // Without grounding every figure would look invented: show the checklist only.
  const warnings = grounding ? result.warnings : [];
  const missing = result.checklist.filter((c) => !c.passed);
  const empty = !checked.trim();
  const issues = warnings.length + missing.length;
  const summary = empty ? "Nothing to check yet" : issues === 0 ? "Looks good" : `${issues} ${issues === 1 ? "thing" : "things"} to check`;

  return (
    <section className="aw-check" aria-labelledby={`${id}-title`}>
      <div className="aw-check__head">
        <h3 id={`${id}-title`} className="aw-check__title">
          Check before sending
        </h3>
        <HelpTip label="What does the check do?">
          It compares figures with this author's records; it can't judge tone fully. Amounts, dates and timelines are matched
          against the author's books, royalties and BookLeaf policy, and the reply is checked for a greeting, a specific fact,
          a next step and the sign-off. Read the reply yourself before sending.
        </HelpTip>
        <span
          className={`aw-check__summary${!empty && issues === 0 ? " aw-check__summary--ok" : ""}`}
          aria-live="polite"
          aria-atomic="true"
        >
          {summary}
        </span>
      </div>

      {empty ? (
        <p className="aw-check__note">The check runs as soon as the reply box has text.</p>
      ) : (
        <>
          {!grounding && <p className="aw-check__note">Figures are checked once the AI draft for this ticket has loaded.</p>}
          {warnings.length > 0 && (
            <ul className="aw-check__warnings" aria-label="Figures to check">
              {warnings.map((w) => (
                <li key={`${w.start}-${w.kind}`}>
                  <button type="button" className={`aw-check__warning aw-check__warning--${w.severity}`} onClick={() => onSelect(w)}>
                    <Pill tone={SEVERITY[w.severity].tone}>{SEVERITY[w.severity].label}</Pill>
                    <code className="aw-check__snippet">{w.text}</code>
                    <span className="aw-check__message">{w.message}</span>
                    <span className="ui-sr-only"> Select it in the reply.</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <ul className="aw-chips aw-check__list" aria-label="Reply checklist">
            {result.checklist.map((c) => (
              <li key={c.id} className={`aw-check__item aw-check__item--${c.passed ? "ok" : "missing"}`}>
                <Pill tone={c.passed ? "success" : "neutral"}>
                  <span aria-hidden="true">{c.passed ? "✓" : "○"}</span>
                  {c.label}
                  <span className="ui-sr-only">{c.passed ? ": done" : ": missing"}</span>
                </Pill>
                {!c.passed && <HelpTip label={`How to fix: ${c.label}`}>{c.hint}</HelpTip>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
