# Stage 1: Build stage
FROM node:20-alpine AS build

WORKDIR /app

# Copy monorepo manifests and configuration
COPY package.json package-lock.json tsconfig.base.json ./

# Copy package manifests for all workspace packages
COPY packages/protocol/package.json ./packages/protocol/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/realtime-gateway/package.json ./apps/realtime-gateway/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# Install dependencies for all workspace packages
RUN npm ci

# Copy source code for workspace packages and target application
COPY packages/protocol ./packages/protocol
COPY packages/shared-types ./packages/shared-types
COPY apps/realtime-gateway ./apps/realtime-gateway

# Build local workspace packages and the realtime gateway
RUN npm run build --workspace=@squadpuzzle/shared-types && \
    npm run build --workspace=@squadpuzzle/protocol && \
    npm run build --workspace=@squadpuzzle/realtime-gateway

# Stage 2: Production runtime stage
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

# Copy monorepo manifests and configuration
COPY package.json package-lock.json tsconfig.base.json ./

# Copy package manifests for workspace packages
COPY packages/protocol/package.json ./packages/protocol/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/realtime-gateway/package.json ./apps/realtime-gateway/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# Install production dependencies only
RUN npm ci --omit=dev

# Copy compiled build output from build stage
COPY --from=build /app/packages/protocol/dist ./packages/protocol/dist
COPY --from=build /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=build /app/apps/realtime-gateway/dist ./apps/realtime-gateway/dist

EXPOSE 8080

CMD ["node", "apps/realtime-gateway/dist/server.js"]