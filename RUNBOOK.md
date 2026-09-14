# Install runbook

Written as the system is built (CLAUDE.md §10 convention), not at the end.

**Status: Phase 1 complete** (per the user's own phasing — UI + backend
integration; deployment hardening is Phase 2, email sending is Phase 3).
That's CLAUDE.md §8 build-order steps 2–5, 7, 8: auth, users/roles,
projects/activities CRUD, the alert engine, the beacon popup/history/
dismissals, the dashboard/RAG rollup, and the audit log. Alert emails are
stubbed (logged, not sent) — see `src/lib/email.ts`.

## Prerequisites

- Docker with Compose v2 (`docker compose`, not `docker-compose`).
- A `.env` file in the project root — copy `.env.example` and set real
  values, especially `POSTGRES_PASSWORD`.

## First-time setup (before `docker compose up` works)

The Prisma schema (`prisma/schema.prisma`) exists, but no migration has
been generated from it yet — `prisma/migrations/` is empty. Generate the
initial migration once, with Postgres reachable:

```
docker compose up -d postgres
docker compose run --rm --entrypoint sh app -c "npx prisma migrate dev --name init"
```

This writes `prisma/migrations/<timestamp>_init/` to the working tree —
commit it. After that, `docker-entrypoint.sh` applies it automatically
(`prisma migrate deploy`) every time the `app` container starts, including
on later schema changes once new migrations are generated the same way.

## Running the stack

```
docker compose up
```

Brings up `postgres`, `app`, and `caddy`. Caddy listens on port 80 and
reverse-proxies to the app. The app itself is not published directly —
only reachable through Caddy, on the internal network (CLAUDE.md §3.2).

Every container start also runs `npx prisma db seed`
(`prisma/seed.ts`, upsert-based — safe to repeat) after migrations, so the
app is demonstrable immediately: one admin user and the sample P101
project with two activities, per CLAUDE.md §10.

**Seeded admin login** — change the password after first login (there is
no self-service reset; an admin resets it from `/users`, CLAUDE.md §3.1):

| Login name | Password |
|---|---|
| `admin` | `ChangeMe123!` |

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
- `next-auth` is pinned to a beta version (`5.0.0-beta.25`) from memory —
  no `npm` has been available anywhere in this project yet to confirm it
  still resolves; check for a newer stable release when `npm install`
  finally runs somewhere with network access.
- `package-lock.json` isn't committed — no `npm` has been available in any
  session so far to generate one. Run `npm install` locally once to create
  it (the Dockerfile's `deps` stage will pick it up automatically), then
  consider switching that stage from `npm install` to `npm ci` for
  reproducible builds. This is also the point at which everything written
  so far gets its first real compiler check — nothing in this repo has
  been built or run by any of the people/agents who wrote it.
