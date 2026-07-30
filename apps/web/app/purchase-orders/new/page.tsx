'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardShell } from '../../../components/layout/dashboard-shell';
import { Card, CardContent, CardHeader } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { FormField } from '../../../components/ui/form-field';
import { useRequireAuth } from '../../../lib/hooks/use-require-auth';
import { listBranches, type Branch } from '../../../lib/settings-api';
import { listSuppliers, createPurchaseOrder, type Supplier } from '../../../lib/purchasing-api';
import { listTaxes, type Tax } from '../../../lib/products-api';
import { ApiError } from '../../../lib/api-client';

interface ItemRow {
  productVariantId: string;
  quantityOrdered: string;
  unitCost: string;
  taxId: string;
}

const EMPTY_ROW: ItemRow = { productVariantId: '', quantityOrdered: '', unitCost: '', taxId: '' };

export default function NewPurchaseOrderPage() {
  const { ready, accessToken } = useRequireAuth();
  const router = useRouter();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [branchId, setBranchId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [rows, setRows] = useState<ItemRow[]>([{ ...EMPTY_ROW }]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ready || !accessToken) return;
    Promise.all([listBranches(accessToken), listSuppliers(accessToken), listTaxes(accessToken)])
      .then(([b, s, t]) => {
        setBranches(b);
        setSuppliers(s);
        setTaxes(t);
        if (b.length > 0) setBranchId(b[0].id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load form data'));
  }, [ready, accessToken]);

  function updateRow(index: number, patch: Partial<ItemRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { ...EMPTY_ROW }]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!accessToken || !branchId || !supplierId) {
      setError('Branch and supplier are required.');
      return;
    }
    const items = rows
      .filter((r) => r.productVariantId && r.quantityOrdered && r.unitCost)
      .map((r) => ({
        productVariantId: r.productVariantId,
        quantityOrdered: Number(r.quantityOrdered),
        unitCost: Number(r.unitCost),
        taxId: r.taxId || undefined,
      }));

    if (items.length === 0) {
      setError('At least one line item is required.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await createPurchaseOrder(accessToken, {
        branchId,
        supplierId,
        expectedDate: expectedDate || undefined,
        items,
      });
      router.push(`/purchase-orders/${result.header.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create purchase order');
    } finally {
      setSaving(false);
    }
  }

  if (!ready) return null;

  return (
    <DashboardShell>
      <h1 className="font-headline-lg text-headline-lg text-on-surface">New purchase order</h1>
      {error ? <p className="mt-4 text-sm text-error">{error}</p> : null}

      <Card className="mt-6">
        <CardHeader>
          <h2 className="font-title-sm text-title-sm">Details</h2>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FormField label="Branch">
            <select
              className="w-full rounded border border-outline-variant px-3 py-2 text-body-md"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Supplier">
            <select
              className="w-full rounded border border-outline-variant px-3 py-2 text-body-md"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">Select a supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Expected date (optional)">
            <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
          </FormField>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <h2 className="font-title-sm text-title-sm">Line items</h2>
          <Button variant="secondary" size="sm" onClick={addRow}>
            Add line
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-on-surface-variant">
            Product variant IDs can be copied from a product&apos;s detail page.
          </p>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-1 gap-3 rounded border border-outline-variant p-4 md:grid-cols-5">
              <FormField label="Product variant ID">
                <Input value={r.productVariantId} onChange={(e) => updateRow(i, { productVariantId: e.target.value })} />
              </FormField>
              <FormField label="Quantity">
                <Input
                  type="number"
                  value={r.quantityOrdered}
                  onChange={(e) => updateRow(i, { quantityOrdered: e.target.value })}
                />
              </FormField>
              <FormField label="Unit cost">
                <Input type="number" value={r.unitCost} onChange={(e) => updateRow(i, { unitCost: e.target.value })} />
              </FormField>
              <FormField label="Tax (optional)">
                <select
                  className="w-full rounded border border-outline-variant px-3 py-2 text-body-md"
                  value={r.taxId}
                  onChange={(e) => updateRow(i, { taxId: e.target.value })}
                >
                  <option value="">None</option>
                  {taxes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <div className="flex items-end">
                {rows.length > 1 ? (
                  <Button variant="destructive" size="sm" onClick={() => removeRow(i)}>
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
          <Button disabled={saving} onClick={handleSubmit}>
            {saving ? 'Creating…' : 'Create purchase order'}
          </Button>
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
