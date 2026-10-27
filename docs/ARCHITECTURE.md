# Architecture

This document explains how the BookLeaf Author Support & Communication Portal is put together and why. The [README](../README.md) covers setup and the API reference.

## 1. Constraints that shaped the design

| Constraint (from the brief) | Design response |
|---|---|
| Authors only see their own data | Every author query is scoped by the `authorId` claim in the session, never by a client-supplied id. Cross-author reads return **404**, not 403, so ticket/book ids can't be probed. |
| Internal notes are never visible to authors | Notes live in a **separate table** (`ticket_notes`) that no author-facing query touches, and author responses are built by an **allow-list mapper**. A test asserts that the serialized author payload has no `notes`, `classification` or `assignee` keys. |
| AI must degrade gracefully | Ticket creation never waits on the LLM. Classification runs in a background queue and falls back to a deterministic rules classifier; drafts fall back to policy templates. A circuit breaker stops calling a failing provider. |
| Cost awareness | Separate small prompts per task, KB retrieval by section instead of the whole KB, only the last 6 messages of a thread, draft caching keyed by an input hash, per-call token accounting with a cost dashboard. |
| API keys never reach the frontend | The key is read from the server environment only, the SDK is constructed server-side, the SPA has no AI code. |
| Real-time ticket updates | Server-Sent Events with polling fallback. |
| Must work with the provided dataset out of the box | Idempotent seed validates and loads `data/bookleaf_sample_data.json` on boot. |
| Reviewers need to run it easily | Without `DATABASE_URL` the server uses **PGlite** (Postgres compiled to WASM, in-process) so `npm install && npm run dev` works with no database server. Production uses managed Postgres; same schema and migrations. |

## 2. System overview

```
┌──────────────────────────── Browser (React SPA) ────────────────────────────┐
│ Author portal: My Books · New Query · My Tickets                             │
│ Admin portal:  Queue (filters, SLA) · Ticket workspace (AI draft, overrides) │
│ React Query cache  ◄── invalidated by ── EventSource(/api/v1/events)         │
└───────────────┬──────────────────────────────────────────▲───────────────────┘
                │ REST JSON (httpOnly session cookie)       │ SSE {type, ticketId}
┌───────────────▼──────────────────────────────────────────┴───────────────────┐
│ Express 5 API  /api/v1                                                        │
│  middleware: request-id · helmet · json(100kb) · auth(JWT cookie|Bearer)      │
│              · requireRole · zod validation · typed error handler            │
│  modules: auth · books · authors · tickets · admin · events(SSE) · docs      │
│                    │                         │                                │
│                    ▼                         ▼                                │
│        AI layer (interface only)        EventBus (in-process pub/sub)         │
│   classification queue · draft service · status                              │
│   guarded LLM client → circuit breaker → provider (Gemini / Anthropic)            │
│   fallbacks: rules classifier · policy templates                             │
└───────────────┬───────────────────────────────────────────────────────────────┘
                ▼
        PostgreSQL (Drizzle ORM)  — PGlite locally
```

The SPA is served by the same Express process in production, so the session cookie is first-party and no CORS is needed. `CORS_ORIGIN` exists for split deployments.

## 3. Repository layout

```
shared/   Contracts used by both sides: enums, zod request schemas, response DTO types
server/   Express API, Drizzle schema + migrations, AI layer, tests
web/      React + Vite SPA
data/     Provided sample dataset (seed source)
docs/     Architecture, write-up
```

`shared` is the single source of truth for the ticket vocabulary. Postgres enums, the AI's structured-output schema, request validation and UI dropdowns are all derived from the same arrays, so a category can't exist in one layer and not another.

## 4. Data model

| Table | Purpose / notable choices |
|---|---|
| `users` | Login identity, `role` enum (`author` / `admin`), bcrypt hash, case-insensitive unique email. |
| `authors` | Profile keyed by the dataset id (`AUTH001`), 1:1 with a user. |
| `books` | Keyed by dataset id (`BK001`). Money is `numeric(12,2)`; nullable fields (MRP, royalty per copy, publication date) model books still in production. |
| `tickets` | `number` serial gives the human reference `BL-1001`. Stores both the **effective** classification (`category`, `priority`, each with a `*_source` of `ai`/`rules`/`admin`) and the classifier's **suggestion** (`suggested_*`, confidence, rationale). Keeping both lets us report how often admins disagree with the AI. Indexed for the queue: `(status, priority, created_at)`. |
| `ticket_messages` | The author-visible conversation (author replies, BookLeaf responses). `used_ai_draft` tracks draft adoption. |
| `ticket_notes` | Internal notes, physically separate from messages. |
| `ticket_events` | Append-only audit trail: created, classified, status/category/priority changes, assignment. Shown as the activity timeline. |
| `ai_drafts` | Draft cache keyed by `input_hash`. |
| `ai_calls` | One row per LLM attempt: purpose, model, outcome, error type, tokens (incl. cache read/write), latency. Feeds the cost and reliability panel. |

## 5. Request lifecycle: a new ticket

1. `POST /api/v1/tickets` → zod validation → book ownership check → insert ticket (`classification_state = pending`) and a `created` event in one transaction.
2. Publish `ticket.created` on the bus → SSE pushes it to admins and the owning author.
3. `ai.classification.enqueue(id)`. Not awaited, so the author gets a 201 whether or not the AI is up.
4. The queue (bounded concurrency, de-duplicated) loads the ticket and minimal book facts and calls the classifier. On any AI failure it uses the rules classifier. Policy guardrails apply to both.
5. Results are persisted. The effective category and priority are only written if an admin hasn't already overridden them. A `classified` event is published to admins only.
6. On restart, `recoverPending()` re-queues anything left `pending`. The database is the queue's source of truth, so nothing is lost if the process dies mid-classification.

## 6. AI integration

See the README's **How the AI works** section for the prompt strategy, model choice, and cost numbers. The structural decisions:

- **The interface is not the vendor SDK.** Modules depend on `AiLayer` (`classification`, `drafts`, `status`). The vendor SDKs are only used inside their own provider classes (`gemini-provider.ts`, `anthropic-provider.ts`), and tests use a fake provider.
- **Calls are guarded.** Every call goes through a guarded client that short-circuits when there is no key, when the kill switch is on, or when the circuit breaker is open. It records an `ai_calls` row and updates the breaker. The SDK's own retries cover transient 429/5xx; the breaker stops a sustained outage from adding latency to every request.
- **Untrusted input stays data.** Author text is placed inside delimited `<ticket>` / `<conversation>` blocks, the system prompt says any instructions there must be ignored, classification output is schema-constrained (structured outputs + zod), and drafts are never sent automatically: a human always reviews them.

## 7. Real-time

SSE was chosen over WebSockets because traffic is server→client only, it works through proxies over plain HTTP, the browser reconnects automatically, and it carries the session cookie. Events are thin (`{type, ticketId}`). The client refetches through the normal RBAC-protected endpoints, so the stream can't leak data. Routing: admins receive everything; authors only receive non-internal events for their own tickets. If the stream drops, the client falls back to 20-second polling.

The `EventBus` is in-process, which is correct for one instance. For horizontal scaling, replace it with Postgres `LISTEN/NOTIFY` or Redis pub/sub behind the same `publish/subscribe` interface.

## 8. Security

- Passwords: bcrypt (cost 10). Login is rate-limited, and unknown emails still pay for one bcrypt compare to blunt user enumeration.
- Session: HS256 JWT in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production). The 12h TTL is configurable. A Bearer header is accepted for API clients.
- CSRF: `SameSite=Lax` plus JSON-only bodies.
- Headers: helmet with a same-origin CSP. The request body is limited to 100 kB.
- Errors: a consistent `{error:{code,message,details,requestId}}` shape. Unknown errors become a generic 500 and are logged with the request id; stack traces are never sent to clients.
- Secrets come only from the environment. The config is validated at boot, and production refuses to start without `JWT_SECRET` and `DATABASE_URL`.

## 9. Testing strategy

Integration tests boot the real Express app over an in-memory PGlite database seeded with the real dataset, with a fixed clock and a fake LLM provider. They cover RBAC, validation, the ticket lifecycle, SSE routing, AI fallback paths, the circuit breaker, draft caching, KB retrieval and rules-classifier accuracy. The suite never calls the network. Real-model classification quality is measured separately with `npm run eval:classifier -w server`, which needs an API key.
