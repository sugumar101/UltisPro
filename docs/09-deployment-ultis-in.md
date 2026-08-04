# Superseded

This described a subpath deployment (`www.ultis.in/retailpro`) on Namecheap shared hosting. Both decisions changed:

- **Hosting** — Namecheap shared hosting can't run a persistent Node process on the entry plan, and offers no PostgreSQL. Deployment moved to Railway.
- **URL shape** — subdomains (`app.ultifashions.com` / `api.ultifashions.com`) replaced the `/retailpro` subpath, which removes a whole class of path-prefix bugs.

See **`09-deployment-railway.md`**.

The subpath *support* remains in the code (`NEXT_PUBLIC_BASE_PATH`, `PUBLIC_PATH_PREFIX`, `lib/app-url.ts`) and is inert when unset — worth keeping, since re-deriving it correctly later is fiddly.

*This file can be deleted once nothing links to it.*
