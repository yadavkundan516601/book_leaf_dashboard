import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_FILES,
  createTicketSchema,
  type AttachmentMeta,
} from "@bookleaf/shared";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ApiError, errorMessage } from "../../api/client";
import { useCreateTicket, useMyBooks } from "../../api/hooks";
import { FormField, toFieldErrors } from "../../components/FormField";
import { formatBytes } from "../../lib/format";

const GENERAL = "";
const SUBJECT_MAX = 150;
const DESCRIPTION_MAX = 5000;

export function NewTicketPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const books = useMyBooks();
  const create = useCreateTicket();

  const [bookId, setBookId] = useState(params.get("bookId") ?? GENERAL);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const selectedBook = books.data?.books.find((b) => b.id === bookId);
  // A ?bookId= that isn't one of the author's books falls back to a general query.
  const effectiveBookId = selectedBook || books.isPending ? bookId : GENERAL;

  function onFilesPicked(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-picking the same file after removing it
    const tooBig = picked.filter((f) => f.size > ATTACHMENT_MAX_BYTES);
    const accepted = picked
      .filter((f) => f.size <= ATTACHMENT_MAX_BYTES && !attachments.some((a) => a.name === f.name))
      .map((f) => ({ name: f.name, size: f.size, type: f.type }));
    const room = ATTACHMENT_MAX_FILES - attachments.length;
    const errors: string[] = [];
    if (tooBig.length) errors.push(`${tooBig.map((f) => f.name).join(", ")} exceeds ${formatBytes(ATTACHMENT_MAX_BYTES)}.`);
    if (accepted.length > room) errors.push(`You can attach up to ${ATTACHMENT_MAX_FILES} files.`);
    setAttachmentError(errors.join(" ") || null);
    setAttachments([...attachments, ...accepted.slice(0, Math.max(0, room))]);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = createTicketSchema.safeParse({ bookId: effectiveBookId || null, subject, description, attachments });
    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error.issues));
      return;
    }
    setFieldErrors({});
    try {
      const ticket = await create.mutateAsync(parsed.data);
      void navigate(`/author/tickets/${ticket.id}`, { state: { created: ticket.reference } });
    } catch (error) {
      if (error instanceof ApiError && error.details.length) setFieldErrors(toFieldErrors(error.details));
      setFormError(errorMessage(error));
    }
  }

  return (
    <div className="narrow stack-lg">
      <div className="page-header">
        <h1>New query</h1>
      </div>
      <p className="muted">
        Tell us what you need help with. Our support team replies here, and you'll see their answer as soon as it's sent.
      </p>
      <form className="card stack" onSubmit={(e) => void onSubmit(e)} noValidate>
        {formError && (
          <div className="alert alert--error" role="alert">
            {formError}
          </div>
        )}
        <FormField
          label="Which book is this about?"
          error={fieldErrors.bookId}
          hint={
            selectedBook && !selectedBook.isPublished
              ? `Current status: ${selectedBook.status}.`
              : books.error
                ? "Couldn't load your books; you can still send a general query."
                : undefined
          }
        >
          {(p) => (
            <select {...p} value={effectiveBookId} onChange={(e) => setBookId(e.target.value)} disabled={books.isPending}>
              <option value={GENERAL}>General / Account Level</option>
              {books.data?.books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          )}
        </FormField>

        <FormField label="Subject" error={fieldErrors.subject}>
          {(p) => (
            <input
              {...p}
              value={subject}
              maxLength={SUBJECT_MAX}
              placeholder="e.g. Royalty for Q3 not received"
              onChange={(e) => setSubject(e.target.value)}
            />
          )}
        </FormField>

        <FormField
          label="Describe your question"
          error={fieldErrors.description}
          hint={
            <span className="field__counter">
              {description.trim().length < 20 ? "At least 20 characters · " : ""}
              {description.length.toLocaleString("en-IN")}/{DESCRIPTION_MAX.toLocaleString("en-IN")}
            </span>
          }
        >
          {(p) => (
            <textarea
              {...p}
              rows={8}
              value={description}
              maxLength={DESCRIPTION_MAX}
              placeholder="Include any order numbers, dates or links that help us look into it."
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        </FormField>

        <FormField
          label="Attachments (optional)"
          error={attachmentError ?? fieldErrors.attachments}
          hint={`Up to ${ATTACHMENT_MAX_FILES} files, ${formatBytes(ATTACHMENT_MAX_BYTES)} each. Attachments are not uploaded in this demo; only the file names are shared.`}
        >
          {(p) => (
            <input
              {...p}
              type="file"
              multiple
              disabled={attachments.length >= ATTACHMENT_MAX_FILES}
              onChange={onFilesPicked}
            />
          )}
        </FormField>
        {attachments.length > 0 && (
          <ul className="chips" aria-label="Selected attachments">
            {attachments.map((a) => (
              <li key={a.name} className="file-chip">
                {a.name} <span className="muted">({formatBytes(a.size)})</span>
                <button
                  type="button"
                  className="file-chip__remove"
                  aria-label={`Remove ${a.name}`}
                  onClick={() => {
                    setAttachments(attachments.filter((x) => x.name !== a.name));
                    setAttachmentError(null);
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="actions">
          <Link to="/author/tickets" className="btn btn--ghost">
            Cancel
          </Link>
          <button type="submit" className="btn btn--primary" disabled={create.isPending}>
            {create.isPending ? "Sending…" : "Submit query"}
          </button>
        </div>
      </form>
    </div>
  );
}
