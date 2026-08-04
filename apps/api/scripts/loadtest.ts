/**
 * Load test for the POS checkout path — the latency-critical,
 * lock-contended route that decides how many shops one instance can serve.
 *
 * Dependency-free on purpose: it uses Node's built-in fetch so it can be run
 * against any environment without adding k6/artillery to the toolchain or
 * installing anything on the machine doing the testing.
 *
 * Usage:
 *   npx tsx apps/api/scripts/loadtest.ts --url http://localhost:4000 --vus 20 --seconds 30
 *
 * IMPORTANT: point this at a staging database, never production. It creates
 * an organization, products and real stock, then rings up real sales.
 *
 * What it measures, and why these three:
 *   - POS search  — every barcode scan; the highest-frequency call.
 *   - Checkout    — the only path that takes row locks; contention shows here.
 *   - Product list — a representative read with an aggregate behind it.
 */

interface Options {
  url: string;
  vus: number;
  seconds: number;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback: string): string => {
    const index = args.indexOf(flag);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
  };

  return {
    url: get('--url', 'http://localhost:4000').replace(/\/$/, ''),
    vus: Number(get('--vus', '10')),
    seconds: Number(get('--seconds', '20')),
  };
}

interface Sample {
  label: string;
  ms: number;
  ok: boolean;
  status: number;
}

const samples: Sample[] = [];

async function timed(label: string, fn: () => Promise<Response>): Promise<Response | null> {
  const started = performance.now();
  try {
    const res = await fn();
    samples.push({ label, ms: performance.now() - started, ok: res.ok, status: res.status });
    return res;
  } catch {
    // A thrown fetch (connection refused, socket hang-up) is itself a
    // result — recording it as a failure rather than crashing the run is
    // the whole point, since that's what saturation looks like.
    samples.push({ label, ms: performance.now() - started, ok: false, status: 0 });
    return null;
  }
}

/** Percentile from a sorted array. p95 matters far more than the mean here. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index];
}

/**
 * `Response.json()` resolves to `unknown` under current lib types, which is
 * correct — the runtime has no idea what came back. This asserts the shape
 * at one boundary rather than sprinkling casts through the fixture setup.
 * A load-test harness pointed at a known API is the right place for that
 * trade; application code should parse, not assert.
 */
async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

interface EnvelopeOf<T> {
  data: T;
}

async function setupFixture(baseUrl: string) {
  const email = `loadtest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const password = 'LoadTest Passphrase 2026';

  const registerRes = await fetch(`${baseUrl}/api/v1/auth/register-organization`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      organization: { legalName: 'Load Test Pvt Ltd', displayName: 'Load Test', businessType: 'clothing' },
      owner: { fullName: 'Load Tester', email, password },
    }),
  });

  if (!registerRes.ok) {
    throw new Error(`Fixture setup failed at registration: ${registerRes.status} ${await registerRes.text()}`);
  }

  const registered = await readJson<EnvelopeOf<{ accessToken: string }>>(registerRes);
  const auth = { Authorization: `Bearer ${registered.data.accessToken}`, 'Content-Type': 'application/json' };

  const me = await readJson<EnvelopeOf<{ assignments: { branchId: string }[] }>>(
    await fetch(`${baseUrl}/api/v1/auth/me`, { headers: auth }),
  );
  const branchId = me.data.assignments[0].branchId;

  const units = await readJson<EnvelopeOf<{ id: string; name: string }[]>>(
    await fetch(`${baseUrl}/api/v1/units`, { headers: auth }),
  );
  const unit = units.data.find((u) => u.name === 'Piece');
  if (!unit) throw new Error('Fixture setup failed: no "Piece" unit found on the new organization');
  const unitId = unit.id;

  // A handful of products so search has something to discriminate between,
  // each stocked deep enough that the run doesn't exhaust inventory and
  // start measuring rejections instead of checkouts.
  const variants: { id: string; barcode: string }[] = [];
  for (let i = 0; i < 10; i++) {
    const productRes = await fetch(`${baseUrl}/api/v1/products`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        name: `Load Test Product ${i}`,
        unitId,
        variants: [{ mrp: 500, sellingPrice: 400 }],
      }),
    });
    const product = await readJson<EnvelopeOf<{ variants: { id: string; barcode: string }[] }>>(productRes);
    const variant = product.data.variants[0];
    variants.push({ id: variant.id, barcode: variant.barcode });

    await fetch(`${baseUrl}/api/v1/inventory/adjustments`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        branchId,
        reasonCode: 'opening_stock',
        items: [{ productVariantId: variant.id, quantityDelta: 1_000_000 }],
      }),
    });
  }

  return { auth, branchId, variants };
}

async function virtualUser(
  baseUrl: string,
  fixture: Awaited<ReturnType<typeof setupFixture>>,
  deadline: number,
): Promise<void> {
  const { auth, branchId, variants } = fixture;

  while (performance.now() < deadline) {
    const variant = variants[Math.floor(Math.random() * variants.length)];

    // 1. Scan a barcode.
    await timed('pos_search', () =>
      fetch(`${baseUrl}/api/v1/pos/search?branchId=${branchId}&q=${variant.barcode}`, { headers: auth }),
    );

    // 2. Ring up the sale. Every virtual user hits the same small pool of
    //    variants deliberately — that's what forces row-lock contention on
    //    branch_stock, which is the behaviour worth measuring.
    await timed('checkout', () =>
      fetch(`${baseUrl}/api/v1/sales`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
          branchId,
          items: [{ productVariantId: variant.id, quantity: 1, unitPrice: 400, discountAmount: 0 }],
          payments: [{ amount: 400, paymentMode: 'cash' }],
        }),
      }),
    );

    // 3. A representative read.
    await timed('product_list', () => fetch(`${baseUrl}/api/v1/products`, { headers: auth }));
  }
}

function report(seconds: number): void {
  const byLabel = new Map<string, Sample[]>();
  for (const sample of samples) {
    const list = byLabel.get(sample.label) ?? [];
    list.push(sample);
    byLabel.set(sample.label, list);
  }

  // eslint-disable-next-line no-console
  console.log('\n' + '='.repeat(78));
  // eslint-disable-next-line no-console
  console.log(
    'endpoint'.padEnd(16) +
      'reqs'.padStart(8) +
      'req/s'.padStart(9) +
      'p50 ms'.padStart(10) +
      'p95 ms'.padStart(10) +
      'p99 ms'.padStart(10) +
      'errors'.padStart(9),
  );
  // eslint-disable-next-line no-console
  console.log('-'.repeat(78));

  for (const [label, list] of byLabel) {
    const sorted = list.map((s) => s.ms).sort((a, b) => a - b);
    const errors = list.filter((s) => !s.ok).length;
    // eslint-disable-next-line no-console
    console.log(
      label.padEnd(16) +
        String(list.length).padStart(8) +
        (list.length / seconds).toFixed(1).padStart(9) +
        percentile(sorted, 50).toFixed(0).padStart(10) +
        percentile(sorted, 95).toFixed(0).padStart(10) +
        percentile(sorted, 99).toFixed(0).padStart(10) +
        `${errors} (${((errors / list.length) * 100).toFixed(1)}%)`.padStart(9),
    );
  }

  const failed = samples.filter((s) => !s.ok);
  if (failed.length > 0) {
    const statuses = new Map<number, number>();
    for (const sample of failed) statuses.set(sample.status, (statuses.get(sample.status) ?? 0) + 1);
    // eslint-disable-next-line no-console
    console.log('\nFailure status codes:', Object.fromEntries(statuses));
    // eslint-disable-next-line no-console
    console.log('  429 = rate limited (expected under load; raise limits or lower --vus)');
    // eslint-disable-next-line no-console
    console.log('  0   = connection refused/reset — the instance is saturated');
    // eslint-disable-next-line no-console
    console.log('  500 = check the API logs; likely pool exhaustion or statement timeout');
  }

  // eslint-disable-next-line no-console
  console.log(
    '\nRule of thumb: a busy till makes ~1-3 requests/second. Divide the sustained\n' +
      'checkout req/s above (at an acceptable p95) by that to estimate concurrent tills.\n',
  );
}

async function main(): Promise<void> {
  const options = parseArgs();
  // eslint-disable-next-line no-console
  console.log(`Load testing ${options.url} — ${options.vus} virtual users for ${options.seconds}s`);
  // eslint-disable-next-line no-console
  console.log('Setting up fixture data…');

  const fixture = await setupFixture(options.url);
  const deadline = performance.now() + options.seconds * 1000;

  // eslint-disable-next-line no-console
  console.log('Running…');
  await Promise.all(Array.from({ length: options.vus }, () => virtualUser(options.url, fixture, deadline)));

  report(options.seconds);
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Load test failed:', err);
  process.exit(1);
});
