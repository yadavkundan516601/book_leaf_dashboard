# BookLeaf Author Support & Communication Portal

A web app for BookLeaf authors to raise and track support queries, and for the operations team to triage and answer them with AI help:

- **Author portal:** My Books (catalog + royalty position), New Query, My Tickets with live updates.
- **Admin portal:** a prioritised ticket queue with SLA flags, AI auto-classification and priority (overridable), AI-drafted replies grounded in the BookLeaf Knowledge Base, internal notes, assignment, status and an audit trail.
- **AI that degrades gracefully:** with no API key, during an outage or when rate-limited, tickets are still created, classified by deterministic rules, and drafted from policy templates.

> Docs: [Architecture](docs/ARCHITECTURE.md) · [Write-up](docs/WRITEUP.md) · API reference at `/api/docs` (Swagger UI) or [`server/openapi.yaml`](server/openapi.yaml)

---

## Quick start (local)

Requirements: **Node 22.12+** (Node 24 recommended, see `.nvmrc`). You don't need a database server: without `DATABASE_URL` the API uses an embedded Postgres (PGlite) in `server/.data/`.

```bash
npm install
npm run build -w web          # the API serves the built SPA
cp server/.env.example server/.env   # optional: add ANTHROPIC_API_KEY here
npm run dev -w server         # http://localhost:4000
```

On first boot the server runs migrations, seeds the provided dataset (10 authors, 18 books), creates two admin accounts and 5 demo tickets, and classifies them.

For frontend hot reload, also run `npm run dev -w web` and open http://localhost:5173. Vite proxies `/api`, including the SSE stream, to port 4000.

To use your own Postgres, set `DATABASE_URL=postgres://…` in `server/.env`.

### Test logins

| Role | Email | Password | Good for |
|---|---|---|---|
| Admin | `admin@bookleaf.test` | `Admin@123` | Ticket queue, AI drafts, overrides |
| Admin | `support@bookleaf.test` | `Admin@123` | Assignment between team members |
| Author | `priya.sharma@email.com` | `Author@123` | Live books with pending royalties |
| Author | `sneha.kulkarni@email.com` | `Author@123` | A book still in production (BK013) |
| Author | `kavita.deshmukh@email.com` | `Author@123` | Pending ₹850, below the ₹1,000 payout threshold |
| Author | any other dataset email | `Author@123` | e.g. `rohit.kapoor@email.com`, `ananya.reddy@email.com` (no payouts yet) |

The login page has one-click demo-account buttons. Hide them with `VITE_SHOW_DEMO_ACCOUNTS=false` at build time. Override the seeded passwords with `SEED_AUTHOR_PASSWORD` / `SEED_ADMIN_PASSWORD`.

### Useful scripts

| Command | What it does |
|---|---|
| `npm test` | Server integration tests (76 tests, in-memory Postgres, fake LLM, never hits the network) |
| `npm run typecheck` | Typechecks `shared`, `server` and `web` |
| `npm run build` | Builds the SPA and bundles the server (`server/dist`) |
| `npm start` | Runs the production bundle |
| `npm run eval:classifier -w server` | Runs labelled queries through the rules classifier and, if a key is set, the live AI classifier, and prints accuracy |
| `npm run db:migrate -w server` / `db:seed` | Apply migrations / re-run the idempotent seed |

---

## Deployment

The repo deploys as a **single Docker service**: the API serves the SPA from the same origin, so the session cookie stays first-party and no CORS is needed. It runs alongside a managed Postgres.

- **Render:** `render.yaml` is a Blueprint (web service + Postgres). New → Blueprint → pick the repo → set `ANTHROPIC_API_KEY`. `JWT_SECRET` is generated, and migrations + seed run on boot.
- **Any Docker host:** `docker build -t bookleaf . && docker run -p 4000:4000 -e DATABASE_URL=… -e JWT_SECRET=… -e ANTHROPIC_API_KEY=… bookleaf`

In production the server refuses to start without `JWT_SECRET` (32+ chars) and `DATABASE_URL`. All settings are listed in [`server/.env.example`](server/.env.example).

---

## Architecture (summary)

```
shared/  enums + zod request schemas + response DTO types (one vocabulary for DB, AI schema, API, UI)
server/  Express 5 + TypeScript · Drizzle ORM · Postgres (PGlite locally) · Anthropic SDK
web/     React 19 + Vite + React Router + TanStack Query
```

| Decision | Why |
|---|---|
| **Monorepo with a `shared` contracts package** | Categories, priorities and statuses are defined once. Postgres enums, the LLM's structured-output schema, API validation and UI dropdowns all derive from the same arrays, so they can't drift. |
| **Express 5 + modular routers** (`modules/<feature>/{routes,service,repository,mappers}`) | Thin HTTP layer, business rules in services, explicit dependency container (`AppContext`) for testability. Express 5 forwards async errors natively. |
| **PostgreSQL + Drizzle** | Relational data (authors → books → tickets → messages) with enums, arrays and transactions. Drizzle keeps SQL visible and typed. PGlite gives reviewers a zero-setup local DB with identical SQL. |
| **Separate `ticket_notes` table** | Internal notes can't leak through a forgotten `WHERE` clause: author queries never touch that table. |
| **Effective vs suggested classification** | Tickets keep both what the AI said and what the admin set, so we can measure AI agreement (shown on the dashboard). |
| **httpOnly cookie JWT** | Not readable by page scripts (never returned in a response body), and works with `EventSource`, which can't send headers. A Bearer header is also accepted for API clients. CSRF: SameSite=Lax plus an Origin check on state-changing requests. |
| **SSE for real time** | One-way server→client updates, auto-reconnect, works over plain HTTP. Events are thin (`{type, ticketId}`) and clients refetch through RBAC'd endpoints, so the stream can't leak data. Polling fallback on disconnect. |
| **AI behind an interface** | Routes depend on `AiLayer`, not the SDK. The provider can be swapped or faked, and the app works with AI disabled. |

The full rationale, data model and request lifecycle are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## AI integration

### Model choice: Claude Haiku 4.5 (`claude-haiku-4-5`)
- Classification and short, policy-bound replies don't need a frontier model. Haiku 4.5 is fast and cheap ($1 / $5 per million input/output tokens), so drafts appear as the admin opens a ticket.
- It supports **structured outputs**, so classification is schema-constrained JSON (category and priority are enums), not parsed prose.
- Models are configured per task (`AI_CLASSIFY_MODEL`, `AI_DRAFT_MODEL`). If draft quality ever needs a step up, only drafting moves to a larger model (e.g. `claude-sonnet-5-5`) while classification stays on Haiku.

### Where AI is used
| Task | When | Input | Output |
|---|---|---|---|
| **Classification + priority** | Background, right after a ticket is created | Ticket subject/description + one compact facts line (book status, last payout, pending royalty, threshold) | `{rationale, category, priority, confidence}` via structured outputs, temperature 0 |
| **Response draft** | When an admin opens a ticket (cached) | Persona + tone rules, **retrieved** KB sections, the category's calibration examples, author/book facts, ticket, the last 6 messages | Plain-text reply for the admin to edit and send |

### Prompt strategy (`server/src/ai/prompts.ts`)
- **Static first, volatile last.** System prompts are constant, so they're cacheable as the KB grows. Per-ticket data goes in the user turn in tagged blocks: `<today>`, `<knowledge_base>`, `<examples>`, `<author_facts>`, `<ticket>`, `<conversation>`.
- **Grounded in real numbers.** The draft gets computed facts: pending ₹ per book and author-wide, last payout date and days since, the next payout due date under the quarterly + 45-day policy, whether the ₹1,000 threshold is met, book status / platforms / print partner. Date maths is done in code, not by the model.
- **No fabrication.** The model must not invent amounts, dates or bank-detail status; when a fact is missing it says the team will verify within 48 hours, matching BookLeaf's tone guide. Sign-off, length and plain-text format are fixed.
- **Classification rubric.** Precise category definitions with boundary cases ("still in typesetting" = production, "Currently Unavailable" = distribution) and a priority rubric derived from the KB (ISBN errors are always high; long-withheld royalties are critical; bio updates are low). The rationale comes first in the schema so the model commits to its reasoning before the labels.
- **Prompt-injection hygiene.** Author text sits in `<ticket>`/`<conversation>` blocks marked as untrusted, our own tag names are neutralised inside it, outputs are schema-validated, and nothing is ever auto-sent: a human reviews every reply.
- **Policy guardrails** (`policy.ts`) run after the AI or rules: ISBN-error language → at least High (KB policy); legal or fraud language → Critical.

### Cost management
| Technique | Effect |
|---|---|
| Two small task-specific prompts instead of one big one | Classification never carries the KB or the thread (≈ 750 input tokens). |
| **KB retrieval by section** (`retrieval.ts`) | Drafts include only the sections for the ticket's category plus keyword matches (≤ 3), and that category's examples (≤ 2). A royalty draft carries ~380 KB tokens instead of the ~1,300-token full KB. |
| **Bounded history** | Only the last 6 messages, each truncated to 800 chars, so cost doesn't grow with long threads. |
| **Draft cache** (`ai_drafts`, keyed by a hash of KB version, prompt version, model, ticket text, category, book facts and included message ids) | Re-opening an unchanged ticket is free. A new author message or a KB edit invalidates it. Template fallbacks aren't cached, so the next open retries the AI. |
| Lazy drafting | Drafts are generated when an admin opens a ticket, not for every ticket up front. |
| Token accounting | Every call is logged to `ai_calls` (tokens, cache reads/writes, latency, outcome). The admin dashboard shows 24h calls, failures and estimated cost. |

**Estimated cost:** ≈ $0.001 per classification and ≈ $0.003 per draft on Haiku 4.5, so ≈ $5 per 1,000 tickets with one draft each.

Prompt caching is wired (stable prefix, `cache_control` on the system block), but Haiku 4.5's minimum cacheable prefix is 4,096 tokens, so today's compact prompts aren't cached. It switches on automatically as the KB grows past that.

### Error handling and graceful degradation
- **Tickets never wait on the AI.** Creation returns 201 immediately. Classification runs in a bounded background queue, and on restart `recoverPending()` resumes anything left pending.
- **Typed failures.** The SDK retries 429/5xx/timeouts (`AI_MAX_RETRIES`, `AI_TIMEOUT_MS`). Errors are mapped to typed kinds: `rate_limited`, `overloaded`, `timeout`, `auth`, `invalid_output`, `refusal`, and others.
- **Circuit breaker.** After `AI_BREAKER_THRESHOLD` consecutive failures (or one auth error), AI calls are skipped for `AI_BREAKER_COOLDOWN_MS`, then a single trial call is allowed. A provider outage doesn't add latency to every request.
- **Fallbacks:**
  - *Classification:* a deterministic keyword/rubric classifier (it gets all 7 KB sample queries right), marked `Rules` in the UI.
  - *Drafts:* per-category policy templates filled with the author's real figures, shown with a banner ("AI drafting is temporarily unavailable…"). The composer is always editable, so admins can write manually.
- **Kill switch.** `AI_DISABLED=true` forces degraded mode without removing the key.
- **Visible status.** The dashboard shows AI available/degraded, 24h failures, and how often admins agree with the AI's category and priority.

### API key security
- The key lives only in the server environment (`ANTHROPIC_API_KEY`). It is never hardcoded, never logged (pino redaction), and never sent to the browser.
- The SPA contains no AI code: `grep -ri anthropic web/src` returns nothing.
- The SDK is constructed only when a key exists, with an explicit `AI_BASE_URL`, so it never silently inherits a host-level `ANTHROPIC_BASE_URL`.

---

## API reference

Base path `/api/v1`. Every route except `/health` and `/auth/login` requires a session (cookie `bl_session` or `Authorization: Bearer <token>`). The OpenAPI 3.1 spec is served at **`/api/openapi.json`** and browsable at **`/api/docs`**.

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/health` | public | DB + AI status |
| POST | `/auth/login` | public | `{email, password}` → sets the httpOnly session cookie, returns `{user}` (rate-limited) |
| POST | `/auth/logout` | any | Clears the session |
| GET | `/auth/me` | any | Current user |
| GET | `/books` | author / admin | Author: own books + royalty summary (next payout date, threshold). Admin: all (`?authorId=`) |
| GET | `/books/:id` | author / admin | One book (authors: own only, else 404) |
| GET | `/authors`, `/authors/:id` | admin | Author directory / profile with books and royalties |
| GET | `/tickets` | author / admin | Author: own tickets. Admin: queue with `status, category, priority` (multi-value), `assignee=me\|unassigned\|<id>`, `authorId, bookId, from, to, q, sort=urgency\|newest\|oldest\|updated, page, pageSize` |
| POST | `/tickets` | author | `{bookId\|null, subject, description, attachments[]}` → 201 (rate-limited per user) |
| GET | `/tickets/:id` | author / admin | Author: public view only. Admin: + classification, notes, activity, author/book context |
| PATCH | `/tickets/:id` | admin | `{status?, category?, priority?, assigneeId?}`: overrides are recorded as `admin` source with audit events |
| POST | `/tickets/:id/messages` | author / admin | Reply. Admin may pass `status` and `usedAiDraft`. An author reply reopens a resolved ticket; closed → 409 |
| POST | `/tickets/:id/notes` | admin | Internal note (never visible to authors) |
| POST | `/tickets/:id/draft` | admin | `{regenerate?}` → AI draft (cached) or template fallback |
| POST | `/tickets/:id/reclassify` | admin | Re-run the classifier now (admin overrides are preserved) |
| GET | `/admin/team` | admin | Admins, for assignment |
| GET | `/admin/stats` | admin | Counts by status/priority, SLA breaches, AI usage, cost and agreement |
| GET | `/events` | author / admin | Server-Sent Events: `ticket.created \| updated \| message \| classified`, routed by role/ownership |

**Errors** share one shape and use meaningful status codes: 400 `VALIDATION_ERROR` (with per-field `details`), 400 `MALFORMED_JSON`, 401 `UNAUTHENTICATED`, 403 `FORBIDDEN`, 404 `NOT_FOUND` (also for other authors' resources), 409 `TICKET_CLOSED`, 413, 429 `RATE_LIMITED`. Unexpected errors return a generic 500 with a `requestId` that matches the server log.

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed",
             "details": [{ "field": "subject", "message": "Subject must be at least 5 characters" }],
             "requestId": "3f0c…" } }
```

---

## Product decisions worth noting
- **Queue defaults to what needs action:** Open + In Progress, sorted by urgency (unresolved → priority → oldest first). Tickets still being classified rank between High and Medium so they aren't buried. First-response SLA per priority (4h / 24h / 48h / 72h) is highlighted.
- **The admin never leaves the ticket:** the side panel shows the author's book facts, royalty position and next payout date, the same facts the AI uses, so drafts are easy to verify.
- **Sensible automation:**
  - Replying to an Open ticket moves it to In Progress and assigns it to the replier if unassigned.
  - "Send & mark resolved" is one click.
  - An author reply on a resolved ticket reopens it.
- **Edge cases from the dataset are handled:**
  - Books in production show their stage with "—" for unpublished fields.
  - "No payouts yet" and "All paid" states are shown.
  - Pending below ₹1,000 explains the roll-over.
  - General / account-level queries are supported.
- **Draft provenance is explicit:** each draft is labelled with its source (AI model + KB sections used, or a template with the reason), and a warning appears if the author replied after the draft was generated.

## Known limitations / what I'd do next
- **Attachments are UI-only**, as the brief allows (metadata stored, files not uploaded). Next step: S3 presigned uploads with type/size checks and virus scanning.
- **The event bus is in-process.** Running more than one instance needs Postgres `LISTEN/NOTIFY` or Redis pub/sub behind the same interface. The classification queue is in-process too: DB-backed and restart-safe, but it would move to a job queue (e.g. pg-boss/BullMQ) at scale.
- **Live-model quality isn't benchmarked in CI.** The test suite uses a fake LLM; `eval:classifier` measures the real model when a key is present. Next: a larger labelled set from real tickets, and draft-quality grading.
- **No email notifications, password reset or admin user management.** Out of scope for the brief.
- **Concurrent admin replies** on the same ticket could both auto-assign; row locking (`SELECT … FOR UPDATE`) would make that strict.
- **Royalty figures are shown as provided by the dataset.** A per-platform breakdown would need sales line items.
