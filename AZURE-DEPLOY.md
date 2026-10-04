# Deploy to Azure free services (all-$0 path)

Target: **$0/month** at demo scale.

| Piece | Service | Why free |
|---|---|---|
| API (FastAPI) | Container Apps, consumption, scale-to-zero | Monthly free grant (180k vCPU-s + 360k GB-s + 2M requests) covers demo traffic |
| Web (Next.js 14) | Static Web Apps, Free SKU | Free SSL, GitHub Actions build, Next.js hybrid supported |
| DB (PG16 + pgvector) | Neon always-free project | pgvector preinstalled, stays $0 forever |

`infra/main.bicep` provisions the Azure side; Neon is created in their dashboard;
`.github/workflows/azure-deploy.yml` wires them together on every push to `main`.

## 1. One-time setup (~20 min)

### 1a. Neon database (always free)

1. Create a project (Postgres 16), open the **SQL Editor**, run:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
   (The backend also tries this at boot as a fallback.)
2. Copy the **non-pooled** connection string (direct host, port 5432), e.g.
   `postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/dogfood?sslmode=require`
   — non-pooled avoids PgBouncer/asyncpg prepared-statement issues.
3. The repo auto-detects Neon hosts and `sslmode=require` (`src/backend/app/core/db_url.py`).
   `DB_SSL=true` is also set in Bicep as a belt-and-braces flag.

### 1b. Azure identity + secrets

1. `az group create -n dogfood-rg -l westeurope` (or your region).
2. Create a Microsoft Entra app + federated credential for this repo/branch
   (`main`), granting Contributor on the resource group.
3. GitHub repo secrets:
   - `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`
   - `NEON_DATABASE_URL` — the URI from 1a
   - `AZURE_SECRET_KEY` — generate **once** and never change it:
     `openssl rand -hex 32` (rotating invalidates all sessions/checker cookies)
4. The backend image pushes to `ghcr.io/<owner>/dogfood-backend`. Set that
   package to **public** (or add a registry password secret to Bicep) so
   Container Apps can pull it without credentials.

### 1c. First deploy

Push to `main` (or run the workflow manually). Order inside the workflow:

1. Build + push `src/backend` image to ghcr.io (tagged with the commit SHA).
2. Bicep: Log Analytics → Container Apps env → backend app (boots with
   `seed.py && alembic upgrade head && uvicorn`, seeded with fixtures +
   test users) → Static Web App. `FRONTEND_URL` is derived from the SWA
   default hostname, so CORS and cookies are correct on first boot.
3. SWA action builds `src/frontend` with `NEXT_PUBLIC_API_URL` = backend FQDN.

Find the URLs in the workflow log / Azure portal:
backend `https://dogfood-api.<env>.azurecontainerapps.io`,
web `https://<name>.azurestaticapps.net`.

## 2. After deploy

- **Warm up**: scale-to-zero means the first request cold-starts (seed +
  migrations run, ~1–2 min). Hit the backend `/health/ready` once, then use it.
- **Logins**: test users `organizer@ / judge_a@ / judge_b@ /
  participant@dogfood.local` / `testpass123` (reseeded every cold boot, same as compose).
- **Cookies**: `COOKIE_SECURE=true` + `COOKIE_SAMESITE=none` are set in Bicep —
  required for cross-site HTTPS (SWA domain ≠ API domain).
- **Checker**: `run.py` cookies are HMAC-signed with `SECRET_KEY`, so the
  committed `.dogfood.toml` tokens only work locally. Keep using
  `docker compose up` + checker for acceptance; Azure is the public play link.
- **Logs**: `az containerapp logs show -n dogfood-api -g dogfood-rg --follow`.

## 3. Costs & limits to respect

- Container Apps: stays in the free grant while `maxReplicas: 1` + scale-to-zero;
  watch the grant in Cost Management.
- SWA Free: fine for demo traffic; no SLA.
- Neon free: connection + storage caps fit 40 projects / 30 judges easily;
  use the pooled URI only if you add `prepared_statement_cache_size=0` handling.
- Nothing here is production-grade (no SLA, single replica, cold starts) —
  same stance as the Render/Railway play links in the README.
