# UltisPro

Multi-tenant retail billing & inventory management SaaS. See `docs/` for the full planning package (functional requirements, architecture, database design, module breakdown, roadmap, design system).

**Status:** Phases 1–7 and 9 complete; Phase 8 (hardening) partially complete — see caveats below. Phase 1: organization signup, login/refresh/logout, password reset, Organizations/Stores/Branches, Users/Roles/Permissions, RBAC-gated APIs, matching frontend pages. Phase 2: Categories/Brands/Units/Taxes masters, Products (with variants), and Inventory (stock, adjustments, branch-to-branch transfers, low-stock/expiring queries). Phase 3: Suppliers, Purchase Orders (draft → approve → receive, partial receiving supported), Purchase Returns, and Supplier Payments. Phase 4: Customers (with addresses, credit limit, and a walk-in customer auto-seeded at signup). Phase 5: POS screen (search/cart/hold-resume/split payment) and the `/sales` checkout endpoint — gapless invoice numbering, per-line stock deduction, on-account shortfall charged to the customer within their credit limit, and sales returns that restore stock. Phase 6: a real Dashboard (KPI cards + 30-day sales trend chart + recent activity) and four MVP Reports (sales, inventory, GST, cash-flow) with CSV export. Phase 7: Expenses (categories + entries feeding a running total), an in-app notification bell (on-demand, idempotent low-stock/expiring-batch alerts), and an audit log viewer with before/after diffs gated by `AUDIT_VIEW`. Phase 8: rate limiting on the auth endpoints, a documented RLS audit finding (tenant isolation today is application-layer, not native Postgres RLS — see `docs/03-database-design.md` §18), a manual dependency review, and a Dependabot config. Phase 9 (post-launch addition): a clothing product taxonomy — org-defined Product Types with their own size lists, nested Product Categories, and a dedicated **Products > New clothing product** flow that creates one variant per selected size, an auto-generated 5-digit product code, and posts opening stock to a branch in one step. Phase 10: receipt and tax-invoice printing — POS auto-prints an 80mm thermal receipt after checkout, and any invoice can be reprinted as either a receipt or a full A4 GST tax invoice with a rate-wise CGST/SGST/IGST summary and the total in words. Excel/PDF report export, S3 archival of invoice PDFs, cash-drawer/auto-cut ESC-POS control, a background notification worker, per-user broadcast read-state, load testing, an automated accessibility audit, production AWS deployment, and clothing product image upload are the explicitly deferred pieces (see `docs/04-module-breakdown.md` and `docs/05-development-roadmap.md`). Every phase has matching API + frontend + a Vitest integration suite.

**Deploying to production?** Read `docs/07-production-security.md` first — it covers the environment variables that are security-critical (especially `TRUST_PROXY_HOPS`), the pre-deploy checklist, and the one isolation gap that is documented rather than closed.

## Stack

Next.js 15 / React 19 / TypeScript / Tailwind (web) — Node 24 / Express / PostgreSQL / Redis (api). Full justification in `docs/02-system-architecture.md`.

Design tokens live in `packages/config/tailwind-preset.ts` and are the single source of truth for colour, type and spacing — the app re-themes by changing values there, not by editing screens. See `docs/03-database-design.md` §23 for the rationale behind the current indigo/violet palette.

## Prerequisites

- Node.js 24.x (`nvm use`, an `.nvmrc` is provided)
- Docker + Docker Compose (for Postgres/Redis, and optional containerized runs)

## Getting started (local dev, no Docker for the app processes)

```bash
npm install
cp .env.example .env

# start just the datastores
docker compose up -d postgres redis

# apply the schema (organizations/stores/branches/users/roles/permissions + RBAC seed data,
# plus catalog + inventory from Phase 2, suppliers/purchasing from Phase 3, customers from
# Phase 4, POS/sales from Phase 5, expenses/notifications from Phase 7, clothing product
# taxonomy from Phase 9)
npm run migrate

# run api (:4000) and web (:3000) together
npm run dev
```

Open http://localhost:3000 — you'll land on `/login`. There's no seed account anymore: click **"Create a workspace"** to sign up (this creates your organization, a default store + branch, and your Owner account in one step), or use `/login` if you've already signed up.

Signing up exercises the full Phase 1 round trip: web → API creates organization/store/branch/user (plus a default "Piece" unit, so you can create your first product immediately) in one transaction → JWT + httpOnly refresh cookie issued → dashboard renders your account and branch/role assignment — proving Phase 1's exit criteria from the roadmap (`docs/05-development-roadmap.md`).

From there, **Products > New product** creates a product with one or more SKU variants — just type a Category and Brand, they're created automatically if they don't exist yet, leaving Barcode blank generates a scannable in-store EAN-13 per variant, and leaving HSN blank fills in the standard code where the product wording makes it unambiguous (a "T-Shirt" gets 6109). Open any product to rename it, fix its HSN, edit prices per variant, add or remove variants, or delete it. **Print barcodes** on any row generates scannable EAN-13 labels sized for a roll/thermal label printer (one label per variant, with size presets and a copies control) — tick several products first to print a batch in one go. **Settings > Catalog Setup** is where you manage categories, brands, units, tax rates and clothing product types — every row there has Edit and Delete. **Inventory** shows stock on hand per branch and lets you record adjustments (opening stock, damage, recount, etc.) — proving Phase 2's exit criteria.

**Suppliers > New supplier**, then **Purchasing > New purchase order** raises a draft PO; approve it, receive stock against it (partial receiving supported — the PO tracks `partially_received` vs `received`), and optionally return received stock — all of which correctly update inventory and the supplier's outstanding balance, proving Phase 3's exit criteria.

**Customers > New customer** (a "Walk-in Customer" already exists from signup) lets you set a credit limit, then charge/record payments against their account from the customer detail page — charges that would exceed the credit limit are rejected, proving Phase 4's exit criteria.

At the till, typing a customer's **mobile number** recognises a returning customer instantly (and shows any outstanding balance); an unknown number lets you capture their name plus an explicit opt-in for offers, saved when the sale completes. After checkout you can send the bill straight to them on WhatsApp.

**POS** is the main event: search for a product (add stock first via Inventory if you haven't), it lands in the cart, adjust qty/price/discount inline, pick a customer (defaults to Walk-in), split payment across cash/card/UPI/etc., and check out — this writes a real invoice with a sequential number, decrements stock, charges any shortfall to the customer's account, and pops a printable receipt (toggle auto-print off in the payment panel if you'd rather print manually). **Sales** lists every invoice; open one to see its items/payments, reprint it as an 80mm receipt or A4 GST tax invoice, or return it (restores stock, credits the customer).

For printing: any printer installed on the machine works, including thermal printers — the 80mm template sets its own page size and the printer driver handles the rest. Choosing "Save as PDF" in the print dialog gives you an archivable invoice copy.

**Dashboard** now shows live KPIs and a sales trend chart once you've rung up a few sales. **Reports** lets you run Sales/Inventory/GST/Cash-flow over a date range and export any of them to CSV.

**Expenses** lets you create categories (Rent, Utilities, etc.) and log entries against them, with a running total on the list — proving Phase 7's "expenses feed into P&L" exit criteria. The notification bell in the header polls every 60 seconds and surfaces low-stock/expiring-batch alerts the first time each condition is seen (mark one read by clicking it). **Settings > Audit Log** shows a filterable before/after trail for every mutation across the system.

**Settings > Catalog Setup > Product Types** lets a clothing retailer define its own taxonomy — e.g. a "T-Shirts" type with sizes `S,M,L,XL`, then nested categories under it like "Oversized" or "Polo". **Products > New clothing product** picks a type/category, name, gender, checks off sizes with a quantity each, one shared price, and a branch — saving it creates one SKU per size under an auto-generated 5-digit product code and posts opening stock immediately, all in one step (Phase 9).

### Running the API test suite locally

The auth/RBAC tests (`apps/api/test/auth.test.ts`), catalog/inventory tests (`apps/api/test/products-inventory.test.ts`), suppliers/purchasing tests (`apps/api/test/purchasing.test.ts`), customer tests (`apps/api/test/customers.test.ts`), sales/POS tests (`apps/api/test/sales.test.ts`), dashboard/reports tests (`apps/api/test/dashboard-reports.test.ts`), expenses/notifications/audit tests (`apps/api/test/expenses-notifications-audit.test.ts`), clothing product taxonomy tests (`apps/api/test/product-taxonomy.test.ts`), and receipt/tax-invoice tests (`apps/api/test/sales-receipt.test.ts`) are integration tests against a real Postgres database, matching `apps/api/.env.test`. product-entry tests (`apps/api/test/products-autofill.test.ts`) and catalog CRUD tests (`apps/api/test/products-crud.test.ts`) also run against Postgres. `apps/api/test/rate-limit.test.ts`, `apps/api/test/env-loading.test.ts`, `apps/api/test/amount-in-words.test.ts`, `apps/api/test/barcode.test.ts`, and `apps/api/test/hsn.test.ts` are plain unit tests (no database) covering the rate-limit counter, env-file path resolution, the invoice amount-in-words renderer, EAN-13 barcode generation, and HSN code suggestion respectively. Before running `npm run test` locally:

```bash
createdb ultispro_test   # or: docker exec -it <postgres-container> createdb -U ultispro ultispro_test
DATABASE_URL=postgresql://ultispro:ultispro@localhost:5432/ultispro_test npm run migrate --workspace=apps/api
npm run test
```

CI does this automatically (see `.github/workflows/ci.yml`).

## Getting started (fully containerized)

```bash
cp .env.example .env
docker compose up --build
```

## Database setup

### Local

`docker-compose.yml` already defines a `postgres` service (`POSTGRES_DB: ultispro`, user/password `ultispro`/`ultispro`), so the database itself is created automatically the first time the container starts — you only need to apply the schema:

```bash
docker compose up -d postgres redis
cp .env.example .env
npm run migrate   # applies apps/api/migrations/0001..0009 in order, tracked in schema_migrations
```

To reset from scratch (e.g. after editing a migration during development, which you should otherwise never do):

```bash
docker compose down -v   # drops the pgdata volume — destroys all local data
docker compose up -d postgres redis
npm run migrate
```

For the test database, see "Running the API test suite locally" above — same idea, a separate `ultispro_test` database.

### Production (Neon)

The system architecture doc (`docs/02-system-architecture.md`) originally scoped AWS RDS for production Postgres; this project is actually running production Postgres on [Neon](https://neon.tech) instead (serverless Postgres, no infrastructure to manage, generous free tier) — see the note in that doc's Cloud/Infra section. The API itself (ECS, a VPS, Fly.io, Render, wherever) is a separate concern from where its database lives; these steps only cover the database.

1. **Create a Neon project.** Sign up at neon.tech, create a project, and pick a region close to wherever the API process will run (lower latency between app and DB matters more than being close to end users).
2. **Get the connection string.** In the Neon console: your project → **Connect** → toggle **Connection pooling** OFF → copy the string shown. It looks like:
   ```
   postgresql://<user>:<password>@<endpoint>.<region>.aws.neon.tech/<dbname>?sslmode=require&channel_binding=require
   ```
   Use the **direct** (non-pooled) string, not the one with `-pooler` in the hostname — this app is a long-running Express process with its own client-side connection pool (`pg.Pool`), so routing it through Neon's PgBouncer pooler too would double-pool for no benefit. Reserve the pooled string for a future scenario where the API itself runs as short-lived serverless functions.
3. **Set production env vars.** Copy `.env.production.example` → fill in the real `DATABASE_URL` from step 2, a real `JWT_SECRET` (`openssl rand -base64 48`), your Redis URL, and your actual `WEB_ORIGIN`/`NEXT_PUBLIC_API_URL`. Set these as secrets in whatever's running the API (ECS task definition env, Render/Fly secrets, etc.) — never commit the filled-in file.
4. **Apply migrations against Neon**, from any machine with Node and this repo checked out (your laptop, or a manual-trigger CI job — don't bake this into container startup, since every replica running it concurrently on deploy is harmless here thanks to the `schema_migrations` tracking table and `BEGIN`/`COMMIT` per file, but it's still cleaner as a single deliberate step):
   ```bash
   DATABASE_URL="postgresql://<user>:<password>@<endpoint>.<region>.aws.neon.tech/<dbname>?sslmode=require&channel_binding=require" \
   NODE_ENV=production \
   npm run migrate --workspace=apps/api
   ```
5. **If you hit a "channel binding" connection error** (some older Postgres client libraries don't support SCRAM channel binding), drop that parameter and retry with just `?sslmode=require`.

Neon also supports instant branching (a full copy-on-write clone of a database) — worth using for a staging environment that mirrors production data without touching it.

## Common commands

| Command | What it does |
|---|---|
| `npm run dev` | Run api + web concurrently in watch mode |
| `npm run build` | Build every workspace |
| `npm run lint` | Lint api/packages (root config) + web (Next config) |
| `npm run typecheck` | `tsc --noEmit` across every workspace |
| `npm run test` | Run Vitest in every workspace |
| `npm run migrate` | Apply pending SQL migrations in `apps/api/migrations` |

## Repository layout

```
apps/
  api/      Express API (clean architecture, feature-based modules under src/modules)
  web/      Next.js 15 app (App Router)
packages/
  shared-types/  Zod DTOs + TS types shared by api & web
  config/        Shared Tailwind design-token preset (source: docs/06-design-system.md)
infra/
  docker/   Dockerfiles for api & web
  nginx/    Reverse proxy config (production reference)
docs/       Phase 1 planning package (read this first)
```

## Notes on this scaffold

- This repository was authored file-by-file rather than via `npm install` / `create-next-app` / `shadcn init` in this environment, so dependency versions are ranges rather than pinned by an actual install. Run `npm install` locally and check for resolution issues.
- Once `npm install` produces a lockfile, switch the Dockerfiles from `npm install` to `npm ci` for reproducible builds (noted inline in each Dockerfile).
- **Cleanup needed:** `apps/api/src/modules/auth-scaffold/` is Phase 0 throwaway code (a single hardcoded demo login) that Phase 1's real Auth module replaces. It's no longer wired into `app.ts`, but the files are still on disk — delete that folder whenever convenient; nothing references it anymore.
- **Cleanup needed:** `apps/web/next.config.ts` and `apps/web/next.config.mjs` both exist with equivalent content — Next.js only supports one config file at a time. Delete `apps/web/next.config.ts` and keep the `.mjs` (or vice versa); this wasn't caught earlier because this build environment has no shell access to run `next dev`/`next build` and surface the conflict.
- Every sidebar item is enabled as of Phase 7. Phase 8 hardening (rate limiting, RLS audit, dependency review, Dependabot config) is in place — see `docs/05-development-roadmap.md` Phase 8 for what's delivered vs. explicitly deferred (load testing, AWS deployment, accessibility audit, Excel/PDF export).
