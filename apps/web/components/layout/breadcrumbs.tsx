'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';

/**
 * Breadcrumbs derived from the URL, so every page gets them automatically
 * rather than each screen hand-rolling its own trail (and drifting).
 *
 * Segments that look like an id (UUID, or the 5-digit product codes this
 * app generates) are rendered as a neutral label instead of dumping a raw
 * identifier into the UI — the page heading already names the record.
 */

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  pos: 'Point of Sale',
  products: 'Products',
  new: 'New',
  'new-clothing': 'New clothing product',
  inventory: 'Inventory',
  customers: 'Customers',
  suppliers: 'Suppliers',
  'purchase-orders': 'Purchasing',
  sales: 'Sales',
  reports: 'Reports',
  expenses: 'Expenses',
  settings: 'Settings',
  organization: 'Organization',
  stores: 'Stores & Branches',
  users: 'Users & Roles',
  catalog: 'Catalog Setup',
  'audit-log': 'Audit Log',
  print: 'Print',
  barcodes: 'Barcode labels',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isIdSegment(segment: string): boolean {
  return UUID_RE.test(segment) || /^\d{4,}$/.test(segment);
}

function labelFor(segment: string): string {
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment];
  if (isIdSegment(segment)) return 'Details';
  // Fallback: turn "some-segment" into "Some segment".
  return segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  // The dashboard is the crumb root, so showing "Home / Dashboard" on the
  // dashboard itself would be redundant.
  if (segments.length === 0 || (segments.length === 1 && segments[0] === 'dashboard')) {
    return null;
  }

  const crumbs = segments.map((segment, index) => ({
    label: labelFor(segment),
    href: `/${segments.slice(0, index + 1).join('/')}`,
    isLast: index === segments.length - 1,
    // Intermediate segments that aren't real routes (e.g. the "settings"
    // part of /settings/catalog) shouldn't be clickable.
    isNavigable: segment !== 'settings',
  }));

  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-label-sm text-on-surface-variant">
      <Link
        href="/dashboard"
        className="flex items-center gap-1 rounded px-1.5 py-1 transition-colors duration-150 ease-smooth hover:bg-surface-container hover:text-on-surface"
      >
        <Home className="h-3.5 w-3.5" />
        <span className="sr-only">Dashboard</span>
      </Link>

      {crumbs.map((crumb) => (
        <span key={crumb.href} className="flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5 text-outline-variant" />
          {crumb.isLast || !crumb.isNavigable ? (
            <span className={crumb.isLast ? 'px-1.5 py-1 font-semibold text-on-surface' : 'px-1.5 py-1'}>
              {crumb.label}
            </span>
          ) : (
            <Link
              href={crumb.href}
              className="rounded px-1.5 py-1 transition-colors duration-150 ease-smooth hover:bg-surface-container hover:text-on-surface"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
