import { db } from '../../shared/db';

export const notificationsRepository = {
  /** Notifications addressed to this user specifically, plus org-wide broadcasts (user_id IS NULL). */
  listForUser(organizationId: string, userId: string, limit: number) {
    return db
      .selectFrom('notifications')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where((eb) => eb.or([eb('user_id', '=', userId), eb('user_id', 'is', null)]))
      .orderBy('created_at', 'desc')
      .limit(limit)
      .execute();
  },

  /**
   * All reference ids in a table that already have an unread notification,
   * as a Set for O(1) membership checks.
   *
   * Replaces a per-condition `findUnreadByReference` call. That version ran
   * one query *per low-stock item* on every notification poll — with the
   * bell polling every 60s per logged-in user, a shop with 40 low-stock
   * SKUs and 5 staff generated ~200 queries a minute while completely idle.
   * The cost scaled with users x conditions, which is exactly the wrong
   * shape. One query per table per poll instead.
   */
  async unreadReferenceIds(organizationId: string, referenceTable: string): Promise<Set<string>> {
    const rows = await db
      .selectFrom('notifications')
      .select('reference_id')
      .where('organization_id', '=', organizationId)
      .where('reference_table', '=', referenceTable)
      .where('read_at', 'is', null)
      .where('reference_id', 'is not', null)
      .execute();

    return new Set(rows.map((row) => row.reference_id as string));
  },

  create(values: {
    organization_id: string;
    user_id: string | null;
    type: string;
    title: string;
    body: string | null;
    reference_table: string | null;
    reference_id: string | null;
  }) {
    return db.insertInto('notifications').values(values).returningAll().executeTakeFirstOrThrow();
  },

  /** Single multi-row insert — one round trip regardless of how many conditions fired. */
  async createMany(
    rows: {
      organization_id: string;
      user_id: string | null;
      type: string;
      title: string;
      body: string | null;
      reference_table: string | null;
      reference_id: string | null;
    }[],
  ): Promise<void> {
    if (rows.length === 0) return;
    await db.insertInto('notifications').values(rows).execute();
  },

  findById(organizationId: string, id: string) {
    return db
      .selectFrom('notifications')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .executeTakeFirst();
  },

  markRead(id: string) {
    return db.updateTable('notifications').set({ read_at: new Date() }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
  },
};
