# Correctness-first multi-stage build (see api.Dockerfile note on npm ci vs install).

FROM node:24-alpine AS build
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build --workspace=@ultispro/shared-types
RUN npm run build --workspace=@ultispro/web

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/web/.next ./apps/web/.next
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["npx", "next", "start"]
