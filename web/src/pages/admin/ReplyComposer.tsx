import { createMessageSchema, type AdminTicketDto, type DraftDto } from "@bookleaf/shared";
import { useEffect, useRef, useState } from "react";
import { errorMessage } from "../../api/client";
import { useGenerateDraft, useSendMessage } from "../../api/hooks";
import { useToast } from "../../components/Toast";
import { formatRelative } from "../../lib/format";

function DraftBanner({ draft }: { draft: DraftDto }) {
  if (draft.source === "template") {
    return (
      <div className="alert alert--warning small" role="status">
        <strong>Template reply.</strong> {draft.notice ?? "The AI assistant is unavailable, so a standard template was used."}{" "}
        Personalise it before sending.
      </div>
    );
  }
  return (
    <div className="draft-banner small">
      <strong>AI draft — review before sending.</strong>{" "}
      <span className="muted">
        {draft.model && <>Model {draft.model} · </>}generated {formatRelative(draft.createdAt)}
      </span>
      {draft.kbSections.length > 0 && (
        <div className="draft-banner__kb">
          Grounded on:{" "}
          {draft.kbSections.map((s) => (
            <span key={s} className="kb-chip">
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Reply box pre-filled with an AI draft. The draft is requested once when the ticket opens;
 * after a reply is sent, a new one is only generated when the agent asks for it.
 */
export function ReplyComposer({ ticket }: { ticket: AdminTicketDto }) {
  const toast = useToast();
  const send = useSendMessage(ticket.id);
  const generate = useGenerateDraft(ticket.id);
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState<DraftDto | null>(null);
  const [usedAiDraft, setUsedAiDraft] = useState(false);
  const [writingManually, setWritingManually] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Read inside the async draft callback, where state captured at request time would be stale.
  const latest = useRef({ body, writingManually });
  latest.current = { body, writingManually };
  const requestedOnce = useRef(false);

  const applyDraft = (d: DraftDto) => {
    setBody(d.body);
    setUsedAiDraft(true);
    setError(null);
  };

  const requestDraft = (opts: { regenerate: boolean; replace: boolean }) => {
    generate.mutate(opts.regenerate, {
      onSuccess: (d) => {
        setDraft(d);
        // Never clobber text the agent typed while the draft was loading.
        if (opts.replace || (!latest.current.body.trim() && !latest.current.writingManually)) applyDraft(d);
      },
    });
  };

  // Auto-draft once, the first time this ticket is seen in a repliable state (the parent keys us by ticket id).
  useEffect(() => {
    if (requestedOnce.current || ticket.status === "closed") return;
    requestedOnce.current = true;
    requestDraft({ regenerate: false, replace: false });
  }, [ticket.status]);

  if (ticket.status === "closed") {
    return (
      <div className="alert alert--info">This ticket is closed. Change its status to reopen it before replying.</div>
    );
  }

  const lastAuthorMessage = [...ticket.messages].reverse().find((m) => m.sender === "author");
  const draftIsStale = Boolean(draft && lastAuthorMessage && lastAuthorMessage.createdAt > draft.createdAt);
  const bodyFromDraft = draft !== null && body === draft.body;
  const showSkeleton = generate.isPending && !body && !writingManually;

  const onRegenerate = () => {
    const hasEdits = body.trim() && !bodyFromDraft;
    if (hasEdits && !window.confirm("Replace your current text with a new AI draft?")) return;
    requestDraft({ regenerate: true, replace: true });
  };

  async function onSend(resolve: boolean) {
    const parsed = createMessageSchema.safeParse({ body });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Write a reply first");
      return;
    }
    setError(null);
    try {
      await send.mutateAsync({ body: parsed.data.body, usedAiDraft, ...(resolve ? { status: "resolved" as const } : {}) });
      setBody("");
      setDraft(null);
      setUsedAiDraft(false);
      setWritingManually(false);
      toast.success(resolve ? "Reply sent and ticket marked resolved." : "Reply sent to the author.");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const busy = send.isPending;

  return (
    <div className="composer stack-sm">
      <div className="composer__head">
        <label htmlFor="admin-reply" className="label">
          Reply to author
        </label>
        <button
          type="button"
          className="btn btn--sm"
          onClick={draft ? onRegenerate : () => requestDraft({ regenerate: requestedOnce.current, replace: !body.trim() })}
          disabled={generate.isPending || busy}
        >
          {generate.isPending ? "Drafting…" : draft ? "Regenerate" : "Draft with AI"}
        </button>
      </div>

      {generate.error && (
        <div className="alert alert--error small" role="alert">
          Couldn't generate a draft: {errorMessage(generate.error)} You can write the reply yourself.
        </div>
      )}
      {draft && <DraftBanner draft={draft} />}
      {draft && draftIsStale && (
        <div className="alert alert--warning small">The author has written again since this draft was generated. Consider regenerating.</div>
      )}
      {draft && !bodyFromDraft && !generate.isPending && (
        <div className="small">
          <button type="button" className="link-button" onClick={() => applyDraft(draft)}>
            Replace my text with the draft
          </button>
        </div>
      )}

      {showSkeleton ? (
        <div className="skeleton-composer" aria-busy="true" aria-label="Drafting a reply with AI">
          <span className="skeleton-line" />
          <span className="skeleton-line" />
          <span className="skeleton-line skeleton-line--short" />
          <button type="button" className="link-button small" onClick={() => setWritingManually(true)}>
            Write manually instead
          </button>
        </div>
      ) : (
        <textarea
          id="admin-reply"
          rows={10}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            if (!e.target.value.trim()) setUsedAiDraft(false);
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "admin-reply-error" : undefined}
          placeholder="Write your reply to the author…"
        />
      )}
      {error && (
        <div id="admin-reply-error" className="field__error" role="alert">
          {error}
        </div>
      )}
      <div className="actions">
        <button type="button" className="btn" disabled={busy || !body.trim()} onClick={() => void onSend(false)}>
          {busy ? "Sending…" : "Send reply"}
        </button>
        <button type="button" className="btn btn--primary" disabled={busy || !body.trim()} onClick={() => void onSend(true)}>
          Send &amp; mark resolved
        </button>
      </div>
    </div>
  );
}
