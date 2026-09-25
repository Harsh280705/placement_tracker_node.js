# Placement Tracker — Node.js + Express + Vue + PostgreSQL (single container)

Node.js backend migration of the Placement Tracker. The Vue frontend is used
**unchanged** (same sources, rebuilt for production); the backend is
**Node.js + Express + node-postgres** and operates ONLY on the
`nodejs_applications` table in the same PostgreSQL database. The original
`Applications` table is never modified.

## Architecture (ONE container)

```text
Browser
   ↓
NGINX :8080
   ├── /       → Vue production files
   └── /api/   → Node.js :3000 (127.0.0.1, internal)
                       ↓
                  PostgreSQL :5432 (internal)
                       ↓
               nodejs_applications
```

## Project structure

```text
backend/            → Express API (src/, scripts/init-db.js, tests/)
frontend/           → Existing Vue app, unchanged (rebuilt in Docker)
nginx/docker.conf   → NGINX :8080 static host + /api/ proxy
Dockerfile          → Single image (node + nginx + postgres 16)
docker-entrypoint.sh→ Starts postgres → init-db → node → nginx
docker-compose.yml  → Exactly ONE service: app (8080:8080, pgdata volume)
```

## API endpoints (unchanged contract, camelCase JSON)

| Method | Endpoint                 | Success | Notes                              |
| ------ | ------------------------ | ------- | ---------------------------------- |
| GET    | `/api/applications`      | 200     | All rows from `nodejs_applications`, id DESC |
| GET    | `/api/applications/{id}` | 200     | 404 `{message}` if missing/malformed id |
| POST   | `/api/applications`      | 201     | Created record; 400 on validation failure |
| PUT    | `/api/applications/{id}` | 200     | 404 if missing; 400 on validation failure |
| DELETE | `/api/applications/{id}` | 204     | 404 if missing                     |

Validation: Company/Role required 2–100 chars; Status ∈
Wishlist|Applied|Interview|Offer|Rejected; AppliedOn required unless
Wishlist; JobUrl optional valid http(s) URL; Notes optional ≤1000 chars.

## Database

Same PostgreSQL database (`placement_tracker`). New table
`nodejs_applications(id, company, role, status, applied_on, job_url, notes,
created_at)`. On startup, `scripts/init-db.js` creates the table if missing
and copies `Applications` rows (preserving ids) ONLY when the new table is
empty — idempotent, never duplicates, never touches `Applications`. If no
legacy data exists (fresh volume), the 3 reference sample records are seeded.

## Run with Docker (single container)

```powershell
docker compose up --build -d
```

App: `http://localhost:8080` — API: `http://localhost:8080/api/applications`

```powershell
docker compose down       # data persists in pgdata volume
docker compose up -d      # data still there
```

Public access:

```powershell
ngrok http 8080
```

**Important:** expose port `8080`, not `3000`.
