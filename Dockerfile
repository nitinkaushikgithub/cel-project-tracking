# syntax=docker/dockerfile:1
#
# Single image, three stages. No standalone-output tracing trickery: the
# runner stage keeps the full node_modules (prisma CLI included) so
# `docker-entrypoint.sh` can run `prisma migrate deploy` at container start
# without reaching out to the network — this box has no internet access
# once deployed (CLAUDE.md §3.2).
#
# package-lock.json is now committed (generated and verified against a real
# install — see RUNBOOK.md) so `npm ci` is safe: an exact, reproducible
# install from the lockfile rather than a fresh resolve.

FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
