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

Open `server/.env`, uncomment `ANTHROPIC_API_KEY=`, paste your key, and restart. The "AI Assistant" tile on the admin queue changes from *Degraded* to *Available*.

**Handy commands**

| Command | What it does |
|---|---|
| `npm test` | Runs the server tests (they never call the real AI) |
| `npm run typecheck` | Type-checks everything |
| `npm run dev -w web` | Frontend with hot reload at http://localhost:5173 |
| `npm run eval:classifier -w server` | Checks classification accuracy (uses the real model if a key is set) |
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

**Model:** Claude Haiku 4.5. The tasks are short and rule-bound, so a small fast model is enough and keeps costs low (a rough estimate is about $5 per 1,000 tickets). You can change the model for each task in `.env`.

**Two jobs:**

| Job | When it runs | What it returns |
|---|---|---|
| Classify | In the background right after a ticket is created | Category, priority, a short reason, and a confidence score |
| Draft a reply | When an admin opens the ticket (then cached) | A plain-text reply the admin can edit |

**Keeping drafts accurate.** The prompt gets facts the code works out itself: pending amount, last payout date, next payout due date, whether the ₹1,000 threshold is met, and the book's status. The model is told never to invent amounts, dates or bank details, and to say "we'll verify within 48 hours" when it lacks a fact. Nothing is ever sent automatically: an admin reviews every reply. Prompts live in `server/src/ai/prompts.ts` and the knowledge base in `server/src/ai/knowledge-base.ts`.

**Keeping costs down.**
- Each call only includes the knowledge-base sections that match the ticket, not the whole thing.
- Drafts only include the last 6 messages of a conversation.
- A draft is cached until something it depends on changes (ticket text, new message, book figures, the day, the knowledge base).
- Every call's tokens and estimated cost are logged and shown on the admin dashboard.

**When the AI fails.**
- Tickets are always created first; the AI never blocks that.
- If a call fails, a rule-based classifier sorts the ticket (marked "Rules" in the UI) and a policy template fills in the draft (with a banner saying so).
- After 3 failures in a row, AI calls pause for a minute so a broken API doesn't slow everything down.
- Setting `AI_DISABLED=true` forces this mode on purpose.

**API key safety.** The key is read from the server's environment only. It's never in the code, never logged, and never sent to the browser.

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

- **Render:** `render.yaml` is ready to use. In Render choose *New → Blueprint*, pick this repo, and set `ANTHROPIC_API_KEY`. The database and `JWT_SECRET` are created for you.
- **Any Docker host:**
  ```bash
  docker build -t bookleaf .
  docker run -p 4000:4000 -e DATABASE_URL=... -e JWT_SECRET=... -e ANTHROPIC_API_KEY=... bookleaf
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
