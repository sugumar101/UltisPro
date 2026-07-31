import { db } from '../../shared/db';
import { AppError } from '../../shared/app-error';
import { recordAudit } from '../../shared/audit-log.service';
import { categoriesRepository } from '../categories/categories.repository';
import { brandsRepository } from '../brands/brands.repository';
import { unitsRepository } from '../units/units.repository';
import { taxesRepository } from '../taxes/taxes.repository';
import { branchesRepository } from '../branches/branches.repository';
import { productTypesRepository, productCategoriesRepository } from '../product-types/product-types.repository';
import { inventoryRepository, applyStockMovement } from '../inventory/inventory.repository';
import { generateEan13 } from '../../shared/barcode';
import { suggestHsnCode } from '../../shared/hsn';
import { productsRepository } from './products.repository';
import type {
  CreateProductInput,
  UpdateProductInput,
  VariantInput,
  UpdateVariantInput,
  ListProductsQuery,
  CreateClothingProductInput,
} from './products.dto';

interface PgError extends Error {
  code?: string;
}
function isUniqueViolation(err: unknown): err is PgError {
  return typeof err === 'object' && err !== null && (err as PgError).code === '23505';
}

async function assertReferencesBelongToOrg(
  organizationId: string,
  refs: { categoryId?: string; brandId?: string; unitId?: string; taxId?: string },
): Promise<void> {
  if (refs.categoryId) {
    const category = await categoriesRepository.findById(organizationId, refs.categoryId);
    if (!category) throw new AppError('VALIDATION_ERROR', 'Category not found');
  }
  if (refs.brandId) {
    const brand = await brandsRepository.findById(organizationId, refs.brandId);
    if (!brand) throw new AppError('VALIDATION_ERROR', 'Brand not found');
  }
  if (refs.unitId) {
    const unit = await unitsRepository.findById(organizationId, refs.unitId);
    if (!unit) throw new AppError('VALIDATION_ERROR', 'Unit not found');
  }
  if (refs.taxId) {
    const tax = await taxesRepository.findById(organizationId, refs.taxId);
    if (!tax) throw new AppError('VALIDATION_ERROR', 'Tax not found');
  }
}

/**
 * Picks an unused 5-digit numeric product code before the create
 * transaction starts, rather than inside a retry loop around the insert
 * itself. With a 90,000-code space per organization and product creation
 * being a low-frequency, single-admin-at-a-time action in practice, the
 * tiny window between this check and the insert is an acceptable risk --
 * the `products_product_code_unique` constraint (migration 0010) is still
 * the real backstop. If two requests do race and collide, the insert fails
 * with a 23505 that createClothing's catch block turns into a clear
 * "please retry" CONFLICT rather than a confusing generic 500.
 */
async function generateUniqueProductCode(organizationId: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = String(Math.floor(10000 + Math.random() * 90000));
    if (!(await productsRepository.existsWithCode(organizationId, code))) return code;
  }
  throw new AppError('CONFLICT', 'Could not generate a unique product code right now -- please try again');
}

/**
 * Picks an unused in-store EAN-13. Same check-then-insert shape as
 * generateUniqueProductCode above, with the UNIQUE constraint on
 * (organization_id, barcode) as the real backstop: the 10 random digits give
 * a collision probability low enough that a retry loop of 20 is generous.
 */
/**
 * Mints a readable, unique SKU: a short alphabetic stem taken from the
 * product name plus a 5-digit number, e.g. `CLA-48213`. Readable matters
 * because staff quote SKUs to each other and it's what prints under the
 * barcode on a label — a UUID would be useless there.
 *
 * Same check-then-insert shape as product codes and barcodes, with the
 * `UNIQUE (organization_id, sku)` constraint as the real backstop. Variants
 * of one product get a suffix so a multi-variant product's SKUs are visibly
 * related rather than unrelated random codes.
 */
async function generateUniqueSku(
  organizationId: string,
  productName: string,
  variantSuffix?: string,
): Promise<string> {
  const stem =
    productName
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 3) || 'SKU';

  for (let attempt = 0; attempt < 20; attempt++) {
    const serial = String(Math.floor(10000 + Math.random() * 90000));
    const candidate = variantSuffix ? `${stem}-${serial}-${variantSuffix}` : `${stem}-${serial}`;
    if (!(await productsRepository.existsWithSku(organizationId, candidate))) return candidate;
  }
  throw new AppError('CONFLICT', 'Could not generate a unique SKU right now -- please try again');
}

async function generateUniqueBarcode(organizationId: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = generateEan13();
    if (!(await productsRepository.existsWithBarcode(organizationId, candidate))) return candidate;
  }
  throw new AppError('CONFLICT', 'Could not generate a unique barcode right now -- please try again');
}

/**
 * Resolves the Category/Brand a product form submitted. Accepts either an
 * existing id (validated against the org) or a free-text name, which is
 * found case-insensitively or created on the spot. Returns undefined when
 * neither was supplied — both are optional on a product.
 */
async function resolveCategoryId(
  organizationId: string,
  actorUserId: string,
  input: { categoryId?: string; categoryName?: string },
): Promise<string | undefined> {
  if (input.categoryId) {
    const category = await categoriesRepository.findById(organizationId, input.categoryId);
    if (!category) throw new AppError('VALIDATION_ERROR', 'Category not found');
    return category.id;
  }

  const name = input.categoryName?.trim();
  if (!name) return undefined;

  const existing = await categoriesRepository.findByName(organizationId, name);
  if (existing) return existing.id;

  const created = await categoriesRepository.create(organizationId, actorUserId, { name });
  await recordAudit({
    organizationId,
    actorUserId,
    action: 'create',
    entityTable: 'categories',
    entityId: created.id,
    after: { name: created.name, createdInline: true },
  });
  return created.id;
}

async function resolveBrandId(
  organizationId: string,
  actorUserId: string,
  input: { brandId?: string; brandName?: string },
): Promise<string | undefined> {
  if (input.brandId) {
    const brand = await brandsRepository.findById(organizationId, input.brandId);
    if (!brand) throw new AppError('VALIDATION_ERROR', 'Brand not found');
    return brand.id;
  }

  const name = input.brandName?.trim();
  if (!name) return undefined;

  const existing = await brandsRepository.findByName(organizationId, name);
  if (existing) return existing.id;

  const created = await brandsRepository.create(organizationId, actorUserId, { name });
  await recordAudit({
    organizationId,
    actorUserId,
    action: 'create',
    entityTable: 'brands',
    entityId: created.id,
    after: { name: created.name, createdInline: true },
  });
  return created.id;
}

function toVariantValues(v: VariantInput, generatedBarcode?: string, generatedSku?: string) {
  const barcode = v.barcode?.trim() || generatedBarcode;
  const sku = v.sku?.trim() || generatedSku;
  if (!sku) throw new AppError('VALIDATION_ERROR', 'A SKU is required');
  return {
    sku,
    attributes: JSON.stringify(v.attributes ?? {}),
    mrp: v.mrp,
    selling_price: v.sellingPrice,
    purchase_price: v.purchasePrice,
    reorder_level: v.reorderLevel,
    ...(barcode !== undefined && { barcode }),
  };
}

export const productsService = {
  async list(organizationId: string, query: ListProductsQuery) {
    const { rows, total } = await productsRepository.list(organizationId, query);

    // Stock is attached per row so the catalog list can show what's actually
    // on hand — the single most useful thing to see next to a product name,
    // and previously only reachable by opening Inventory separately.
    const stock = await productsRepository.stockForProducts(
      organizationId,
      rows.map((row) => row.id),
    );

    const withStock = rows.map((row) => ({
      ...row,
      totalStock: stock.get(row.id)?.totalStock ?? 0,
      variantCount: stock.get(row.id)?.variantCount ?? 0,
    }));

    return { rows: withStock, total, page: query.page, pageSize: query.pageSize };
  },

  async getById(organizationId: string, id: string) {
    const product = await productsRepository.findById(organizationId, id);
    if (!product) throw new AppError('NOT_FOUND', 'Product not found');

    const [variants, images] = await Promise.all([
      productsRepository.listVariantsForProduct(id),
      productsRepository.listImagesForProduct(id),
    ]);

    return { product, variants, images };
  },

  async create(organizationId: string, actorUserId: string, input: CreateProductInput) {
    await assertReferencesBelongToOrg(organizationId, {
      unitId: input.unitId,
      taxId: input.taxId,
    });

    // Resolved before the transaction opens: find-or-create may insert a
    // category/brand row, and doing that inside the product transaction
    // would roll the new master back if the product insert later failed on
    // a duplicate SKU — leaving the user to re-type it.
    const categoryId = await resolveCategoryId(organizationId, actorUserId, input);
    const brandId = await resolveBrandId(organizationId, actorUserId, input);

    // HSN is never invented — only suggested from a fixed table of real
    // codes (shared/hsn.ts), matched against the product name plus whatever
    // category was typed. Nothing recognisable means it stays null, which
    // is the correct outcome: a blank HSN is fixable, a wrong one on a GST
    // invoice is a compliance problem.
    const hsnCode = input.hsnCode?.trim() || suggestHsnCode(`${input.name} ${input.categoryName ?? ''}`);

    // Pre-generate barcodes for variants that didn't supply one, so the
    // uniqueness probe runs outside the transaction like the product-code
    // generator does.
    const barcodes = new Map<number, string>();
    const skus = new Map<number, string>();
    for (const [index, variant] of input.variants.entries()) {
      if (!variant.barcode?.trim()) {
        barcodes.set(index, await generateUniqueBarcode(organizationId));
      }
      if (!variant.sku?.trim()) {
        // Multi-variant products get a numeric suffix so their SKUs read as
        // a family (CLA-48213-1, CLA-48213-2) rather than unrelated codes.
        const suffix = input.variants.length > 1 ? String(index + 1) : undefined;
        skus.set(index, await generateUniqueSku(organizationId, input.name, suffix));
      }
    }

    try {
      const result = await db.transaction().execute(async (trx) => {
        const product = await productsRepository.createProduct(trx, organizationId, actorUserId, {
          name: input.name,
          unit_id: input.unitId,
          has_variants: input.hasVariants,
          track_batches: input.trackBatches,
          ...(input.description !== undefined && { description: input.description }),
          ...(categoryId !== undefined && { category_id: categoryId }),
          ...(brandId !== undefined && { brand_id: brandId }),
          ...(input.taxId !== undefined && { tax_id: input.taxId }),
          ...(hsnCode !== null && { hsn_code: hsnCode }),
        });

        const variants = [];
        for (const [index, variantInput] of input.variants.entries()) {
          const variant = await productsRepository.createVariant(
            trx,
            organizationId,
            product.id,
            actorUserId,
            toVariantValues(variantInput, barcodes.get(index), skus.get(index)),
          );
          variants.push(variant);
        }

        return { product, variants };
      });

      await recordAudit({
        organizationId,
        actorUserId,
        action: 'create',
        entityTable: 'products',
        entityId: result.product.id,
        after: { name: result.product.name, variantCount: result.variants.length },
      });

      return result;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AppError('CONFLICT', 'A product variant with this SKU or barcode already exists');
      }
      throw err;
    }
  },

  /**
   * The dedicated clothing product flow: Product Type -> Category, gender,
   * a size checkbox set (each size becomes its own product_variants row,
   * SKU = `${productCode}-${size}`), one shared MRP/selling price across
   * all sizes, and -- if any size has a quantity > 0 -- opening stock
   * posted to the chosen branch in the same transaction, via the exact
   * same stock_adjustments + applyStockMovement path the Inventory
   * module's own adjustments endpoint uses (reasonCode 'opening_stock'),
   * not a parallel reimplementation.
   */
  async createClothing(organizationId: string, actorUserId: string, input: CreateClothingProductInput) {
    const productType = await productTypesRepository.findById(organizationId, input.productTypeId);
    if (!productType) throw new AppError('VALIDATION_ERROR', 'Product type not found');

    const productCategory = await productCategoriesRepository.findById(organizationId, input.productCategoryId);
    if (!productCategory) throw new AppError('VALIDATION_ERROR', 'Product category not found');
    if (productCategory.product_type_id !== input.productTypeId) {
      throw new AppError('VALIDATION_ERROR', 'This category does not belong to the selected product type');
    }

    const branch = await branchesRepository.findById(organizationId, input.branchId);
    if (!branch) throw new AppError('VALIDATION_ERROR', 'Branch not found');

    const unit = await unitsRepository.findByName(organizationId, 'Piece');
    if (!unit) {
      throw new AppError(
        'VALIDATION_ERROR',
        'No "Piece" unit found for your organization -- check Settings > Catalog > Units',
      );
    }

    const brandId = await resolveBrandId(organizationId, actorUserId, input);
    const productCode = await generateUniqueProductCode(organizationId);

    // HSN inheritance chain: what the admin confirmed on the product type
    // wins, then a suggestion from the type + product name, then null.
    const hsnCode =
      productType.default_hsn_code?.trim() ||
      suggestHsnCode(`${productType.name} ${input.name}`);

    // Every size gets its own scannable barcode — that's the whole point of
    // size-level variants at the till: scanning a Medium must ring up and
    // decrement the Medium, not "the product".
    const sizeBarcodes = new Map<number, string>();
    for (const index of input.sizes.keys()) {
      sizeBarcodes.set(index, await generateUniqueBarcode(organizationId));
    }

    try {
      const result = await db.transaction().execute(async (trx) => {
        const product = await productsRepository.createProduct(trx, organizationId, actorUserId, {
          name: input.name,
          unit_id: unit.id,
          has_variants: true,
          track_batches: false,
          product_type_id: input.productTypeId,
          product_category_id: input.productCategoryId,
          gender: input.gender,
          product_code: productCode,
          ...(brandId !== undefined && { brand_id: brandId }),
          ...(hsnCode !== null && { hsn_code: hsnCode }),
        });

        const variants = [];
        for (const [index, sizeInput] of input.sizes.entries()) {
          const variant = await productsRepository.createVariant(trx, organizationId, product.id, actorUserId, {
            sku: `${productCode}-${sizeInput.size}`,
            barcode: sizeBarcodes.get(index)!,
            attributes: JSON.stringify({
              size: sizeInput.size,
              ...(input.color?.trim() && { color: input.color.trim() }),
            }),
            mrp: input.mrp,
            selling_price: input.sellingPrice,
            purchase_price: 0,
            reorder_level: 0,
          });
          variants.push(variant);
        }

        const sizesNeedingStock = input.sizes.filter((s) => s.quantity > 0);
        let adjustment = null;
        if (sizesNeedingStock.length > 0) {
          adjustment = await inventoryRepository.createAdjustmentHeader(
            trx,
            organizationId,
            input.branchId,
            actorUserId,
            'opening_stock',
            `Initial stock for ${input.name} (${productCode})`,
          );

          for (let i = 0; i < input.sizes.length; i++) {
            const sizeInput = input.sizes[i];
            if (sizeInput.quantity <= 0) continue;
            const variant = variants[i];

            await inventoryRepository.addAdjustmentItem(trx, adjustment.id, variant.id, null, sizeInput.quantity);
            await applyStockMovement(trx, {
              organizationId,
              branchId: input.branchId,
              productVariantId: variant.id,
              batchId: null,
              movementType: 'adjustment_in',
              referenceTable: 'stock_adjustments',
              referenceId: adjustment.id,
              quantityDelta: sizeInput.quantity,
              actorUserId,
            });
          }
        }

        return { product, variants, adjustment };
      });

      await recordAudit({
        organizationId,
        actorUserId,
        action: 'create',
        entityTable: 'products',
        entityId: result.product.id,
        after: {
          name: result.product.name,
          productCode,
          gender: input.gender,
          sizeCount: result.variants.length,
        },
      });
      if (result.adjustment) {
        await recordAudit({
          organizationId,
          actorUserId,
          action: 'create',
          entityTable: 'stock_adjustments',
          entityId: result.adjustment.id,
          after: { reasonCode: 'opening_stock', productId: result.product.id },
        });
      }

      return result;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AppError('CONFLICT', 'A variant with this SKU already exists -- please retry (product code collision)');
      }
      throw err;
    }
  },

  async update(organizationId: string, id: string, actorUserId: string, input: UpdateProductInput) {
    const before = await productsRepository.findById(organizationId, id);
    if (!before) throw new AppError('NOT_FOUND', 'Product not found');

    await assertReferencesBelongToOrg(organizationId, {
      categoryId: input.categoryId ?? undefined,
      brandId: input.brandId ?? undefined,
      unitId: input.unitId,
      taxId: input.taxId ?? undefined,
    });

    const updated = await productsRepository.updateProduct(organizationId, id, actorUserId, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.categoryId !== undefined && { category_id: input.categoryId }),
      ...(input.brandId !== undefined && { brand_id: input.brandId }),
      ...(input.unitId !== undefined && { unit_id: input.unitId }),
      ...(input.taxId !== undefined && { tax_id: input.taxId }),
      ...(input.hsnCode !== undefined && { hsn_code: input.hsnCode }),
      ...(input.isActive !== undefined && { is_active: input.isActive }),
    });

    await recordAudit({
      organizationId,
      actorUserId,
      action: 'update',
      entityTable: 'products',
      entityId: id,
      before: { name: before.name },
      after: { name: updated.name },
    });

    return updated;
  },

  async remove(organizationId: string, id: string, actorUserId: string) {
    const before = await productsRepository.findById(organizationId, id);
    if (!before) throw new AppError('NOT_FOUND', 'Product not found');

    await productsRepository.softDeleteProduct(organizationId, id, actorUserId);
    await recordAudit({
      organizationId,
      actorUserId,
      action: 'delete',
      entityTable: 'products',
      entityId: id,
      before: { name: before.name },
    });
  },

  async addVariant(organizationId: string, productId: string, actorUserId: string, input: VariantInput) {
    const product = await productsRepository.findById(organizationId, productId);
    if (!product) throw new AppError('NOT_FOUND', 'Product not found');

    const generatedBarcode = input.barcode?.trim() ? undefined : await generateUniqueBarcode(organizationId);
    const generatedSku = input.sku?.trim() ? undefined : await generateUniqueSku(organizationId, product.name);

    try {
      const variant = await db
        .transaction()
        .execute((trx) =>
          productsRepository.createVariant(
            trx,
            organizationId,
            productId,
            actorUserId,
            toVariantValues(input, generatedBarcode, generatedSku),
          ),
        );

      await recordAudit({
        organizationId,
        actorUserId,
        action: 'create',
        entityTable: 'product_variants',
        entityId: variant.id,
        after: { sku: variant.sku },
      });

      return variant;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AppError('CONFLICT', 'A variant with this SKU or barcode already exists');
      }
      throw err;
    }
  },

  async updateVariant(organizationId: string, variantId: string, actorUserId: string, input: UpdateVariantInput) {
    const before = await productsRepository.findVariantById(organizationId, variantId);
    if (!before) throw new AppError('NOT_FOUND', 'Variant not found');

    try {
      const updated = await productsRepository.updateVariant(organizationId, variantId, actorUserId, {
        ...(input.sku !== undefined && { sku: input.sku }),
        ...(input.barcode !== undefined && { barcode: input.barcode }),
        ...(input.attributes !== undefined && { attributes: JSON.stringify(input.attributes) }),
        ...(input.mrp !== undefined && { mrp: input.mrp }),
        ...(input.sellingPrice !== undefined && { selling_price: input.sellingPrice }),
        ...(input.purchasePrice !== undefined && { purchase_price: input.purchasePrice }),
        ...(input.reorderLevel !== undefined && { reorder_level: input.reorderLevel }),
        ...(input.isActive !== undefined && { is_active: input.isActive }),
      });

      await recordAudit({
        organizationId,
        actorUserId,
        action: 'update',
        entityTable: 'product_variants',
        entityId: variantId,
        before: { sku: before.sku, sellingPrice: before.selling_price },
        after: { sku: updated.sku, sellingPrice: updated.selling_price },
      });

      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AppError('CONFLICT', 'A variant with this SKU or barcode already exists');
      }
      throw err;
    }
  },

  /**
   * Soft-deletes a single variant (one size/colour of a product), leaving
   * the parent product intact.
   *
   * Refuses to remove the last remaining variant, because the schema treats
   * "a product always has at least one variant" as an invariant — even a
   * simple product carries exactly one row (docs/03-database-design.md §10),
   * and that's what keeps stock, pricing and POS search uniform between
   * simple and variant products. A product with zero variants would be
   * invisible at the till and unpriceable. Deleting the whole product is the
   * right action there, so the error says so.
   */
  async removeVariant(organizationId: string, productId: string, variantId: string, actorUserId: string) {
    const product = await productsRepository.findById(organizationId, productId);
    if (!product) throw new AppError('NOT_FOUND', 'Product not found');

    const variant = await productsRepository.findVariantById(organizationId, variantId);
    if (!variant || variant.product_id !== productId) {
      throw new AppError('NOT_FOUND', 'Variant not found on this product');
    }

    const remaining = await productsRepository.countActiveVariants(productId);
    if (remaining <= 1) {
      throw new AppError(
        'BUSINESS_RULE_VIOLATION',
        'This is the product\'s only variant — delete the product itself instead of its last variant',
      );
    }

    await productsRepository.softDeleteVariant(organizationId, variantId, actorUserId);

    await recordAudit({
      organizationId,
      actorUserId,
      action: 'delete',
      entityTable: 'product_variants',
      entityId: variantId,
      before: { sku: variant.sku, productId },
    });
  },

  async addImage(organizationId: string, productId: string, actorUserId: string, s3Key: string, sortOrder: number) {
    const product = await productsRepository.findById(organizationId, productId);
    if (!product) throw new AppError('NOT_FOUND', 'Product not found');

    const image = await productsRepository.addImage(productId, s3Key, sortOrder);

    await recordAudit({
      organizationId,
      actorUserId,
      action: 'create',
      entityTable: 'product_images',
      entityId: image.id,
      after: { s3Key },
    });

    return image;
  },

  async removeImage(organizationId: string, productId: string, imageId: string, actorUserId: string) {
    const product = await productsRepository.findById(organizationId, productId);
    if (!product) throw new AppError('NOT_FOUND', 'Product not found');

    await productsRepository.removeImage(productId, imageId);

    await recordAudit({
      organizationId,
      actorUserId,
      action: 'delete',
      entityTable: 'product_images',
      entityId: imageId,
    });
  },
};
