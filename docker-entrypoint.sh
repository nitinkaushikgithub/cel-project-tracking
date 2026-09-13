#!/bin/sh
# Applies any migrations not yet on the database, then starts the app.
# `prisma migrate deploy` only ever applies migrations already committed to
# prisma/migrations — it never generates new ones and never touches dates
# or data beyond the schema itself.
set -e

npx prisma migrate deploy

exec npm run start
