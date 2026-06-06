FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@8

# Copy workspace manifests first (for layer caching)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/database/package.json ./packages/database/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/permissions/package.json ./packages/permissions/
COPY packages/auth/package.json ./packages/auth/
COPY services/api/package.json ./services/api/
COPY apps/admin-portal/package.json ./apps/admin-portal/

# Install all workspace dependencies
RUN pnpm install --frozen-lockfile

# Copy full source
COPY . .

# Generate Prisma client (binary is at packages/database/node_modules/.bin/prisma)
RUN cd packages/database && npx prisma generate

# Build API TypeScript
RUN pnpm --filter @flowtiq/api build

# At runtime: push schema then start server
CMD cd packages/database && npx prisma db push --accept-data-loss && cd /app && node services/api/dist/index.js
