import { createMessageSchema, type AdminTicketDto, type CreateMessageInput, type DraftDto } from "@bookleaf/shared";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { errorMessage } from "../../../api/client";
import { useGenerateDraft, useSendMessage, useUpdateTicket } from "../../../api/hooks";
import { useToast } from "../../../components/Toast";
import { Card, useConfirm } from "../../../components/ui";
import { formatCount, formatRelative } from "../../../lib/format";
import { modKey, statusLabel } from "./format";
import { finishConfirm, reopenStatusFor, useStatusChange } from "./hooks";

const MAX_CHARS = 10_000;

interface BannerProps {
  draft: DraftDto | null;
  generating: boolean;
  manual: boolean;
  stale: boolean;
  busy: boolean;
  error: unknown;
  onRegenerate: () => void;
  onManual: () => void;
  onUseDraft: () => void;
  onRequest: () => void;
}

/** What the AI contributed, with the ways out: regenerate, write it yourself, or go back to the draft. */
function DraftBanner({ draft, generating, manual, stale, busy, error, onRegenerate, onManual, onUseDraft, onRequest }: BannerProps) {
  if (generating) {
    return (
      <div className="aw-draft aw-draft--loading" role="status">
        <strong>Drafting a reply with AI…</strong>
        <button type="button" className="link-button" onClick={onManual}>
          Write manually instead
        </button>
      </div>
    );
  }
  if (error) {
    return (
      <div className="aw-draft aw-draft--error" role="alert">
        <span>Couldn't generate a draft: {errorMessage(error)} You can write the reply yourself.</span>
        <button type="button" className="btn btn--sm" onClick={onRequest} disabled={busy}>
          Try again
        </button>
      </div>
    );
  }
  if (!draft) {
    return (
      <div className="aw-draft aw-draft--idle">
        <span className="muted">Want a starting point? The AI drafts a reply from the knowledge base.</span>
        <button type="button" className="btn btn--sm" onClick={onRequest} disabled={busy}>
          Draft with AI
        </button>
      </div>
    );
  }
  if (manual) {
    return (
      <div className="aw-draft aw-draft--idle">
        <span className="muted">Writing manually. The AI draft is still available.</span>
        <button type="button" className="btn btn--sm" onClick={onUseDraft} disabled={busy}>
          Use the AI draft
        </button>
      </div>
    );
  }
  const template = draft.source === "template";
  return (
    <div className={`aw-draft aw-draft--${template ? "template" : "ai"}`}>
      <div className="aw-draft__text">
        <strong>{template ? "Template reply: personalise before sending." : "AI draft: review before sending."}</strong>
        {template && draft.notice && <p className="aw-draft__notice">{draft.notice}</p>}
        <p className="aw-draft__meta">
          {draft.model && <>Model {draft.model} · </>}generated {formatRelative(draft.createdAt)}
        </p>
        {draft.kbSections.length > 0 && (
          <ul className="aw-chips" aria-label="Knowledge base sections used">
            {draft.kbSections.map((s) => (
              <li key={s} className="aw-chip aw-chip--kb">
                {s}
              </li>
            ))}
          </ul>
        )}
        {stale && <p className="aw-draft__stale">The author has written again since this draft. Consider regenerating.</p>}
      </div>
      <div className="aw-draft__actions">
        <button type="button" className="btn btn--sm" onClick={onRegenerate} disabled={busy}>
          Regenerate
        </button>
        <button type="button" className="link-button" onClick={onManual} disabled={busy}>
          Write manually instead
        </button>
      </div>
    </div>
  );
}

/** Shown instead of the composer on closed tickets: replying starts with an explicit reopen. */
function ClosedNotice({ ticket }: { ticket: AdminTicketDto }) {
  const { change, isPending } = useStatusChange(ticket);
  const next = reopenStatusFor(ticket);
  return (
    <Card as="section" className="aw-card aw-closed" aria-labelledby="aw-closed-title">
      <h2 id="aw-closed-title" className="aw-section-title">
        This ticket is closed
      </h2>
      <p className="muted">
        The author can't reply to a closed ticket. Reopen it to write to them; it goes back to{" "}
        <strong>{statusLabel(next)}</strong>.
      </p>
      <div>
        <button
          type="button"
          className="btn btn--primary"
          aria-busy={isPending}
          disabled={isPending}
          onClick={() => void change(next, `${ticket.reference} reopened as ${statusLabel(next).toLowerCase()}. You can reply now.`)}
        >
          <span>Reopen ticket</span>
        </button>
      </div>
    </Card>
  );
}

interface ComposerProps {
  ticket: AdminTicketDto;
  /** Reports whether the textarea holds text the agent typed or edited (an untouched AI draft doesn't count). */
  onUnsentChange: (unsent: boolean) => void;
}

/**
 * Reply box pre-filled with an AI draft. The draft is requested once when an open or in-progress ticket is
 * opened (the parent keys this by ticket id); afterwards only when the agent asks.
 */
export function ReplyComposer({ ticket, onUnsentChange }: ComposerProps) {
  if (ticket.status === "closed") return <ClosedNotice ticket={ticket} />;
  return <Composer ticket={ticket} onUnsentChange={onUnsentChange} />;
}

function Composer({ ticket, onUnsentChange }: ComposerProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const send = useSendMessage(ticket.id);
  const generate = useGenerateDraft(ticket.id);
  const update = useUpdateTicket(ticket.id);
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState<DraftDto | null>(null);
  const [usedAiDraft, setUsedAiDraft] = useState(false);
  const [manual, setManual] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<{ message: string; input: CreateMessageInput } | null>(null);
  const [busyAction, setBusyAction] = useState<"send" | "resolve" | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sending = useRef(false);
  // Read inside async callbacks, where state captured at request time would be stale.
  const latest = useRef({ body, manual });
  latest.current = { body, manual };
  const requestedOnce = useRef(false);

  const bodyFromDraft = draft !== null && body === draft.body;
  const unsent = body.trim() !== "" && !bodyFromDraft;
  useEffect(() => onUnsentChange(unsent), [unsent, onUnsentChange]);
  useEffect(() => () => onUnsentChange(false), [onUnsentChange]);

  const applyDraft = (d: DraftDto) => {
    setBody(d.body);
    setUsedAiDraft(true);
    setManual(false);
    setError(null);
  };

  const requestDraft = (opts: { regenerate: boolean; replace: boolean }) => {
    generate.mutate(opts.regenerate, {
      onSuccess: (d) => {
        setDraft(d);
        // Never clobber text the agent typed while the draft was loading.
        if (opts.replace || (!latest.current.body.trim() && !latest.current.manual)) applyDraft(d);
      },
    });
  };

  useEffect(() => {
    if (requestedOnce.current || (ticket.status !== "open" && ticket.status !== "in_progress")) return;
    requestedOnce.current = true;
    requestDraft({ regenerate: false, replace: false });
  }, [ticket.status]);

  const onRegenerate = async () => {
    if (
      unsent &&
      !(await confirm({
        title: "Replace your text with a new AI draft?",
        message: "Your edits will be lost.",
        confirmLabel: "Replace text",
        cancelLabel: "Keep my text",
        tone: "danger",
      }))
    ) {
      return;
    }
    requestDraft({ regenerate: true, replace: true });
  };

  const onManual = async () => {
    if (
      unsent &&
      !(await confirm({
        title: "Clear your text and start over?",
        confirmLabel: "Clear text",
        cancelLabel: "Keep my text",
        tone: "danger",
      }))
    ) {
      return;
    }
    if (!generate.isPending || unsent) setBody("");
    setUsedAiDraft(false);
    setManual(true);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const deliver = async (input: CreateMessageInput) => {
    if (sending.current) return;
    sending.current = true;
    const resolving = input.status === "resolved";
    const previousStatus = ticket.status;
    setBusyAction(resolving ? "resolve" : "send");
    setSendError(null);
    try {
      await send.mutateAsync(input);
      setBody("");
      setDraft(null);
      setUsedAiDraft(false);
      setManual(false);
      if (resolving && previousStatus !== "resolved") {
        toast.success(`Reply sent and ${ticket.reference} marked resolved. Sent replies can't be undone.`, {
          action: {
            label: "Undo status",
            onClick: () =>
              update.mutateAsync({ status: previousStatus }).then(
                () => toast.success(`${ticket.reference} is ${statusLabel(previousStatus).toLowerCase()} again.`),
                (err: unknown) => toast.error(`Couldn't undo: ${errorMessage(err)}`),
              ),
          },
        });
      } else {
        toast.success("Reply sent to the author. Sent replies can't be undone.");
      }
    } catch (err) {
      setSendError({ message: errorMessage(err), input });
    } finally {
      sending.current = false;
      setBusyAction(null);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  };

  const onSend = async (resolve: boolean) => {
    if (sending.current) return;
    const parsed = createMessageSchema.safeParse({ body });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Write a reply first");
      textareaRef.current?.focus();
      return;
    }
    setError(null);
    if (
      bodyFromDraft &&
      !(await confirm({
        title: "You haven't edited the AI draft. Send it as is?",
        message: "The author will receive the draft exactly as written. Check names, amounts and dates first.",
        confirmLabel: "Send as is",
        cancelLabel: "Review draft",
        // "danger" puts the initial focus on the safe choice, Review draft.
        tone: "danger",
      }))
    ) {
      textareaRef.current?.focus();
      return;
    }
    if (resolve && ticket.status !== "resolved" && !(await confirm(finishConfirm(ticket.reference, "resolved")))) return;
    await deliver({ body: parsed.data.body, usedAiDraft, ...(resolve ? { status: "resolved" as const } : {}) });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void onSend(false);
    }
  };

  const busy = busyAction !== null;
  const chars = body.length;
  const tooLong = chars > MAX_CHARS;
  const empty = !body.trim();
  const generatingEmpty = generate.isPending && empty && !manual;
  const lastAuthorMessage = [...ticket.messages].reverse().find((m) => m.sender === "author");
  const stale = Boolean(draft && lastAuthorMessage && lastAuthorMessage.createdAt > draft.createdAt);
  const blockedReason = busy
    ? "Sending your reply…"
    : generatingEmpty
      ? "Wait for the AI draft, or choose “Write manually instead”."
      : empty
        ? "Write a reply first: the send buttons unlock once there is text."
        : tooLong
          ? `Shorten the reply to ${formatCount(MAX_CHARS)} characters to send it.`
          : null;
  const describedBy = ["aw-reply-count", error && "aw-reply-error"].filter(Boolean).join(" ");

  return (
    <Card as="section" className="aw-card aw-composer" aria-labelledby="aw-composer-title">
      <div className="aw-composer__head">
        <h2 id="aw-composer-title" className="aw-section-title">
          <label htmlFor="aw-reply">Reply to {ticket.author.name}</label>
        </h2>
        <span className="aw-composer__shortcut">
          <kbd>{modKey}</kbd> + <kbd>Enter</kbd> sends
        </span>
      </div>

      <DraftBanner
        draft={draft}
        generating={generatingEmpty}
        manual={manual}
        stale={stale}
        busy={busy || generate.isPending}
        error={generate.error}
        onRegenerate={() => void onRegenerate()}
        onManual={() => void onManual()}
        onUseDraft={() => draft && applyDraft(draft)}
        onRequest={() => requestDraft({ regenerate: requestedOnce.current, replace: !body.trim() })}
      />

      <textarea
        id="aw-reply"
        ref={textareaRef}
        className="aw-composer__input"
        rows={10}
        value={body}
        readOnly={busy}
        onChange={(e) => {
          setBody(e.target.value);
          if (error) setError(null);
          if (!e.target.value.trim()) setUsedAiDraft(false);
        }}
        onKeyDown={onKeyDown}
        aria-invalid={Boolean(error) || tooLong}
        aria-describedby={describedBy}
        placeholder={generatingEmpty ? "The AI draft will appear here…" : `Write your reply to ${ticket.author.name}…`}
      />
      <div className="aw-composer__under">
        {error ? (
          <span id="aw-reply-error" className="field__error" role="alert">
            {error}
          </span>
        ) : (
          <span className="field__hint">The author sees this reply by email and in their portal.</span>
        )}
        <span id="aw-reply-count" className={`aw-counter${tooLong ? " aw-counter--over" : ""}`}>
          {formatCount(chars)} / {formatCount(MAX_CHARS)}
          <span className="ui-sr-only"> characters</span>
        </span>
      </div>

      {sendError && (
        <div className="aw-inline-error" role="alert">
          <span>Your reply wasn't sent: {sendError.message} Your text is still here.</span>
          <button type="button" className="btn btn--sm" disabled={busy} onClick={() => void deliver(sendError.input)}>
            Retry
          </button>
        </div>
      )}

      <div className="aw-composer__actions">
        {blockedReason && (
          <p id="aw-send-reason" className="aw-composer__reason" role="status">
            {blockedReason}
          </p>
        )}
        <button
          type="button"
          className="btn"
          aria-busy={busyAction === "send"}
          disabled={Boolean(blockedReason)}
          aria-describedby={blockedReason ? "aw-send-reason" : undefined}
          onClick={() => void onSend(false)}
        >
          <span>Send reply</span>
        </button>
        {ticket.status !== "resolved" && (
          <button
            type="button"
            className="btn btn--primary"
            aria-busy={busyAction === "resolve"}
            disabled={Boolean(blockedReason)}
            aria-describedby={blockedReason ? "aw-send-reason" : undefined}
            onClick={() => void onSend(true)}
          >
            <span>Send &amp; mark resolved</span>
          </button>
        )}
      </div>
    </Card>
  );
}
