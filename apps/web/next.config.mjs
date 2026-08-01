/**
 * @type {import('next').NextConfig}
 *
 * Deployed under a URL subpath (https://www.ultis.in/retailpro) rather than
 * at a domain root.
 *
 * `basePath` makes Next prefix every route, `<Link>`, and static asset URL
 * automatically — without it the app would load at /retailpro but then
 * request its own JS from /_next/... at the domain root and render a blank
 * page. It is read from the environment so the same build can be deployed
 * at the root (leave it unset) or under a path, and so local development
 * doesn't have to run under a prefix.
 *
 * NEXT_PUBLIC_BASE_PATH is duplicated as a public env var because
 * `basePath` itself isn't readable from client code, and application code
 * needs it when constructing absolute URLs by hand — notably the public
 * bill link (lib/share-bill.ts), which is sent to customers and must
 * include the prefix or it 404s.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const nextConfig = {
  reactStrictMode: true,

  ...(basePath ? { basePath } : {}),

  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.amazonaws.com' }],
  },

  // Emits a self-contained server bundle with only the node_modules actually
  // reached at runtime. Matters on constrained hosting (a cPanel Node app,
  // a small VPS) where copying a full node_modules tree is slow and may not
  // even fit within the account's inode limit.
  output: 'standalone',

  // The API returns its own errors; don't leak the framework version.
  poweredByHeader: false,
};

export default nextConfig;
