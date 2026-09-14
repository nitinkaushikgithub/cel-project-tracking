# Install runbook

Written as the system is built (CLAUDE.md §10 convention), not at the end.

**Status: Phase 1 complete and verified end-to-end.** CLAUDE.md §8
build-order steps 2–5, 7, 8: auth, users/roles, projects/activities CRUD,
the alert engine, the beacon popup/history/dismissals, the dashboard/RAG
rollup, and the audit log. Alert emails are stubbed (logged, not sent) —
see `src/lib/email.ts`; that's Phase 3, per the user's own phasing.
Deployment hardening (backup script, TLS decision) is Phase 2.

This was built by a 4-agent team against a written architecture contract,
then integrated and verified by hand against a real (temporary, local)
Postgres 16 instance and a real running server — not just code review:
`npm install`, `prisma generate`, `tsc --noEmit`, and `next build` all
pass clean, the initial migration below was actually generated and
applied, the seed ran, a real login (bcrypt + JWT) succeeded over HTTP,
every screen rendered against live data, the RAG rollup computed
correctly against real dates, and the alert engine was proven to raise
alerts (including OVERDUE) exactly once each even when run twice — the
idempotency the unique constraint is supposed to guarantee, confirmed
against a real constraint violation, not just in theory.

## Prerequisites

- Docker with Compose v2 (`docker compose`, not `docker-compose`).
- A `.env` file in the project root — copy `.env.example` and set real
  values (`POSTGRES_PASSWORD`, and `AUTH_SECRET` — generate with
  `openssl rand -base64 32`, the app won't start without it).

## Running the stack

```
docker compose up
```

Brings up `postgres`, `app`, and `caddy`. Caddy listens on port 80 and
reverse-proxies to the app. The app itself is not published directly —
only reachable through Caddy, on the internal network (CLAUDE.md §3.2).
`docker-entrypoint.sh` applies `prisma/migrations/` (already generated and
committed — see below) and reseeds (idempotent) on every start, so the
app is demonstrable immediately: one admin user and the sample P101
project with two activities, per CLAUDE.md §10.

**Seeded admin login** — change the password after first login (there is
no self-service reset; an admin resets it from `/users`, CLAUDE.md §3.1):

| Login name | Password |
|---|---|
| `admin` | `ChangeMe123!` |

## The initial migration

`prisma/migrations/20260914093431_init/` is committed — generated and
applied for real against a live Postgres 16 instance during Phase 1
verification, not hand-written. Future schema changes: edit
`prisma/schema.prisma`, then generate the next migration the same way
(`npx prisma migrate dev --name <description>` with `DATABASE_URL`
pointed at a reachable Postgres — `docker compose run --rm --entrypoint
sh app -c "npx prisma migrate dev --name <description>"` works against
the compose stack) and commit what it writes.

## Known gaps at this stage

- **TLS is undecided.** Caddy currently serves plain HTTP. See the
  comments in `Caddyfile` and `docker-compose.yml` — this is CLAUDE.md
  §9.10 (open question 10), not a decision made here.
- **Email isn't actually sent.** `src/lib/email.ts` logs what it would
  send; `Alert.emailSentAt` stays `null`. Real Nodemailer/SMTP wiring is
  Phase 3 (CLAUDE.md build-order step 6).
- **No deployment hardening yet** — backup script, restore procedure,
  administrator guide (CLAUDE.md §8.3 / build-order step 8's remaining
  half). That's Phase 2.
- **`next-auth` is pinned to a beta version** (`5.0.0-beta.32`) — that's
  correctly the current state of the actual package (Auth.js v5 is still
  beta upstream as of this writing), not a placeholder, but it's worth
  checking for a stable release before going to production.
- Verification above ran on Node 22 against a temporary local Postgres 16
  instance and `next start` directly (not through Docker/Caddy — Docker
  wasn't available in the environment this was built in). The Docker
  Compose path itself (image build, Caddy proxying, container networking,
  `docker-entrypoint.sh`'s migrate+seed+start sequence) has not yet been
  run end-to-end and should be the first thing verified in an environment
  that has Docker.
