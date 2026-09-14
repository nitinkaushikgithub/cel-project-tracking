# Install runbook

Everything you need to install and run this from scratch, written for
someone with no prior context on the project. Read `README.md` first if you
want to know *what* this is before *how to run it*.

## 1. Prerequisites

- **Git**. Any reasonably current version.
- **Docker** with Compose v2 (`docker compose`, not the older
  `docker-compose`). That's the only *other* thing you need installed —
  Node, Postgres, etc. all run inside containers, nothing to set up
  natively.
- Network access to pull `node:20-alpine`, `postgres:16-alpine`, and
  `caddy:2-alpine` the first time (Docker pulls these automatically on
  first build/run).
- Read access to the repo: **https://github.com/nitinkaushikgithub/cel-project-tracking**
  (ask the repo owner for access if you don't have it yet — it may be
  private, or you may need to be added as a collaborator).

## 2. Get the code

**Option A — HTTPS (works everywhere, no SSH key needed):**
```
git clone https://github.com/nitinkaushikgithub/cel-project-tracking.git
cd cel-project-tracking
```
If the repo requires authentication and you don't already have Git
credentials configured, either:
- install the [GitHub CLI](https://cli.github.com) and run `gh auth login`
  once (handles credentials for you from then on — this is what was used
  to originally push this repo), or
- generate a [Personal Access Token](https://github.com/settings/tokens)
  and use it as the password when Git prompts for one.

**Option B — SSH (if you already have an SSH key added to your GitHub
account):**
```
git clone git@github.com:nitinkaushikgithub/cel-project-tracking.git
cd cel-project-tracking
```

Either way, you should now be on the `main` branch with everything in this
runbook already in place — confirm with:
```
git status
git log --oneline -5
```

## 3. Configure environment

```
cp .env.example .env
```

Then edit `.env` and set two things for real (everything else in the
example file is fine as-is for a first run):

- **`POSTGRES_PASSWORD`** — any real password. Also update the matching
  password inside `DATABASE_URL` in the same file if you change it (they
  must match).
- **`AUTH_SECRET`** — the app **will not start** without this (Auth.js v5
  signs sessions with it). Generate a real one:
  ```
  openssl rand -base64 32
  ```
  (No `openssl`? `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
  works too, or any other way to get 32 random bytes as base64.)

Leave `AUTH_TRUST_HOST=true` as-is — needed because this runs behind
Caddy's reverse proxy on an internal hostname that isn't fixed yet
(CLAUDE.md §9.10 is still open on what that hostname will be).

**Optional but recommended — SMTP, for real alert emails**: leave
`SMTP_HOST` blank for a first run (the app works fine without it — alerts
still get raised and shown in the app, they just don't get emailed, and
that's logged so you can tell). To actually receive alert emails, set
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` to
CEL's real SMTP server details (CLAUDE.md §8.2 lists this as something
CEL needs to provide), and `APP_BASE_URL` to whatever internal URL this
ends up running at (used only to build the link inside alert emails — the
email body always has full detail regardless, since that link only
resolves on the CEL network).

## 4. First run

```
docker compose up
```

This builds the app image and starts three containers: `postgres`, `app`,
`caddy`. On the app container's first start, `docker-entrypoint.sh`
automatically:

1. Applies the committed migration (`prisma/migrations/20260914093431_init/`)
   — no manual migration step needed, it's already generated and checked
   into the repo.
2. Runs the seed script (`prisma/seed.ts`) — creates one admin user and a
   sample project so there's something to look at immediately. Safe to run
   on every restart (it upserts, never duplicates).
3. Starts the Next.js server.

Wait for a line like `Ready` in the `app` container's logs, then open:

**http://localhost** (port 80, via Caddy — not port 3000; the app container
itself isn't published directly).

## 5. Log in

There's no fixed default password — the seed script generates a random
one the first time it creates the admin account, and prints it once:

```
docker compose logs app | grep -A3 "First-run admin"
```

Login name is `admin` unless you set `SEED_ADMIN_LOGIN_NAME` in `.env`.
That log line only ever appears once, on the very first successful start
— copy the password down before it scrolls out of your terminal history.
(If you missed it: there's no recovery except resetting the database —
see the troubleshooting table below — since it's a real bcrypt hash from
that point on, not recoverable another way. If you specifically need a
known password up front instead, e.g. for a scripted setup, set
`SEED_ADMIN_PASSWORD` in `.env` before the first `docker compose up`.)

**Change this password after first login anyway** (`/users` → find the
admin account → *Reset password*) — there's no self-service reset by
design (CLAUDE.md hard constraint #1), only another admin can reset a
password, so don't lock yourself out by forgetting the new one before
creating a second admin account.

## 6. Verify it's actually working

A quick smoke test, in order:

1. Dashboard loads and shows one project (**P101**), coloured amber or
   green depending on today's date relative to its sample activities.
2. `/users` (visible in the header nav, admin only) lists the seeded admin.
3. Create a second user, log out, log in as them — confirm the role-based
   nav differences (a Member shouldn't see *Users* or *Alert rules* in the
   header).
4. From the dashboard, **+ New project** → create one → **Add activity** on
   it → the activity form should show a live "alert schedule" preview as
   you pick dates, before you save.
5. `/admin/alert-rules` (admin only) lists seven threshold rows across the
   three duration classes.
6. Bell icon → **alert history** — empty on a fresh install; it fills in as
   the hourly job (see below) actually raises alerts over time.

If all six work, the install is good.

## 7. Stopping / restarting

```
docker compose down          # stop, keep the database volume
docker compose down -v       # stop AND delete the database volume (data loss)
docker compose up            # start again — migrations/seed re-run automatically, harmlessly
docker compose up -d         # same, but detached (runs in the background)
```

## 8. Making a schema change later

1. Edit `prisma/schema.prisma`.
2. Generate the migration against a reachable Postgres:
   ```
   docker compose up -d postgres
   docker compose run --rm --entrypoint sh app -c "npx prisma migrate dev --name <short-description>"
   ```
3. Commit what that writes to `prisma/migrations/`.
4. Next `docker compose up` applies it automatically via
   `docker-entrypoint.sh` — no separate deploy step.

## 9. Troubleshooting

| Symptom | Likely cause |
|---|---|
| App container exits immediately, log mentions `AUTH_SECRET` | You skipped step 3 — it's not optional. |
| `docker compose up` can't reach `localhost` | You're probably going to `localhost:3000` — that's not published. Use plain `http://localhost` (port 80, through Caddy). |
| Login fails with a valid-looking password | Someone reset it since install — there's no way to recover a forgotten password except another admin resetting it from `/users`. If *no* admin account works, you'll need to reset the database (`docker compose down -v && docker compose up`, which reseeds the default admin — **this deletes all other data too**, so only do it on a throwaway/dev instance). |
| Alerts never seem to appear | The hourly job runs at the top of every hour (`0 * * * *`), not immediately on activity creation — it can take up to an hour after a date first crosses a threshold. This is by design, not a bug (CLAUDE.md §5). |
| `npx prisma migrate dev` complains about a deprecated `package.json#prisma` config | Expected, harmless — Prisma is deliberately pinned to the 6.x line here (see below); this warning is Prisma nagging about its own future v7 change, not something to fix. |

## 10. Notes for whoever maintains this

- **Prisma is pinned to 6.19.3, not the "latest" tag.** Prisma 7 removed
  schema-file `datasource { url }` entirely in favor of a `prisma.config.ts`
  + driver-adapter rewrite. That's a real architectural change this app
  deliberately isn't adopting yet — don't `npm update` Prisma past 6.x
  without doing that migration deliberately, on purpose, with time set
  aside for it.
- **`next-auth` is pinned to a beta** (`5.0.0-beta.32`) because Auth.js v5
  genuinely is still beta upstream — not a placeholder. Check for a stable
  release periodically.
- Full current package versions: `package.json` (and the committed
  `package-lock.json` for exact resolved versions).
- **Email alerts are live** (Phase 3, CLAUDE.md build-order step 6) —
  every alert that raises the beacon popup also emails the activity's
  assignee, the project's manager, and every admin, each only if they have
  an email on file (deduplicated). Needs `SMTP_*` set in `.env` to actually
  send — see step 3. Without it, `src/lib/email.ts` just logs, so nothing
  breaks; `Alert.emailSentAt` stays `null` until a real send succeeds.
- **No backup/restore script yet** — that's Phase 2. Right now, the only
  durable data is the `postgres_data` Docker volume; back that up however
  you'd back up any Postgres data directory until a real script exists.
- **TLS is unresolved** (CLAUDE.md §9.10) — Caddy currently serves plain
  HTTP. See the comments in `Caddyfile` and `docker-compose.yml`.
- See `docs/API_CONTRACT.md` for every server action/query in the app, and
  `docs/ARCHITECTURE.md` for how Phase 1 was originally planned and built.
