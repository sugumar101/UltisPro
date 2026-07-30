'use client';

import { useEffect, useState } from 'react';
import { PERMISSIONS } from '@ultispro/shared-types';
import { DashboardShell } from '../../../components/layout/dashboard-shell';
import { SettingsTabs } from '../../../components/layout/settings-tabs';
import { Card, CardContent, CardHeader } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { useRequireAuth } from '../../../lib/hooks/use-require-auth';
import { hasPermission } from '../../../lib/stores/auth-store';
import { EditableListRow } from '../../../components/ui/editable-list-row';
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listBrands,
  createBrand,
  updateBrand,
  deleteBrand,
  listUnits,
  createUnit,
  updateUnit,
  deleteUnit,
  listTaxes,
  createTax,
  updateTax,
  deleteTax,
  type Category,
  type Brand,
  type Unit,
  type Tax,
} from '../../../lib/products-api';
import {
  listProductTypes,
  createProductType,
  updateProductType,
  deleteProductType,
  listProductCategories,
  createProductCategory,
  updateProductCategory,
  deleteProductCategory,
  type ProductType,
  type ProductCategory,
} from '../../../lib/product-types-api';
import { ApiError } from '../../../lib/api-client';

const IN_USE_WARNING =
  'Products already using it keep their reference — this only removes it from the list for future use.';

export default function CatalogSettingsPage() {
  const { ready, accessToken, assignments } = useRequireAuth();
  const canManage = hasPermission(assignments, PERMISSIONS.PRODUCTS_MANAGE);

  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [productCategories, setProductCategories] = useState<ProductCategory[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [newCategory, setNewCategory] = useState('');
  const [newBrand, setNewBrand] = useState('');
  const [newUnit, setNewUnit] = useState({ name: '', symbol: '' });
  const [newTax, setNewTax] = useState({ name: '', ratePercent: '', cgstPercent: '', sgstPercent: '' });
  const [newProductType, setNewProductType] = useState({ name: '', sizeOptions: '', defaultHsnCode: '' });
  const [newProductCategory, setNewProductCategory] = useState({ productTypeId: '', name: '' });
  const [busy, setBusy] = useState<string | null>(null);

  async function loadAll(token: string) {
    const [c, b, u, t, pt, pc] = await Promise.all([
      listCategories(token),
      listBrands(token),
      listUnits(token),
      listTaxes(token),
      listProductTypes(token),
      listProductCategories(token),
    ]);
    setCategories(c);
    setBrands(b);
    setUnits(u);
    setTaxes(t);
    setProductTypes(pt);
    setProductCategories(pc);
  }

  useEffect(() => {
    if (!ready || !accessToken) return;
    loadAll(accessToken).catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, accessToken]);

  async function run(key: string, fn: () => Promise<void>) {
    if (!accessToken) return;
    setBusy(key);
    setError(null);
    try {
      await fn();
      await loadAll(accessToken);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  }

  if (!ready) return null;

  return (
    <DashboardShell>
      <h1 className="font-headline-lg text-headline-lg text-on-surface">Settings</h1>
      <SettingsTabs active="catalog" />

      {error ? <p className="mt-4 text-sm text-error">{error}</p> : null}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-title-sm text-title-sm">Categories</h2>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {categories.map((c) => (
                <EditableListRow
                  key={c.id}
                  canManage={canManage}
                  fields={[{ key: 'name', label: 'Category name', value: c.name }]}
                  deleteLabel={`the "${c.name}" category`}
                  deleteWarning={IN_USE_WARNING}
                  onSave={(values) =>
                    run('category', async () => {
                      await updateCategory(accessToken!, c.id, { name: values.name });
                    })
                  }
                  onDelete={() =>
                    run('category', async () => {
                      await deleteCategory(accessToken!, c.id);
                    })
                  }
                >
                  {c.name}
                </EditableListRow>
              ))}
              {categories.length === 0 ? <p className="text-on-surface-variant">No categories yet.</p> : null}
            </ul>
            {canManage ? (
              <div className="mt-4 flex gap-2">
                <Input
                  placeholder="New category name"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                />
                <Button
                  disabled={busy === 'category' || !newCategory}
                  onClick={() =>
                    run('category', async () => {
                      await createCategory(accessToken!, { name: newCategory });
                      setNewCategory('');
                    })
                  }
                >
                  {busy === 'category' ? 'Adding…' : 'Add'}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-title-sm text-title-sm">Brands</h2>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {brands.map((b) => (
                <EditableListRow
                  key={b.id}
                  canManage={canManage}
                  fields={[{ key: 'name', label: 'Brand name', value: b.name }]}
                  deleteLabel={`the "${b.name}" brand`}
                  deleteWarning={IN_USE_WARNING}
                  onSave={(values) =>
                    run('brand', async () => {
                      await updateBrand(accessToken!, b.id, { name: values.name });
                    })
                  }
                  onDelete={() =>
                    run('brand', async () => {
                      await deleteBrand(accessToken!, b.id);
                    })
                  }
                >
                  {b.name}
                </EditableListRow>
              ))}
              {brands.length === 0 ? <p className="text-on-surface-variant">No brands yet.</p> : null}
            </ul>
            {canManage ? (
              <div className="mt-4 flex gap-2">
                <Input placeholder="New brand name" value={newBrand} onChange={(e) => setNewBrand(e.target.value)} />
                <Button
                  disabled={busy === 'brand' || !newBrand}
                  onClick={() =>
                    run('brand', async () => {
                      await createBrand(accessToken!, { name: newBrand });
                      setNewBrand('');
                    })
                  }
                >
                  {busy === 'brand' ? 'Adding…' : 'Add'}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-title-sm text-title-sm">Units</h2>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {units.map((u) => (
                <EditableListRow
                  key={u.id}
                  canManage={canManage}
                  fields={[
                    { key: 'name', label: 'Unit name', value: u.name },
                    { key: 'symbol', label: 'Symbol', value: u.symbol, width: 'w-32' },
                  ]}
                  deleteLabel={`the "${u.name}" unit`}
                  deleteWarning={IN_USE_WARNING}
                  onSave={(values) =>
                    run('unit', async () => {
                      await updateUnit(accessToken!, u.id, { name: values.name, symbol: values.symbol });
                    })
                  }
                  onDelete={() =>
                    run('unit', async () => {
                      await deleteUnit(accessToken!, u.id);
                    })
                  }
                >
                  <div className="flex justify-between">
                    <span>{u.name}</span>
                    <span className="font-mono-data text-on-surface-variant">{u.symbol}</span>
                  </div>
                </EditableListRow>
              ))}
              {units.length === 0 ? <p className="text-on-surface-variant">No units yet.</p> : null}
            </ul>
            {canManage ? (
              <div className="mt-4 flex gap-2">
                <Input
                  placeholder="Name (e.g. Kilogram)"
                  value={newUnit.name}
                  onChange={(e) => setNewUnit((u) => ({ ...u, name: e.target.value }))}
                />
                <Input
                  placeholder="Symbol (e.g. kg)"
                  value={newUnit.symbol}
                  onChange={(e) => setNewUnit((u) => ({ ...u, symbol: e.target.value }))}
                />
                <Button
                  disabled={busy === 'unit' || !newUnit.name || !newUnit.symbol}
                  onClick={() =>
                    run('unit', async () => {
                      await createUnit(accessToken!, newUnit);
                      setNewUnit({ name: '', symbol: '' });
                    })
                  }
                >
                  {busy === 'unit' ? 'Adding…' : 'Add'}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-title-sm text-title-sm">Tax Rates</h2>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {taxes.map((t) => (
                <EditableListRow
                  key={t.id}
                  canManage={canManage}
                  fields={[
                    { key: 'name', label: 'Name', value: t.name },
                    { key: 'ratePercent', label: 'Rate %', value: String(Number(t.rate_percent)), width: 'w-28' },
                    { key: 'cgstPercent', label: 'CGST %', value: String(Number(t.cgst_percent)), width: 'w-28' },
                    { key: 'sgstPercent', label: 'SGST %', value: String(Number(t.sgst_percent)), width: 'w-28' },
                  ]}
                  deleteLabel={`the "${t.name}" tax rate`}
                  deleteWarning={IN_USE_WARNING}
                  onSave={(values) =>
                    run('tax', async () => {
                      const ratePercent = Number(values.ratePercent);
                      const cgstPercent = Number(values.cgstPercent);
                      const sgstPercent = Number(values.sgstPercent);
                      await updateTax(accessToken!, t.id, {
                        name: values.name,
                        ratePercent,
                        cgstPercent,
                        sgstPercent,
                        // The API requires rate == cgst + sgst (intra-state)
                        // or rate == igst (inter-state); derive IGST so an
                        // edit can't land in an invalid split.
                        igstPercent: cgstPercent + sgstPercent === 0 ? ratePercent : 0,
                      });
                    })
                  }
                  onDelete={() =>
                    run('tax', async () => {
                      await deleteTax(accessToken!, t.id);
                    })
                  }
                >
                  <div className="flex justify-between">
                    <span>{t.name}</span>
                    <span className="font-mono-data text-on-surface-variant">{t.rate_percent}%</span>
                  </div>
                </EditableListRow>
              ))}
              {taxes.length === 0 ? <p className="text-on-surface-variant">No tax rates yet.</p> : null}
            </ul>
            {canManage ? (
              <div className="mt-4 space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Name (e.g. GST 18%)"
                    value={newTax.name}
                    onChange={(e) => setNewTax((t) => ({ ...t, name: e.target.value }))}
                  />
                  <Input
                    placeholder="Rate %"
                    value={newTax.ratePercent}
                    onChange={(e) => setNewTax((t) => ({ ...t, ratePercent: e.target.value }))}
                  />
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="CGST % (intra-state)"
                    value={newTax.cgstPercent}
                    onChange={(e) => setNewTax((t) => ({ ...t, cgstPercent: e.target.value }))}
                  />
                  <Input
                    placeholder="SGST % (intra-state)"
                    value={newTax.sgstPercent}
                    onChange={(e) => setNewTax((t) => ({ ...t, sgstPercent: e.target.value }))}
                  />
                </div>
                <p className="text-xs text-on-surface-variant">
                  Leave CGST/SGST blank to treat the full rate as IGST (inter-state). CGST + SGST must equal the
                  overall rate.
                </p>
                <Button
                  disabled={busy === 'tax' || !newTax.name || !newTax.ratePercent}
                  onClick={() =>
                    run('tax', async () => {
                      const ratePercent = Number(newTax.ratePercent);
                      const cgstPercent = newTax.cgstPercent ? Number(newTax.cgstPercent) : undefined;
                      const sgstPercent = newTax.sgstPercent ? Number(newTax.sgstPercent) : undefined;
                      await createTax(accessToken!, {
                        name: newTax.name,
                        ratePercent,
                        cgstPercent,
                        sgstPercent,
                        igstPercent: cgstPercent === undefined ? ratePercent : 0,
                      });
                      setNewTax({ name: '', ratePercent: '', cgstPercent: '', sgstPercent: '' });
                    })
                  }
                >
                  {busy === 'tax' ? 'Adding…' : 'Add'}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-title-sm text-title-sm">Product Types</h2>
            <p className="text-xs text-on-surface-variant">
              For the clothing product flow — e.g. Shirts, T-Shirts, Pants, Shorts. Each type&apos;s size list drives
              the size checkboxes on Products &gt; New Clothing Product.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {productTypes.map((pt) => (
                <EditableListRow
                  key={pt.id}
                  canManage={canManage}
                  fields={[
                    { key: 'name', label: 'Type name', value: pt.name },
                    {
                      key: 'sizeOptions',
                      label: 'Sizes (comma-separated)',
                      value: pt.size_options.join(', '),
                      placeholder: 'XS,S,M,L,XL',
                    },
                    {
                      key: 'defaultHsnCode',
                      label: 'Default HSN code',
                      value: pt.default_hsn_code ?? '',
                      width: 'w-40',
                      placeholder: 'e.g. 6109',
                    },
                  ]}
                  deleteLabel={`the "${pt.name}" product type`}
                  deleteWarning="Its categories stay in the database but will no longer be selectable. Existing products keep their type."
                  onSave={(values) =>
                    run('productType', async () => {
                      await updateProductType(accessToken!, pt.id, {
                        name: values.name,
                        sizeOptions: values.sizeOptions
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                        defaultHsnCode: values.defaultHsnCode.trim() || null,
                      });
                    })
                  }
                  onDelete={() =>
                    run('productType', async () => {
                      await deleteProductType(accessToken!, pt.id);
                    })
                  }
                >
                  <div>
                    <span className="font-semibold">{pt.name}</span>
                    {pt.default_hsn_code ? (
                      <span className="ml-2 rounded bg-surface-container px-1.5 py-0.5 font-mono-data text-xs">
                        HSN {pt.default_hsn_code}
                      </span>
                    ) : null}
                    <div className="mt-0.5">
                      {pt.size_options.length > 0 ? (
                        <span className="font-mono-data text-xs text-on-surface-variant">
                          {pt.size_options.join(', ')}
                        </span>
                      ) : (
                        <span className="text-xs text-on-surface-variant">No sizes defined</span>
                      )}
                    </div>
                  </div>
                </EditableListRow>
              ))}
              {productTypes.length === 0 ? <p className="text-on-surface-variant">No product types yet.</p> : null}
            </ul>
            {canManage ? (
              <div className="mt-4 space-y-2">
                <Input
                  placeholder="Type name (e.g. T-Shirts)"
                  value={newProductType.name}
                  onChange={(e) => setNewProductType((v) => ({ ...v, name: e.target.value }))}
                />
                <Input
                  placeholder="Sizes, comma-separated (e.g. XS,S,M,L,XL,2XL,3XL)"
                  value={newProductType.sizeOptions}
                  onChange={(e) => setNewProductType((v) => ({ ...v, sizeOptions: e.target.value }))}
                />
                <Input
                  placeholder="Default HSN code (auto-suggested from the name if left blank)"
                  value={newProductType.defaultHsnCode}
                  onChange={(e) => setNewProductType((v) => ({ ...v, defaultHsnCode: e.target.value }))}
                />
                <p className="text-xs text-on-surface-variant">
                  Products created under this type inherit its HSN code. Naming a type &quot;T-Shirts&quot; or
                  &quot;Trousers&quot; fills in the standard code automatically — confirm it with your accountant, since
                  HSN determines the GST rate.
                </p>
                <Button
                  disabled={busy === 'productType' || !newProductType.name}
                  onClick={() =>
                    run('productType', async () => {
                      const sizeOptions = newProductType.sizeOptions
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean);
                      await createProductType(accessToken!, {
                        name: newProductType.name,
                        sizeOptions,
                        defaultHsnCode: newProductType.defaultHsnCode.trim() || undefined,
                      });
                      setNewProductType({ name: '', sizeOptions: '', defaultHsnCode: '' });
                    })
                  }
                >
                  {busy === 'productType' ? 'Adding…' : 'Add'}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-title-sm text-title-sm">Product Categories</h2>
            <p className="text-xs text-on-surface-variant">
              Nested under a Product Type — e.g. Oversized, Normal Fit, Drop Shoulder, Polo under T-Shirts.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {productCategories.map((pc) => (
                <EditableListRow
                  key={pc.id}
                  canManage={canManage}
                  fields={[{ key: 'name', label: 'Category name', value: pc.name }]}
                  deleteLabel={`the "${pc.name}" category`}
                  deleteWarning={IN_USE_WARNING}
                  onSave={(values) =>
                    run('productCategory', async () => {
                      await updateProductCategory(accessToken!, pc.id, { name: values.name });
                    })
                  }
                  onDelete={() =>
                    run('productCategory', async () => {
                      await deleteProductCategory(accessToken!, pc.id);
                    })
                  }
                >
                  <div className="flex justify-between">
                    <span>{pc.name}</span>
                    <span className="text-xs text-on-surface-variant">
                      {productTypes.find((pt) => pt.id === pc.product_type_id)?.name ?? '—'}
                    </span>
                  </div>
                </EditableListRow>
              ))}
              {productCategories.length === 0 ? (
                <p className="text-on-surface-variant">No product categories yet.</p>
              ) : null}
            </ul>
            {canManage ? (
              <div className="mt-4 space-y-2">
                <select
                  className="w-full rounded border border-outline-variant px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-primary"
                  value={newProductCategory.productTypeId}
                  onChange={(e) => setNewProductCategory((v) => ({ ...v, productTypeId: e.target.value }))}
                >
                  <option value="">Select a product type…</option>
                  {productTypes.map((pt) => (
                    <option key={pt.id} value={pt.id}>
                      {pt.name}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <Input
                    placeholder="Category name (e.g. Oversized)"
                    value={newProductCategory.name}
                    onChange={(e) => setNewProductCategory((v) => ({ ...v, name: e.target.value }))}
                  />
                  <Button
                    disabled={busy === 'productCategory' || !newProductCategory.name || !newProductCategory.productTypeId}
                    onClick={() =>
                      run('productCategory', async () => {
                        await createProductCategory(accessToken!, {
                          productTypeId: newProductCategory.productTypeId,
                          name: newProductCategory.name,
                        });
                        setNewProductCategory((v) => ({ ...v, name: '' }));
                      })
                    }
                  >
                    {busy === 'productCategory' ? 'Adding…' : 'Add'}
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
