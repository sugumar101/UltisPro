/**
 * Path helpers for a deployment served under a URL subpath.
 *
 * Next automatically prefixes `<Link>` hrefs, `router.push()` and static
 * asset URLs with `basePath` — but **not** paths passed to `window.open()`
 * or `window.location`. Those are raw browser navigations that Next never
 * sees, so a hardcoded `/sales/123/print` resolves against the domain root
 * and 404s once the app moves to `/retailpro`.
 *
 * Every manual navigation therefore goes through `appPath()`. Keeping it in
 * one place also means moving or removing the prefix later is a single
 * environment change rather than a hunt through the codebase.
 */

/** Configured at build time by next.config.mjs; empty when served from the domain root. */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/**
 * Prefixes an in-app path with the deployment's base path.
 *
 *   appPath('/sales/123/print')  ->  '/retailpro/sales/123/print'
 *   appPath('/sales/123/print')  ->  '/sales/123/print'            (no basePath)
 */
export function appPath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${BASE_PATH}${normalized}`;
}

/** Absolute in-app URL, for links that leave the browser (messages, emails, QR codes). */
export function appUrl(path: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${appPath(path)}`;
}

/**
 * Opens an in-app path in a new window/tab with the base path applied.
 * Used for print views and the barcode label sheet.
 */
export function openAppWindow(path: string, features?: string): Window | null {
  return window.open(appPath(path), '_blank', features);
}
