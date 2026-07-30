import { z } from 'zod';

export const createProductTypeSchema = z.object({
  name: z.string().min(1).max(100),
  // e.g. ['XS','S','M','L','XL','2XL','3XL'] for Shirts/T-Shirts, or
  // ['28','30','32',...,'44'] for Pants/Shorts -- whatever the admin
  // managing Settings > Catalog enters. Empty is valid (a type with no
  // size concept at all, e.g. accessories).
  sizeOptions: z.array(z.string().min(1).max(20)).max(50).optional().default([]),
  // Omitted, the service suggests a standard HSN from the type name
  // (shared/hsn.ts) — e.g. "T-Shirts" -> 6109. Always overridable: HSN
  // drives the GST rate and is the admin's call, not the app's.
  defaultHsnCode: z.string().max(20).optional(),
});
export type CreateProductTypeInput = z.infer<typeof createProductTypeSchema>;

export const updateProductTypeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  sizeOptions: z.array(z.string().min(1).max(20)).max(50).optional(),
  defaultHsnCode: z.string().max(20).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateProductTypeInput = z.infer<typeof updateProductTypeSchema>;

export const createProductCategorySchema = z.object({
  productTypeId: z.string().uuid(),
  name: z.string().min(1).max(100),
});
export type CreateProductCategoryInput = z.infer<typeof createProductCategorySchema>;

export const updateProductCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateProductCategoryInput = z.infer<typeof updateProductCategorySchema>;

export const listProductCategoriesQuerySchema = z.object({
  productTypeId: z.string().uuid().optional(),
});
export type ListProductCategoriesQuery = z.infer<typeof listProductCategoriesQuerySchema>;
