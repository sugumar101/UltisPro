# Deploying to www.ultis.in/retailpro

## Read this first: Namecheap shared hosting probably won't work

You picked Namecheap shared hosting. I need to be straight with you rather than write a guide that fails halfway.

**What this application needs to run:**

| Requirement | Namecheap shared (cPanel) |
|---|---|
| Long-lived Node.js process (Express API) | Only on **Stellar Plus / Business** and above, via cPanel → *Setup Node.js App* (Phusion Passenger). **Not** on the entry Stellar plan. |
| Second long-lived Node process (Next.js server) | Same requirement, and you need **two** apps — check your plan's app limit. |
| PostgreSQL | ❌ Not offered. cPanel gives MySQL/MariaDB only. |
| Redis | ❌ Not offered. |
| Reverse proxy path routing | Possible via `.htaccess`, but fiddly. |

**The PostgreSQL gap is not a blocker** — you already have Neon, and the app connects to it over the network. Keep using Neon.

**Redis is not a blocker either** — rate limiting falls back to per-process counters automatically when Redis is unreachable (`shared/redis.ts` opens a circuit breaker and logs a warning). You lose cross-instance limit sharing, which on a single shared-hosting process is irrelevant anyway.

**The real question is whether your plan supports Node.js apps.** Log into cPanel and look for **Setup Node.js App**. If it isn't there, this application cannot run on that hosting and no amount of configuration will change it — shared hosting for PHP sites cannot execute a persistent Node server.

### Check first

1. cPanel → search for "Node". If **Setup Node.js App** exists, note the Node version offered (needs 20+; the repo targets 24).
2. Check how many Node apps your plan permits — you need two, or you must merge them (see §4).

### If Node.js apps aren't available

A small VPS is genuinely the right answer and costs about the same as upgrading a shared plan:

- **Hetzner CX22** — ~€4/mo
- **DigitalOcean Basic** — $6/mo
- **Railway / Render** — free tier to start, ~$5–7/mo after

You keep the Namecheap domain either way; you'd just point the DNS A record at the VPS. Say the word and I'll write that setup instead — it's simpler than the cPanel route, not harder.

---

## Configuration (needed on any host)

The subpath support is now in the code. Set these at **build time** for the web app — `NEXT_PUBLIC_*` values are inlined into the bundle, so setting them only at runtime has no effect:

```bash
# apps/web — build environment
NEXT_PUBLIC_BASE_PATH=/retailpro
NEXT_PUBLIC_API_URL=https://www.ultis.in/retailpro/api
```

```bash
# apps/api — runtime environment
NODE_ENV=production
DATABASE_URL=postgresql://…neon.tech/neondb?sslmode=require
JWT_SECRET=<openssl rand -base64 48>
WEB_ORIGIN=https://www.ultis.in
PUBLIC_PATH_PREFIX=/retailpro
TRUST_PROXY_HOPS=1
COOKIE_SAMESITE=lax
DB_POOL_MAX=10
REDIS_URL=redis://localhost:6379   # validated at boot; unreachable is fine
```

`PUBLIC_PATH_PREFIX` matters: the refresh cookie is scoped to the auth routes, and the browser matches that against the **public** URL. Without it the cookie is set for a path the browser never sends back, and logins silently fail to persist.

Same-origin (`www.ultis.in` serving both) means no CORS complexity and `SameSite=Lax` works as-is.

## Routing

Both apps run as Node processes; the web server routes by path prefix:

```
https://www.ultis.in/retailpro/api/*  →  Express  (port 4000)
https://www.ultis.in/retailpro/*      →  Next.js  (port 3000)
```

The API must receive requests with `/retailpro` **stripped** — Express routes are declared as `/api/v1/…`. Next.js must receive them **intact**, because `basePath` expects the prefix.

### nginx (VPS)

```nginx
server {
    listen 443 ssl http2;
    server_name www.ultis.in ultis.in;

    # ssl_certificate … (certbot)

    # Trailing slash on proxy_pass strips /retailpro/api before Express sees it.
    location /retailpro/api/ {
        proxy_pass http://127.0.0.1:4000/api/;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # No trailing slash: Next keeps the prefix, which basePath expects.
    location /retailpro {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

The trailing-slash difference between those two `proxy_pass` lines is the single easiest thing to get wrong. `X-Forwarded-Proto` is required or the API's HTTPS enforcement redirect-loops.

### cPanel (if Node apps are available)

Create two apps under *Setup Node.js App*:

| | Application root | Application URL | Startup file |
|---|---|---|---|
| API | `ultispro/apps/api` | `www.ultis.in/retailpro/api` | `dist/server.js` |
| Web | `ultispro/apps/web` | `www.ultis.in/retailpro` | `.next/standalone/server.js` |

Passenger does **not** strip the application URL prefix the way nginx's trailing-slash form does, so the API will receive `/retailpro/api/v1/…`. Mount the routers accordingly, or put an `.htaccess` rewrite in front. Confirm which before assuming.

## Deploy steps

```bash
npm install
npm run build                    # shared-types, then api and web
npm run migrate --workspace=apps/api
```

Then start both processes (systemd, pm2, or Passenger). Migrations run once, from any machine that can reach Neon — not per instance.

## Verify

```bash
curl -sI https://www.ultis.in/retailpro/api/healthz     # 200, HSTS present
curl -si https://www.ultis.in/retailpro/api/v1/products # 401 (auth required)
curl -sI http://www.ultis.in/retailpro                  # 308 → https
```

Then in a browser:

1. `https://www.ultis.in/retailpro` loads and is styled — broken CSS means `basePath` didn't reach the build.
2. Log in, **reload the page**, and confirm you're still logged in. If you're logged out, `PUBLIC_PATH_PREFIX` is wrong.
3. Ring up a sale, tick WhatsApp, and check the link is `www.ultis.in/retailpro/r/…` — not `www.ultis.in/r/…`.
4. Open that link in a private window. It must render without logging in.
5. Settings → Audit Log: your login should show your real public IP, not `10.x` or `127.0.0.1`. Wrong IP means `TRUST_PROXY_HOPS` is off.

## DNS at Namecheap

Domain List → Manage → Advanced DNS:

| Type | Host | Value |
|---|---|---|
| A | `@` | your server IP |
| A | `www` | your server IP |

Propagation is usually minutes, occasionally up to an hour. Issue TLS **after** DNS resolves (`certbot --nginx -d ultis.in -d www.ultis.in`), since certificate validation requires the domain to already point at the server.
