FROM node:22-slim AS deps
WORKDIR /app

# Install the exact dependency graph reviewed and committed in the repository.
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY apps/web ./apps/web

WORKDIR /app/apps/web
# Next.js inlines NEXT_PUBLIC_* at build time. Load production values from the
# same file Cloud Run uses so client bundles include Firebase config.
COPY apps/web/.cloudrun.env.yaml ./production.build.env
RUN set -a \
  && while IFS= read -r line; do \
    case "$line" in ''|\#*) continue ;; esac; \
    key="${line%%:*}"; \
    val="${line#*: }"; \
    export "$key=$val"; \
  done < production.build.env \
  && set +a \
  && npm run build

FROM node:22-slim AS runner
WORKDIR /app/apps/web
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=8080

COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/apps/web/.next/standalone /app
COPY --from=builder /app/apps/web/.next/static ./.next/static

CMD ["node", "server.js"]
