import { apiFetch, apiFetchEnvelope } from './api-client';

export interface Category {
  id: string;
  name: string;
  parent_id: string | null;
}

export interface Brand {
  id: string;
  name: string;
}

export interface Unit {
  id: string;
  name: string;
  symbol: string;
}

export interface Tax {
  id: string;
  name: string;
  rate_percent: string;
  cgst_percent: string;
  sgst_percent: string;
  igst_percent: string;
}

export interface ProductVariant {
  id: string;
  sku: string;
  barcode: string | null;
  attributes: Record<string, string>;
  mrp: string;
  selling_price: string;
  purchase_price: string;
  reorder_level: number;
  is_active: boolean;
  /** Summed across every branch. Present on `getProduct` (detail) responses only. */
  stockOnHand?: number;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  brand_id: string | null;
  unit_id: string;
  tax_id: string | null;
  hsn_code: string | null;
  has_variants: boolean;
  track_batches: boolean;
  is_active: boolean;
  // Clothing taxonomy (Phase 9) — null on products created via the generic flow.
  product_type_id: string | null;
  product_category_id: string | null;
  gender: string | null;
  product_code: string | null;
  created_at: string;
  updated_at: string;
  /**
   * Stock on hand summed across every branch, and the number of live
   * variants. Present on list responses only (computed per page), not on
   * `getProduct` — the detail page shows per-variant figures instead.
   */
  totalStock?: number;
  variantCount?: number;
  /**
   * From one representative variant (list responses only) — a product's
   * variants normally share the same colour and price, sizes being the
   * only thing that differs, so this is a fair stand-in rather than a
   * price range. Null when the product has no variants yet.
   */
  color?: string | null;
  mrp?: string | null;
  sellingPrice?: string | null;
  /** Joined from brand_id (list responses only). Null when the product has no brand set. */
  brandName?: string | null;
}

export interface VariantInput {
  /** Optional — the API generates a unique readable SKU when omitted. */
  sku?: string;
  barcode?: string;
  attributes?: Record<string, string>;
  mrp: number;
  sellingPrice: number;
  purchasePrice?: number;
  reorderLevel?: number;
}

export interface CreateProductInput {
  name: string;
  description?: string;
  /** Either an existing id, or a free-text name the API finds-or-creates. The forms send names. */
  categoryId?: string;
  categoryName?: string;
  brandId?: string;
  brandName?: string;
  unitId: string;
  taxId?: string;
  hsnCode?: string;
  hasVariants?: boolean;
  trackBatches?: boolean;
  variants: VariantInput[];
}

// --- Masters ---

export const listCategories = (token: string) => apiFetch<Category[]>('/api/v1/categories', {}, token);
export const createCategory = (token: string, input: { name: string; parentId?: string }) =>
  apiFetch<Category>('/api/v1/categories', { method: 'POST', body: JSON.stringify(input) }, token);

export const listBrands = (token: string) => apiFetch<Brand[]>('/api/v1/brands', {}, token);
export const createBrand = (token: string, input: { name: string }) =>
  apiFetch<Brand>('/api/v1/brands', { method: 'POST', body: JSON.stringify(input) }, token);

export const listUnits = (token: string) => apiFetch<Unit[]>('/api/v1/units', {}, token);
export const createUnit = (token: string, input: { name: string; symbol: string }) =>
  apiFetch<Unit>('/api/v1/units', { method: 'POST', body: JSON.stringify(input) }, token);

export const listTaxes = (token: string) => apiFetch<Tax[]>('/api/v1/taxes', {}, token);
export const createTax = (
  token: string,
  input: { name: string; ratePercent: number; cgstPercent?: number; sgstPercent?: number; igstPercent?: number },
) => apiFetch<Tax>('/api/v1/taxes', { method: 'POST', body: JSON.stringify(input) }, token);

// --- Products ---

export interface ListProductsResult {
  data: Product[];
  meta: { page: number; pageSize: number; total: number };
}

export async function listProducts(
  token: string,
  params: {
    q?: string;
    categoryId?: string;
    brandId?: string;
    productTypeId?: string;
    productCategoryId?: string;
    page?: number;
  } = {},
): Promise<ListProductsResult> {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.categoryId) search.set('categoryId', params.categoryId);
  if (params.brandId) search.set('brandId', params.brandId);
  if (params.productTypeId) search.set('productTypeId', params.productTypeId);
  if (params.productCategoryId) search.set('productCategoryId', params.productCategoryId);
  if (params.page) search.set('page', String(params.page));

  const envelope = await apiFetchEnvelope<Product[]>(`/api/v1/products?${search.toString()}`, {}, token);
  return {
    data: envelope.data,
    meta: {
      page: envelope.meta?.page ?? 1,
      pageSize: envelope.meta?.pageSize ?? 20,
      total: envelope.meta?.total ?? envelope.data.length,
    },
  };
}

export const getProduct = (token: string, id: string) =>
  apiFetch<{ product: Product; variants: ProductVariant[]; images: unknown[] }>(`/api/v1/products/${id}`, {}, token);

export const createProduct = (token: string, input: CreateProductInput) =>
  apiFetch<{ product: Product; variants: ProductVariant[] }>(
    '/api/v1/products',
    { method: 'POST', body: JSON.stringify(input) },
    token,
  );

// --- Edit / delete ---

export interface UpdateProductInput {
  name?: string;
  description?: string;
  categoryId?: string | null;
  brandId?: string | null;
  unitId?: string;
  taxId?: string | null;
  hsnCode?: string;
  isActive?: boolean;
  trackBatches?: boolean;
  /** Clothing taxonomy only — omit for a product created via the generic flow. */
  gender?: 'boy' | 'girl' | 'men' | 'women' | 'unisex';
}

export const updateProduct = (token: string, id: string, input: UpdateProductInput) =>
  apiFetch<Product>(`/api/v1/products/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, token);

export const deleteProduct = (token: string, id: string) =>
  apiFetch<{ deleted: boolean }>(`/api/v1/products/${id}`, { method: 'DELETE' }, token);

export const updateVariant = (
  token: string,
  productId: string,
  variantId: string,
  input: Partial<VariantInput> & { isActive?: boolean },
) =>
  apiFetch<ProductVariant>(
    `/api/v1/products/${productId}/variants/${variantId}`,
    { method: 'PATCH', body: JSON.stringify(input) },
    token,
  );

export const deleteVariant = (token: string, productId: string, variantId: string) =>
  apiFetch<{ deleted: boolean }>(
    `/api/v1/products/${productId}/variants/${variantId}`,
    { method: 'DELETE' },
    token,
  );

export const addVariant = (token: string, productId: string, input: VariantInput) =>
  apiFetch<ProductVariant>(
    `/api/v1/products/${productId}/variants`,
    { method: 'POST', body: JSON.stringify(input) },
    token,
  );

export const updateCategory = (token: string, id: string, input: { name?: string }) =>
  apiFetch<Category>(`/api/v1/categories/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, token);

export const deleteCategory = (token: string, id: string) =>
  apiFetch<{ deleted: boolean }>(`/api/v1/categories/${id}`, { method: 'DELETE' }, token);

export const updateBrand = (token: string, id: string, input: { name?: string }) =>
  apiFetch<Brand>(`/api/v1/brands/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, token);

export const deleteBrand = (token: string, id: string) =>
  apiFetch<{ deleted: boolean }>(`/api/v1/brands/${id}`, { method: 'DELETE' }, token);

export const updateUnit = (token: string, id: string, input: { name?: string; symbol?: string }) =>
  apiFetch<Unit>(`/api/v1/units/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, token);

export const deleteUnit = (token: string, id: string) =>
  apiFetch<{ deleted: boolean }>(`/api/v1/units/${id}`, { method: 'DELETE' }, token);

export const updateTax = (
  token: string,
  id: string,
  input: { name?: string; ratePercent?: number; cgstPercent?: number; sgstPercent?: number; igstPercent?: number },
) => apiFetch<Tax>(`/api/v1/taxes/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, token);

export const deleteTax = (token: string, id: string) =>
  apiFetch<{ deleted: boolean }>(`/api/v1/taxes/${id}`, { method: 'DELETE' }, token);
