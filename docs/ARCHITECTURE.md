# Phase 1 architecture — UI + backend integration

Written by the Architect for four implementers (Backend Lead, Frontend Lead,
Dev1-backend, Dev2-frontend) who have **no conversation history** — only
`CLAUDE.md`, this doc, and the repo as it stands. If something here seems to
contradict `CLAUDE.md`, `CLAUDE.md` wins; stop and flag it rather than
guessing (same rule it states for the source docx).

Phase 1 = CLAUDE.md §8 build-order steps **2, 3, 4, 5, 7, 8**: auth, users
and roles, projects/activities CRUD, the alert engine, the beacon popup +
alert history + dismissals, the dashboard + RAG rollup, and the audit log.

**Not phase 1** (do not build):
- Actually sending email (step 6) — Phase 3. The alert engine still writes
  `Alert` rows exactly as CLAUDE.md §5 specifies; only the "send the email"
  step is stubbed (see §6 below).
- Deployment hardening, backup script — Phase 2.
- Anything in CLAUDE.md §9 (open questions: PO/sales fields, P/R-series
  form split, HOD workflow beyond a text note, risk register, and the
  rest). Do not invent answers. If a screen needs one of these to feel
  "complete," leave it out rather than guessing — it's meant to feel
  incomplete until the customer answers.

No one on this team has `node`/`npm`/`docker` available to run anything.
Write carefully, re-read what you write, match the syntax and style already
in the repo.

---

## 1. What already exists — do not touch

`prisma/schema.prisma`, `package.json`, `docker-compose.yml`, `Dockerfile`,
`docker-entrypoint.sh`, `Caddyfile`, `next.config.js`, `tsconfig.json`,
`next-env.d.ts`, `.env.example`, `RUNBOOK.md`, and this file are owned by
the Architect. If you find you genuinely need to change one, stop and flag
it back rather than editing it silently.

The schema now includes, beyond CLAUDE.md §4's literal model:
- `User.email` (`String?`, unique, contact-only, never used for auth).
- `AlertRuleSetting` — the admin-configurable thresholds table §5 requires.
  Shape:
  ```
  AlertRuleSetting: id, durationClass (WEEKLY|FORTNIGHTLY|MONTHLY),
                     rule (HALF_TIME|THREE_QUARTER|TWO_DAYS_BEFORE),
                     enabled (bool, default true),
                     fractionOfDuration (float, nullable),
                     offsetDaysBeforeEnd (int, nullable)
  @@unique([durationClass, rule])
  ```
  Exactly one of `fractionOfDuration` / `offsetDaysBeforeEnd` is set per
  row, matching which kind of point the `rule` is:
  - `HALF_TIME` / `THREE_QUARTER` → `fractionOfDuration` (0.50 / 0.75).
    Point = `startDate + floor(fraction * durationDays)`.
  - `TWO_DAYS_BEFORE` → `offsetDaysBeforeEnd` (2). Point = `endDate -
    offsetDaysBeforeEnd`.
  `OVERDUE` is **not** a row in this table — it isn't a duration-class point
  computed from a fraction/offset, it's a standing status check ("end_date
  has passed and status is not COMPLETED"). It's always-on logic in the
  alert engine, not something a duration class can individually disable.

  **Seed defaults** (must match CLAUDE.md §5 exactly):
  | durationClass | rule | enabled | value |
  |---|---|---|---|
  | WEEKLY | TWO_DAYS_BEFORE | true | offsetDaysBeforeEnd = 2 |
  | FORTNIGHTLY | HALF_TIME | true | fractionOfDuration = 0.50 |
  | FORTNIGHTLY | THREE_QUARTER | true | fractionOfDuration = 0.75 |
  | FORTNIGHTLY | TWO_DAYS_BEFORE | true | offsetDaysBeforeEnd = 2 |
  | MONTHLY | HALF_TIME | true | fractionOfDuration = 0.50 |
  | MONTHLY | THREE_QUARTER | true | fractionOfDuration = 0.75 |
  | MONTHLY | TWO_DAYS_BEFORE | true | offsetDaysBeforeEnd = 2 |
  (WEEKLY has no HALF_TIME/THREE_QUARTER row — it never had those points.)

`package.json` now also declares (not yet installed — no npm here):
`next-auth` (v5, credentials provider, JWT sessions, **no adapter** — do
not add Session/Account/VerificationToken models or touch the schema; hard
constraint #1 forbids any email-based auth flow), `bcryptjs` (password
hashing), `zod` (validation), `node-cron` (the hourly job). Exact pinned
versions may need bumping once `npm install` actually runs somewhere with
network access — that's expected, not a bug in this doc.

`prisma/migrations/` is still empty (noted in `RUNBOOK.md`). Nobody on this
team can generate migrations here either. Build against the schema as
written; migration generation happens later, from a machine with Docker.

---

## 2. Directory layout

```
src/
  middleware.ts                 — Backend Lead
  instrumentation.ts            — Dev1

  lib/
    prisma.ts                   — exists already, don't touch
    auth.ts                     — Backend Lead
    password.ts                 — Backend Lead
    rbac.ts                     — Backend Lead
    audit.ts                    — Backend Lead
    alerts.ts                   — Dev1
    email.ts                    — Dev1 (stub only, see §6.5)
    validation/
      user.ts                   — Backend Lead
      project.ts                — Backend Lead
      activity.ts                — Backend Lead
      alert-rule.ts              — Dev1

  types/
    next-auth.d.ts               — Backend Lead

  components/
    BeaconPopup.tsx               — Dev2
    RagBadge.tsx                  — Dev2 (small shared badge; Frontend Lead
                                    may import it on the project detail page
                                    — read-only import, not edited by them)

  app/
    layout.tsx                    — Frontend Lead
    page.tsx                      — Frontend Lead (redirect to /dashboard)
    globals.css                   — Frontend Lead (extend, don't rewrite)

    api/auth/[...nextauth]/route.ts — Backend Lead

    login/
      page.tsx                    — Frontend Lead
      actions.ts                  — Backend Lead

    users/
      page.tsx                    — Frontend Lead
      actions.ts                  — Backend Lead
      [id]/reset-password/page.tsx — Frontend Lead

    projects/
      actions.ts                  — Backend Lead
      queries.ts                  — Backend Lead
      new/page.tsx                 — Frontend Lead
      [id]/page.tsx                 — Frontend Lead
      [id]/activities/new/page.tsx   — Frontend Lead (the activity form;
                                       see §4 — there is no bare /projects
                                       list page, the dashboard is it)

    activities/
      actions.ts                   — Backend Lead
      queries.ts                    — Backend Lead
      [id]/page.tsx                  — Frontend Lead

    dashboard/
      page.tsx                      — Dev2
      queries.ts                     — Dev1 (RAG rollup query — grouped
                                       with Dev1 since it's alert/status
                                       logic, matching the actions.ts/
                                       queries.ts-vs-page.tsx split used
                                       everywhere else in this doc)

    admin/alert-rules/
      page.tsx                       — Dev2
      actions.ts                      — Dev1

    alerts/
      page.tsx                        — Dev2
      actions.ts                       — Dev1
      queries.ts                        — Dev1

prisma/
  seed.ts                                — Backend Lead (creates the one
                                           admin user CLAUDE.md §10 wants;
                                           P101 sample project needs
                                           projects/activities to exist —
                                           coordinate with whichever of you
                                           finishes projects CRUD first, or
                                           just write both halves — it's one
                                           small file, low conflict risk)
```

**Rule for shared folders** (users/projects/activities/admin/alert-rules/
alerts): whoever needs the directory first creates it with only their own
file in it. The other implementer adds their file alongside — never
overwrite or delete a file you don't own to "clean up" a folder. File names
above are fully disjoint, so this is zero-conflict by construction as long
as everyone only writes the files listed as theirs.

`src/app/layout.tsx` is Frontend Lead's alone. Dev2 does not touch it.
Frontend Lead must leave this exact mount point so Dev2's popup shows up
without either of you touching the other's file:

```tsx
// src/app/layout.tsx
import { BeaconPopup } from "@/components/BeaconPopup";
// ...
<body>
  <Header />           {/* Frontend Lead's own component, bell icon links to /alerts */}
  <BeaconPopup />       {/* Dev2 owns this component; renders null if there's nothing to show */}
  {children}
</body>
```
Import path `@/components/BeaconPopup`, named export `BeaconPopup`, a
client component that takes no props and returns `null` when there's
nothing to show. Frontend Lead: add the import and the tag exactly once,
even before Dev2's file exists — Dev2 will create it at that path.

---

## 3. Auth & roles

Auth.js v5, credentials provider only, **JWT session strategy, no
database adapter** (hard constraint #1: no email auth of any kind, so
none of the adapter's tables are needed or wanted).

`src/types/next-auth.d.ts` (Backend Lead) — module augmentation so
`session.user.role` etc. are typed, no `any` anywhere (CLAUDE.md §10):

```ts
import { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: Role;
    loginName: string;
  }
  interface Session {
    user: {
      id: string;
      role: Role;
      loginName: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    loginName: string;
  }
}
```

`src/lib/auth.ts` exports `{ handlers, auth, signIn, signOut }` from
`NextAuth({...})`. Credentials `authorize()`: look up `User` by
`loginName`, reject if missing or `!isActive`, verify password via
`src/lib/password.ts`'s `verifyPassword`, return `{ id, name: fullName,
loginName, role }`. `jwt`/`session` callbacks copy `id`, `role`,
`loginName` onto the token/session per the augmentation above. `pages:
{ signIn: "/login" }`.

`src/app/api/auth/[...nextauth]/route.ts`:
```ts
export const { GET, POST } = handlers; // re-exported from "@/lib/auth"
```

`src/lib/password.ts`:
```ts
export async function hashPassword(password: string): Promise<string>
export async function verifyPassword(password: string, hash: string): Promise<boolean>
```
`bcryptjs`, 12 salt rounds, boring.

`src/lib/rbac.ts` — used inside every server action for the fine-grained
check; middleware only does the coarse gate (see below):
```ts
export class ForbiddenError extends Error {}
export async function requireUser(): Promise<Session["user"]>   // throws ForbiddenError if not logged in
export async function requireRole(...roles: Role[]): Promise<Session["user"]>  // throws if role not in list
```

`src/middleware.ts` (Backend Lead) wraps `auth` from `@/lib/auth`:
redirect to `/login` if not logged in (except `/login` and
`/api/auth/**`); redirect logged-in users away from `/login`; and as a
**coarse, defense-in-depth** gate (not the source of truth — that's each
server action's own `requireRole` call), redirect non-admins away from
`/users/**` and `/admin/**`. Matcher excludes `/api/auth`, `_next/static`,
`_next/image`, `favicon.ico`.

### Role matrix (CLAUDE.md §7, restated so you don't need to cross-reference)

| Action | Admin | Project manager | Member |
|---|---|---|---|
| Create/reset users | yes | no | no |
| Create projects | yes | own only* | no |
| Add/edit activities | yes | own projects only | no |
| Update status | yes | own projects only | assigned activity only |
| See all projects | yes | yes | yes |

\* "own projects" for a PM means `Project.managerId === session.user.id`.
For activities, "own projects" means the activity's parent
`Project.managerId === session.user.id`. For a Member updating status,
"assigned only" means `Activity.assignedToId === session.user.id`. Every
action below that mutates a `Project` or `Activity` must re-check this
server-side via a DB read — never trust a client-supplied project/activity
id without confirming ownership/assignment first.

---

## 4. Routes (CLAUDE.md §6 screens)

| Route | Screen | Who |
|---|---|---|
| `/login` | Login | all (unauthenticated) |
| `/dashboard` | Dashboard — counts, project list with RAG, slipping in red | all |
| `/users` | Users — list, create, reset password | admin |
| `/users/[id]/reset-password` | Reset password form | admin |
| `/projects/new` | Create project | admin, PM |
| `/projects/[id]` | Project detail — fields + activity table | all (read); edit per role matrix |
| `/projects/[id]/activities/new` | Activity form — live alert schedule preview | admin, PM (own project) |
| `/activities/[id]` | Activity detail: status update, delay record fields, edit dates/assignee | per role matrix |
| `/admin/alert-rules` | Alert rules — thresholds per duration class, on/off | admin |
| `/alerts` | Alert history, reachable from a bell icon in the header | all |

`/` redirects to `/dashboard` (middleware already sends unauthenticated
users to `/login` first). There is no separate `/projects` list page —
the dashboard *is* the project list (CLAUDE.md §3.3 of the source doc:
"The dashboard is the first screen after login and lists every project
with its status"). Frontend Lead: skip building a bare `/projects` index;
`/projects/new` is the only route Frontend Lead needs under `/projects`
besides `[id]`.

Beacon popup is not a route — it's the global component described in §2.

---

## 5. Alert engine (Dev1 owns `src/lib/alerts.ts`, `instrumentation.ts`)

### 5.1 Classification (pure function)

```ts
// src/lib/alerts.ts
export function classifyDuration(startDate: Date, endDate: Date): DurationClass
```
`durationDays = endDate - startDate + 1` (inclusive, both `Date`s at
midnight UTC / date-only). `<= 7` → `WEEKLY`; `8..21` → `FORTNIGHTLY`;
`>= 22` → `MONTHLY`.

### 5.2 Alert points (pure function, reads settings, no DB writes)

```ts
export type AlertPoint = { rule: AlertRule; date: Date };

export async function computeAlertPoints(
  startDate: Date,
  endDate: Date,
  durationClass: DurationClass,
): Promise<AlertPoint[]>
```
Reads enabled `AlertRuleSetting` rows for `durationClass`, computes each
point's date per §1's formulas, **de-duplicates same-day points** (if two
computed dates land on the same day, keep one — CLAUDE.md §5 says so
explicitly). Does not include `OVERDUE` — that's not a fixed point, it's
evaluated live by the hourly job against "has `endDate` passed and status
!= COMPLETED," not precomputed.

This must be callable from a **client component** for the "shows the
computed alert schedule live before save" requirement (CLAUDE.md §6,
activity form) — but it reads `AlertRuleSetting` from the DB, so it can't
run client-side directly. Frontend Lead's activity form calls it through a
plain **server action** wrapper Backend Lead does not own (Dev1 owns
`activities/actions.ts`? No — re-check §2: `activities/actions.ts` is
**Backend Lead's** file). So: Backend Lead's `activities/actions.ts`
exports a thin wrapper:
```ts
export async function previewAlertSchedule(
  startDate: string, endDate: string,
): Promise<{ durationClass: DurationClass; points: AlertPoint[] }>
```
which just calls `classifyDuration` + `computeAlertPoints` from Dev1's
`src/lib/alerts.ts` — Backend Lead imports Dev1's module, does not
reimplement it. Frontend Lead's activity form calls `previewAlertSchedule`
via `useActionState`/a debounced call on date-field change to render the
live preview.

### 5.3 Recomputation on edit (CLAUDE.md §5 "Recomputation")

When an activity's `startDate`/`endDate` change (in Backend Lead's
`activities/actions.ts` `updateActivity`), after saving the new dates and
`durationClass`:
```ts
export async function recomputeAlerts(activityId: string): Promise<void>
```
(in `src/lib/alerts.ts`, Dev1): delete `Alert` rows for this activity where
`raisedAt` is in the future relative to... no — re-read CLAUDE.md
carefully: "Delete future unraised alerts; never delete alerts already
raised." An `Alert` row *is* "raised" the moment it's written (§5's hourly
check inserts it as the raise). So "unraised" here means **not yet
created** — i.e. this is about the *computed schedule*, not existing rows:
recomputation means deleting existing `Alert` rows whose `scheduledFor` is
still in the future (today or later) AND have not yet actually been
triggered... but every `Alert` row that exists *was* triggered (the
hourly job writes the row exactly when it raises the alert, never before).
So in practice: **there should never be an `Alert` row with
`scheduledFor` in the future to delete** under normal operation, because
rows are only created at the moment their point is reached. The
recomputation step exists for the case where dates change *after* some
alerts were already raised (past `scheduledFor`, row exists) but *before*
other computed points were reached (future `scheduledFor`, no row exists
yet — nothing to delete, the new schedule simply applies going forward
since the hourly job computes points fresh from current dates each run).
**Conclusion for implementers:** `recomputeAlerts` only needs to delete any
`Alert` row for this activity with `scheduledFor >= today` (there normally
won't be any, but delete defensively in case of a same-day edit race) —
**never** delete rows with `scheduledFor < today` (already raised,
history). Call `recomputeAlerts(activityId)` at the end of every
`updateActivity` that changes `startDate` or `endDate`. If this reasoning
still feels off when you're implementing it, flag it back rather than
guessing further — this is the trickiest paragraph in the whole doc.

### 5.4 The hourly job

```ts
// src/lib/alerts.ts
export async function runHourlyAlertCheck(): Promise<void>
```
For every `Activity` not `COMPLETED`:
1. Compute today's applicable points: `computeAlertPoints(...)` for the
   three duration-class rules, plus a synthetic `OVERDUE` check
   (`endDate < today && status !== 'COMPLETED'`, `scheduledFor = endDate`
   — pick the overdue date deterministically as `endDate` so the unique
   constraint still dedupes it across runs).
2. For each point whose `date === today` (or, for `OVERDUE`, whose
   condition is simply currently true — evaluate it every run, not just on
   the day it first becomes true, but rely on the unique constraint so
   it's only inserted once): attempt
   `prisma.alert.create({ data: { activityId, rule, scheduledFor } })`
   inside error handling that treats a unique-constraint violation
   (`P2002`) as "already raised, skip" rather than an error.
3. **Write the `Alert` row before doing anything else for that point.**
   Only after a successful insert, call the stubbed
   `sendAlertEmail(alert)` from `src/lib/email.ts` (§6). Never call
   `sendAlertEmail` before the insert succeeds — CLAUDE.md §5 is explicit
   and this is load-bearing for idempotency across restarts/retries.

`instrumentation.ts` (Dev1, project root, i.e. `src/instrumentation.ts` —
Next.js's documented hook, runs once when the server process starts):
```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const cron = await import("node-cron");
    cron.schedule("0 * * * *", async () => {
      const { runHourlyAlertCheck } = await import("@/lib/alerts");
      await runHourlyAlertCheck();
    });
  }
}
```
This is a single long-running `next start` process inside one Docker
container (CLAUDE.md §2 — not serverless, no queue). One `node-cron`
registration is the whole "scheduler." Do not reach for anything else.

### 5.5 Email stub (`src/lib/email.ts`, Dev1)

```ts
export async function sendAlertEmail(alert: Alert & { activity: Activity & { project: Project; assignedTo: User } }): Promise<void> {
  // Phase 3 (CLAUDE.md build-order step 6): actually send via Nodemailer
  // over CEL's SMTP server, full activity detail in the body (hard
  // constraint #2 — the link only works on the CEL network). Not built
  // yet. Log so the alert engine's behavior is still observable.
  console.log(`[email stub] would send alert email for alert ${alert.id}`);
}
```
Update `Alert.emailSentAt` only once real sending exists in Phase 3 —
leave it `null` for now (do not fake-set it from the stub; that would
misrepresent history).

---

## 6. RAG rule (CLAUDE.md §6, restated)

For a project, evaluate over its activities:
- **Red** — any activity `DELAYED`, or `endDate` has passed and status is
  not `COMPLETED`.
- **Amber** — any activity within 2 days of `endDate` (and not already
  Red by the rule above).
- **Green** — otherwise.

Dev1's `dashboard/queries.ts` computes this per project (a plain function,
e.g. `computeProjectRag(activities: Activity[]): 'RED' | 'AMBER' | 'GREEN'`
in `src/lib/alerts.ts` is a reasonable home for it too since it's alert-
adjacent logic and Dev1 already owns that file — Dev1's call which file,
just export it clearly). Dev2's dashboard page and `RagBadge` component
render the three states with the same red used consistently everywhere
(CLAUDE.md §6).

---

## 7. Audit log

`src/lib/audit.ts` (Backend Lead):
```ts
export async function writeAuditLog(params: {
  userId: string;
  entity: string;       // "User" | "Project" | "Activity" | "AlertRuleSetting"
  entityId: string;
  action: string;       // short verb: "create" | "update" | "reset_password" | "toggle_active" | "dismiss"
  changes: Prisma.InputJsonValue;  // whatever's useful — new values at minimum
}): Promise<void>
```
CLAUDE.md §10: "Every destructive action writes an AuditLog row." Call it
from every mutating action below:

| Action | entity | action value |
|---|---|---|
| create user | `User` | `create` |
| reset password | `User` | `reset_password` |
| toggle user active | `User` | `toggle_active` |
| create project | `Project` | `create` |
| create activity | `Activity` | `create` |
| update activity (dates/assignee/name) | `Activity` | `update` |
| update activity status | `Activity` | `update_status` |
| update delay record (reason/corrective action/HOD fields) | `Activity` | `update_delay_record` |
| update alert rule setting | `AlertRuleSetting` | `update` |

Alert creation by the hourly job is **not** a user action — don't audit-log
it (it already has its own record: the `Alert` row itself). Dismissing a
popup is arguably not "destructive" but is worth a trail since it's the
only record of who saw what — Dev1's dismissal action should audit-log it
too (`entity: "Alert"`, `action: "dismiss"`) for consistency; use your
judgment if this feels like overkill, it's a minor call either way.

---

## 8. Server action / query contract

Exact signatures. Implementers building against these in parallel is the
whole point — do not rename without flagging it back.

**`src/app/login/actions.ts`** (Backend Lead)
```ts
export async function loginAction(
  prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined>  // returns an error message, or undefined on success (redirects)
```

**`src/app/users/actions.ts`** (Backend Lead)
```ts
export async function createUser(prevState: string | undefined, formData: FormData): Promise<string | undefined>
export async function resetPassword(userId: string, prevState: string | undefined, formData: FormData): Promise<string | undefined>
export async function toggleUserActive(userId: string): Promise<void>
```
All `requireRole("ADMIN")` first. `createUser` fields: `fullName`,
`loginName`, `email` (optional), `password`, `role`. Validate with
`src/lib/validation/user.ts` (zod schemas `createUserSchema`,
`resetPasswordSchema`).

**`src/app/projects/actions.ts` / `queries.ts`** (Backend Lead)
```ts
export async function createProject(prevState: string | undefined, formData: FormData): Promise<string | undefined>
// requireRole("ADMIN", "PROJECT_MANAGER"); fields: code, name, type, managerId
// (admin picks any manager; PM creating their own project — default managerId to self, but allow admin to assign to any PM)

export async function getProjectWithActivities(projectId: string): Promise<Project & { activities: Activity[]; manager: User } | null>
export async function listProjectsForDashboard(): Promise<(Project & { activities: Activity[]; manager: User })[]>
```

**`src/app/activities/actions.ts` / `queries.ts`** (Backend Lead)
```ts
export async function createActivity(projectId: string, prevState: string | undefined, formData: FormData): Promise<string | undefined>
// requireRole("ADMIN","PROJECT_MANAGER") + ownership check on the project.
// fields: name, startDate, endDate, assignedToId, target.
// Computes durationClass via classifyDuration (from Dev1's lib/alerts.ts) and stores it.

export async function updateActivity(activityId: string, prevState: string | undefined, formData: FormData): Promise<string | undefined>
// role matrix ownership check; if startDate/endDate changed, recompute durationClass
// and call recomputeAlerts(activityId) (Dev1's function) after saving.

export async function updateActivityStatus(activityId: string, prevState: string | undefined, formData: FormData): Promise<string | undefined>
// assignee, or PM/admin per role matrix. fields: status, actual.

export async function updateDelayRecord(activityId: string, prevState: string | undefined, formData: FormData): Promise<string | undefined>
// fields: reasonForDelay, correctiveAction, hodSupportRequested, hodRemark.

export async function previewAlertSchedule(startDate: string, endDate: string): Promise<{ durationClass: DurationClass; points: AlertPoint[] }>
// thin wrapper over Dev1's classifyDuration + computeAlertPoints — see §5.2.

export async function getActivity(activityId: string): Promise<Activity & { project: Project; assignedTo: User } | null>
```

**`src/app/admin/alert-rules/actions.ts`** (Dev1)
```ts
export async function listAlertRuleSettings(): Promise<AlertRuleSetting[]>
export async function updateAlertRuleSetting(id: string, prevState: string | undefined, formData: FormData): Promise<string | undefined>
// requireRole("ADMIN"). fields: enabled, and whichever of fractionOfDuration/offsetDaysBeforeEnd applies to that row's rule.
```

**`src/app/alerts/actions.ts` / `queries.ts`** (Dev1)
```ts
export async function listAlertHistory(): Promise<(Alert & { activity: Activity & { project: Project } })[]>
export async function listUndismissedAlertsForCurrentUser(): Promise<(Alert & { activity: Activity & { project: Project } })[]>
// alerts with no AlertDismissal row for the current session user — powers the beacon popup.
export async function dismissAlert(alertId: string): Promise<void>
// requireUser(); creates AlertDismissal(alertId, userId) — @@id means a second call is a harmless no-op, catch the unique violation.
```

`src/components/BeaconPopup.tsx` (Dev2) polls
`listUndismissedAlertsForCurrentUser` (simplest boring approach: a client
component with a `setInterval` every 60s calling a route handler or
server action — reuse the server action directly via a client component
is fine in Next 15/React 19) and renders the first undismissed alert as a
modal with **Update progress** (links to `/activities/[id]`) and **Close**
(calls `dismissAlert`, then re-fetches).

---

## 9. Seed script (`prisma/seed.ts`, Backend Lead)

CLAUDE.md §10: "Seed script should create one admin and the sample P101
project so the app is demonstrable immediately after install." One admin
user (pick a boring default login name/password, document it in
`RUNBOOK.md` — note in your PR that `RUNBOOK.md` itself is Architect-owned,
so *propose* the addition in your report rather than editing it, or add a
short new section clearly marked as yours if you judge that safer — your
call, low risk either way) via `hashPassword`, then the P101 project with
one or two sample activities so the dashboard isn't empty on first login.
Also seed the `AlertRuleSetting` defaults table from §1 — this seed script
is the natural place for that, not a migration.

---

## 10. Summary of who owns what (copy of §2, flattened)

**Backend Lead**: `src/lib/auth.ts`, `src/lib/password.ts`,
`src/lib/rbac.ts`, `src/lib/audit.ts`, `src/lib/validation/*`,
`src/types/next-auth.d.ts`, `src/middleware.ts`,
`src/app/api/auth/[...nextauth]/route.ts`, `src/app/login/actions.ts`,
`src/app/users/actions.ts`, `src/app/projects/actions.ts`,
`src/app/projects/queries.ts`, `src/app/activities/actions.ts`,
`src/app/activities/queries.ts`, `prisma/seed.ts`.

**Frontend Lead**: `src/app/layout.tsx`, `src/app/page.tsx`,
`src/app/globals.css`, `src/app/login/page.tsx`, `src/app/users/page.tsx`,
`src/app/users/[id]/reset-password/page.tsx`,
`src/app/projects/new/page.tsx`, `src/app/projects/[id]/page.tsx`,
`src/app/activities/[id]/page.tsx`, and the new-activity page (choose the
route `src/app/projects/[id]/activities/new/page.tsx` per §4's route
table).

**Dev1 (backend)**: `src/lib/alerts.ts`, `src/lib/email.ts`,
`src/instrumentation.ts`, `src/app/admin/alert-rules/actions.ts`,
`src/app/alerts/actions.ts`, `src/app/alerts/queries.ts`,
`src/app/dashboard/queries.ts` (RAG rollup query — grouped with Dev1 since
it's alert/status logic, not markup).

**Dev2 (frontend)**: `src/app/dashboard/page.tsx`,
`src/components/BeaconPopup.tsx`, `src/components/RagBadge.tsx`,
`src/app/admin/alert-rules/page.tsx`, `src/app/alerts/page.tsx`.

If any of you finds a genuine file-ownership collision not resolved above,
stop and flag it back rather than guessing who wins.
