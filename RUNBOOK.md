# Install runbook

Written as the system is built (CLAUDE.md §10 convention), not at the end.
This entry covers build-order step 1 only: Docker Compose + Prisma schema.
Nothing here logs in, creates a project, or raises an alert yet — that's
steps 2 onward.

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

Currently the app serves a single placeholder page — no login, no data
entry. That's expected until build-order step 2 (CLAUDE.md §8).

## Known gaps at this stage

- **TLS is undecided.** Caddy currently serves plain HTTP. See the
  comments in `Caddyfile` and `docker-compose.yml` — this is CLAUDE.md
  §9.10 (open question 10), not a decision made here.
- **No settings table yet** for the alert thresholds CLAUDE.md §5 requires
  to be admin-configurable. `prisma/schema.prisma` follows §4's data model
  literally, which doesn't list one. Needs a decision before build-order
  step 4 (the alert engine) — flagged, not invented.
- **No seed script yet.** CLAUDE.md §10 wants one admin user + the sample
  P101 project seeded automatically, but that needs password hashing and
  user creation logic that doesn't exist until step 2.
- `package-lock.json` isn't committed — this session had no `npm`
  available to generate one. Run `npm install` locally once to create it
  (the Dockerfile's `deps` stage will pick it up automatically), then
  consider switching that stage from `npm install` to `npm ci` for
  reproducible builds.
