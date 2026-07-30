/**
 * Canonical permission codes ("module:action"), the single source of truth
 * for RBAC checks on the API (middleware) and conditional rendering on the
 * web app. See docs/02-system-architecture.md §4 and
 * docs/03-database-design.md §4 (permissions table).
 *
 * This list grows module-by-module as each one is built (docs/05-development-roadmap.md).
 * Phase 0 declares the shape only; nothing enforces these yet until the
 * real Auth/RBAC module (M1/M3) lands in Phase 1.
 */
export const PERMISSIONS = {
  ORG_MANAGE: 'org:manage',
  USERS_MANAGE: 'users:manage',
  ROLES_MANAGE: 'roles:manage',
  PRODUCTS_VIEW: 'products:view',
  PRODUCTS_MANAGE: 'products:manage',
  INVENTORY_VIEW: 'inventory:view',
  INVENTORY_ADJUST: 'inventory:adjust',
  INVENTORY_TRANSFER: 'inventory:transfer',
  SUPPLIERS_MANAGE: 'suppliers:manage',
  PURCHASE_ORDERS_MANAGE: 'purchase_orders:manage',
  PURCHASE_ORDERS_APPROVE: 'purchase_orders:approve',
  CUSTOMERS_MANAGE: 'customers:manage',
  SALES_CREATE: 'sales:create',
  SALES_DISCOUNT_APPROVE: 'sales:discount:approve',
  SALES_RETURN: 'sales:return',
  EXPENSES_MANAGE: 'expenses:manage',
  REPORTS_VIEW: 'reports:view',
  AUDIT_VIEW: 'audit:view',
  SETTINGS_MANAGE: 'settings:manage',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
