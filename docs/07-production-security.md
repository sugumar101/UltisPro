# UltisPro — Production Security

What is enforced in code, what you must configure, and what is still open. Read this before the first production deploy.

## 1. What the application enforces on its own

| Control | Where | Notes |
|---|---|---|
| Boot-time config validation | `apps/api/src/config/env.ts` | In production the process **refuses to start** on a placeholder/low-entropy `JWT_SECRET`, a non-TLS `DATABASE_URL`, or a non-HTTPS `WEB_ORIGIN`. Failing to boot is deliberate — a service that starts and looks healthy while insecure is worse. |
| Password hashing | `auth/password.util.ts` | bcrypt, cost 12. |
| Password policy | `auth/auth.dto.ts` | ≥10 chars, common-password denylist, variety check. Length-first per NIST rather than forced symbol classes, which mostly produce `Password1!`. |
| Account lockout | `auth.service.ts` + `users.failed_login_count`/`locked_until` | Blunts online brute force. |
| Auth rate limiting | `shared/rate-limit.middleware.ts` | Per-IP fixed windows on register / login / forgot / reset. |
| Global rate limiting | `shared/security.middleware.ts` | 600 req/min/IP across the API, to catch abuse that spreads across endpoints to stay under any single limit. Health checks exempt. |
| RBAC | `auth/rbac.middleware.ts` | Permission checked per endpoint. |
| Tenant isolation | Every repository | `organization_id` filtered explicitly. **Application-layer — see §4.** |
| Audit trail | `shared/audit-log.service.ts` | Actor, action, before/after on every mutation. |
| Token storage | `auth.routes.ts` | Refresh token in an httpOnly, Secure, path-scoped cookie; access token in memory only, never `localStorage`, so XSS cannot read either. |
| Transport | `shared/security.middleware.ts` | HTTPS enforced; HSTS 2 years + preload; strict CSP; `no-store`; framing denied. |
| CORS | `app.ts` | Allow-list only. Never reflects an arbitrary origin — with `credentials: true` that would let any site drive an authenticated session. |
| Payload limits | `app.ts` | 1 MB JSON/urlencoded. |
| Error handling | `shared/error-middleware.ts` | Real messages in dev; generic in production with full detail to logs only. |
| Dependency audit | `.github/workflows/ci.yml` | `npm audit --audit-level=high` gates the build; weekly Dependabot PRs. |

## 2. What you must configure (deployment)

Set these as platform secrets — never in a committed file:

```bash
NODE_ENV=production
JWT_SECRET=$(openssl rand -base64 48)      # unique per environment
DATABASE_URL=postgresql://…?sslmode=require
WEB_ORIGIN=https://app.yourdomain.com
NEXT_PUBLIC_API_URL=https://api.yourdomain.com

# Number of proxies you control in front of the API. See §3 — getting this
# wrong is the single most impactful misconfiguration here.
TRUST_PROXY_HOPS=1

# Only if the frontend and API are on genuinely different registrable
# domains. Requires Secure, and removes SameSite's CSRF protection.
# COOKIE_SAMESITE=none
```

Checklist:

- [ ] `JWT_SECRET` generated fresh, different per environment, stored in a secret manager. Rotating it logs everyone out — plan the window.
- [ ] Database user is **not** a superuser and owns only what it needs.
- [ ] Database network access restricted to the API (Neon: IP allow-list / private networking).
- [ ] Automated database backups on, and a restore actually rehearsed.
- [ ] TLS terminated by the load balancer with a valid certificate and auto-renewal.
- [ ] `TRUST_PROXY_HOPS` matches reality (§3).
- [ ] Neon password rotated if it has ever appeared in a chat, ticket or screenshot.
- [ ] Logs shipped somewhere durable; they contain no secrets by design (headers are no longer logged — see §5).

## 3. `TRUST_PROXY_HOPS` — read this one carefully

Behind a load balancer, every request appears to originate from the proxy. Express only recovers the real client address if told how many hops to trust.

- **Too low (e.g. 0 behind a proxy):** every client shares one rate-limit bucket, so the limiter is useless and one user trips it for everyone. Audit logs record the proxy's IP for every action.
- **Too high:** a client can prepend a forged `X-Forwarded-For` entry and spoof any source IP, evading rate limits and poisoning the audit trail.

Set it to the number of proxies you actually control. One ALB/ingress → `1`. Cloudflare in front of an ALB → `2`. Running the container directly → `0`.

Verify after deploy: hit an endpoint and confirm the audit log records your real IP, not an internal `10.x` address.

## 4. Open gap — tenant isolation is application-layer

Isolation is enforced by every repository filtering `organization_id`. That has held, but it is a **convention, not a guarantee**: one forgotten filter in a future repository method leaks one tenant's data into another's screen, with nothing at the database layer to stop it.

`apps/api/security/rls-policies.sql` contains ready Row-Level Security policies that turn this into a database-enforced invariant. It is deliberately **not** in `migrations/` and **not** applied, because enabling it without the matching application change does not fail gracefully — it makes every query return zero rows, which in production is indistinguishable from total data loss.

Closing it properly requires:

1. A `withOrgContext()` wrapper setting `app.current_org_id` per transaction (sketched in that file).
2. Routing every repository read and write through it — most reads currently use no transaction at all, so this touches every module.
3. Full validation on a staging database restored from a production snapshot.
4. Production application in a maintenance window, with the rollback in that file to hand.

Until then, treat "does this query filter by `organization_id`?" as a mandatory review question on every new repository method.

## 5. Known limitations, stated plainly

- **Rate limiting is in-memory.** Correct for a single process; each replica keeps its own counters, so behind N instances the effective ceiling is N×. Move to a Redis counter (`INCR`/`EXPIRE`) before scaling out. `REDIS_URL` is already required and validated.
- **No 2FA.** `AUTH-07` is P2 in the functional requirements and is not built.
- **No CSRF tokens.** Mitigated by `SameSite` on the refresh cookie plus a CORS allow-list. If you set `COOKIE_SAMESITE=none`, the CORS allow-list becomes the *only* control — add CSRF tokens before doing that.
- **No secret rotation automation.** Rotation is manual and logs all users out.
- **Load testing not performed.** The POS checkout path has not been tested under concurrency; the row-locking is correct by construction (`SELECT … FOR UPDATE`) but unproven at volume.
- **`apps/api/src/modules/auth-scaffold/`** is Phase 0 throwaway code containing a hardcoded demo login. It is not wired into `app.ts`, but **delete the folder before production** — dead auth code is exactly what gets accidentally re-imported later.

## 6. Post-deploy verification

```bash
# HSTS, CSP, framing, no-store, no x-powered-by
curl -sI https://api.yourdomain.com/healthz

# Must NOT reflect the origin back
curl -sI -H "Origin: https://evil.example.com" https://api.yourdomain.com/healthz | grep -i access-control

# Must redirect, not serve
curl -sI http://api.yourdomain.com/healthz

# Must 401
curl -si https://api.yourdomain.com/api/v1/products
```

Then confirm in the app: log in, check **Settings → Audit Log** shows your real public IP against the login.
