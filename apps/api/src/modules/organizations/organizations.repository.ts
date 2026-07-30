import { db } from '../../shared/db';

export const organizationsRepository = {
  findById(id: string) {
    return db
      .selectFrom('organizations')
      .selectAll()
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  },

  update(
    id: string,
    values: Partial<{
      legal_name: string;
      display_name: string;
      business_type: string;
      default_currency: string;
      timezone: string;
    }>,
  ) {
    return db.updateTable('organizations').set(values).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
  },
};
