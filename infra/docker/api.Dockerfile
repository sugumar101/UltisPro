# Correctness-first multi-stage build. No lockfile exists yet in this repo
# (see root README.md), so this uses `npm install` rather than `npm ci` for
# now; switch to `npm ci` once package-lock.json is committed, for
# reproducible, faster installs.

FROM node:24-alpine AS build
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build --workspace=@ultispro/shared-types
RUN npm run build --workspace=@ultispro/api

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/migrations ./apps/api/migrations
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/server.js"]
