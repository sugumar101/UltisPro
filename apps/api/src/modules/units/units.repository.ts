import { db } from '../../shared/db';

interface UnitWritableFields {
  name: string;
  symbol: string;
  base_unit_id?: string;
  conversion_factor?: number;
}

export const unitsRepository = {
  list(organizationId: string) {
    return db
      .selectFrom('units')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('deleted_at', 'is', null)
      .orderBy('name', 'asc')
      .execute();
  },

  findById(organizationId: string, id: string) {
    return db
      .selectFrom('units')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  },

  /** Used by the clothing product flow to auto-resolve the "Piece" unit seeded at org signup (auth.service.ts) rather than exposing a unit picker on that form. */
  findByName(organizationId: string, name: string) {
    return db
      .selectFrom('units')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('name', '=', name)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  },

  create(organizationId: string, actorUserId: string, values: UnitWritableFields) {
    return db
      .insertInto('units')
      .values({ organization_id: organizationId, created_by: actorUserId, updated_by: actorUserId, ...values })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  update(
    organizationId: string,
    id: string,
    actorUserId: string,
    values: Partial<UnitWritableFields & { base_unit_id: string | null }>,
  ) {
    return db
      .updateTable('units')
      .set({ ...values, updated_by: actorUserId })
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  softDelete(organizationId: string, id: string, actorUserId: string) {
    return db
      .updateTable('units')
      .set({ deleted_at: new Date(), updated_by: actorUserId })
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },
};
