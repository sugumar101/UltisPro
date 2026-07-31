'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardShell } from '../../../components/layout/dashboard-shell';
import { Card, CardContent, CardHeader } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { FormField } from '../../../components/ui/form-field';
import { useRequireAuth } from '../../../lib/hooks/use-require-auth';
import {
  listCategories,
  listBrands,
  listUnits,
  listTaxes,
  createProduct,
  type Category,
  type Brand,
  type Unit,
  type Tax,
  type VariantInput,
} from '../../../lib/products-api';
import { ApiError } from '../../../lib/api-client';

// SKU and barcode intentionally blank — both are auto-generated server-side.
const EMPTY_VARIANT: VariantInput = { sku: '', barcode: '', mrp: 0, sellingPrice: 0, purchasePrice: 0, reorderLevel: 0 };

export default function NewProductPage() {
  const { ready, accessToken } = useRequireAuth();
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // Free text rather than an id: the user can type a brand-new name or pick
  // an existing one from the datalist, and the API finds-or-creates it. On a
  // fresh organization both lists are empty, which made the old id-only
  // dropdowns impossible to use without a detour through Settings.
  const [categoryName, setCategoryName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [unitId, setUnitId] = useState('');
  const [taxId, setTaxId] = useState('');
  const [hsnCode, setHsnCode] = useState('');
  const [trackBatches, setTrackBatches] = useState(false);
  const [variants, setVariants] = useState<VariantInput[]>([{ ...EMPTY_VARIANT }]);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ready || !accessToken) return;
    Promise.all([listCategories(accessToken), listBrands(accessToken), listUnits(accessToken), listTaxes(accessToken)])
      .then(([c, b, u, t]) => {
        setCategories(c);
        setBrands(b);
        setUnits(u);
        setTaxes(t);
        if (u.length > 0) setUnitId(u[0].id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load form data'));
  }, [ready, accessToken]);

  function updateVariant(index: number, patch: Partial<VariantInput>) {
    setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  }

  function addVariant() {
    setVariants((prev) => [...prev, { ...EMPTY_VARIANT }]);
  }

  function removeVariant(index: number) {
    setVariants((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!accessToken) return;
    if (!name || !unitId || variants.length === 0) {
      setError('Name, unit, and at least one variant are required.');
      return;
    }
    if (variants.some((v) => Number(v.sellingPrice) <= 0)) {
      setError('Every variant needs a selling price above zero.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await createProduct(accessToken, {
        name,
        description: description || undefined,
        categoryName: categoryName.trim() || undefined,
        brandName: brandName.trim() || undefined,
        unitId,
        taxId: taxId || undefined,
        hsnCode: hsnCode || undefined,
        hasVariants: variants.length > 1,
        trackBatches,
        variants: variants.map((v) => ({
          sku: v.sku?.trim() || undefined,
          barcode: v.barcode || undefined,
          mrp: Number(v.mrp),
          sellingPrice: Number(v.sellingPrice),
          purchasePrice: Number(v.purchasePrice ?? 0),
          reorderLevel: Number(v.reorderLevel ?? 0),
        })),
      });
      router.push(`/products/${result.product.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create product');
    } finally {
      setSaving(false);
    }
  }

  if (!ready) return null;

  return (
    <DashboardShell>
      <h1 className="font-headline-lg text-headline-lg text-on-surface">New product</h1>

      {error ? <p className="mt-4 text-sm text-error">{error}</p> : null}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <h2 className="font-title-sm text-title-sm">Details</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <FormField label="Description">
              <textarea
                className="w-full rounded border border-outline-variant px-3 py-2 text-body-md"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Category">
                <Input
                  list="category-options"
                  placeholder="Type a new category or pick an existing one"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                />
                <datalist id="category-options">
                  {categories.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </FormField>
              <FormField label="Brand">
                <Input
                  list="brand-options"
                  placeholder="Type a new brand or pick an existing one"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                />
                <datalist id="brand-options">
                  {brands.map((b) => (
                    <option key={b.id} value={b.name} />
                  ))}
                </datalist>
              </FormField>
            </div>
            <p className="text-xs text-on-surface-variant">
              New categories and brands are created automatically when you save — no need to set them up first.
            </p>
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Unit">
                <select
                  className="w-full rounded border border-outline-variant px-3 py-2 text-body-md"
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                >
                  <option value="">Select a unit</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.symbol})
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Tax rate">
                <select
                  className="w-full rounded border border-outline-variant px-3 py-2 text-body-md"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                >
                  <option value="">None</option>
                  {taxes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="HSN code">
                <Input value={hsnCode} onChange={(e) => setHsnCode(e.target.value)} />
              </FormField>
            </div>
            <label className="flex items-center gap-2 text-body-md">
              <input type="checkbox" checked={trackBatches} onChange={(e) => setTrackBatches(e.target.checked)} />
              Track batches / expiry for this product
            </label>

            {units.length === 0 && ready ? (
              <p className="text-sm text-on-surface-variant">
                No units found yet — add one under Settings &gt; Catalog Setup first.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-title-sm text-title-sm">Summary</h2>
          </CardHeader>
          <CardContent className="space-y-3 text-body-md text-on-surface-variant">
            <p>{variants.length} variant(s) configured.</p>
            <Button className="w-full" disabled={saving} onClick={handleSubmit}>
              {saving ? 'Saving…' : 'Create product'}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <h2 className="font-title-sm text-title-sm">Variants (SKUs)</h2>
            <p className="text-xs text-on-surface-variant">
              Leave SKU and Barcode blank — a unique SKU and a scannable in-store EAN-13 are generated for each
              variant.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={addVariant}>
            Add variant
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {variants.map((v, i) => (
            <div key={i} className="grid grid-cols-1 gap-3 rounded border border-outline-variant p-4 md:grid-cols-6">
              <FormField label="SKU">
                <Input
                  placeholder="Auto-generated"
                  value={v.sku ?? ''}
                  onChange={(e) => updateVariant(i, { sku: e.target.value })}
                />
              </FormField>
              <FormField label="Barcode">
                <Input
                  placeholder="Auto-generated"
                  value={v.barcode ?? ''}
                  onChange={(e) => updateVariant(i, { barcode: e.target.value })}
                />
              </FormField>
              <FormField label="MRP">
                <Input
                  type="number"
                  value={v.mrp}
                  onChange={(e) => updateVariant(i, { mrp: Number(e.target.value) })}
                />
              </FormField>
              <FormField label="Selling price">
                <Input
                  type="number"
                  value={v.sellingPrice}
                  onChange={(e) => updateVariant(i, { sellingPrice: Number(e.target.value) })}
                />
              </FormField>
              <FormField label="Purchase price">
                <Input
                  type="number"
                  value={v.purchasePrice ?? 0}
                  onChange={(e) => updateVariant(i, { purchasePrice: Number(e.target.value) })}
                />
              </FormField>
              <div className="flex items-end gap-2">
                <FormField label="Reorder level">
                  <Input
                    type="number"
                    value={v.reorderLevel ?? 0}
                    onChange={(e) => updateVariant(i, { reorderLevel: Number(e.target.value) })}
                  />
                </FormField>
                {variants.length > 1 ? (
                  <Button variant="destructive" size="sm" onClick={() => removeVariant(i)}>
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
