# Deploying to Railway — app.ultifashions.com

Two services from one GitHub repo, plus Neon for Postgres. Roughly $5–10/month.

```
app.ultifashions.com  →  Next.js  (ultispro-web)
api.ultifashions.com  →  Express  (ultispro-api)
                              ↓
                         Neon Postgres (ap-southeast-1)
```

Both hostnames share the registrable domain `ultifashions.com`, so they are cross-*origin* but same-*site*. That matters: `SameSite=Lax` on the refresh cookie keeps working, so sessions persist and CSRF protection stays intact. Splitting across unrelated domains would force `COOKIE_SAMESITE=none` and give up that protection.

## 0. Before you start

Commit and push everything. Railway builds from GitHub, so anything uncommitted simply isn't deployed — this bit us repeatedly during setup.

```powershell
git add -A
git commit -m "Ready for deploy"
git push
```

Confirm the build passes locally first; it's a 30-second loop instead of a 3-minute one:

```powershell
npm run build
```

## 1. Project and services

1. **railway.com** → log in with GitHub → **New Project → Deploy from GitHub repo → UltisPro**.
2. Railway detects npm workspaces and may stage a service per package. **Delete any service for `shared-types` or `config`** — they're libraries, not apps.
3. You want exactly two services. If only one was created, add the second with **+ New → GitHub Repo → same repo**.

## 2. Service settings

Both services use **Root Directory `/`**. Setting it to `apps/api` breaks the build: npm workspaces resolve `@ultispro/shared-types` from the repo root, and from a subdirectory that dependency doesn't exist.

**ultispro-api**

| Setting | Value |
|---|---|
| Build Command | `npm install && npm run build --workspace=apps/api` |
| Start Command | `npm run start --workspace=apps/api` |
| Watch Paths | `apps/api/**`, `packages/**` |
| Health Check Path | `/healthz` |
| Region | Singapore (`asia-southeast1`) |

**ultispro-web**

| Setting | Value |
|---|---|
| Build Command | `npm install && npm run build --workspace=apps/web` |
| Start Command | `npm run start --workspace=apps/web` |
| Watch Paths | `apps/web/**`, `packages/**` |
| Region | Singapore (`asia-southeast1`) |

The root `postinstall` builds `@ultispro/shared-types`, so `npm install` alone puts it in place for both.

**Region is not cosmetic.** Neon is in `ap-southeast-1`; a US region adds ~200ms to every database round trip, and a checkout makes several. Set it before the first deploy.

**Watch paths** stop a change in the web app from rebuilding the API and vice versa.

## 3. Environment variables

**ultispro-api**

```
NODE_ENV=production
DATABASE_URL=<Neon direct connection string, with ?sslmode=require>
JWT_SECRET=<openssl rand -base64 48 — generate fresh>
REDIS_URL=redis://localhost:6379
WEB_ORIGIN=https://app.ultifashions.com
TRUST_PROXY_HOPS=1
COOKIE_SAMESITE=lax
DB_POOL_MAX=10
DB_STATEMENT_TIMEOUT_MS=15000
```

**ultispro-web**

```
NEXT_PUBLIC_API_URL=https://api.ultifashions.com
```

Points worth understanding rather than copying blindly:

- **`JWT_SECRET` must be new.** The value in your `.env.production` has been pasted into a chat. The API refuses to boot in production on a known placeholder, but it can't detect a leaked-but-random one.
- **`TRUST_PROXY_HOPS=1`** — Railway's router is one proxy. Without this, every client shares a rate-limit bucket and audit logs record Railway's IP instead of the user's. Set higher only if you add Cloudflare in front.
- **`REDIS_URL` is validated at boot but never reached.** Rate limiting falls back to per-process counters and logs a warning. That's correct for a single instance; add real Redis when you scale past one.
- **`NEXT_PUBLIC_API_URL` is inlined at build time.** Changing it later requires a rebuild, not just a restart.
- **`DB_POOL_MAX=10`** — budget against Neon's connection limit across all instances.

## 4. Domains

Each service → **Settings → Networking → Custom Domain**:

- `ultispro-api` → `api.ultifashions.com`
- `ultispro-web` → `app.ultifashions.com`

Railway shows a CNAME target for each. At your registrar's DNS:

| Type | Host | Value |
|---|---|---|
| CNAME | `api` | *(Railway's target for the API)* |
| CNAME | `app` | *(Railway's target for the web)* |

TLS is issued automatically once DNS resolves — usually minutes.

## 5. Migrations

Migrations don't run during the build, deliberately: with multiple instances they'd race, and a failed migration mid-build leaves an ambiguous state. Run them once from your machine:

```powershell
$env:DATABASE_URL="<neon url>"
$env:NODE_ENV="production"
$env:JWT_SECRET="only-needed-to-satisfy-boot-validation-not-used-here"
$env:REDIS_URL="redis://localhost:6379"
npm run migrate --workspace=apps/api
```

Applies `0001`–`0014`, tracked in `schema_migrations`, so re-running is safe.

## 6. Verify

```bash
curl -sI https://api.ultifashions.com/healthz          # 200, HSTS, no x-powered-by
curl -si https://api.ultifashions.com/api/v1/products  # 401
curl -sI http://api.ultifashions.com/healthz           # 308 → https
```

Then in the browser:

1. `https://app.ultifashions.com` loads and is styled.
2. Sign up, then **reload** — you should stay logged in. Logged out means the cookie isn't sticking; check `WEB_ORIGIN` and `COOKIE_SAMESITE`.
3. Create a product, ring up a sale.
4. Tick WhatsApp at checkout; confirm the link is `app.ultifashions.com/r/…`.
5. Open that link in a private window — it must render with no login.
6. **Settings → Audit Log**: your login should show your real public IP. A `10.x` address means `TRUST_PROXY_HOPS` is wrong.

## 7. After it's live

- **Rotate the Neon password.** It has been in plaintext in a chat.
- **Commit `package-lock.json`.** Without it, Railway can resolve different versions than you tested — which is exactly how `next@9.3.3` got installed during setup.
- Set a **spend limit** in Railway billing so a runaway loop can't produce a surprise invoice.
- Take a **Neon backup** before the first real customer data goes in.
