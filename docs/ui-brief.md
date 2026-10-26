# UI redesign brief

Goal: rebuild the web UI as a modern admin-style application inspired by a help-desk dashboard template
(grouped sidebar, top bar with search/notifications/profile, KPI cards with sparklines, active-ticket
list, status donut, agent leaderboard), while keeping BookLeaf's identity (coral brand colour, logo,
Mulish/Lato fonts). Everything is built from scratch in React and CSS. **No code, markup, icons or images
are copied from the template** (it is a licensed commercial product); only the layout ideas are reused.

## Design tokens (`web/src/styles/tokens.css`)

Light theme:

| Token | Value | Use |
|---|---|---|
| `--bg` | `#f3f6f9` | page background |
| `--surface` | `#ffffff` | cards, sidebar, top bar |
| `--surface-2` | `#f8fafc` | table heads, hovered rows, inputs on cards |
| `--border` | `#e6ebf2` | hairlines |
| `--text` | `#172b4c` | primary text (deep navy) |
| `--muted` | `#566f9e` | secondary text (slate blue) |
| `--primary` | `#f26979` | BookLeaf coral: primary buttons, active nav, focus |
| `--primary-hover` | `#dd4d5e` | |
| `--primary-soft` | `#fdeef0` | active nav background, soft badges |
| `--blue` | `#3762ea` | secondary accent: links in neutral contexts, chart series 2 |
| `--cyan` | `#00baff` | chart series 3 |
| `--success` | `#04a08b` | teal |
| `--warning` | `#f6b749` | amber |
| `--danger` | `#ff6c6c` | red |
| `--radius` | `12px` | cards; inputs/buttons use 8px, pills 999px |
| `--shadow` | `0 1px 2px rgb(23 43 76 / 4%), 0 4px 16px rgb(23 43 76 / 6%)` | |

Dark theme (`:root[data-theme="dark"]`, navy not brown): `--bg #0c1a32`, `--surface #112547`,
`--surface-2 #162f5b`, `--border #1b3a70`, `--text #e6ecf7`, `--muted #8cade4`; coral stays the primary.

Existing token names used by `legacy.css` must keep working (alias them) until pages are migrated.
Fonts stay Mulish (body) and Lato (headings).

## App shell

- **Sidebar** (260px, collapsible to a 72px icon rail on desktop, off-canvas drawer with backdrop below 1024px):
  BookLeaf logo on top, then nav groups with small uppercase group labels, items = icon + label + optional
  count badge. Active item: `--primary-soft` background, coral text and a 3px coral bar on the left.
- **Top bar** (64px, white): hamburger (toggles sidebar), page-aware global search (admin: searches tickets and
  jumps to the queue with `?q=`; press `/` to focus), then on the right: live-updates indicator, theme toggle,
  notifications bell with unread count and dropdown (recent realtime events, "Clear all"), user menu
  (initial-avatar, name, role; dropdown with name/email and Sign out).
- **Content**: max-width 1440px, 24px padding, 24px grid gaps, 12-column CSS grid for dashboards.
- Every page starts with a **PageHeader**: breadcrumbs, title, one-line subtitle, primary action on the right.

Navigation:
- Admin: *Overview* → Dashboard; *Support* → Ticket Queue (badge = open tickets), Assigned to me, Unassigned
  (badge), SLA breached (badge); *Resources* → API docs (opens `/api/docs` in a new tab).
- Author: *Overview* → Dashboard; *My account* → My Books, My Tickets (badge = tickets with a new reply),
  New Query; *Help* → Help & FAQ.

## Shared components (`web/src/components/ui/`)

`Card` / `CardHeader` (title, subtitle, actions), `KpiCard` (label, big value, delta pill with arrow and
tone, optional sparkline, optional footnote), `Sparkline` (inline SVG), `DonutChart` (+ legend with counts and
percentages), `BarChart` (horizontal and vertical), `Avatar` (initials, stable colour from the name, sizes),
`Skeleton` (+ list/card variants), `ConfirmDialog` + `useConfirm()` (promise based; focus trap, Esc, returns
focus, destructive tone), `PageHeader`, `Breadcrumbs`, `HelpTip` (accessible tooltip for jargon),
`Tabs` (segmented control, `role=tablist`), `Accordion` (FAQ), `ProgressBar`, `Pill`. Charts are hand-written
SVG (no chart library) and must respect light/dark tokens, expose `role="img"` with an `aria-label`
summarising the data, and handle empty data with a clear empty state.

## "Monkey-proof" UX rules (apply on every screen)

1. **Say what to do next.** Every empty state has an explanation and a button. Every success has a clear
   confirmation and the next step.
2. **Confirm irreversible or surprising actions** with `ConfirmDialog`: marking resolved/closed, sending a reply
   whose AI draft was not edited, leaving a page with unsent text (route blocker + `beforeunload`).
3. **Undo where possible:** status/assignment/priority/category changes show a toast with an Undo action.
4. **Forms:** visible labels, helper text, character counters, inline errors on blur and on submit, focus moves to
   the first invalid field, submit shows progress and prevents double submission, never a silent disabled button
   (explain why it is disabled).
5. **Skeletons, not spinners,** for lists and cards. Errors always offer Retry.
6. **Explain jargon** with `HelpTip` (SLA, AI confidence, "Rules" vs "AI", royalty threshold, quarter payout).
7. **Keyboard and screen readers:** visible focus rings, Esc closes menus/dialogs, `/` focuses search, landmarks
   (`nav`, `main`), `aria-current="page"` on active nav, buttons are buttons and links are links.
8. **Responsive:** nothing scrolls sideways on a 360px phone; the sidebar becomes a drawer; dense admin rows
   collapse to stacked rows.

## Data the admin dashboard needs (`GET /api/v1/admin/dashboard`)

7 daily buckets (UTC days ending today) + previous-period totals for deltas: tickets created, tickets resolved,
admin replies sent; average first-response and resolution hours (this vs previous 7 days); unresolved tickets by
category; agent leaderboard (resolved and replies in 7d and 30d, avg first response); needs-attention counts
(SLA breached, unassigned critical/high).

## Ownership of files (to avoid merge conflicts between parallel work)

- `styles/tokens.css`, `styles/base.css`, `styles/shell.css`, `components/shell/*`, `components/Layout.tsx`,
  `App.tsx`, `realtime/*`: app shell.
- `styles/ui.css`, `components/ui/*`, `components/Toast.tsx`, `pages/UiKitPage.tsx`: shared components.
- `pages/admin/*` + `styles/admin.css`: admin pages. `pages/author/*` + `styles/author.css`: author pages.
- `styles/legacy.css` is the old stylesheet; it shrinks as pages migrate and is deleted at the end.
