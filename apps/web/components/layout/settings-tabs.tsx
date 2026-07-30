import Link from 'next/link';

const TABS = [
  { key: 'organization', href: '/settings/organization', label: 'Organization' },
  { key: 'stores', href: '/settings/stores', label: 'Stores & Branches' },
  { key: 'users', href: '/settings/users', label: 'Users' },
  { key: 'catalog', href: '/settings/catalog', label: 'Catalog Setup' },
  { key: 'audit-log', href: '/settings/audit-log', label: 'Audit Log' },
] as const;

export function SettingsTabs({ active }: { active: (typeof TABS)[number]['key'] }) {
  return (
    <div className="mt-4 flex gap-2 border-b border-outline-variant">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`px-4 py-2 text-body-md font-semibold ${
            active === tab.key
              ? 'border-b-2 border-primary text-primary'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
