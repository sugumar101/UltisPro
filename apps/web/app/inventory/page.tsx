'use client';

import { useEffect, useState } from 'react';
import { PERMISSIONS } from '@ultispro/shared-types';
import { DashboardShell } from '../../components/layout/dashboard-shell';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { FormField } from '../../components/ui/form-field';
import { useRequireAuth } from '../../lib/hooks/use-require-auth';
import { hasPermission } from '../../lib/stores/auth-store';
import { listBranches, type Branch } from '../../lib/settings-api';
import { getStock, createAdjustment, type StockRow } from '../../lib/inventory-api';
import { ApiError } from '../../lib/api-client';

interface AdjustmentRow {
  productVariantId: string;
  quantityDelta: string;
}

export default function InventoryPage() {
  const { ready, accessToken, assignments } = useRequireAuth();
  const canAdjust = hasPermission(assignments, PERMISSIONS.INVENTORY_ADJUST);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [stock, setStock] = useState<StockRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [reasonCode, setReasonCode] = useState<'opening_stock' | 'damage' | 'theft' | 'recount' | 'expiry_writeoff' | 'other'>(
    'recount',
  );
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<AdjustmentRow[]>([{ productVariantId: '', quantityDelta: '' }]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !accessToken) return;
    listBranches(accessToken)
      .then((b) => {
        setBranches(b);
        if (b.length > 0) setBranchId(b[0].id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load branches'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, accessToken]);

  async function loadStock() {
    if (!accessToken || !branchId) return;
    setLoading(true);
    try {
      setStock(await getStock(accessToken, branchId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load stock');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, branchId]);

  function updateRow(index: number, patch: Partial<AdjustmentRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { productVariantId: '', quantityDelta: '' }]);
  }

  async function handleSubmitAdjustment() {
    if (!accessToken || !branchId) return;
    const items = rows
      .filter((r) => r.productVariantId && r.quantityDelta)
      .map((r) => ({ productVariantId: r.productVariantId, quantityDelta: Number(r.quantityDelta) }));

    if (items.length === 0) {
      setError('Add at least one variant ID and a non-zero quantity change.');
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await createAdjustment(accessToken, { branchId, reasonCode, notes: notes || undefined, items });
      setMessage('Adjustment recorded.');
      setRows([{ productVariantId: '', quantityDelta: '' }]);
      setNotes('');
      await loadStock();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to record adjustment');
    } finally {
      setSaving(false);
    }
  }

  if (!ready) return null;

  return (
    <DashboardShell>
      <div className="flex items-center justify-between">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">Inventory</h1>
        <FormField label="Branch">
          <select
            className="min-w-[200px] rounded border border-outline-variant px-3 py-2 text-body-md"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.code})
              </option>
            ))}
          </select>
        </FormField>
      </div>

      {error ? <p className="mt-4 text-sm text-error">{error}</p> : null}
      {message ? <p className="mt-4 text-sm text-green-700">{message}</p> : null}

      <Card className="mt-6">
        <CardHeader>
          <h2 className="font-title-sm text-title-sm">Stock on hand</h2>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-left text-body-md">
            <thead className="border-b border-outline-variant text-label-sm text-on-surface-variant">
              <tr>
                <th className="p-4">Product</th>
                <th className="p-4">SKU</th>
                <th className="p-4">Batch</th>
                <th className="p-4">On hand</th>
                <th className="p-4">Reorder level</th>
              </tr>
            </thead>
            <tbody>
              {stock.map((s) => {
                const onHand = Number(s.quantityOnHand);
                const low = onHand <= s.reorderLevel;
                return (
                  <tr key={`${s.productVariantId}-${s.batchId ?? 'none'}`} className="border-b border-outline-variant last:border-0">
                    <td className="p-4">{s.productName}</td>
                    <td className="p-4 font-mono-data text-on-surface-variant">{s.sku}</td>
                    <td className="p-4 font-mono-data text-on-surface-variant">{s.batchNumber ?? '—'}</td>
                    <td className={`p-4 font-semibold ${low ? 'text-error' : ''}`}>{onHand}</td>
                    <td className="p-4">{s.reorderLevel}</td>
                  </tr>
                );
              })}
              {!loading && stock.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-on-surface-variant">
                    No stock recorded for this branch yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {canAdjust ? (
        <Card className="mt-6">
          <CardHeader>
            <h2 className="font-title-sm text-title-sm">Record a stock adjustment</h2>
            <p className="text-sm text-on-surface-variant">
              Use positive quantities to add stock (e.g. opening stock, recount up) and negative quantities to remove
              it (e.g. damage, theft, recount down). Product variant IDs can be copied from a product&apos;s detail
              page.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Reason">
                <select
                  className="w-full rounded border border-outline-variant px-3 py-2 text-body-md"
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value as typeof reasonCode)}
                >
                  <option value="opening_stock">Opening stock</option>
                  <option value="recount">Recount</option>
                  <option value="damage">Damage</option>
                  <option value="theft">Theft</option>
                  <option value="expiry_writeoff">Expiry write-off</option>
                  <option value="other">Other</option>
                </select>
              </FormField>
              <FormField label="Notes (optional)">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </FormField>
            </div>

            {rows.map((r, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder="Product variant ID"
                  value={r.productVariantId}
                  onChange={(e) => updateRow(i, { productVariantId: e.target.value })}
                />
                <Input
                  placeholder="Quantity change (e.g. -5 or 20)"
                  type="number"
                  value={r.quantityDelta}
                  onChange={(e) => updateRow(i, { quantityDelta: e.target.value })}
                />
              </div>
            ))}
            <div className="flex justify-between">
              <Button variant="secondary" size="sm" onClick={addRow}>
                Add line
              </Button>
              <Button disabled={saving} onClick={handleSubmitAdjustment}>
                {saving ? 'Saving…' : 'Record adjustment'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </DashboardShell>
  );
}
