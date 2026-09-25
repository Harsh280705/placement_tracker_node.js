# Placement Tracker (Node.js) — SINGLE container (Vue frontend + Node.js API + PostgreSQL 16 + NGINX).
#
# One image / one container serves the whole stack:
#   NGINX :8080  ->  /            serves the Vue production bundle (static files)
#                 ->  /api/...     proxies to the Node.js API on 127.0.0.1:3000
#   API           ->  PostgreSQL on 127.0.0.1:5432 (same database, nodejs_applications table)
#   Data persists in the `pgdata` volume at /var/lib/postgresql/data.
#
# Notes:
# - Frontend is built with the same `npm ci && npm run build`; the resulting
#   dist/ bundle is served by NGINX as static files (identical UI, no source changes).
# - Node.js runs on 127.0.0.1:3000 internally. Public entry stays http://localhost:8080.

# ---------- Stage 1: build the Vue frontend (unchanged sources) ----------
FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---------- Stage 2: install backend production dependencies ----------
FROM node:22-alpine AS backend-deps
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# ---------- Stage 3: single runtime (node + nginx + postgres 16) ----------
FROM node:22-bookworm-slim AS final
WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive \
    PGDATA=/var/lib/postgresql/data \
    PORT=3000 \
    HOST=127.0.0.1

# NGINX + PostgreSQL 16 (via the official PGDG repo: bookworm ships PG15,
# and we keep PG16 to match the existing database exactly).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates gnupg wget \
 && wget -qO- https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/pgdg.gpg \
 && echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends nginx postgresql-16 \
 && sed -i 's/^# *en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen && locale-gen \
 && rm -f /etc/nginx/sites-enabled/default \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /var/run/postgresql /var/log/postgresql \
 && chown postgres:postgres /var/run/postgresql /var/log/postgresql

# Node.js backend (sources + production node_modules).
COPY backend/package.json /app/backend/package.json
COPY backend/src/ /app/backend/src/
COPY backend/scripts/ /app/backend/scripts/
COPY --from=backend-deps /app/node_modules/ /app/backend/node_modules/
# Vue production bundle (from stage 1) served by NGINX.
COPY --from=frontend-build /app/dist/ /usr/share/nginx/html/
# NGINX single-container reverse proxy + static hosting.
COPY nginx/docker.conf /etc/nginx/conf.d/default.conf
# Entrypoint: init/starts postgres, init nodejs_applications, starts Node, then NGINX.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 8080
VOLUME /var/lib/postgresql/data
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
