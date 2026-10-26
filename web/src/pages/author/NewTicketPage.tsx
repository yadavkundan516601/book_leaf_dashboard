import { createTicketSchema, type AttachmentMeta, type BookDto, type CreateTicketInput } from "@bookleaf/shared";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ApiError, errorMessage } from "../../api/client";
import { useCreateTicket, useMyBooks } from "../../api/hooks";
import { AttachmentPicker } from "../../components/Attachments";
import { FormField, toFieldErrors } from "../../components/FormField";
import { CheckIcon } from "../../components/icons";
import { Card, PageHeader } from "../../components/ui";
import { useAuth } from "../../auth/AuthProvider";
import { formatRelative } from "../../lib/format";
import { stageProgress } from "../../lib/productionStage";
import "../../styles/author-tickets.css";
import { safeStorage, useDocumentTitle, useLeaveGuard } from "./tickets/hooks";
import { ProgressHelp, RoyaltyHelp } from "./tickets/SmartHelp";
import { isTopicId, topicById, type TopicId } from "./tickets/topics";
import { TopicPicker } from "./tickets/TopicPicker";

const GENERAL = "";
const GENERAL_LABEL = "General / Account level";
const SUBJECT_MIN = 5;
const SUBJECT_MAX = 150;
const DESCRIPTION_MIN = 20;
const DESCRIPTION_MAX = 5000;

type Field = "bookId" | "subject" | "description" | "attachments";
const FIELD_ORDER: readonly Field[] = ["bookId", "subject", "description", "attachments"];
const FIELD_NAMES: Record<Field, string> = {
  bookId: "Book",
  subject: "Subject",
  description: "Description",
  attachments: "Attachments",
};

interface Values {
  bookId: string;
  subject: string;
  description: string;
  attachments: AttachmentMeta[];
}

interface Draft {
  topic: TopicId | null;
  bookId: string;
  subject: string;
  description: string;
  savedAt: string;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

function parseDraft(raw: unknown): Draft | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const draft: Draft = {
    topic: isTopicId(r.topic) ? r.topic : null,
    bookId: str(r.bookId),
    subject: str(r.subject),
    description: str(r.description),
    savedAt: str(r.savedAt) || new Date().toISOString(),
  };
  return draft.subject.trim() || draft.description.trim() ? draft : null;
}

/** Validates with the shared schema; empty fields get a friendlier message than the length rule. */
function validate(v: Values): { errors: Partial<Record<Field, string>>; data?: CreateTicketInput } {
  const parsed = createTicketSchema.safeParse({
    bookId: v.bookId || null,
    subject: v.subject,
    description: v.description,
    attachments: v.attachments,
  });
  if (parsed.success) return { errors: {}, data: parsed.data };
  const errors: Partial<Record<Field, string>> = toFieldErrors(parsed.error.issues);
  if (!v.subject.trim()) errors.subject = `Add a subject (at least ${SUBJECT_MIN} characters).`;
  if (!v.description.trim()) errors.description = `Describe your question (at least ${DESCRIPTION_MIN} characters).`;
  return { errors };
}

const bookOptionLabel = (b: BookDto) => `${b.title} (${b.status})`;

export function NewTicketPage() {
  useDocumentTitle("New query");
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const books = useMyBooks();
  const create = useCreateTicket();
  const draftKey = `bookleaf:new-query-draft:${user?.id ?? "anonymous"}`;

  const [topic, setTopic] = useState<TopicId | null>(null);
  const [values, setValues] = useState<Values>({
    bookId: params.get("bookId") ?? GENERAL,
    subject: "",
    description: "",
    attachments: [],
  });
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(() => safeStorage.read(draftKey, parseDraft));
  const [touched, setTouched] = useState<ReadonlySet<Field>>(new Set());
  const [serverErrors, setServerErrors] = useState<Partial<Record<Field, string>>>({});
  const [summaryFields, setSummaryFields] = useState<readonly Field[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  /** Smart-help cards the author waved through with "I still need help" ("royalty", "progress:<bookId>"). */
  const [helpDismissed, setHelpDismissed] = useState<ReadonlySet<string>>(new Set());
  const [focusSubjectSoon, setFocusSubjectSoon] = useState(false);
  const submitting = useRef(false);

  const step1Id = useId();
  const topicHelpId = useId();
  const bookRef = useRef<HTMLSelectElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const attachmentsRef = useRef<HTMLDivElement>(null);
  const fieldRefs: Record<Field, { current: HTMLElement | null }> = {
    bookId: bookRef,
    subject: subjectRef,
    description: descriptionRef,
    attachments: attachmentsRef,
  };

  // ----- Book selection: ?bookId= preselects; an id that isn't one of the author's books falls back to General.
  const bookList = books.data?.books ?? [];
  const knownBook = bookList.find((b) => b.id === values.bookId);
  const unknownBook = Boolean(books.data) && values.bookId !== GENERAL && !knownBook;
  const effectiveBookId = unknownBook ? GENERAL : values.bookId;
  const selectedBook = unknownBook ? undefined : knownBook;
  // While the list loads the preselected id is kept; if it can't load, the query goes out as General.
  const effective: Values = { ...values, bookId: books.error ? GENERAL : books.data ? effectiveBookId : values.bookId };

  // ----- Validation: errors show for fields the author has left (blur) or after a submit attempt.
  const { errors: clientErrors } = validate(effective);
  const errorFor = (f: Field) => (touched.has(f) ? (clientErrors[f] ?? serverErrors[f]) : serverErrors[f]);
  const summary = summaryFields.filter((f) => errorFor(f));
  const touch = (f: Field) => setTouched((t) => (t.has(f) ? t : new Set(t).add(f)));

  const set = <K extends Field>(f: K, v: Values[K]) => {
    setValues((prev) => ({ ...prev, [f]: v }));
    setServerErrors((prev) => (prev[f] ? { ...prev, [f]: undefined } : prev));
  };

  // ----- Draft safety: autosave as they type (not while the restore question is still open).
  const hasText = Boolean(values.subject.trim() || values.description.trim());
  useEffect(() => {
    if (pendingDraft) return;
    if (!hasText) {
      safeStorage.remove(draftKey);
      return;
    }
    const draft: Draft = {
      topic,
      bookId: values.bookId,
      subject: values.subject,
      description: values.description,
      savedAt: new Date().toISOString(),
    };
    safeStorage.write(draftKey, draft);
  }, [pendingDraft, hasText, draftKey, topic, values.bookId, values.subject, values.description]);

  const unsent = hasText || values.attachments.length > 0;
  const allowNavigation = useLeaveGuard(unsent && !create.isSuccess);

  function restoreDraft(d: Draft) {
    setTopic(d.topic ?? "other");
    setValues((prev) => ({ ...prev, bookId: d.bookId, subject: d.subject, description: d.description }));
    setPendingDraft(null);
  }
  function discardDraft() {
    safeStorage.remove(draftKey);
    setPendingDraft(null);
  }

  // ----- Smart help (never blocks: "I still need help" always reveals the form; hidden once text exists).
  const progress = selectedBook && !selectedBook.isPublished ? stageProgress(selectedBook.status) : null;
  const helpKey =
    topic === "royalty" && !books.error ? "royalty" : topic === "progress" && progress && selectedBook ? `progress:${selectedBook.id}` : null;
  const showHelp = helpKey !== null && !helpDismissed.has(helpKey) && !hasText;
  const needHelp = () => {
    if (helpKey) setHelpDismissed((s) => new Set(s).add(helpKey));
    setFocusSubjectSoon(true);
  };
  useEffect(() => {
    if (focusSubjectSoon && !showHelp) {
      subjectRef.current?.focus();
      setFocusSubjectSoon(false);
    }
  }, [focusSubjectSoon, showHelp]);

  function focusField(f: Field) {
    const el = fieldRefs[f].current;
    el?.focus();
    el?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    setFormError(null);
    setTouched(new Set(FIELD_ORDER));
    const { errors, data } = validate(effective);
    const invalid = FIELD_ORDER.filter((f) => errors[f]);
    if (!data || invalid.length > 0) {
      setSummaryFields(invalid);
      focusField(invalid[0] ?? "subject");
      return;
    }
    setSummaryFields([]);
    submitting.current = true;
    try {
      const ticket = await create.mutateAsync(data);
      safeStorage.remove(draftKey);
      allowNavigation();
      void navigate(`/author/tickets/${ticket.id}`, { state: { created: ticket.reference } });
    } catch (error) {
      const fieldErrs: Partial<Record<Field, string>> =
        error instanceof ApiError && error.details.length ? toFieldErrors(error.details) : {};
      const serverInvalid = FIELD_ORDER.filter((f) => fieldErrs[f]);
      setServerErrors(fieldErrs);
      setSummaryFields(serverInvalid);
      setFormError(errorMessage(error));
      if (serverInvalid[0]) focusField(serverInvalid[0]);
    } finally {
      submitting.current = false;
    }
  }

  const chosen = topic ? topicById(topic) : null;
  const sending = create.isPending || create.isSuccess;
  const subjectLen = values.subject.trim().length;
  const descLen = values.description.trim().length;
  const descShort = DESCRIPTION_MIN - descLen;

  let bookHint: string;
  if (books.isPending) bookHint = "Loading your books…";
  else if (books.error) bookHint = `We couldn't load your books, so this query will be sent as ${GENERAL_LABEL}.`;
  else if (unknownBook) bookHint = `We couldn't find that book on your account, so ${GENERAL_LABEL} is selected.`;
  else if (selectedBook) bookHint = selectedBook.isPublished ? "This book is published and live." : `Current stage: ${selectedBook.status}.`;
  else bookHint = "Choose General for questions about your account, your contract or all your books at once.";

  return (
    <div className="at-page">
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", to: "/author/overview" },
          { label: "My tickets", to: "/author/tickets" },
          { label: "New query" },
        ]}
        title="New query"
        subtitle="Tell us what you need. Our support team replies on your query's page, where you can follow the answer."
      />

      {pendingDraft && (
        <div className="at-banner at-banner--info" role="region" aria-label="Unsent draft">
          <div className="at-banner__text">
            <p className="at-banner__title">Restore your unsent draft?</p>
            <p>
              You started a query {formatRelative(pendingDraft.savedAt)}
              {pendingDraft.subject.trim() ? (
                <>
                  : <q>{pendingDraft.subject.trim()}</q>
                </>
              ) : (
                ""
              )}
              .
            </p>
          </div>
          <div className="at-banner__actions">
            <button type="button" className="btn btn--primary btn--sm" onClick={() => restoreDraft(pendingDraft)}>
              Restore
            </button>
            <button type="button" className="btn btn--sm" onClick={discardDraft}>
              Discard
            </button>
          </div>
        </div>
      )}

      <div className="nq-layout">
        <form className="nq-form" onSubmit={(e) => void onSubmit(e)} noValidate aria-label="New query">
          {summary.length > 0 && (
            <div className="nq-summary" role="alert">
              <p className="nq-summary__title">
                Please fix {summary.length === 1 ? "this problem" : `these ${summary.length} problems`} before sending:
              </p>
              <ul>
                {summary.map((f) => (
                  <li key={f}>
                    <button type="button" className="link-button" onClick={() => focusField(f)}>
                      {FIELD_NAMES[f]}: {errorFor(f)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {formError && summary.length === 0 && (
            <div className="alert alert--error" role="alert">
              {formError}
            </div>
          )}

          <Card as="section" className="nq-step" aria-labelledby={step1Id}>
            <h2 className="nq-step__title" id={step1Id}>
              <span className="nq-step__num" aria-hidden="true">
                1
              </span>
              What is this about?
            </h2>
            <TopicPicker
              value={topic}
              onChange={setTopic}
              labelledBy={step1Id}
              describedBy={chosen ? topicHelpId : undefined}
            />
            {chosen ? (
              <p className="nq-step__helper" id={topicHelpId}>
                {chosen.helper}
              </p>
            ) : (
              <p className="nq-step__helper muted">Choose a topic to continue. It lets us show you the right tips.</p>
            )}
          </Card>

          {chosen && (
            <Card as="section" className="nq-step" aria-labelledby={`${step1Id}-2`}>
              <h2 className="nq-step__title" id={`${step1Id}-2`}>
                <span className="nq-step__num" aria-hidden="true">
                  2
                </span>
                Tell us more
              </h2>

              <FormField label="Which book is this about?" error={errorFor("bookId")} hint={bookHint}>
                {(p) => (
                  <select
                    {...p}
                    ref={bookRef}
                    value={books.data ? effectiveBookId : GENERAL}
                    disabled={books.isPending}
                    onChange={(e) => set("bookId", e.target.value)}
                    onBlur={() => touch("bookId")}
                  >
                    <option value={GENERAL}>{GENERAL_LABEL}</option>
                    {bookList.map((b) => (
                      <option key={b.id} value={b.id}>
                        {bookOptionLabel(b)}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
              {books.error && (
                <button type="button" className="link-button nq-retry" onClick={() => void books.refetch()}>
                  Try loading your books again
                </button>
              )}

              {showHelp && topic === "royalty" && <RoyaltyHelp data={books.data} onNeedHelp={needHelp} />}
              {showHelp && topic === "progress" && selectedBook && progress && (
                <ProgressHelp book={selectedBook} progress={progress} onNeedHelp={needHelp} />
              )}

              {!showHelp && (
                <>
                  <FormField
                    label="Subject"
                    error={errorFor("subject")}
                    counter={`${values.subject.length}/${SUBJECT_MAX}`}
                    hint={
                      <>
                        A short summary, {SUBJECT_MIN} to {SUBJECT_MAX} characters. For example: <q>{chosen.subjectExample}</q>
                      </>
                    }
                  >
                    {(p) => (
                      <input
                        {...p}
                        ref={subjectRef}
                        value={values.subject}
                        maxLength={SUBJECT_MAX}
                        autoComplete="off"
                        onChange={(e) => set("subject", e.target.value)}
                        onBlur={() => touch("subject")}
                      />
                    )}
                  </FormField>

                  <FormField
                    label="Describe your question"
                    error={errorFor("description")}
                    counter={`${values.description.length.toLocaleString("en-IN")}/${DESCRIPTION_MAX.toLocaleString("en-IN")}`}
                    hint={
                      descShort > 0
                        ? `Minimum ${DESCRIPTION_MIN} characters: ${descShort} more to go.`
                        : `Minimum ${DESCRIPTION_MIN} characters reached. Add anything else that helps.`
                    }
                  >
                    {(p) => (
                      <textarea
                        {...p}
                        ref={descriptionRef}
                        rows={8}
                        value={values.description}
                        maxLength={DESCRIPTION_MAX}
                        onChange={(e) => set("description", e.target.value)}
                        onBlur={() => touch("description")}
                      />
                    )}
                  </FormField>

                  <AttachmentPicker
                    ref={attachmentsRef}
                    value={values.attachments}
                    onChange={(next) => set("attachments", next)}
                    error={errorFor("attachments")}
                  />

                  <div className="nq-submit">
                    <div className="nq-submit__buttons">
                      <button
                        type="submit"
                        className="btn btn--primary"
                        disabled={sending}
                        aria-busy={sending}
                        aria-describedby={`${step1Id}-submit-hint`}
                      >
                        <span>{sending ? "Sending…" : "Send query"}</span>
                      </button>
                      <Link to="/author/tickets" className="btn btn--ghost">
                        Cancel
                      </Link>
                    </div>
                    <p className="field__hint" id={`${step1Id}-submit-hint`} role="status">
                      {sending
                        ? "Sending your query. The button is paused so it can't be sent twice."
                        : subjectLen >= SUBJECT_MIN && descLen >= DESCRIPTION_MIN
                          ? "Ready to send. Your draft is saved on this device until it's sent."
                          : "We'll check everything when you send. Your draft is saved on this device as you type."}
                    </p>
                  </div>
                </>
              )}
            </Card>
          )}
        </form>

        <aside className="nq-aside" aria-label="What to include">
          <Card className="nq-tips">
            {chosen ? (
              <>
                <h2 className="nq-tips__title">What to include</h2>
                <p className="nq-tips__lead">For {chosen.label.toLowerCase()} queries, these details help us answer first time:</p>
                <ul className="nq-checklist">
                  {chosen.include.map((item) => (
                    <li key={item}>
                      <span className="nq-checklist__icon" aria-hidden="true">
                        <CheckIcon />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <h2 className="nq-tips__title">How it works</h2>
                <ol className="nq-howto">
                  <li>Pick what your query is about.</li>
                  <li>Tell us the details. We'll show you what to include.</li>
                  <li>Our support team replies on the query's page, and you can follow it under My tickets.</li>
                </ol>
              </>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
