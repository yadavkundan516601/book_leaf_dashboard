# Write-up: approach, trade-offs, and the path to production

## What I prioritised
BookLeaf's problem is **throughput and consistency of author communication**, so I optimised for the ops agent's time-to-good-reply while keeping authors informed in real time.

1. **The core ticket loop, end to end, before polish.** Author raises a query → it is classified and ranked → an admin opens it with a grounded draft → edits and sends → the author sees it live. Every step works even when the AI doesn't.
2. **AI that is trustworthy, not just present.** Drafts are grounded in *computed facts* (pending ₹, next payout date under the quarterly + 45-day rule, the ₹1,000 threshold, book status) plus only the relevant KB sections, so replies are specific the way BookLeaf's tone guide asks. The model is told never to invent amounts or bank-detail status. A human always reviews before anything reaches an author.
3. **Graceful degradation as a first-class path.** No key, a rate limit or an outage all lead to the same outcome: tickets are created, classified by a deterministic rules engine, and drafted from policy templates with the author's real figures. A circuit breaker keeps a failing provider from slowing the app down.
4. **Data isolation by construction.** Author scoping comes from the session, never from client input. Internal notes live in a separate table, and author responses are built by an allow-list mapper with a test that fails if internal fields leak.
5. **Zero-friction review.** `npm install` and `npm run dev` work with no database server (embedded Postgres), seeded from the exact dataset, with one-click demo logins.

## Trade-offs I made
- **Haiku 4.5 for both tasks.** Cheap and fast, with structured outputs for classification. Models are configurable per task if drafts need a larger one.
- **Sectioned keyword retrieval instead of embeddings.** The KB is small and well structured, so category + keyword routing is deterministic, testable and free. Embeddings become worthwhile when the KB grows to hundreds of articles.
- **In-process queue and event bus.** These are simple and restart-safe because the database is the source of truth. The trade-off is a single instance (see below).
- **SSE over WebSockets.** Updates only flow server → client, SSE works over plain HTTP with cookie auth and auto-reconnect, and polling covers the gap.
- **Attachments are UI-only,** as the brief allows. I spent that time on AI reliability and RBAC tests instead.
- **Rules fallback over "AI or nothing".** Lower accuracy than the model, but an ops team can work a queue that's 80% right; they can't work an empty one.

## How I'd evolve this into a production system
1. **Scale-out:**
   - Move the event bus to Postgres `LISTEN/NOTIFY` or Redis and the classification queue to a durable job queue (pg-boss/BullMQ) with retries and dead-lettering.
   - Run multiple stateless API instances behind a load balancer.
2. **AI quality loop:**
   - Admin overrides and draft edits are already stored, along with whether a reply started from a draft. Turn them into a labelled dataset.
   - Track the category agreement rate and how much admins edit drafts as KPIs.
   - Run an offline eval suite (classification accuracy, draft grading against the tone guide) on every prompt or model change before shipping it.
3. **Richer grounding:**
   - Connect real systems (payout ledger, bank-link status, platform stock-sync status, production tracker) as tools, so the draft can say "your bank account isn't linked" instead of asking.
   - Move to embedding retrieval when the KB grows, and turn on prompt caching once the static prefix passes the cache minimum.
4. **Operational maturity:**
   - SLA timers with escalation notifications, and email/WhatsApp notifications to authors on replies.
   - Saved views and bulk actions in the queue; canned macros alongside AI drafts.
5. **Platform hardening:**
   - SSO for staff, password reset and verified email for authors.
   - Real attachment storage with virus scanning, audit-log export, PII retention policies.
   - OpenTelemetry tracing across API → LLM, and a cost budget alert on `ai_calls`.
6. **Self-service deflection:** before a ticket is submitted, show the author the answer the system already knows ("your next payout is due by 14 Nov"). Many royalty and status questions could resolve without a ticket.
