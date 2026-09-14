# CEL Project Monitoring System

Internal web application for CEL (Central Electronics) that replaces an Excel
workbook used for project activity tracking, and raises automatic alerts as
activity deadlines approach. Built for a fixed set of people inside CEL's own
network — never reachable from the internet.

**Governing spec:** [`CLAUDE.md`](./CLAUDE.md) in this folder is the
project's source of truth for scope, rules, and constraints. Where anything
below disagrees with it, `CLAUDE.md` wins. Read it before making product
decisions — especially §9 ("Open — do not invent"), which lists points the
customer hasn't answered yet.

## Status

Built in three phases:

| Phase | Scope | Status |
|---|---|---|
| **1** | UI + backend integration — auth, users/roles, projects/activities CRUD, the alert engine, beacon popup + alert history + dismissals, dashboard/RAG, audit log | **Done**, verified end-to-end against a real database (see [Verification](#verification) below) |
| **2** | Deployment hardening — backup script, restore procedure, administrator guide, resolving the TLS question (CLAUDE.md §9.10) | Not started |
| **3** | Email integration — real Nodemailer/SMTP sending, matching the popup 1:1 (every alert rule, not just overdue ones) | **Done**, verified with a real end-to-end SMTP send. Needs real SMTP credentials in `.env` to actually deliver (see `RUNBOOK.md`) — without them the app still runs fine, it just logs instead. |

Nothing from CLAUDE.md §9 (open customer questions — PO/sales fields,
P/R-series form split, HOD workflow, risk register, escalation matrix, etc.)
has been implemented. Don't add any of those without the customer's answer.

## Where to go next

- **Installing and running this**: [`RUNBOOK.md`](./RUNBOOK.md) — start here if you're setting this up for the first time.
- **Hosting it somewhere other than your own machine**, while staying off the public internet: [`docs/HOSTING.md`](./docs/HOSTING.md).
- **The application's API surface** (Server Actions, not REST): [`docs/API_CONTRACT.md`](./docs/API_CONTRACT.md).
- **How Phase 1 was built** (directory layout, the alert engine's algorithm, the original implementation contract): [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md). Written before implementation; a few details (mainly: a `listUsers`/`getUser` query got added that wasn't originally planned, see the API contract) drifted slightly during integration — the API contract doc reflects the code as it actually is today.
- **Database schema**: [`prisma/schema.prisma`](./prisma/schema.prisma) — heavily commented, including the reasoning behind every field.

## Stack

Fixed by CLAUDE.md §2 — don't substitute any of these:

| Layer | Choice |
|---|---|
| App | Next.js 15 (App Router) + TypeScript strict, single codebase |
| DB | PostgreSQL 16 |
| ORM | Prisma 6 (deliberately not 7 — see `RUNBOOK.md`'s notes) |
| Auth | Auth.js v5, credentials provider only (no email auth of any kind) |
| Email | Nodemailer over CEL's own SMTP server (Phase 3, not built yet) |
| Scheduling | `node-cron`, running inside the app process via `src/instrumentation.ts` |
| Proxy | Caddy |
| Packaging | Docker Compose: `app` + `postgres` + `caddy`, one `docker compose up` |

Deliberately **not** used: Redis, BullMQ, Keycloak, S3/MinIO, native mobile,
any cloud service.

## What it does

- **Login** — login name + password only. No signup, no verification email,
  no reset links. An administrator creates every user and resets passwords
  directly (CLAUDE.md hard constraint #1).
- **Users** (admin) — create users, edit name/email/role, reset passwords,
  activate/deactivate. Login name isn't editable once set (it's the login
  credential itself).
- **Projects & activities** (admin / PM own projects) — a project has a code,
  name, type (Purchase Order or R&D — fixed, matches the source workbook),
  and a manager. Activities have a start date, end date, assignee, target,
  and status, plus delay-record fields (reason, corrective action, HOD
  support/remark).
- **The alert engine** — the system's core requirement. Every activity is
  classified Weekly / Fortnightly / Monthly from its duration, and gets alert
  points computed from admin-configurable thresholds (`/admin/alert-rules`).
  An hourly job (`node-cron`, wired in `src/instrumentation.ts`) checks for
  alert points landing today, writes an `Alert` row *before* attempting to
  send anything (the write is what makes it idempotent — a unique constraint
  on `(activityId, rule, scheduledFor)` means a restart or retry can never
  raise or email the same alert twice), then emails everyone the alert is
  relevant to: the activity's assignee, the project's manager, and every
  admin — each only if they have an email on file, deduplicated. Email
  content matches the popup, with full activity detail in the body (the
  link inside only resolves on the CEL network, so the body never relies on
  it). Needs `SMTP_HOST` etc. set in `.env` to actually deliver — see
  `RUNBOOK.md`. An `OVERDUE` alert also fires for anything past its end
  date that isn't `COMPLETED`.
- **Beacon popup** — pops up on any screen, for any logged-in user, when an
  alert exists that they haven't dismissed yet. Dismissing it is per-user
  (`AlertDismissal`), so one person closing it doesn't hide it from anyone
  else. Every alert stays visible forever in **alert history** (bell icon in
  the header), dismissed or not.
- **Dashboard** — every project, colour-coded Red / Amber / Green: Red if any
  activity is `DELAYED` or overdue-and-not-`COMPLETED`; Amber if any activity
  is within 2 days of its end date; Green otherwise. Red always wins.
- **Audit log** — every mutating action (create/update/reset/toggle/dismiss)
  writes an `AuditLog` row: who, what entity, what action, what changed.

Full role matrix (who can do what) is in `docs/API_CONTRACT.md` and
CLAUDE.md §7.

## Verification

Phase 1 was tested end-to-end against a real (locally-run) PostgreSQL 16
instance, not just compiled: `npm install`, `prisma generate`,
`tsc --noEmit`, and `next build` all pass clean; the committed initial
migration was generated and applied for real; the seed script ran; a real
HTTP login succeeded (CSRF → credentials → bcrypt verify → session); every
screen rendered real data; the alert engine was proven to raise `OVERDUE`
and threshold alerts correctly and idempotently against real data; and a
handful of real bugs found via live use (not just review) were fixed —
notably a page that leaked no sensitive data but *would* have leaked
password hashes to the browser if left as originally written, a missing
"create project" entry point, and a client-side session-hook bug that
incorrectly blocked real admins from a form the server correctly knew they
were allowed to use. See the git log for the full detail on each.

Phase 3 (email) was verified the same way, not just compiled: a real
end-to-end send via a live SMTP test service against real recipient data
from the demo database (assignee/manager/admin resolution, deduplication,
and `Alert.emailSentAt` only getting set after a real successful send).

**Not yet verified**: the Docker Compose path itself (image build, Caddy,
`docker-entrypoint.sh`) — Docker was not available in the environment this
was built in, so verification used `next start` directly against Postgres
instead. That should be the first thing checked in an environment that has
Docker; see `RUNBOOK.md`.

## Conventions

TypeScript strict, no `any`. Dates are `date` columns (day-granular), never
timestamps — the system never changes a date a user entered. Every
destructive/mutating action writes an audit log row. See `CLAUDE.md` §10 for
the full list.
