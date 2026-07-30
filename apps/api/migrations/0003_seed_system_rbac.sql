-- System permissions and system roles, shared across every tenant.
-- Permission codes must stay in lockstep with packages/shared-types/src/permissions.ts.

INSERT INTO permissions (code, module, description) VALUES
  ('org:manage',              'organizations',   'Manage organization-level settings'),
  ('users:manage',            'users',           'Create, edit, deactivate users'),
  ('roles:manage',            'roles',           'Create and edit custom roles'),
  ('products:view',           'products',        'View product catalog'),
  ('products:manage',        'products',        'Create and edit products'),
  ('inventory:view',          'inventory',       'View stock levels and ledger'),
  ('inventory:adjust',        'inventory',       'Perform manual stock adjustments'),
  ('inventory:transfer',      'inventory',       'Create and receive stock transfers'),
  ('suppliers:manage',        'suppliers',       'Manage supplier records'),
  ('purchase_orders:manage',  'purchase_orders', 'Create and edit purchase orders'),
  ('purchase_orders:approve', 'purchase_orders', 'Approve purchase orders'),
  ('customers:manage',        'customers',       'Manage customer records'),
  ('sales:create',            'sales',           'Create sales / operate POS'),
  ('sales:discount:approve',  'sales',           'Approve discounts above the standard threshold'),
  ('sales:return',            'sales',           'Process sales returns'),
  ('expenses:manage',         'expenses',        'Record and edit expenses'),
  ('reports:view',            'reports',         'View reports and analytics'),
  ('audit:view',              'audit',           'View the audit log'),
  ('settings:manage',         'settings',        'Manage organization/store settings')
ON CONFLICT (code) DO NOTHING;

-- organization_id = NULL marks these as system roles, visible to every tenant.
INSERT INTO roles (id, organization_id, name, is_system) VALUES
  ('00000000-0000-0000-0000-000000000001', NULL, 'Owner',            true),
  ('00000000-0000-0000-0000-000000000002', NULL, 'Manager',          true),
  ('00000000-0000-0000-0000-000000000003', NULL, 'Cashier',          true),
  ('00000000-0000-0000-0000-000000000004', NULL, 'Inventory Clerk',  true),
  ('00000000-0000-0000-0000-000000000005', NULL, 'Accountant',       true)
ON CONFLICT (id) DO NOTHING;

-- Owner: every permission.
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000001', id FROM permissions
ON CONFLICT DO NOTHING;

-- Manager: everything except organization-level and role-editing permissions.
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000002', id FROM permissions
WHERE code NOT IN ('org:manage', 'roles:manage')
ON CONFLICT DO NOTHING;

-- Cashier: POS-facing permissions only.
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000003', id FROM permissions
WHERE code IN ('products:view', 'inventory:view', 'customers:manage', 'sales:create', 'sales:return')
ON CONFLICT DO NOTHING;

-- Inventory Clerk: catalog + stock + procurement (not approval).
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000004', id FROM permissions
WHERE code IN (
  'products:view', 'products:manage', 'inventory:view', 'inventory:adjust',
  'inventory:transfer', 'suppliers:manage', 'purchase_orders:manage'
)
ON CONFLICT DO NOTHING;

-- Accountant: financial visibility and approval, no catalog/inventory edit rights.
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000005', id FROM permissions
WHERE code IN ('reports:view', 'expenses:manage', 'audit:view', 'purchase_orders:approve')
ON CONFLICT DO NOTHING;
