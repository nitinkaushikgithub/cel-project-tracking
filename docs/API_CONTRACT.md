# API contract

This app has **no traditional REST/GraphQL API**. Its entire read/write
surface is Next.js **Server Actions** — plain async functions exported from
a file marked `"use server"`, called directly from React components (server
or client). Next.js handles the wire protocol (an RPC-style POST under the
hood); nothing here is meant to be called from outside the app, and there is
no OpenAPI/Swagger spec because there's no conventional HTTP API to
describe.

The one real HTTP endpoint group is Auth.js's own: `/api/auth/*` (login,
logout, session, CSRF) — standard Auth.js v5 routes, not hand-written; see
[authjs.dev](https://authjs.dev) if you need their exact wire shapes.

This document is the contract for everything else: every exported function
in `src/app/**/actions.ts` and `src/app/**/queries.ts`, organized by
feature. If you're integrating something new against this app's data (a
script, a future real API, a test), these are the functions to call —
import them directly (they're plain TypeScript) rather than reimplementing
the logic.

## Conventions used throughout

- **Auth**: every function calls either `requireUser()` (any logged-in
  user) or `requireRole(...roles)` (specific roles) from `src/lib/rbac.ts`
  as its first line. Both throw `ForbiddenError` (not logged in / wrong
  role) — see [Errors](#errors).
- **Ownership**: beyond role, several actions re-check ownership against
  the database on every call (a PM only their own projects, a Member only
  their own assigned activities) — never trust a client-supplied id alone.
  This is enforced here, not just in the UI.
- **Mutating-action signature**: most create/update actions follow React's
  `useActionState` convention: `(prevState, formData) => Promise<string |
  undefined>` — reads fields off a `FormData`, returns an error message
  string on failure or `undefined` on success (some additionally `redirect()`
  on success instead of returning). Fields are validated with a
  [Zod](https://zod.dev) schema from `src/lib/validation/*` before anything
  touches the database.
- **Audit log**: every mutating action (except the hourly alert job itself,
  which isn't a user action) calls `writeAuditLog()` — see the
  [audit log table](#audit-log) at the end.
- **Dates**: activity/alert dates are day-granular (`@db.Date` — no time
  component). Pass/expect `YYYY-MM-DD` strings from forms; the functions
  convert internally.

### Errors

| Error | Thrown by | Meaning |
|---|---|---|
| `ForbiddenError` (`src/lib/rbac.ts`) | `requireUser()` / `requireRole()` | Not logged in, or logged in as the wrong role. Uncaught — propagates as a thrown exception, not a returned error string. |
| A returned string (not thrown) | Mutating actions, on validation/business-rule failure | e.g. `"That login name is already in use."` — meant to be displayed inline next to the form. |
| `Prisma.PrismaClientKnownRequestError` (`P2002`) | `dismissAlert`, the hourly job's alert insert | Unique-constraint violation — both call sites catch this specific code and treat it as a harmless no-op (idempotency), not an error. |

---

## Auth (`src/lib/auth.ts`, `src/app/login/actions.ts`)

### `loginAction(prevState, formData): Promise<string | undefined>`
Fields: `loginName`, `password`. On success, calls Auth.js's `signIn()`
which redirects to `/dashboard` (Auth.js's redirect is a thrown internal
signal, not a normal return — see the comment in `login/actions.ts` if
touching this). On failure, returns `"Invalid login name or password."`

### `signOut()` (from `@/lib/auth`, called directly)
No params. Used inline as a form action in `src/app/layout.tsx`'s logout
button.

---

## Users (`src/app/users/actions.ts`) — admin only for writes

```ts
export type SafeUser = Omit<User, "passwordHash">   // never returns the hash to any caller
```

### `listUsers(): Promise<SafeUser[]>`
Auth: any logged-in user (`requireUser`) — used across the app for
manager/assignee pickers, not just the admin Users screen. All fields
except `passwordHash`.

### `getUser(userId: string): Promise<SafeUser | null>`
Auth: any logged-in user.

### `createUser(prevState, formData): Promise<string | undefined>`
Auth: `requireRole("ADMIN")`. Fields: `fullName`, `loginName`, `email`
(optional), `password` (min 8 chars), `role` (`ADMIN` | `PROJECT_MANAGER` |
`MEMBER`). Rejects a duplicate `loginName`. Audit: `User` / `create`.

### `updateUser(userId, prevState, formData): Promise<string | undefined>`
Auth: `requireRole("ADMIN")`. Fields: `fullName`, `email` (optional),
`role`. `loginName` is deliberately not editable here (it's the login
credential itself) — password changes go through `resetPassword` below,
not this. Rejects a duplicate `email` (unique when set). Audit: `User` /
`update`.

### `resetPassword(userId, prevState, formData): Promise<string | undefined>`
Auth: `requireRole("ADMIN")`. Fields: `password` (min 8 chars). No
self-service path exists anywhere — this is the only way a password
changes, ever. Audit: `User` / `reset_password`.

### `toggleUserActive(userId): Promise<void>`
Auth: `requireRole("ADMIN")`. Flips `isActive`. An inactive user can't log
in (`auth.ts`'s `authorize()` checks this). Audit: `User` / `toggle_active`.

---

## Projects (`src/app/projects/actions.ts`, `queries.ts`)

### `createProject(prevState, formData): Promise<string | undefined>`
Auth: `requireRole("ADMIN", "PROJECT_MANAGER")`. Fields: `code`, `name`,
`type` (`PURCHASE_ORDER` | `RND` — fixed, matches the source workbook, see
`prisma/schema.prisma`'s comment before touching this), `managerId`. A PM
can only ever create a project managed by themselves — `managerId` is
forced server-side to the caller's own id for that role, regardless of what
the form sends; only an admin can assign a different manager. Rejects a
duplicate `code`. On success: redirects to `/projects/[id]`. Audit:
`Project` / `create`.

### `getProjectWithActivities(projectId): Promise<(Project & { activities: (Activity & { assignedTo: SafeUser })[]; manager: SafeUser }) | null>`
Auth: any logged-in user (every role can see every project).

### `listProjectsForDashboard(): Promise<(Project & { activities: Activity[]; manager: SafeUser })[]>`
Auth: any logged-in user. Powers the dashboard's project list + RAG rollup
(RAG itself is computed client/server-side from the returned activities via
`computeProjectRag()`, not stored).

---

## Activities (`src/app/activities/actions.ts`, `queries.ts`)

### `createActivity(projectId, prevState, formData): Promise<string | undefined>`
Auth: `requireRole("ADMIN", "PROJECT_MANAGER")` + ownership (PM must manage
the project). Fields: `name`, `startDate`, `endDate` (must be ≥ `startDate`),
`assignedToId`, `target`. `durationClass` is computed server-side via
`classifyDuration()` — never accept it from the client. On success:
redirects to `/projects/[projectId]`. Audit: `Activity` / `create`.

### `updateActivity(activityId, prevState, formData): Promise<string | undefined>`
Same fields as create, same ownership check. If `startDate`/`endDate`
changed, recomputes `durationClass` and calls `recomputeAlerts()` (see
[the alert engine](#the-alert-engine-src%2Flibalertsts)) — never changes a
date on its own, only reacts to the dates given. Audit: `Activity` /
`update`.

### `updateActivityStatus(activityId, prevState, formData): Promise<string | undefined>`
Auth: `requireUser()` + ownership — admin always; PM on their own project;
Member only if `assignedToId` is them. Fields: `status`
(`NOT_STARTED`|`IN_PROGRESS`|`COMPLETED`|`DELAYED`), `actual` (free text,
optional). Audit: `Activity` / `update_status`.

### `updateDelayRecord(activityId, prevState, formData): Promise<string | undefined>`
Same auth as status update. Fields: `reasonForDelay`, `correctiveAction`
(both optional text), `hodSupportRequested` (checkbox), `hodRemark`
(optional text — "support from HOD" is a plain note here, not a workflow;
CLAUDE.md §9 open question 3 is still unanswered on whether it should
become one). Audit: `Activity` / `update_delay_record`.

### `previewAlertSchedule(startDate, endDate): Promise<{ durationClass: DurationClass; points: AlertPoint[] }>`
Auth: any logged-in user. Pure computation, no DB writes — what powers the
activity form's live "here's when this will alert" preview. Thin wrapper
over `src/lib/alerts.ts`'s `classifyDuration` + `computeAlertPoints`.

### `getActivity(activityId): Promise<(Activity & { project: Project; assignedTo: SafeUser }) | null>`
Auth: any logged-in user.

---

## Admin: alert rule settings (`src/app/admin/alert-rules/actions.ts`)

The admin-configurable thresholds CLAUDE.md §5 requires ("configurable by an
administrator in a settings table, not hardcoded constants") — the
`AlertRuleSetting` table, one row per `(durationClass, rule)` pair. `OVERDUE`
is not here; it's always-on logic in the hourly job, not a configurable
threshold (see `prisma/schema.prisma`'s comment on this model).

### `listAlertRuleSettings(): Promise<AlertRuleSetting[]>`
Auth: `requireRole("ADMIN")`.

### `updateAlertRuleSetting(id, prevState, formData): Promise<string | undefined>`
Auth: `requireRole("ADMIN")`. Fields: `enabled` (checkbox), and *only*
whichever of `fractionOfDuration` (0–1, for `HALF_TIME`/`THREE_QUARTER`) or
`offsetDaysBeforeEnd` (0–365, for `TWO_DAYS_BEFORE`) matches that row's
`rule` — the other is ignored even if sent. Audit: `AlertRuleSetting` /
`update` (records before/after).

---

## Alerts (`src/app/alerts/actions.ts`, `queries.ts`)

### `listAlertHistory(): Promise<(Alert & { activity: Activity & { project: Project } })[]>`
Auth: any logged-in user. Every alert ever raised, including already-
dismissed ones — dismissal is per-user and never deletes the `Alert` row.

### `listUndismissedAlertsForCurrentUser(): Promise<(Alert & { activity: Activity & { project: Project } })[]>`
Auth: any logged-in user (scoped to them via `requireUser()`). Powers the
beacon popup — polled client-side every 60s (`src/components/BeaconPopup.tsx`).

### `dismissAlert(alertId): Promise<void>`
Auth: any logged-in user. Creates an `AlertDismissal(alertId, userId)` row.
The composite primary key means a second dismiss by the same user is a
harmless no-op (the `P2002` unique violation is caught, not thrown). Audit:
`Alert` / `dismiss`.

---

## The alert engine (`src/lib/alerts.ts`)

Not Server Actions (no `"use server"`, not directly callable from a client)
— plain exported functions, the actual engine. Documented here because
they're the core logic everything above wraps or depends on.

- **`classifyDuration(startDate, endDate): DurationClass`** — pure.
  `≤7 days → WEEKLY`, `8–21 → FORTNIGHTLY`, `≥22 → MONTHLY`.
- **`computeAlertPoints(startDate, endDate, durationClass): Promise<AlertPoint[]>`**
  — reads enabled `AlertRuleSetting` rows for that duration class, computes
  each point's date, de-duplicates same-day points (CLAUDE.md §5).
- **`recomputeAlerts(activityId): Promise<void>`** — called after a date
  edit; deletes only `Alert` rows with `scheduledFor >= today` for that
  activity (defensive, for a same-day edit race) — never touches
  already-raised history.
- **`runHourlyAlertCheck(): Promise<void>`** — the actual hourly job, wired
  into the running process via `src/instrumentation.ts` + `node-cron`
  (`"0 * * * *"`). For every non-`COMPLETED` activity: computes today's
  points (+ a live `OVERDUE` check), and for each, **writes the `Alert` row
  first** (relying on the `(activityId, rule, scheduledFor)` unique
  constraint — a `P2002` means "already raised, skip"), and only after a
  successful insert calls `sendAlertEmail()`. This ordering is load-bearing:
  never call the email step before the insert succeeds. A failed send is
  caught and logged here, not rethrown — one bad email must not stop the
  rest of the batch's `Alert` rows from being written.
- **`computeProjectRag(activities): "RED" | "AMBER" | "GREEN"`** — pure.
  Red beats Amber beats Green.

### `sendAlertEmail(alert): Promise<void>` (`src/lib/email.ts`)

Not a Server Action either — called only from `runHourlyAlertCheck` above.
Recipients: the activity's assignee, the project's manager, and every
active admin — each included only if `User.email` is set, deduplicated.
Sends one email (not one per recipient) via Nodemailer over
`SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD`/`SMTP_FROM`. If
`SMTP_HOST` isn't set, or there are zero recipients with an email on file,
logs and returns without sending — this is a normal, non-error path (e.g.
every environment before SMTP credentials exist). Sets `Alert.emailSentAt`
only after a real send succeeds; never faked. Body is plain text with full
activity detail (name, project, assignee, manager, dates, status, target,
actual, and delay-record fields when present) — CLAUDE.md hard constraint
#2: the link included at the bottom (only when `APP_BASE_URL` is set)
resolves only on the CEL network, so the body itself must never depend on
it.

---

## Audit log

`writeAuditLog()` (`src/lib/audit.ts`) — called by every action above.
`entity` / `action` pairs currently in use:

| Action | `entity` | `action` value |
|---|---|---|
| Create user | `User` | `create` |
| Update user (name/email/role) | `User` | `update` |
| Reset password | `User` | `reset_password` |
| Toggle user active | `User` | `toggle_active` |
| Create project | `Project` | `create` |
| Create activity | `Activity` | `create` |
| Update activity (dates/assignee/name) | `Activity` | `update` |
| Update activity status | `Activity` | `update_status` |
| Update delay record | `Activity` | `update_delay_record` |
| Update alert rule setting | `AlertRuleSetting` | `update` |
| Dismiss alert | `Alert` | `dismiss` |

The hourly job's own `Alert.create` is **not** audit-logged — it's a system
action, not a user one, and the `Alert` row itself is already its own
record.
