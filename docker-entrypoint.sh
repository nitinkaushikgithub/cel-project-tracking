#!/bin/sh
# Applies any migrations not yet on the database, seeds it, then starts the
# app. `prisma migrate deploy` only ever applies migrations already
# committed to prisma/migrations — it never generates new ones and never
# touches dates or data beyond the schema itself.
#
# `prisma db seed` runs prisma/seed.ts (see its own comments and
# package.json's "prisma.seed" entry) on every container start, not just
# the first. That's intentional and safe: the seed is upsert-based
# (unchanged on repeat runs), and CLAUDE.md §10 wants the app demonstrable
# — one admin user, the P101 sample project — immediately after install,
# which only holds if seeding actually happens as part of `docker compose
# up` rather than a manual extra step.
set -e

npx prisma migrate deploy
npx prisma db seed

exec npm run start
