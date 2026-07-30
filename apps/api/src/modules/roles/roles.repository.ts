import { db } from '../../shared/db';

export const rolesRepository = {
  findById(id: string) {
    return db.selectFrom('roles').selectAll().where('id', '=', id).where('deleted_at', 'is', null).executeTakeFirst();
  },

  /** System roles (organization_id IS NULL) plus any custom roles for this org (custom roles are FR USR-03, P1 — none exist yet). */
  listAvailable(organizationId: string) {
    return db
      .selectFrom('roles')
      .selectAll()
      .where('deleted_at', 'is', null)
      .where((eb) => eb.or([eb('organization_id', 'is', null), eb('organization_id', '=', organizationId)]))
      .orderBy('is_system', 'desc')
      .orderBy('name', 'asc')
      .execute();
  },

  listPermissionsForRole(roleId: string) {
    return db
      .selectFrom('role_permissions')
      .innerJoin('permissions', 'permissions.id', 'role_permissions.permission_id')
      .select(['permissions.code as code', 'permissions.module as module', 'permissions.description as description'])
      .where('role_permissions.role_id', '=', roleId)
      .execute();
  },

  listAllPermissions() {
    return db.selectFrom('permissions').selectAll().orderBy('module', 'asc').execute();
  },
};
