'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Printer, Search } from 'lucide-react';
import { PERMISSIONS } from '@ultispro/shared-types';
import { DashboardShell } from '../../components/layout/dashboard-shell';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { useRequireAuth } from '../../lib/hooks/use-require-auth';
import { hasPermission } from '../../lib/stores/auth-store';
import { listProducts, deleteProduct, type Product } from '../../lib/products-api';
import { openAppWindow } from '../../lib/app-url';
import { ApiError } from '../../lib/api-client';

export default function ProductsPage() {
  const { ready, accessToken, assignments } = useRequireAuth();
  const canManage = hasPermission(assignments, PERMISSIONS.PRODUCTS_MANAGE);

  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Selection for bulk barcode printing. Held as a Set of product ids.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === products.length ? new Set() : new Set(products.map((p) => p.id))));
  }

  function openBarcodes(ids: string[]) {
    if (ids.length === 0) return;
    openAppWindow(`/products/barcodes?ids=${ids.join(',')}`);
  }

  async function load(token: string) {
    setLoading(true);
    try {
      const result = await listProducts(token, { q: q || undefined, page });
      setProducts(result.data);
      setTotal(result.meta.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!ready || !accessToken) return;
    load(accessToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, accessToken, page]);

  async function handleDelete(product: Product) {
    if (!accessToken) return;
    const confirmed = window.confirm(
      `Delete "${product.name}"? It will be removed from product lists and POS search. Past invoices that reference it are unaffected.`,
    );
    if (!confirmed) return;

    try {
      await deleteProduct(accessToken, product.id);
      await load(accessToken);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete product');
    }
  }

  if (!ready) return null;

  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <DashboardShell>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-headline-lg text-on-surface">Products</h1>
          <p className="mt-0.5 text-body-md text-on-surface-variant">
            {total} product{total === 1 ? '' : 's'} in your catalog
          </p>
        </div>
        {canManage ? (
          <div className="flex gap-2">
            <Link href="/products/new-clothing">
              <Button variant="secondary">New clothing product</Button>
            </Link>
            <Link href="/products/new">
              <Button>New product</Button>
            </Link>
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
          <Input
            className="pl-9"
            placeholder="Search by name, SKU, or barcode…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setPage(1);
                if (accessToken) load(accessToken);
              }
            }}
          />
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            setPage(1);
            if (accessToken) load(accessToken);
          }}
        >
          Search
        </Button>
      </div>

      {error ? <p className="mt-4 text-sm text-error">{error}</p> : null}

      {selected.size > 0 ? (
        <div className="mt-4 flex animate-fade-in items-center gap-3 rounded-md border border-primary/30 bg-primary-container px-4 py-3">
          <span className="text-body-md font-semibold text-on-primary-container">
            {selected.size} product{selected.size === 1 ? '' : 's'} selected
          </span>
          <Button size="sm" onClick={() => openBarcodes([...selected])}>
            <Printer className="h-4 w-4" />
            Print barcodes
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      ) : null}

      <Card className="mt-6">
        <CardContent className="p-0">
          <table className="w-full text-left text-body-md">
            <thead className="border-b border-outline-variant text-label-sm text-on-surface-variant">
              <tr>
                <th className="w-10 p-4">
                  <input
                    type="checkbox"
                    aria-label="Select all products on this page"
                    checked={products.length > 0 && selected.size === products.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="p-4">Name</th>
                <th className="p-4">HSN</th>
                <th className="p-4">Variants</th>
                <th className="p-4">In stock</th>
                <th className="p-4">Status</th>
                <th className="p-4" />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr
                  key={p.id}
                  className={`row-hover border-b border-outline-variant last:border-0 ${
                    selected.has(p.id) ? 'bg-primary-container/40' : ''
                  }`}
                >
                  <td className="p-4">
                    <input
                      type="checkbox"
                      aria-label={`Select ${p.name}`}
                      checked={selected.has(p.id)}
                      onChange={() => toggleSelected(p.id)}
                    />
                  </td>
                  <td className="p-4">
                    <Link href={`/products/${p.id}`} className="font-semibold text-primary hover:underline">
                      {p.name}
                    </Link>
                    {p.description ? (
                      <p className="truncate text-sm text-on-surface-variant">{p.description}</p>
                    ) : null}
                  </td>
                  <td className="p-4 font-mono-data text-on-surface-variant">{p.hsn_code ?? '—'}</td>
                  <td className="p-4 text-on-surface-variant">
                    {p.variantCount ?? (p.has_variants ? '—' : 1)}
                  </td>
                  <td className="p-4">
                    {/* Summed across every branch. Zero is called out because
                        it's the state that blocks a sale at the till. */}
                    <span
                      className={`rounded-full px-2 py-0.5 text-sm font-semibold ${
                        (p.totalStock ?? 0) <= 0
                          ? 'bg-error-container text-on-error-container'
                          : 'bg-success-container text-on-success-container'
                      }`}
                    >
                      {p.totalStock ?? 0}
                    </span>
                  </td>
                  <td className="p-4">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        p.is_active ? 'bg-green-100 text-green-700' : 'bg-surface-container text-on-surface-variant'
                      }`}
                    >
                      {p.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Print barcode labels for this product"
                        onClick={() => openBarcodes([p.id])}
                      >
                        <Printer className="h-4 w-4" />
                        Barcode
                      </Button>
                      {canManage ? (
                        <>
                          <Link href={`/products/${p.id}`}>
                            <Button size="sm" variant="secondary">
                              Edit
                            </Button>
                          </Link>
                          <Button size="sm" variant="destructive" onClick={() => handleDelete(p)}>
                            Delete
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-on-surface-variant">
                    No products yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-body-md text-on-surface-variant">
          <span>
            Page {page} of {totalPages} ({total} products)
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </DashboardShell>
  );
}
