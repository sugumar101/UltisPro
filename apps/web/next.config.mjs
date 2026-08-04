/**
 * @type {import('next').NextConfig}
 *
 * Deployed at a domain root (https://app.ultifashions.com), so `basePath`
 * is normally empty.
 *
 * Subpath support is kept because it costs nothing and is easy to get
 * subtly wrong later: setting NEXT_PUBLIC_BASE_PATH makes Next prefix every
 * route, `<Link>` and asset URL. Without it, an app served from a subpath
 * loads but then requests its own JS from the domain root and renders
 * blank.
 *
 * The value is mirrored into a NEXT_PUBLIC_ variable because `basePath`
 * itself isn't readable from client code, and `lib/app-url.ts` needs it
 * when building absolute URLs by hand — notably the public bill link sent
 * to customers, which would 404 without the prefix.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const nextConfig = {
  reactStrictMode: true,

  ...(basePath ? { basePath } : {}),

  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.amazonaws.com' }],
  },

  // The API returns its own errors; don't advertise the framework version.
  poweredByHeader: false,
};

export default nextConfig;
