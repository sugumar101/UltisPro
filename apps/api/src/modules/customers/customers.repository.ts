import type { Transaction } from 'kysely';
import { db, type Database } from '../../shared/db';
import type { ListCustomersQuery } from './customers.dto';

interface CustomerWritableFields {
  full_name?: string;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  credit_limit?: number;
  marketing_opt_in?: boolean;
  marketing_consent_at?: Date | null;
}

export const customersRepository = {
  findWalkin(organizationId: string) {
    return db
      .selectFrom('customers')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('is_walkin', '=', true)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  },

  async list(organizationId: string, query: ListCustomersQuery) {
    let listQuery = db
      .selectFrom('customers')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('deleted_at', 'is', null);
    let countQuery = db
      .selectFrom('customers')
      .select(({ fn }) => [fn.countAll<string>().as('count')])
      .where('organization_id', '=', organizationId)
      .where('deleted_at', 'is', null);

    if (query.q) {
      listQuery = listQuery.where((eb) =>
        eb.or([eb('full_name', 'ilike', `%${query.q}%`), eb('phone', 'ilike', `%${query.q}%`)]),
      );
      countQuery = countQuery.where((eb) =>
        eb.or([eb('full_name', 'ilike', `%${query.q}%`), eb('phone', 'ilike', `%${query.q}%`)]),
      );
    }

    const [rows, countRow] = await Promise.all([
      listQuery
        .orderBy('full_name', 'asc')
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize)
        .execute(),
      countQuery.executeTakeFirst(),
    ]);

    return { rows, total: Number(countRow?.count ?? 0) };
  },

  findById(organizationId: string, id: string) {
    return db
      .selectFrom('customers')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  },

  /**
   * Exact lookup on the normalised phone number — the counter's "who is
   * this?" query.
   *
   * Also matches rows whose stored phone merely *ends with* the normalised
   * digits, so customers created before normalisation existed (saved as
   * `+91 98765 43210`) are still found. Walk-in is excluded: it's a shared
   * placeholder, not a person, and must never be returned as a recognised
   * customer.
   */
  findByPhone(organizationId: string, normalizedPhone: string) {
    return db
      .selectFrom('customers')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('deleted_at', 'is', null)
      .where('is_walkin', '=', false)
      .where((eb) =>
        eb.or([eb('phone', '=', normalizedPhone), eb('phone', 'like', `%${normalizedPhone}`)]),
      )
      .orderBy('created_at', 'asc')
      .executeTakeFirst();
  },

  create(organizationId: string, actorUserId: string, values: CustomerWritableFields & { full_name: string }) {
    return db
      .insertInto('customers')
      .values({ organization_id: organizationId, created_by: actorUserId, updated_by: actorUserId, ...values })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  /** Used once, from registerOrganization()'s transaction, to seed the default walk-in customer. */
  createWalkin(trx: Transaction<Database>, organizationId: string, actorUserId: string) {
    return trx
      .insertInto('customers')
      .values({
        organization_id: organizationId,
        full_name: 'Walk-in Customer',
        is_walkin: true,
        created_by: actorUserId,
        updated_by: actorUserId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  update(organizationId: string, id: string, actorUserId: string, values: CustomerWritableFields) {
    return db
      .updateTable('customers')
      .set({ ...values, updated_by: actorUserId })
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  softDelete(organizationId: string, id: string, actorUserId: string) {
    return db
      .updateTable('customers')
      .set({ deleted_at: new Date(), updated_by: actorUserId })
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  /**
   * Row-locked balance adjustment — mirrors
   * suppliers.repository.ts#adjustOutstandingBalance, and (as of Phase 5)
   * takes the same shape: it accepts an external transaction so callers that
   * need this adjustment to be atomic with other writes (e.g. Sales
   * checkout charging an on-account shortfall in the same transaction as
   * stock movements and invoice numbering) can compose it in, rather than
   * opening a nested transaction of its own. Positive delta is a charge
   * (sale on credit), negative is a payment/credit note.
   */
  async adjustOutstandingBalance(trx: Transaction<Database>, organizationId: string, id: string, delta: number) {
    const customer = await trx
      .selectFrom('customers')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirstOrThrow();

    const newBalance = Number(customer.outstanding_balance) + delta;

    return trx
      .updateTable('customers')
      .set({ outstanding_balance: newBalance })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  listAddresses(customerId: string) {
    return db.selectFrom('customer_addresses').selectAll().where('customer_id', '=', customerId).execute();
  },

  findAddressById(customerId: string, id: string) {
    return db
      .selectFrom('customer_addresses')
      .selectAll()
      .where('customer_id', '=', customerId)
      .where('id', '=', id)
      .executeTakeFirst();
  },

  async createAddress(
    customerId: string,
    values: { label?: string; line1?: string; city?: string; state?: string; postal_code?: string; is_default?: boolean },
  ) {
    if (values.is_default) {
      await db.updateTable('customer_addresses').set({ is_default: false }).where('customer_id', '=', customerId).execute();
    }
    return db
      .insertInto('customer_addresses')
      .values({ customer_id: customerId, ...values })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  async updateAddress(
    customerId: string,
    id: string,
    values: Partial<{ label: string; line1: string; city: string; state: string; postal_code: string; is_default: boolean }>,
  ) {
    if (values.is_default) {
      await db.updateTable('customer_addresses').set({ is_default: false }).where('customer_id', '=', customerId).execute();
    }
    return db
      .updateTable('customer_addresses')
      .set(values)
      .where('customer_id', '=', customerId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  removeAddress(customerId: string, id: string) {
    return db.deleteFrom('customer_addresses').where('customer_id', '=', customerId).where('id', '=', id).execute();
  },
};
