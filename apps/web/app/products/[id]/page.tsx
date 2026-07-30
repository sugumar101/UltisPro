'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Printer } from 'lucide-react';
import { PERMISSIONS } from '@ultispro/shared-types';
import { DashboardShell } from '../../../components/layout/dashboard-shell';
import { Card, CardContent, CardHeader } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { FormField } from '../../../components/ui/form-field';
import { Barcode } from '../../../components/ui/barcode';
import { useRequireAuth } from '../../../lib/hooks/use-require-auth';
import { hasPermission } from '../../../lib/stores/auth-store';
import {
  getProduct,
  updateProduct,
  deleteProduct,
  updateVariant,
  deleteVariant,
  addVariant,
  type Product,
  type ProductVariant,
} from '../../../lib/products-api';
import { ApiError } from '../../../lib/api-client';

export default function ProductDetailPage() {
  const { ready, accessToken, assignments } = useRequireAuth();
  const canManage = hasPermission(assignments, PERMISSIONS.PRODUCTS_MANAGE);
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [product, setProduct] = useState<Product | null>(null);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', hsnCode: '' });
  // Which variant row is open for editing, and its working copy.
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [variantForm, setVariantForm] = useState({ sku: '', barcode: '', mrp: '', sellingPrice: '', reorderLevel: '' });

  async function load(token: string, id: string) {
    try {
      const result = await getProduct(token, id);
      setProduct(result.product);
      setVariants(result.variants);
      setForm({
        name: result.product.name,
        description: result.product.description ?? '',
        hsnCode: result.product.hsn_code ?? '',
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load product');
    }
  }

  useEffect(() => {
    if (!ready || !accessToken || !params.id) return;
    load(accessToken, params.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, accessToken, params.id]);

  async function handleSave() {
    if (!accessToken || !params.id) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await updateProduct(accessToken, params.id, {
        name: form.name,
        description: form.description,
        hsnCode: form.hsnCode,
      });
      await load(accessToken, params.id);
      setEditing(false);
      setMessage('Product updated.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update product');
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleActive() {
    if (!accessToken || !params.id || !product) return;
    setBusy(true);
    setError(null);
    try {
      await updateProduct(accessToken, params.id, { isActive: !product.is_active });
      await load(accessToken, params.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update product');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!accessToken || !params.id || !product) return;
    // Soft delete server-side, but it disappears from every list — worth a
    // confirmation since there's no undo in the UI.
    const confirmed = window.confirm(
      `Delete "${product.name}"? It will be removed from product lists and POS search. Past invoices that reference it are unaffected.`,
    );
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    try {
      await deleteProduct(accessToken, params.id);
      router.push('/products');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete product');
      setBusy(false);
    }
  }

  function startEditVariant(v: ProductVariant) {
    setEditingVariantId(v.id);
    setVariantForm({
      sku: v.sku,
      barcode: v.barcode ?? '',
      mrp: String(v.mrp),
      sellingPrice: String(v.selling_price),
      reorderLevel: String(v.reorder_level),
    });
  }

  async function handleSaveVariant(variantId: string) {
    if (!accessToken || !params.id) return;
    setBusy(true);
    setError(null);
    try {
      await updateVariant(accessToken, params.id, variantId, {
        sku: variantForm.sku,
        barcode: variantForm.barcode || undefined,
        mrp: Number(variantForm.mrp),
        sellingPrice: Number(variantForm.sellingPrice),
        reorderLevel: Number(variantForm.reorderLevel),
      });
      await load(accessToken, params.id);
      setEditingVariantId(null);
      setMessage('Variant updated.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update variant');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteVariant(v: ProductVariant) {
    if (!accessToken || !params.id) return;
    const confirmed = window.confirm(
      `Delete variant ${v.sku}? Stock history for it is preserved, but it will no longer be sellable.`,
    );
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await deleteVariant(accessToken, params.id, v.id);
      await load(accessToken, params.id);
      setMessage('Variant deleted.');
    } catch (err) {
      // The API refuses to remove the last variant — surface that reason
      // rather than a generic failure.
      setError(err instanceof ApiError ? err.message : 'Failed to delete variant');
    } finally {
      setBusy(false);
    }
  }

  async function handleAddVariant() {
    if (!accessToken || !params.id) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      // Barcode intentionally omitted — the API generates one.
      await addVariant(accessToken, params.id, {
        sku: `${product?.name?.slice(0, 6).toUpperCase().replace(/\s/g, '') ?? 'SKU'}-${Date.now().toString().slice(-5)}`,
        mrp: 0,
        sellingPrice: 0,
      });
      await load(accessToken, params.id);
      setMessage('Variant added — edit it to set the SKU and price.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add variant');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;

  return (
    <DashboardShell>
      {error ? <p className="text-sm text-error">{error}</p> : null}
      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {!product && !error ? <p className="text-on-surface-variant">Loading…</p> : null}

      {product ? (
        <>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="font-headline-lg text-headline-lg text-on-surface">{product.name}</h1>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    product.is_active ? 'bg-green-100 text-green-700' : 'bg-surface-container text-on-surface-variant'
                  }`}
                >
                  {product.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              {product.description ? <p className="mt-1 text-on-surface-variant">{product.description}</p> : null}
              <p className="mt-1 font-mono-data text-sm text-on-surface-variant">
                HSN {product.hsn_code ?? '— not set'}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => window.open(`/products/barcodes?ids=${product.id}`, '_blank')}
              >
                <Printer className="h-4 w-4" />
                Print barcodes
              </Button>
              {canManage ? (
                <>
                  <Button variant="secondary" onClick={() => setEditing((v) => !v)}>
                    {editing ? 'Cancel' : 'Edit'}
                  </Button>
                  <Button variant="secondary" disabled={busy} onClick={handleToggleActive}>
                    {product.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button variant="destructive" disabled={busy} onClick={handleDelete}>
                    Delete
                  </Button>
                </>
              ) : null}
            </div>
          </div>

          {editing ? (
            <Card className="mt-6">
              <CardHeader>
                <h2 className="font-title-sm text-title-sm">Edit product</h2>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField label="Name">
                  <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </FormField>
                <FormField label="Description">
                  <textarea
                    className="w-full rounded border border-outline-variant px-3 py-2 text-body-md"
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </FormField>
                <FormField label="HSN code">
                  <Input
                    value={form.hsnCode}
                    placeholder="e.g. 6109"
                    onChange={(e) => setForm((f) => ({ ...f, hsnCode: e.target.value }))}
                  />
                </FormField>
                <div className="flex gap-2">
                  <Button disabled={busy} onClick={handleSave}>
                    {busy ? 'Saving…' : 'Save changes'}
                  </Button>
                  <Button variant="secondary" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card className="mt-6">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <h2 className="font-title-sm text-title-sm">Variants</h2>
                <p className="text-xs text-on-surface-variant">
                  Each variant is a separately stocked, separately scannable SKU.
                </p>
              </div>
              {canManage ? (
                <Button size="sm" variant="secondary" disabled={busy} onClick={handleAddVariant}>
                  Add variant
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-left text-body-md">
                <thead className="border-b border-outline-variant text-label-sm text-on-surface-variant">
                  <tr>
                    <th className="p-4">SKU</th>
                    <th className="p-4">Barcode</th>
                    <th className="p-4">MRP</th>
                    <th className="p-4">Selling price</th>
                    <th className="p-4">Reorder level</th>
                    {canManage ? <th className="p-4" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {variants.map((v) =>
                    editingVariantId === v.id ? (
                      <tr key={v.id} className="border-b border-outline-variant last:border-0 bg-surface-container-low">
                        <td className="p-3">
                          <Input
                            value={variantForm.sku}
                            onChange={(e) => setVariantForm((f) => ({ ...f, sku: e.target.value }))}
                          />
                        </td>
                        <td className="p-3">
                          <Input
                            value={variantForm.barcode}
                            onChange={(e) => setVariantForm((f) => ({ ...f, barcode: e.target.value }))}
                          />
                        </td>
                        <td className="p-3">
                          <Input
                            type="number"
                            className="w-24"
                            value={variantForm.mrp}
                            onChange={(e) => setVariantForm((f) => ({ ...f, mrp: e.target.value }))}
                          />
                        </td>
                        <td className="p-3">
                          <Input
                            type="number"
                            className="w-24"
                            value={variantForm.sellingPrice}
                            onChange={(e) => setVariantForm((f) => ({ ...f, sellingPrice: e.target.value }))}
                          />
                        </td>
                        <td className="p-3">
                          <Input
                            type="number"
                            className="w-20"
                            value={variantForm.reorderLevel}
                            onChange={(e) => setVariantForm((f) => ({ ...f, reorderLevel: e.target.value }))}
                          />
                        </td>
                        <td className="p-3">
                          <div className="flex gap-2">
                            <Button size="sm" disabled={busy} onClick={() => handleSaveVariant(v.id)}>
                              Save
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => setEditingVariantId(null)}>
                              Cancel
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={v.id} className="border-b border-outline-variant last:border-0">
                        <td className="p-4 font-mono-data">
                          {v.sku}
                          {v.attributes?.size ? (
                            <span className="ml-2 text-xs text-on-surface-variant">Size {v.attributes.size}</span>
                          ) : null}
                        </td>
                        <td className="p-4">
                          {v.barcode ? (
                            <Barcode value={v.barcode} height={28} moduleWidth={1.1} />
                          ) : (
                            <span className="text-on-surface-variant">—</span>
                          )}
                        </td>
                        <td className="p-4">{v.mrp}</td>
                        <td className="p-4">{v.selling_price}</td>
                        <td className="p-4">{v.reorder_level}</td>
                        {canManage ? (
                          <td className="p-4">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="secondary" onClick={() => startEditVariant(v)}>
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={busy || variants.length <= 1}
                                title={
                                  variants.length <= 1
                                    ? 'A product must keep at least one variant — delete the product instead'
                                    : undefined
                                }
                                onClick={() => handleDeleteVariant(v)}
                              >
                                Delete
                              </Button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </DashboardShell>
  );
}
