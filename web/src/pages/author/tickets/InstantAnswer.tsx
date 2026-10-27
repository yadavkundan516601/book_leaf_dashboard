import type { AnswerConfidence, AnswerDto } from "@bookleaf/shared";
import { useId, useState } from "react";
import { ApiError } from "../../../api/client";
import { Card, CardHeader, HelpTip, Pill, Skeleton, type Tone } from "../../../components/ui";
import { useInstantAnswer } from "./hooks";

/** Same as the description minimum: shorter text rarely says enough to answer. */
export const INSTANT_ANSWER_MIN = 20;
const QUESTION_MAX = 1000;
const SUBJECT_MAX = 150;

const CONFIDENCE: Record<AnswerConfidence, { label: string; tone: Tone }> = {
  high: { label: "High confidence", tone: "success" },
  medium: { label: "Medium confidence", tone: "info" },
  low: { label: "Low confidence", tone: "warning" },
};

function failureMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 429) {
    return "You've asked a lot of questions in a short time, you can still send your query.";
  }
  if (error instanceof ApiError && error.status === 400 && error.details[0]) return error.details[0].message;
  return "We couldn't get an instant answer right now. You can still send your query.";
}

export interface InstantAnswerProps {
  /** The description as typed; trimmed and capped before sending. */
  question: string;
  subject: string;
  bookId: string | null;
  /** "That solved it": the page clears the draft and leaves. */
  onSolved: () => void;
  /** "Send my query anyway": the page moves focus to its submit button. */
  onSendAnyway: () => void;
}

/**
 * "Get an instant answer" card on the New Query page. Only asks when the author clicks (never while typing),
 * keeps every answer it got for this visit keyed by (question, subject, book) so asking again is instant,
 * and never stands between the author and the submit button.
 */
export function InstantAnswer({ question, subject, bookId, onSolved, onSendAnyway }: InstantAnswerProps) {
  const titleId = useId();
  const hintId = useId();
  const ask = useInstantAnswer();
  const [answers, setAnswers] = useState<ReadonlyMap<string, AnswerDto>>(new Map());
  const [lastKey, setLastKey] = useState<string | null>(null);

  const q = question.trim().slice(0, QUESTION_MAX);
  const s = subject.trim().slice(0, SUBJECT_MAX);
  const key = JSON.stringify([q, s, bookId]);
  const current = answers.get(key);
  const shown = current ?? (lastKey ? answers.get(lastKey) : undefined);
  const stale = !current && Boolean(shown);
  const ready = q.length >= INSTANT_ANSWER_MIN;
  const pending = ask.isPending;

  function getAnswer() {
    const requested = key;
    ask.mutate(
      { question: q, subject: s || undefined, bookId },
      {
        onSuccess: (dto) => {
          setAnswers((prev) => new Map(prev).set(requested, dto));
          setLastKey(requested);
        },
      },
    );
  }

  return (
    <Card as="section" className="nq-answer" aria-labelledby={titleId}>
      <CardHeader
        as="h3"
        titleId={titleId}
        title="Get an instant answer"
        subtitle="Our assistant can often answer straight away from our policies and your account details."
      />

      {!current && (
        <div className="nq-answer__ask">
          <button
            type="button"
            className="btn"
            disabled={!ready || pending}
            aria-busy={pending}
            aria-describedby={hintId}
            onClick={getAnswer}
          >
            {pending ? "Getting an answer…" : stale ? "Get an updated answer" : "Get an instant answer"}
          </button>
          <p className="field__hint" id={hintId}>
            {ready
              ? "Uses the subject and description above. Nothing is sent to our team until you send your query."
              : `Write at least ${INSTANT_ANSWER_MIN} characters in your description to get an instant answer.`}
          </p>
        </div>
      )}

      <div className="nq-answer__live" aria-live="polite">
        {pending && (
          <div className="nq-answer__loading">
            <span className="ui-sr-only">Getting an answer…</span>
            <Skeleton width="100%" height={12} radius={0} />
            <Skeleton width="92%" height={12} radius={0} />
            <Skeleton width="60%" height={12} radius={0} />
          </div>
        )}

        {!pending && ask.isError && <p className="nq-answer__error">{failureMessage(ask.error)}</p>}

        {!pending && shown && (
          <div className="nq-answer__result">
            <div className="nq-answer__meta">
              <Pill tone={shown.source === "ai" ? "primary" : "neutral"}>
                {shown.source === "ai" ? "AI-generated" : "Policy summary"}
              </Pill>
              <span className="nq-answer__confidence">
                <Pill tone={CONFIDENCE[shown.confidence].tone}>{CONFIDENCE[shown.confidence].label}</Pill>
                <HelpTip label="What does the confidence mean?">
                  High means it matches our policy and your account data; Low means a person should look at it.
                </HelpTip>
              </span>
            </div>
            {stale && <p className="nq-answer__stale">This answer is for an earlier version of your question.</p>}
            {shown.notice && <p className="nq-answer__notice">{shown.notice}</p>}
            <div className="nq-answer__body">
              {shown.answer
                .split(/\n+/)
                .filter((p) => p.trim())
                .map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
            </div>
            {shown.sources.length > 0 && (
              <p className="nq-answer__sources">Based on: {shown.sources.map((src) => src.title).join(" · ")}</p>
            )}
            <div className="nq-answer__footer">
              <p>This is an automated answer. If it doesn't solve your problem, send your query and our team will reply.</p>
              <div className="nq-answer__actions">
                <button type="button" className="btn" onClick={onSolved}>
                  That solved it
                </button>
                <button type="button" className="btn btn--primary" onClick={onSendAnyway}>
                  Send my query anyway
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
