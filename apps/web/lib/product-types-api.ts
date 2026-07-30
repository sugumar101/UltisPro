import { apiFetch } from './api-client';

export interface ProductType {
  id: string;
  name: string;
  size_options: string[];
  default_hsn_code: string | null;
  is_active: boolean;
}

export interface ProductCategory {
  id: string;
  product_type_id: string;
  name: string;
  is_active: boolean;
}

export const listProductTypes = (token: string) => apiFetch<ProductType[]>('/api/v1/product-types', {}, token);

export const createProductType = (
  token: string,
  input: { name: string; sizeOptions?: string[]; defaultHsnCode?: string },
) => apiFetch<ProductType>('/api/v1/product-types', { method: 'POST', body: JSON.stringify(input) }, token);

export const updateProductType = (
  token: string,
  id: string,
  input: { name?: string; sizeOptions?: string[]; defaultHsnCode?: string | null },
) => apiFetch<ProductType>(`/api/v1/product-types/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, token);

export const deleteProductType = (token: string, id: string) =>
  apiFetch<{ deleted: boolean }>(`/api/v1/product-types/${id}`, { method: 'DELETE' }, token);

export const updateProductCategory = (token: string, id: string, input: { name?: string }) =>
  apiFetch<ProductCategory>(
    `/api/v1/product-categories/${id}`,
    { method: 'PATCH', body: JSON.stringify(input) },
    token,
  );

export const deleteProductCategory = (token: string, id: string) =>
  apiFetch<{ deleted: boolean }>(`/api/v1/product-categories/${id}`, { method: 'DELETE' }, token);

export const listProductCategories = (token: string, productTypeId?: string) => {
  const search = productTypeId ? `?productTypeId=${productTypeId}` : '';
  return apiFetch<ProductCategory[]>(`/api/v1/product-categories${search}`, {}, token);
};

export const createProductCategory = (token: string, input: { productTypeId: string; name: string }) =>
  apiFetch<ProductCategory>('/api/v1/product-categories', { method: 'POST', body: JSON.stringify(input) }, token);

// --- Clothing product creation ---

export const GENDERS = ['boy', 'girl', 'men', 'women', 'unisex'] as const;
export type Gender = (typeof GENDERS)[number];

export interface CreateClothingProductInput {
  productTypeId: string;
  productCategoryId: string;
  name: string;
  /** Free text — the API finds an existing brand by name or creates it. */
  brandName?: string;
  /** Stored on each variant's attributes and printed on the price tag. */
  color?: string;
  gender: Gender;
  sizes: { size: string; quantity: number }[];
  mrp: number;
  sellingPrice: number;
  branchId: string;
}

export interface ClothingProductResult {
  product: { id: string; name: string; product_code: string; gender: string };
  variants: {
    id: string;
    sku: string;
    barcode: string | null;
    mrp: string;
    selling_price: string;
    attributes: { size: string };
  }[];
  adjustment: { id: string } | null;
}

export const createClothingProduct = (token: string, input: CreateClothingProductInput) =>
  apiFetch<ClothingProductResult>('/api/v1/products/clothing', { method: 'POST', body: JSON.stringify(input) }, token);
