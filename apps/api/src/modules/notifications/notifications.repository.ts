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

  /** Used to avoid re-notifying about a condition (e.g. the same low-stock variant) that's already unread. */
  findUnreadByReference(organizationId: string, referenceTable: string, referenceId: string) {
    return db
      .selectFrom('notifications')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('reference_table', '=', referenceTable)
      .where('reference_id', '=', referenceId)
      .where('read_at', 'is', null)
      .executeTakeFirst();
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
