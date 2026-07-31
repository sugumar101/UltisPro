import { sql, type Transaction } from 'kysely';
import { db, type Database } from '../../shared/db';
import type { ListProductsQuery } from './products.dto';

interface ProductWritableFields {
  name: string;
  unit_id: string;
  has_variants?: boolean;
  track_batches?: boolean;
  description?: string;
  category_id?: string;
  brand_id?: string;
  tax_id?: string;
  hsn_code?: string;
  // Clothing product flow only (docs/03-database-design.md §19) -- left
  // undefined for every product created via the generic create() path.
  product_type_id?: string;
  product_category_id?: string;
  gender?: string;
  product_code?: string;
}

interface VariantWritableFields {
  sku: string;
  attributes: string; // JSON.stringify'd — see ProductVariantsTable in shared/db.ts
  mrp: number;
  selling_price: number;
  purchase_price?: number;
  reorder_level?: number;
  barcode?: string;
}

export const productsRepository = {
  async list(organizationId: string, query: ListProductsQuery) {
    let listQuery = db
      .selectFrom('products')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('deleted_at', 'is', null);

    let countQuery = db
      .selectFrom('products')
      .select(({ fn }) => [fn.countAll<string>().as('count')])
      .where('organization_id', '=', organizationId)
      .where('deleted_at', 'is', null);

    if (query.categoryId) {
      listQuery = listQuery.where('category_id', '=', query.categoryId);
      countQuery = countQuery.where('category_id', '=', query.categoryId);
    }
    if (query.brandId) {
      listQuery = listQuery.where('brand_id', '=', query.brandId);
      countQuery = countQuery.where('brand_id', '=', query.brandId);
    }
    if (query.q) {
      listQuery = listQuery.where('name', 'ilike', `%${query.q}%`);
      countQuery = countQuery.where('name', 'ilike', `%${query.q}%`);
    }

    const [rows, countRow] = await Promise.all([
      listQuery
        .orderBy('created_at', 'desc')
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize)
        .execute(),
      countQuery.executeTakeFirst(),
    ]);

    return { rows, total: Number(countRow?.count ?? 0) };
  },

  /**
   * Stock on hand and live variant count for a set of products, summed
   * across every branch.
   *
   * Deliberately a second query rather than a join into `list()` above: a
   * product joins to N variants which join to M branch_stock rows, so
   * folding it into the paginated query would multiply rows and break both
   * `LIMIT` and the total count. Running it over just the current page's ids
   * keeps it to one extra round trip regardless of catalog size.
   */
  async stockForProducts(organizationId: string, productIds: string[]) {
    if (productIds.length === 0) return new Map<string, { totalStock: number; variantCount: number }>();

    const rows = await db
      .selectFrom('product_variants as pv')
      .leftJoin('branch_stock as bs', 'bs.product_variant_id', 'pv.id')
      .select(({ fn }) => [
        'pv.product_id as productId',
        fn.sum<string>(fn.coalesce('bs.quantity_on_hand', sql<number>`0`)).as('totalStock'),
        fn.count<string>('pv.id').distinct().as('variantCount'),
      ])
      .where('pv.organization_id', '=', organizationId)
      .where('pv.product_id', 'in', productIds)
      .where('pv.deleted_at', 'is', null)
      .groupBy('pv.product_id')
      .execute();

    return new Map(
      rows.map((row) => [
        row.productId,
        { totalStock: Number(row.totalStock ?? 0), variantCount: Number(row.variantCount ?? 0) },
      ]),
    );
  },

  findById(organizationId: string, id: string) {
    return db
      .selectFrom('products')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  },

  /** Used by the clothing product code generator to pick an unused 5-digit code before starting the create transaction. */
  async existsWithCode(organizationId: string, code: string): Promise<boolean> {
    const row = await db
      .selectFrom('products')
      .select('id')
      .where('organization_id', '=', organizationId)
      .where('product_code', '=', code)
      .executeTakeFirst();
    return row !== undefined;
  },

  /**
   * Barcode collision check for auto-generated EAN-13s. Intentionally does
   * NOT filter on `deleted_at` — a soft-deleted variant still occupies its
   * barcode as far as the `UNIQUE (organization_id, barcode)` constraint is
   * concerned, so ignoring deleted rows here would hand back a barcode that
   * then fails to insert.
   */
  /** SKU collision check. Ignores `deleted_at` for the same reason as barcodes — the UNIQUE constraint doesn't. */
  async existsWithSku(organizationId: string, sku: string): Promise<boolean> {
    const row = await db
      .selectFrom('product_variants')
      .select('id')
      .where('organization_id', '=', organizationId)
      .where('sku', '=', sku)
      .executeTakeFirst();
    return row !== undefined;
  },

  async existsWithBarcode(organizationId: string, barcode: string): Promise<boolean> {
    const row = await db
      .selectFrom('product_variants')
      .select('id')
      .where('organization_id', '=', organizationId)
      .where('barcode', '=', barcode)
      .executeTakeFirst();
    return row !== undefined;
  },

  listVariantsForProduct(productId: string) {
    return db
      .selectFrom('product_variants')
      .selectAll()
      .where('product_id', '=', productId)
      .where('deleted_at', 'is', null)
      .orderBy('created_at', 'asc')
      .execute();
  },

  findVariantById(organizationId: string, id: string) {
    return db
      .selectFrom('product_variants')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  },

  listImagesForProduct(productId: string) {
    return db
      .selectFrom('product_images')
      .selectAll()
      .where('product_id', '=', productId)
      .orderBy('sort_order', 'asc')
      .execute();
  },

  createProduct(
    trx: Transaction<Database>,
    organizationId: string,
    actorUserId: string,
    values: ProductWritableFields,
  ) {
    return trx
      .insertInto('products')
      .values({ organization_id: organizationId, created_by: actorUserId, updated_by: actorUserId, ...values })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  createVariant(
    trx: Transaction<Database>,
    organizationId: string,
    productId: string,
    actorUserId: string,
    values: VariantWritableFields,
  ) {
    return trx
      .insertInto('product_variants')
      .values({
        organization_id: organizationId,
        product_id: productId,
        created_by: actorUserId,
        updated_by: actorUserId,
        ...values,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  updateProduct(
    organizationId: string,
    id: string,
    actorUserId: string,
    values: Partial<ProductWritableFields & { is_active: boolean }>,
  ) {
    return db
      .updateTable('products')
      .set({ ...values, updated_by: actorUserId })
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  updateVariant(
    organizationId: string,
    id: string,
    actorUserId: string,
    values: Partial<VariantWritableFields & { is_active: boolean }>,
  ) {
    return db
      .updateTable('product_variants')
      .set({ ...values, updated_by: actorUserId })
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  /** Count of live variants on a product — guards against deleting the last one. */
  async countActiveVariants(productId: string): Promise<number> {
    const row = await db
      .selectFrom('product_variants')
      .select(({ fn }) => [fn.countAll<string>().as('count')])
      .where('product_id', '=', productId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    return Number(row?.count ?? 0);
  },

  softDeleteVariant(organizationId: string, id: string, actorUserId: string) {
    return db
      .updateTable('product_variants')
      .set({ deleted_at: new Date(), updated_by: actorUserId })
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  softDeleteProduct(organizationId: string, id: string, actorUserId: string) {
    return db
      .updateTable('products')
      .set({ deleted_at: new Date(), updated_by: actorUserId })
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  addImage(productId: string, s3Key: string, sortOrder: number) {
    return db
      .insertInto('product_images')
      .values({ product_id: productId, s3_key: s3Key, sort_order: sortOrder })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  async removeImage(productId: string, imageId: string): Promise<void> {
    await db.deleteFrom('product_images').where('product_id', '=', productId).where('id', '=', imageId).execute();
  },
};
