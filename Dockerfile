# One container serves the SarthiAI API and the web app (PWA).
FROM node:22-slim AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
COPY shared/ /app/shared/
ARG VITE_API_BASE_URL=
RUN npm run build

FROM node:22-slim
ENV NODE_ENV=production
# Python is used by the daily refresh of official sources (ingest/).
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY ingest/requirements.txt ingest/requirements.txt
RUN python3 -m venv ingest/.venv && ingest/.venv/bin/pip install --no-cache-dir -r ingest/requirements.txt
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev
COPY server/ server/
COPY shared/ shared/
COPY ingest/ ingest/
COPY --from=web /app/web/dist web/dist
WORKDIR /app/server
EXPOSE 4000
# SEED_ON_START=true loads the committed data (verified listings + daily scraped snapshot) before
# starting. Safe to repeat: records are upserted, never duplicated. A seed problem never blocks startup.
CMD ["sh", "-c", "if [ \"$SEED_ON_START\" = \"true\" ]; then node scripts/seed.js || echo 'seed skipped'; fi; exec node src/server.js"]
