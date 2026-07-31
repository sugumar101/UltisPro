import { z } from 'zod';

export const variantInputSchema = z.object({
  // Optional: omitted, the service mints a readable unique SKU (see
  // products.service.ts#generateUniqueSku). A SKU is an internal identifier
  // whose only hard requirement is uniqueness within the organization, so
  // making a shopkeeper invent one per variant is needless work — and
  // hand-typed SKUs are exactly where duplicates and typos come from.
  sku: z.string().min(1).max(100).optional(),
  // Optional: left blank, the service generates a unique in-store EAN-13
  // (see shared/barcode.ts). Most garments arrive without a manufacturer
  // barcode, so auto-generation is the common path, not the exception.
  barcode: z.string().max(100).optional(),
  attributes: z.record(z.string()).optional().default({}),
  mrp: z.number().nonnegative(),
  sellingPrice: z.number().nonnegative(),
  purchasePrice: z.number().nonnegative().optional().default(0),
  reorderLevel: z.number().int().nonnegative().optional().default(0),
});
export type VariantInput = z.infer<typeof variantInputSchema>;

export const createProductSchema = z.object({
  name: z.string().min(2).max(255),
  description: z.string().max(5000).optional(),
  // Category and Brand can be supplied either as an existing id, or as a
  // free-text name that the service finds-or-creates. The name form is what
  // the product forms actually send: making someone leave a half-filled
  // product form, go to Settings, create a category, and come back is a bad
  // first-run experience — and on a brand-new organization both lists are
  // empty, so the id-only version left the dropdowns unusable.
  categoryId: z.string().uuid().optional(),
  categoryName: z.string().max(150).optional(),
  brandId: z.string().uuid().optional(),
  brandName: z.string().max(150).optional(),
  unitId: z.string().uuid(),
  taxId: z.string().uuid().optional(),
  hsnCode: z.string().max(20).optional(),
  hasVariants: z.boolean().optional().default(false),
  trackBatches: z.boolean().optional().default(false),
  variants: z.array(variantInputSchema).min(1, 'At least one variant (SKU) is required'),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  description: z.string().max(5000).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  brandId: z.string().uuid().nullable().optional(),
  unitId: z.string().uuid().optional(),
  taxId: z.string().uuid().nullable().optional(),
  hsnCode: z.string().max(20).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const createVariantSchema = variantInputSchema;
export const updateVariantSchema = variantInputSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;

export const listProductsQuerySchema = z.object({
  q: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
});
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

export const attachImageSchema = z.object({
  s3Key: z.string().min(1).max(500),
  sortOrder: z.number().int().nonnegative().optional().default(0),
});
export type AttachImageInput = z.infer<typeof attachImageSchema>;

// --- Clothing product creation (dedicated flow, see product-types module) ---

export const GENDERS = ['boy', 'girl', 'men', 'women', 'unisex'] as const;

export const clothingSizeInputSchema = z.object({
  size: z.string().min(1).max(20),
  // "For every size, add no. of items" -- 0 is valid (list the size as
  // carried without stocking it yet; a separate Inventory adjustment can
  // add quantity later).
  quantity: z.number().int().nonnegative(),
});

export const createClothingProductSchema = z.object({
  productTypeId: z.string().uuid(),
  productCategoryId: z.string().uuid(),
  name: z.string().min(2).max(255),
  // Free-text, found-or-created like the generic form's brand field. A
  // clothing shop cares about brand (Levi's, Zara, in-house label), but
  // shouldn't have to pre-register one before adding a product.
  brandName: z.string().max(150).optional(),
  // Stored on each variant's `attributes` JSONB alongside size, and printed
  // on the price tag. One colour per product here rather than a colour x
  // size matrix: a shop that stocks the same style in three colours creates
  // three products, which keeps the size grid one-dimensional and the form
  // fast. A true colour-way matrix is a later enhancement.
  color: z.string().max(50).optional(),
  gender: z.enum(GENDERS),
  sizes: z.array(clothingSizeInputSchema).min(1, 'Select at least one size').superRefine((sizes, ctx) => {
    const seen = new Set<string>();
    for (const s of sizes) {
      if (seen.has(s.size)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Size "${s.size}" was selected more than once` });
      }
      seen.add(s.size);
    }
  }),
  mrp: z.number().nonnegative(),
  sellingPrice: z.number().nonnegative(),
  branchId: z.string().uuid(),
});
export type CreateClothingProductInput = z.infer<typeof createClothingProductSchema>;
