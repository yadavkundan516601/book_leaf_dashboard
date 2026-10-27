# BookLeaf Author Support Portal

A support portal for BookLeaf. Authors check their books and royalties and raise queries. The ops team works those queries from a prioritised queue, with AI doing the first pass: it sorts each ticket into a category, gives it a priority, and drafts a reply from the BookLeaf knowledge base.

The AI is a helper, not a dependency. With no API key, or if the AI API is down, tickets are still created and sorted by simple rules, and admins get a policy-based template to edit.

**Jump to:** [Run it locally](#run-it-locally) · [Logins](#test-logins) · [Try it out](#try-it-out) · [How the AI works](#how-the-ai-works) · [API](#api) · [Deploy](#deploy) · [Project layout](#project-layout) · [Limitations](#known-limitations)

More detail: [Architecture](docs/ARCHITECTURE.md) · [Write-up](docs/WRITEUP.md)

---

## Run it locally

You need **Node 22.12 or newer**. You don't need to install a database.

```bash
npm install
npm run build -w web
npm run dev -w server
```

Open **http://localhost:4000**.

The first start creates an embedded database, loads the sample data (10 authors, 18 books), creates the logins below, and adds 5 demo tickets.

**Turn on the real AI (optional):**

```bash
cp server/.env.example server/.env
```

Get a free key at [Google AI Studio](https://aistudio.google.com/apikey), open `server/.env`, uncomment `GEMINI_API_KEY=`, paste your key, and restart. The "AI Assistant" tile on the admin queue changes from *Degraded* to *Available*.

**Handy commands**

| Command | What it does |
|---|---|
| `npm test` | Runs the server tests (they never call the real AI) |
| `npm run typecheck` | Type-checks everything |
| `npm run dev -w web` | Frontend with hot reload at http://localhost:5173 |
| `npm run eval:classifier -w server` | Checks classification accuracy (uses Gemini if a key is set) |
| `rm -rf server/.data` | Resets the local data (stop the server first) |

To use your own Postgres instead of the embedded one, set `DATABASE_URL` in `server/.env`.

---

## Test logins

| Who | Email | Password |
|---|---|---|
| Admin | `admin@bookleaf.test` | `Admin@123` |
| Admin (second) | `support@bookleaf.test` | `Admin@123` |
| Author | `priya.sharma@email.com` | `Author@123` |

Every author email in the sample data works with the same password. The login page also has one-click buttons for a few of them.

Authors worth trying:
- `sneha.kulkarni@email.com`: has a book still in production
- `kavita.deshmukh@email.com`: pending royalties below the ₹1,000 payout threshold
- `ananya.reddy@email.com`: has never been paid

---

## Try it out

1. Sign in as an **author**, open *New Query*, pick a book and submit something like "I haven't received my royalty".
2. In another browser window (or a private one), sign in as the **admin**. The ticket is in the queue, already categorised and prioritised.
3. Open it. The reply box is pre-filled with a draft that uses the author's real numbers and next payout date. Edit it and send.
4. Back in the author's window, the reply shows up without refreshing.

Along the way you can change the category or priority (your change is marked *Admin*), add an internal note the author can't see, assign the ticket to yourself, and change its status.

---

## How the AI works

**Provider: Google Gemini** (free tier works). Classification runs on `gemini-3.5-flash-lite` and drafts/answers on `gemini-3.8-flash` by default; change them with `AI_CLASSIFY_MODEL` / `AI_DRAFT_MODEL`. If a model id isn't available to your key, the app automatically falls back to the next Gemini model and remembers the one that works. Anthropic Claude is still supported as an alternative (`AI_PROVIDER=anthropic` with `ANTHROPIC_API_KEY`).

**Set it up:** create a key at [Google AI Studio](https://aistudio.google.com/apikey) and put it in `server/.env` as `GEMINI_API_KEY=...`. The key stays on the server and is never sent to the browser. Without a key the app still works on rules and templates.

**What the AI does**

| Job | When | What you get |
|---|---|---|
| **Triage** | Background, right after a ticket is created | Category, priority, confidence, a one-line summary, the author's sentiment (calm to angry), a suggested next action, and an *escalate* flag with a reason |
| **Draft a reply** | When an admin opens a ticket | An editable reply grounded in the author's real figures and the BookLeaf policy |
| **Refine** | Buttons above the reply box | Shorter, Warmer, Clearer, Add next steps, or your own instruction, applied to the text you're editing, with Undo |
| **Check before sending** | Live while the admin edits | Flags any ₹ amount, date or timeline that isn't in the author's data or the policy, plus a checklist (greeting, empathy, next step with a timeline, sign-off). This check is plain code, not AI, so it also catches mistakes in hand-written replies. |
| **Instant answer** | Authors, on the New Query page | A short grounded answer from the author's own data and the policy before they send a ticket; it never blocks submitting |

**Keeping answers accurate**
- The prompt receives facts computed by the code: pending amount, last payout, next payout date, the ₹1,000 threshold, book status. The model is told never to invent amounts, dates or bank details.
- Every number in a draft or answer is verified against those facts. An instant answer containing an unverified figure is replaced by a plain policy answer. A draft with one gets a warning, and the admin is asked to confirm before sending.
- Nothing is sent automatically: an admin reviews every reply.
- Prompts live in `server/src/ai/prompts/`, the knowledge base in `server/src/ai/knowledge-base.ts`.

**Keeping costs and limits under control**
- Each call only includes the knowledge-base sections that match the ticket, and drafts only the last 6 messages.
- Drafts and answers are cached until something they depend on changes.
- A built-in limiter (`AI_RPM_LIMIT`, default 12 requests a minute) keeps the app inside free-tier limits. Calls wait briefly for a slot, and past that they fall back to rules and templates instead of failing.
- Every call's tokens and estimated cost are logged and shown on the admin dashboard (`$0.00` while `AI_FREE_TIER` is on).

**When the AI fails** (no key, rate limit, outage, bad output)
- Tickets are always created first; the AI never blocks that.
- A rule-based classifier fills the same fields (marked "Rules" in the UI), and drafts and instant answers fall back to policy templates, with a banner saying so.
- After 3 failures in a row, AI calls pause for a minute so a broken API doesn't slow everything down. `AI_DISABLED=true` forces this mode on purpose.

---

## API

Everything is under `/api/v1` and needs a sign-in, except `/health` and `/auth/login`. Authors only ever see their own data; admins see everything.

Full docs: **http://localhost:4000/api/docs** (Swagger) or [`server/openapi.yaml`](server/openapi.yaml).

| Method | Path | Who | What it does |
|---|---|---|---|
| POST | `/auth/login`, `/auth/logout` | anyone / signed in | Sign in and out (session cookie) |
| GET | `/auth/me` | signed in | Current user |
| GET | `/books` | author, admin | An author's books and royalty summary (admins: all books) |
| GET | `/tickets` | author, admin | Authors: their tickets. Admins: the queue, with filters for status, category, priority, assignee, date, search and sort |
| POST | `/tickets` | author | Raise a ticket |
| GET | `/tickets/:id` | author, admin | A ticket (admins also get notes, AI details and history) |
| PATCH | `/tickets/:id` | admin | Change status, category, priority or assignee |
| POST | `/tickets/:id/messages` | author, admin | Reply on a ticket |
| POST | `/tickets/:id/notes` | admin | Add an internal note |
| POST | `/tickets/:id/draft` | admin | Get the AI draft reply |
| POST | `/tickets/:id/reclassify` | admin | Re-run the classifier |
| GET | `/admin/stats`, `/admin/team` | admin | Dashboard numbers, and the team list for assignment |
| GET | `/authors`, `/authors/:id` | admin | Author directory |
| GET | `/events` | author, admin | Live updates (Server-Sent Events) |

Errors always look like this, with a sensible status code (400, 401, 403, 404, 409, 429):

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed",
             "details": [{ "field": "subject", "message": "Subject must be at least 5 characters" }],
             "requestId": "3f0c…" } }
```

---

## Deploy

The app deploys as a single Docker service (the API also serves the web app), plus a Postgres database.

- **Render:** `render.yaml` is ready to use. In Render choose *New → Blueprint*, pick this repo, and set `GEMINI_API_KEY`. The database and `JWT_SECRET` are created for you.
- **Any Docker host:**
  ```bash
  docker build -t bookleaf .
  docker run -p 4000:4000 -e DATABASE_URL=... -e JWT_SECRET=... -e GEMINI_API_KEY=... bookleaf
  ```

In production the server won't start without `DATABASE_URL` and a `JWT_SECRET` of at least 32 characters. All settings are listed in [`server/.env.example`](server/.env.example).

---

## Project layout

```
shared/   Types, categories and validation rules used by both server and web
server/   API (Express + TypeScript + Postgres), AI code in src/ai, tests in test/
web/      The React app (author and admin screens)
data/     The sample dataset used to seed the database
docs/     Architecture notes and the write-up
```

A few choices worth knowing, with the reasons in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md):
- Internal notes are stored in their own table, so an author-facing query can't accidentally return them.
- Live updates use Server-Sent Events, and the page falls back to polling if the connection drops.
- The AI sits behind a small interface, so it can be swapped or faked in tests.
- Each ticket keeps both what the AI suggested and what the admin set, so you can measure how often the AI was right.

---

## Known limitations

- **Attachments are UI only.** File names are saved but files aren't uploaded (the brief allowed this).
- **One server instance.** Live updates and the classification queue run inside the server process. Running several instances would need Redis or Postgres notifications.
- **The real model hasn't been benchmarked yet.** The tests use a fake AI. Run `npm run eval:classifier -w server` with a key to measure it.
- **Not included:** email notifications, password reset, admin user management.
- **Two admins replying at the same instant** could both auto-assign the ticket. Row locking would fix it.
