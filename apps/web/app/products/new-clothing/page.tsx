'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DashboardShell } from '../../../components/layout/dashboard-shell';
import { Card, CardContent, CardHeader } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { FormField } from '../../../components/ui/form-field';
import { useRequireAuth } from '../../../lib/hooks/use-require-auth';
import {
  listProductTypes,
  listProductCategories,
  createClothingProduct,
  GENDERS,
  type ProductType,
  type ProductCategory,
  type Gender,
  type ClothingProductResult,
} from '../../../lib/product-types-api';
import { listBranches, type Branch } from '../../../lib/settings-api';
import { listBrands, type Brand } from '../../../lib/products-api';
import { ApiError } from '../../../lib/api-client';

const GENDER_LABELS: Record<Gender, string> = {
  boy: 'Boy',
  girl: 'Girl',
  men: 'Men',
  women: 'Women',
  unisex: 'Unisex',
};

export default function NewClothingProductPage() {
  const { ready, accessToken } = useRequireAuth();

  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  const [brands, setBrands] = useState<Brand[]>([]);
  const [productTypeId, setProductTypeId] = useState('');
  const [productCategoryId, setProductCategoryId] = useState('');
  const [name, setName] = useState('');
  // Free text, found-or-created by the API — same as the generic form.
  const [brandName, setBrandName] = useState('');
  const [color, setColor] = useState('');
  const [gender, setGender] = useState<Gender>('unisex');
  // Checked sizes and their quantities. Presence of a key = checked.
  const [selectedSizes, setSelectedSizes] = useState<Record<string, number>>({});
  const [mrp, setMrp] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  // All optional — a shop that doesn't track cost price or run offers leaves these blank.
  const [purchasePrice, setPurchasePrice] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [offerPrice, setOfferPrice] = useState('');
  const [branchId, setBranchId] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ClothingProductResult | null>(null);

  const selectedType = useMemo(
    () => productTypes.find((pt) => pt.id === productTypeId) ?? null,
    [productTypes, productTypeId],
  );

  useEffect(() => {
    if (!ready || !accessToken) return;
    Promise.all([listProductTypes(accessToken), listBranches(accessToken), listBrands(accessToken)])
      .then(([types, branchList, brandList]) => {
        setProductTypes(types);
        setBranches(branchList);
        setBrands(brandList);
        if (branchList.length > 0) setBranchId(branchList[0].id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load form data'));
  }, [ready, accessToken]);

  useEffect(() => {
    if (!accessToken || !productTypeId) {
      setCategories([]);
      setProductCategoryId('');
      return;
    }
    listProductCategories(accessToken, productTypeId)
      .then(setCategories)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load categories'));
    setProductCategoryId('');
    setSelectedSizes({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productTypeId, accessToken]);

  function toggleSize(size: string, checked: boolean) {
    setSelectedSizes((prev) => {
      const next = { ...prev };
      if (checked) {
        next[size] = next[size] ?? 0;
      } else {
        delete next[size];
      }
      return next;
    });
  }

  function setSizeQuantity(size: string, quantity: number) {
    setSelectedSizes((prev) => ({ ...prev, [size]: quantity }));
  }

  async function handleSubmit() {
    if (!accessToken) return;
    const sizeEntries = Object.entries(selectedSizes);
    if (!name || !productTypeId || !productCategoryId || !branchId || sizeEntries.length === 0 || !mrp || !sellingPrice) {
      setError('Product type, category, name, at least one size, price, selling price, and branch are all required.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const created = await createClothingProduct(accessToken, {
        productTypeId,
        productCategoryId,
        name,
        brandName: brandName.trim() || undefined,
        color: color.trim() || undefined,
        gender,
        sizes: sizeEntries.map(([size, quantity]) => ({ size, quantity })),
        mrp: Number(mrp),
        sellingPrice: Number(sellingPrice),
        purchasePrice: purchasePrice.trim() ? Number(purchasePrice) : undefined,
        originalPrice: originalPrice.trim() ? Number(originalPrice) : undefined,
        offerPrice: offerPrice.trim() ? Number(offerPrice) : undefined,
        branchId,
      });
      setResult(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create product');
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setResult(null);
    setName('');
    setProductTypeId('');
    setProductCategoryId('');
    setGender('unisex');
    setSelectedSizes({});
    setMrp('');
    setSellingPrice('');
    setPurchasePrice('');
    setOriginalPrice('');
    setOfferPrice('');
  }

  if (!ready) return null;

  if (result) {
    return (
      <DashboardShell>
        <h1 className="font-headline-lg text-headline-lg text-on-surface">Clothing product created</h1>
        <Card className="mt-6">
          <CardContent className="space-y-3 py-6">
            <p className="text-body-md">
              <span className="font-semibold">{result.product.name}</span> was created with product code{' '}
              <span className="rounded bg-surface-container-low px-2 py-0.5 font-mono-data text-primary">
                {result.product.product_code}
              </span>
            </p>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-outline-variant text-label-sm text-on-surface-variant">
                <tr>
                  <th className="py-2">Size</th>
                  <th className="py-2">SKU</th>
                  <th className="py-2">Barcode</th>
                  <th className="py-2">Price</th>
                </tr>
              </thead>
              <tbody>
                {result.variants.map((v) => (
                  <tr key={v.id} className="border-b border-outline-variant last:border-0">
                    <td className="py-2 font-semibold">{v.attributes.size}</td>
                    <td className="py-2 font-mono-data">{v.sku}</td>
                    <td className="py-2 font-mono-data">{v.barcode ?? '—'}</td>
                    <td className="py-2">₹{v.selling_price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-on-surface-variant">
              Each size has its own scannable barcode, so scanning at the till rings up that exact size.
            </p>
            {result.adjustment ? (
              <p className="text-sm text-on-surface-variant">Opening stock posted to the selected branch.</p>
            ) : (
              <p className="text-sm text-on-surface-variant">
                No opening stock posted (all sizes were entered with 0 quantity).
              </p>
            )}
            <div className="flex gap-2 pt-2">
              <Link href={`/products/${result.product.id}`}>
                <Button>View product</Button>
              </Link>
              <Button variant="secondary" onClick={resetForm}>
                Add another
              </Button>
            </div>
          </CardContent>
        </Card>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <h1 className="font-headline-lg text-headline-lg text-on-surface">New clothing product</h1>
      <p className="mt-1 text-body-md text-on-surface-variant">
        One product, multiple sizes — each size becomes its own stock-tracked SKU under a shared, auto-generated
        product code.
      </p>

      {error ? <p className="mt-4 text-sm text-error">{error}</p> : null}

      {productTypes.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="py-6 text-body-md text-on-surface-variant">
            No product types found yet — add one (e.g. &quot;T-Shirts&quot; with sizes XS,S,M,L,XL) under{' '}
            <Link href="/settings/catalog" className="text-primary hover:underline">
              Settings &gt; Catalog Setup
            </Link>{' '}
            first.
          </CardContent>
        </Card>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <h2 className="font-title-sm text-title-sm">Details</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Product type">
                  <select
                    className="w-full rounded border border-outline-variant px-3 py-2 text-body-md"
                    value={productTypeId}
                    onChange={(e) => setProductTypeId(e.target.value)}
                  >
                    <option value="">Select a type…</option>
                    {productTypes.map((pt) => (
                      <option key={pt.id} value={pt.id}>
                        {pt.name}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Product category">
                  <select
                    className="w-full rounded border border-outline-variant px-3 py-2 text-body-md"
                    value={productCategoryId}
                    onChange={(e) => setProductCategoryId(e.target.value)}
                    disabled={!productTypeId}
                  >
                    <option value="">Select a category…</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {productTypeId && categories.length === 0 ? (
                    <p className="mt-1 text-xs text-on-surface-variant">
                      No categories under this type yet — add one in Settings &gt; Catalog Setup.
                    </p>
                  ) : null}
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Product name">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Classic Oversized Tee"
                  />
                </FormField>
                <FormField label="Brand (optional)">
                  <Input
                    list="clothing-brand-options"
                    placeholder="Type a new brand or pick an existing one"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                  />
                  <datalist id="clothing-brand-options">
                    {brands.map((b) => (
                      <option key={b.id} value={b.name} />
                    ))}
                  </datalist>
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Gender">
                  <select
                    className="field-base"
                    value={gender}
                    onChange={(e) => setGender(e.target.value as Gender)}
                  >
                    {GENDERS.map((g) => (
                      <option key={g} value={g}>
                        {GENDER_LABELS[g]}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Colour (optional)">
                  <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="e.g. White" />
                </FormField>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <FormField label="Price (MRP)">
                  <Input type="number" value={mrp} onChange={(e) => setMrp(e.target.value)} />
                </FormField>
                <FormField label="Selling price">
                  <Input type="number" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} />
                </FormField>
                <FormField label="Branch (for opening stock)">
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
              </div>

              <div className="grid grid-cols-3 gap-4">
                <FormField label="Purchase price (optional)">
                  <Input
                    type="number"
                    value={purchasePrice}
                    onChange={(e) => setPurchasePrice(e.target.value)}
                    placeholder="Cost price"
                  />
                </FormField>
                <FormField label="Original price (optional)">
                  <Input
                    type="number"
                    value={originalPrice}
                    onChange={(e) => setOriginalPrice(e.target.value)}
                    placeholder="Pre-offer price"
                  />
                </FormField>
                <FormField label="Offer price (optional)">
                  <Input
                    type="number"
                    value={offerPrice}
                    onChange={(e) => setOfferPrice(e.target.value)}
                    placeholder="Discounted price"
                  />
                </FormField>
              </div>

              <p className="text-xs text-on-surface-variant">
                Product code is auto-generated (5 digits) once you save — no need to enter one.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="font-title-sm text-title-sm">Summary</h2>
            </CardHeader>
            <CardContent className="space-y-3 text-body-md text-on-surface-variant">
              <p>{Object.keys(selectedSizes).length} size(s) selected.</p>
              <p>
                {Object.values(selectedSizes).reduce((sum, q) => sum + (q || 0), 0)} total items across selected
                sizes.
              </p>
              <Button className="w-full" disabled={saving} onClick={handleSubmit}>
                {saving ? 'Saving…' : 'Create clothing product'}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {productTypeId ? (
        <Card className="mt-6">
          <CardHeader>
            <h2 className="font-title-sm text-title-sm">Sizes &amp; quantity</h2>
            <p className="text-xs text-on-surface-variant">
              Sizes come from the selected product type&apos;s size list (Settings &gt; Catalog Setup &gt; Product
              Types). Check a size and enter how many items you have.
            </p>
          </CardHeader>
          <CardContent>
            {!selectedType || selectedType.size_options.length === 0 ? (
              <p className="text-body-md text-on-surface-variant">
                This product type has no sizes configured — add sizes to it under Settings &gt; Catalog Setup.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {selectedType.size_options.map((size) => {
                  const checked = size in selectedSizes;
                  return (
                    <div
                      key={size}
                      className={`rounded border p-3 ${checked ? 'border-primary' : 'border-outline-variant'}`}
                    >
                      <label className="flex items-center gap-2 font-semibold">
                        <input type="checkbox" checked={checked} onChange={(e) => toggleSize(size, e.target.checked)} />
                        {size}
                      </label>
                      {checked ? (
                        <Input
                          className="mt-2"
                          type="number"
                          min={0}
                          value={selectedSizes[size]}
                          onChange={(e) => setSizeQuantity(size, Number(e.target.value))}
                          placeholder="Qty"
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </DashboardShell>
  );
}
