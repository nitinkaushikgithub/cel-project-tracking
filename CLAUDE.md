# CEL Project Monitoring System

Internal web application for CEL (Central Electronics) to replace an Excel workbook
used for project activity tracking, and to raise automatic alerts as activity
deadlines approach.

Built by a student engineering team. **Favour the simple, boring implementation
everywhere.** If a choice is between clever and obvious, pick obvious.

---

## 1. Source of truth

`CEL-project-monitoring-draft.docx` in this folder is the agreed scope document.
Where this file and the document disagree, the document wins — tell the user
rather than guessing.

Section 10 of that document lists points **not yet decided by the customer**.
See §9 below. Do not invent answers to those.

---

## 2. Stack (fixed — do not substitute)

| Layer | Choice |
|---|---|
| App | Next.js (App Router) + TypeScript, single codebase |
| DB | PostgreSQL |
| ORM | Prisma |
| Auth | Auth.js, credentials provider only |
| Email | Nodemailer over customer SMTP |
| Scheduling | `node-cron` inside the app process |
| Proxy | Caddy |
| Packaging | Docker Compose: app + postgres + caddy |

Deliberately **not** used: Redis, BullMQ, Keycloak, S3/MinIO, native mobile,
any cloud service. Do not add them.

---

## 3. Hard constraints

1. **No email authentication.** No signup, no verification mail, no reset links.
   An administrator creates each user and sets their password directly, and
   resets it the same way.
2. **Internal network only.** Never reachable from the internet. Alert emails
   must carry full activity detail in the body, because the link inside them
   only works on the CEL network.
3. **The system never changes a date.** It reads dates users entered and acts
   on them. No auto-rescheduling, ever.
4. **Responsive web only.** Must work in a phone browser. No native app.
5. **Single command deploy.** `docker compose up` must be the whole install.

---

## 4. Data model

```
User            id, full_name, login_name (unique), password_hash,
                role: ADMIN | PROJECT_MANAGER | MEMBER,
                is_active, created_at

Project         id, code (unique, e.g. "P101"), name,
                type: PURCHASE_ORDER | RND,
                manager_id -> User, created_at

Activity        id, project_id -> Project, name,
                start_date (date), end_date (date),
                duration_class: WEEKLY | FORTNIGHTLY | MONTHLY  (derived, stored)
                assigned_to -> User,
                status: NOT_STARTED | IN_PROGRESS | COMPLETED | DELAYED,
                target (text), actual (text),
                reason_for_delay (text, nullable),
                corrective_action (text, nullable),
                hod_support_requested (bool), hod_remark (text, nullable)

Alert           id, activity_id -> Activity,
                rule: HALF_TIME | THREE_QUARTER | TWO_DAYS_BEFORE | OVERDUE,
                scheduled_for (date),
                raised_at, email_sent_at (nullable),
                UNIQUE (activity_id, rule, scheduled_for)   <-- load bearing

AlertDismissal  alert_id -> Alert, user_id -> User, dismissed_at,
                UNIQUE (alert_id, user_id)

AuditLog        id, user_id, entity, entity_id, action, changes (jsonb), at
```

**Note on `AlertDismissal`:** the popup is shown to *all* users, so dismissal
must be per-user. One user closing a popup must not hide it from anyone else.
Do not put a `dismissed` boolean on `Alert`.

---

## 5. Alert engine — the core feature

### Classification
```
duration_days = end_date - start_date + 1

duration_days <= 7    -> WEEKLY
duration_days 8..21   -> FORTNIGHTLY
duration_days >= 22   -> MONTHLY
```

### Alert points
```
WEEKLY:       [ end_date - 2 days ]
FORTNIGHTLY:  [ start + floor(0.50 * duration_days),
                start + floor(0.75 * duration_days),
                end_date - 2 days ]
MONTHLY:      same as FORTNIGHTLY
```
De-duplicate if two computed dates land on the same day.
Additionally: `OVERDUE` fires when `end_date` has passed and status is not
`COMPLETED`.

These thresholds must be **configurable by an administrator** in a settings
table, not hardcoded constants. The values above are the defaults.

### The hourly check
```
every hour:
  find activities where an alert point == today
    and no Alert row exists for (activity, rule, date)
  for each:
    INSERT Alert            <-- write first
    then send email
```
Write the `Alert` row before sending. The unique constraint is what makes the
job idempotent across restarts and retries. Never send first.

The same `Alert` row drives both the popup and the history list — they are one
record, which is why closing a popup cannot delete it.

### Recomputation
If a user edits an activity's dates, recompute its alert points. Delete future
unraised alerts; never delete alerts already raised.

---

## 6. Screens

| Screen | Who | Contents |
|---|---|---|
| Login | all | login name + password only |
| Users | admin | list; create user (name, login, password, role); reset password |
| Dashboard | all | counts, project list with RAG, **slipping projects in red** |
| Project detail | all | project fields + activity table |
| Activity form | PM | name, start, end, assignee — shows computed alert schedule live before save |
| Delay record | assignee/PM | reason for delay, corrective action, HOD support, HOD remark |
| Alert rules | admin | thresholds per duration class, on/off |
| Alert history | all | every alert, reachable from a bell icon in the header |

Beacon popup: appears on any screen when an unraised-to-this-user alert exists.
Actions are *Update progress* and *Close*. Close writes an `AlertDismissal`.

### Project RAG rule
- **Red** — any activity `DELAYED`, or past `end_date` and not `COMPLETED`
- **Amber** — any activity within 2 days of `end_date`
- **Green** — otherwise

---

## 7. Roles

| | Admin | Project manager | Member |
|---|---|---|---|
| Create/reset users | yes | no | no |
| Create projects | yes | own only | no |
| Add/edit activities | yes | own projects | no |
| Update status | yes | own projects | assigned only |
| See all projects | yes | yes | yes |

---

## 8. Build order

1. Docker Compose + Prisma schema + migrations
2. Auth.js credentials login, user CRUD, roles
3. Projects + activities CRUD, data entry screens
4. **Alert engine** — classification, point calculation, hourly job, idempotency
5. Beacon popup + alert history + dismissals
6. Email via Nodemailer, full detail in body
7. Dashboard + RAG rollup
8. Audit log, backup script, install runbook

Build 4 before 7. It is the customer's headline requirement and the one that
depends on their mail server, so it needs proving while there is time to fix
access problems.

---

## 9. Open — DO NOT INVENT

The customer has not yet answered these. If code needs one of them, stop and
ask the user rather than picking:

1. Whether PO / sales columns (PO number, PO value, quantity supplied, sales
   achieved) are in scope. Currently **out**.
2. Whether P-series and R-series need different forms. Currently one form.
3. Whether "support from HOD" is a workflow or a text note. Currently a note.
4. Whether a risk register with likelihood/impact is wanted. Currently **not built**.
5. Who updates progress, and how often.
6. Whether half time is measured across the activity or the whole project.
   Currently **the activity**.
7. Whether popups stay visible to all users or narrow to assignee/PM/HOD.
   Currently **all users**.
8. Whether popup acknowledgement must be recorded against a user.
9. Full escalation matrix — not yet supplied.
10. Internal certificate authority availability.

---

## 10. Conventions

- TypeScript strict. No `any`.
- Dates as `date` columns, not timestamps. Activities are day-granular.
- All money/quantity fields deferred until open question 1 is answered.
- Every destructive action writes an `AuditLog` row.
- Seed script should create one admin and the sample P101 project so the app is
  demonstrable immediately after install.
- Write the install runbook as you go, not at the end.
