'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ComponentType, ReactNode } from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Warehouse,
  Users,
  Truck,
  ClipboardList,
  Receipt,
  BarChart3,
  Wallet,
  Settings,
  LogOut,
} from 'lucide-react';
import { PERMISSIONS } from '@ultispro/shared-types';
import { useAuthStore, hasPermission } from '../../lib/stores/auth-store';
import { logout as logoutApi } from '../../lib/auth-api';
import { NotificationBell } from './notification-bell';
import { Breadcrumbs } from './breadcrumbs';

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  enabled: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, enabled: true },
  { href: '/pos', label: 'POS', icon: ShoppingCart, enabled: true },
  { href: '/products', label: 'Products', icon: Package, enabled: true },
  { href: '/inventory', label: 'Inventory', icon: Warehouse, enabled: true },
  { href: '/customers', label: 'Customers', icon: Users, enabled: true },
  { href: '/suppliers', label: 'Suppliers', icon: Truck, enabled: true },
  { href: '/purchase-orders', label: 'Purchasing', icon: ClipboardList, enabled: true },
  { href: '/sales', label: 'Sales', icon: Receipt, enabled: true },
  { href: '/reports', label: 'Reports', icon: BarChart3, enabled: true },
  { href: '/expenses', label: 'Expenses', icon: Wallet, enabled: true },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const assignments = useAuthStore((s) => s.assignments);
  const clear = useAuthStore((s) => s.clear);

  const canSeeSettings =
    hasPermission(assignments, PERMISSIONS.SETTINGS_MANAGE) || hasPermission(assignments, PERMISSIONS.ORG_MANAGE);

  async function handleLogout() {
    try {
      await logoutApi();
    } finally {
      clear();
      router.replace('/login');
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <aside className="no-print fixed left-0 top-0 z-50 flex h-full w-sidebar-width flex-col border-r border-outline-variant bg-surface-container-lowest">
        <div className="flex items-center gap-2.5 px-5 py-5">
          {/* Gradient mark — the one place a brand gradient earns its keep. */}
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gradient-to-br from-primary to-secondary shadow-sm">
            <span className="text-title-sm font-bold text-on-primary">U</span>
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-title-sm font-bold tracking-tight text-on-surface">UltisPro</h1>
            <p className="truncate text-[11px] text-on-surface-variant">Retail Suite</p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
            />
          ))}
          {canSeeSettings ? (
            <NavLink
              item={{ href: '/settings/organization', label: 'Settings', icon: Settings, enabled: true }}
              active={pathname.startsWith('/settings')}
            />
          ) : null}
        </nav>

        <div className="border-t border-outline-variant p-3">
          <div className="flex items-center gap-2.5 rounded-md px-2 py-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-container to-secondary-container">
              <span className="text-label-sm font-bold text-on-primary-container">
                {user?.fullName?.charAt(0).toUpperCase() ?? '?'}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-md font-semibold text-on-surface">{user?.fullName}</p>
              <p className="truncate text-[11px] text-on-surface-variant">{user?.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-body-md font-medium text-on-surface-variant transition-all duration-200 ease-smooth hover:bg-error-container hover:text-on-error-container"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="ml-sidebar-width">
        <header className="no-print sticky top-0 z-40 flex h-top-nav-height items-center justify-between border-b border-outline-variant bg-surface-bright/80 px-gutter backdrop-blur-md">
          <div />
          <div className="flex items-center gap-3">
            <NotificationBell />
            <div className="flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container-low py-1 pl-3 pr-2">
              <span className="text-label-sm font-semibold text-on-surface">
                {assignments[0]?.roleName ?? 'No role'}
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
            </div>
          </div>
        </header>

        <main className="animate-fade-in-up p-container-padding">
          <Breadcrumbs />
          {children}
        </main>
      </div>
    </div>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;

  if (!item.enabled) {
    return (
      <div
        className="flex h-10 cursor-not-allowed items-center rounded-md px-3 text-on-surface-variant/40"
        title="Ships in a later phase — see docs/05-development-roadmap.md"
      >
        <Icon className="mr-2.5 h-[18px] w-[18px]" />
        <span className="text-body-md">{item.label}</span>
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      className={`group relative flex h-10 items-center rounded-md px-3 transition-all duration-200 ease-smooth ${
        active
          ? 'bg-primary-container font-semibold text-on-primary-container'
          : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
      }`}
    >
      {/* Active indicator rail — fades rather than popping in. */}
      <span
        className={`absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary transition-opacity duration-200 ease-smooth ${
          active ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <Icon
        className={`mr-2.5 h-[18px] w-[18px] transition-transform duration-200 ease-smooth ${
          active ? '' : 'group-hover:scale-110'
        }`}
      />
      <span className="text-body-md">{item.label}</span>
    </Link>
  );
}
