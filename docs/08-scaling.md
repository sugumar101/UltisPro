# UltisPro — Scaling & Capacity

What the system can carry, what the current limits are, and how to raise them. Numbers here are **architectural estimates until you run the load test** (`npm run loadtest --workspace=apps/api`) against your own hardware — measure before you commit to a customer.

## 1. Where capacity actually comes from

The API is stateless: JWT auth, no server-side sessions, no in-process request affinity. Throughput is therefore bounded by, in order:

1. **Database connections** — `DB_POOL_MAX` per instance (default 20). A checkout holds one for a multi-statement transaction with row locks.
2. **Row-lock contention** — two tills selling the *same variant* serialise on `SELECT … FOR UPDATE` against `branch_stock`. Different variants don't contend.
3. **CPU** — rarely the binding constraint; the work is I/O.

## 2. Estimated capacity

| Deployment | Rough concurrent tills | Rough shops |
|---|---|---|
| 1 instance, pool 20 | 60–150 | 100–300 |
| 3 instances + Redis, pool 20 each | 200–450 | 300–900 |
| Beyond that | Needs read replicas and ledger partitioning — see §5 |

A busy till makes roughly 1–3 requests/second (each scan is a search). Divide your measured sustained checkout req/s at an acceptable p95 by that to get concurrent tills. Most shops have 1–2 tills and aren't busy all day, hence the shops column being several times higher.

## 3. Fixes applied (and what each unblocked)

**Notification polling was the worst offender.** `generateLiveNotifications()` ran on every `GET /notifications` and issued one duplicate-check query *per low-stock item*. With the bell polling every 60s per logged-in user, a shop with 40 low-stock SKUs and 5 staff produced ~200 queries/minute while completely idle — cost scaling with users × conditions. Now: one query per reference table, one multi-row insert, plus a 2-minute per-organization scan throttle. Four queries per scan regardless of size, and at most one scan every two minutes per shop rather than one per poll per user.

**Pool was at pg's default of 10** with no timeouts. Now `DB_POOL_MAX` (20) plus `statement_timeout` (15s) and `idle_in_transaction_session_timeout` (30s). The timeouts matter as much as the size: without them a single slow report pins a connection until the client gives up, and under load the pool drains and the API stops responding entirely.

**Rate limiting was per-process**, so "10 logins per 15 min" became 30 across three replicas — and an attacker spreading attempts across instances saw effectively no limit. Auth limits now use Redis `INCR`/`EXPIRE` so all instances share one counter. **The global 600/min limiter stays in-process deliberately**: it runs on every request, so a Redis round trip there would add latency to the entire API, and a per-instance ceiling is adequate for blunt volumetric abuse. Auth is different — credential stuffing must see one shared counter.

**Redis failure degrades, it does not fail closed.** If Redis is unreachable the limiter falls back to per-process counting and a circuit breaker stops retrying for 30s. Taking tills offline because a *rate limiter's* backing store is down would be a far worse outcome than a briefly weaker limit.

**Search indexes.** POS search matches tokens against name, SKU and barcode with `ILIKE '%term%'`. A leading wildcard makes btree useless, and only `products.name` had a trigram index — SKU and barcode sequential-scanned `product_variants` on the most latency-sensitive path in the product. Migration 0013 adds trigram indexes on SKU, barcode and customer phone, plus a `(organization_id, branch_id, invoice_date DESC)` index matching how the sales list is actually read.

## 4. Running the load test

```bash
# Against staging — it creates an org, products, stock, and real sales.
npm run loadtest --workspace=apps/api -- --url https://staging-api.yourdomain.com --vus 25 --seconds 60
```

Reports req/s and p50/p95/p99 per endpoint. Reading the failures:

- **429** — rate limited. Expected at high `--vus` from one IP; not a capacity signal.
- **0** — connection refused/reset. The instance is saturated.
- **500** — check API logs; usually pool exhaustion or a statement timeout.

Watch p95 on `checkout`, not the mean. Contention shows up in the tail long before averages move.

## 5. Ceilings not yet addressed

- **`stock_ledger` and `audit_logs` grow unbounded.** Append-only, never pruned or partitioned. Fine for years at small scale. Before high volume, partition monthly by `created_at` and archive cold partitions — the ledger is the reconciliation source of truth, so it can be archived but never deleted.
- **Reports aggregate live over full history.** No materialised views. A multi-year GST report will get slow; materialise per-month rollups when it does.
- **Redis is used only for rate limits.** No caching layer. Product catalogue and tax rates are read constantly and change rarely — an obvious next win.
- **Single primary, no read replicas.** Reports and dashboards are pure reads that could be routed to a replica, halving primary load. Needs a second Kysely instance bound to a replica URL and read-path routing.
- **No per-tenant quotas.** One shop bulk-importing 50,000 products competes freely with every other tenant's tills. Fine while you know all your customers; needs per-org limits before self-serve signup.

## 6. Scaling order when you outgrow this

1. Raise `DB_POOL_MAX` and instance count together, watching `max_connections`.
2. Add read replicas; route reports and dashboard there.
3. Cache the catalogue in Redis (it's already connected).
4. Partition `stock_ledger`/`audit_logs` monthly.
5. Materialise report rollups.

Steps 1–3 are configuration and small refactors. Steps 4–5 are migrations that want a maintenance window.
