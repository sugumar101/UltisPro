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
import { openAppWindow } from '../../../lib/app-url';
import { useRequireAuth } from '../../../lib/hooks/use-require-auth';
import { hasPermission } from '../../../lib/stores/auth-store';
import {
  getProduct,
  updateProduct,
  deleteProduct,
  updateVariant,
  deleteVariant,
  addVariant,
  listCategories,
  listBrands,
  listUnits,
  listTaxes,
  type Product,
  type ProductVariant,
  type Category,
  type Brand,
  type Unit,
  type Tax,
} from '../../../lib/products-api';
import { GENDERS, type Gender } from '../../../lib/product-types-api';
import { ApiError } from '../../../lib/api-client';

const GENDER_LABELS: Record<Gender, string> = {
  boy: 'Boy',
  girl: 'Girl',
  men: 'Men',
  women: 'Women',
  unisex: 'Unisex',
};

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

  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    hsnCode: '',
    categoryId: '',
    brandId: '',
    unitId: '',
    taxId: '',
    trackBatches: false,
    gender: 'unisex' as Gender,
    color: '',
  });
  // Colour lives on each variant's attributes, not on the product row — one
  // colour per product, shared across every size (see the clothing create
  // flow). Editing it here means writing that same value across every
  // variant, so this tracks what was loaded to tell "unchanged" from
  // "changed" and avoid rewriting variants that don't need it.
  const [originalColor, setOriginalColor] = useState('');
  // Which variant row is open for editing, and its working copy.
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [variantForm, setVariantForm] = useState({ sku: '', barcode: '', mrp: '', sellingPrice: '', reorderLevel: '' });
  // A new-variant row, shown inline rather than navigating away — adding a
  // size/colour to stock a shop already carries shouldn't feel like
  // creating a whole new product.
  const [addingVariant, setAddingVariant] = useState(false);
  const [newVariantForm, setNewVariantForm] = useState({ size: '', color: '', mrp: '', sellingPrice: '' });

  async function load(token: string, id: string) {
    try {
      const result = await getProduct(token, id);
      setProduct(result.product);
      setVariants(result.variants);
      const color = result.variants[0]?.attributes?.color ?? '';
      setForm({
        name: result.product.name,
        description: result.product.description ?? '',
        hsnCode: result.product.hsn_code ?? '',
        categoryId: result.product.category_id ?? '',
        brandId: result.product.brand_id ?? '',
        unitId: result.product.unit_id,
        taxId: result.product.tax_id ?? '',
        trackBatches: result.product.track_batches,
        gender: (result.product.gender as Gender | null) ?? 'unisex',
        color,
      });
      setOriginalColor(color);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load product');
    }
  }

  useEffect(() => {
    if (!ready || !accessToken || !params.id) return;
    load(accessToken, params.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, accessToken, params.id]);

  useEffect(() => {
    if (!ready || !accessToken) return;
    Promise.all([listCategories(accessToken), listBrands(accessToken), listUnits(accessToken), listTaxes(accessToken)])
      .then(([c, b, u, t]) => {
        setCategories(c);
        setBrands(b);
        setUnits(u);
        setTaxes(t);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load form data'));
  }, [ready, accessToken]);

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
        categoryId: form.categoryId || null,
        brandId: form.brandId || null,
        unitId: form.unitId || undefined,
        taxId: form.taxId || null,
        trackBatches: form.trackBatches,
        // Gender is clothing-taxonomy-only — leaving it out for a
        // generic-flow product (no product_type_id) matches the schema,
        // which treats an absent field as "nothing to correct" rather than
        // forcing every product into a gender it was never given.
        ...(product?.product_type_id ? { gender: form.gender } : {}),
      });

      const trimmedColor = form.color.trim();
      if (trimmedColor !== originalColor) {
        // Not a product-table column — writing it means updating every
        // variant's attributes, since that's where colour actually lives.
        // `attributes` is replaced wholesale server-side, not merged, so
        // each variant's existing attributes (size, in particular) have to
        // be spread back in rather than sent as just `{ color }`.
        await Promise.all(
          variants.map((v) => {
            const nextAttributes = { ...v.attributes };
            if (trimmedColor) nextAttributes.color = trimmedColor;
            else delete nextAttributes.color;
            return updateVariant(accessToken, params.id, v.id, { attributes: nextAttributes });
          }),
        );
      }

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

  function startAddVariant() {
    // Pre-fill price from an existing variant when there is one — a new
    // size of the same product almost always sells at the same price, and
    // retyping it for every size is exactly the kind of friction this row
    // exists to avoid.
    const last = variants[variants.length - 1];
    setNewVariantForm({
      size: '',
      color: last?.attributes?.color ?? '',
      mrp: last ? String(last.mrp) : '',
      sellingPrice: last ? String(last.selling_price) : '',
    });
    setAddingVariant(true);
  }

  async function handleCreateVariant() {
    if (!accessToken || !params.id) return;
    if (!newVariantForm.mrp || !newVariantForm.sellingPrice) {
      setError('MRP and selling price are required for a new variant.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const attributes: Record<string, string> = {};
      if (newVariantForm.size.trim()) attributes.size = newVariantForm.size.trim();
      if (newVariantForm.color.trim()) attributes.color = newVariantForm.color.trim();

      // SKU and barcode both omitted — the API generates unique values for
      // each, checked against the organization's existing ones. Minting a
      // SKU client-side (as this used to) can't see other variants and so
      // can collide.
      await addVariant(accessToken, params.id, {
        attributes,
        mrp: Number(newVariantForm.mrp),
        sellingPrice: Number(newVariantForm.sellingPrice),
      });
      await load(accessToken, params.id);
      setAddingVariant(false);
      setMessage('Variant added.');
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
              <p className="mt-1 text-xs text-on-surface-variant">
                Created {new Date(product.created_at).toLocaleString('en-IN')} · Updated{' '}
                {new Date(product.updated_at).toLocaleString('en-IN')}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => openAppWindow(`/products/barcodes?ids=${product.id}`)}
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
                <div className="grid grid-cols-2 gap-4">
                  <FormField label="Category">
                    <select
                      className="field-base"
                      value={form.categoryId}
                      onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                    >
                      <option value="">None</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Brand">
                    <select
                      className="field-base"
                      value={form.brandId}
                      onChange={(e) => setForm((f) => ({ ...f, brandId: e.target.value }))}
                    >
                      <option value="">None</option>
                      {brands.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField label="Unit">
                    <select
                      className="field-base"
                      value={form.unitId}
                      onChange={(e) => setForm((f) => ({ ...f, unitId: e.target.value }))}
                    >
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.symbol})
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Tax rate">
                    <select
                      className="field-base"
                      value={form.taxId}
                      onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))}
                    >
                      <option value="">None</option>
                      {taxes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {product.product_type_id ? (
                    <FormField label="Gender">
                      <select
                        className="field-base"
                        value={form.gender}
                        onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value as Gender }))}
                      >
                        {GENDERS.map((g) => (
                          <option key={g} value={g}>
                            {GENDER_LABELS[g]}
                          </option>
                        ))}
                      </select>
                    </FormField>
                  ) : null}
                  {variants.length > 0 ? (
                    <FormField label="Color">
                      <Input
                        value={form.color}
                        placeholder="e.g. Black"
                        onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                      />
                      <p className="mt-1 text-xs text-on-surface-variant">
                        Applies to all {variants.length} variant{variants.length === 1 ? '' : 's'} of this product.
                      </p>
                    </FormField>
                  ) : null}
                </div>
                <FormField label="HSN code">
                  <Input
                    value={form.hsnCode}
                    placeholder="e.g. 6109"
                    onChange={(e) => setForm((f) => ({ ...f, hsnCode: e.target.value }))}
                  />
                </FormField>
                <label className="flex items-center gap-2 text-body-md">
                  <input
                    type="checkbox"
                    checked={form.trackBatches}
                    onChange={(e) => setForm((f) => ({ ...f, trackBatches: e.target.checked }))}
                  />
                  Track batches / expiry for this product
                </label>
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
                <Button size="sm" variant="secondary" disabled={busy || addingVariant} onClick={startAddVariant}>
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
                    <th className="p-4">In stock</th>
                    <th className="p-4" />
                  </tr>
                </thead>
                <tbody>
                  {addingVariant ? (
                    <tr className="border-b border-outline-variant bg-surface-container-low">
                      <td className="p-3">
                        <div className="flex gap-2">
                          <Input
                            className="w-20"
                            placeholder="Size"
                            value={newVariantForm.size}
                            onChange={(e) => setNewVariantForm((f) => ({ ...f, size: e.target.value }))}
                          />
                          <Input
                            placeholder="Color (optional)"
                            value={newVariantForm.color}
                            onChange={(e) => setNewVariantForm((f) => ({ ...f, color: e.target.value }))}
                          />
                        </div>
                      </td>
                      <td className="p-3 text-sm text-on-surface-variant">Auto-generated</td>
                      <td className="p-3">
                        <Input
                          type="number"
                          className="w-24"
                          value={newVariantForm.mrp}
                          onChange={(e) => setNewVariantForm((f) => ({ ...f, mrp: e.target.value }))}
                        />
                      </td>
                      <td className="p-3">
                        <Input
                          type="number"
                          className="w-24"
                          value={newVariantForm.sellingPrice}
                          onChange={(e) => setNewVariantForm((f) => ({ ...f, sellingPrice: e.target.value }))}
                        />
                      </td>
                      <td className="p-3 text-sm text-on-surface-variant">—</td>
                      <td className="p-3 text-sm text-on-surface-variant">—</td>
                      {canManage ? (
                        <td className="p-3">
                          <div className="flex gap-2">
                            <Button size="sm" disabled={busy} onClick={handleCreateVariant}>
                              Save
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => setAddingVariant(false)}>
                              Cancel
                            </Button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ) : null}
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
                        <td className="p-3 text-on-surface-variant" title="Managed from Inventory, not editable here">
                          {v.stockOnHand ?? 0}
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
                        <td className="p-4">
                          {/* Summed across every branch, same convention as the products
                              list — zero called out since it's what blocks a sale at the till. */}
                          <span
                            className={`rounded-full px-2 py-0.5 text-sm font-semibold ${
                              (v.stockOnHand ?? 0) <= 0
                                ? 'bg-error-container text-on-error-container'
                                : 'bg-success-container text-on-success-container'
                            }`}
                          >
                            {v.stockOnHand ?? 0}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              title={`Print a barcode label for just this variant (${v.sku})`}
                              onClick={() => openAppWindow(`/products/barcodes?ids=${product.id}&variantIds=${v.id}`)}
                            >
                              <Printer className="h-4 w-4" />
                              Print
                            </Button>
                            {canManage ? (
                              <>
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
                              </>
                            ) : null}
                          </div>
                        </td>
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
