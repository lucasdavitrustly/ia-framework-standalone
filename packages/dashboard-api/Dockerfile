# ─── Stage 1: Build React frontend ───────────────────────────────────────────
FROM node:22-slim AS build-frontend

# Install build tools needed for native modules (tree-sitter requires node-gyp)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ curl \
  && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace definition files first (for layer caching)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./

# Copy all package.json files needed for workspace resolution
# (pnpm needs all package.json files before install)
COPY packages/core/package.json               packages/core/
COPY packages/ast-parser/package.json         packages/ast-parser/
COPY packages/embedding/package.json          packages/embedding/
COPY packages/vector-store/package.json       packages/vector-store/
COPY packages/indexer/package.json            packages/indexer/
COPY packages/retrieval/package.json          packages/retrieval/
COPY packages/observability/package.json      packages/observability/
COPY packages/benchmark/package.json          packages/benchmark/
COPY packages/mcp-server/package.json         packages/mcp-server/
COPY packages/cli/package.json                packages/cli/
COPY packages/project-detector/package.json   packages/project-detector/
COPY packages/db-context/package.json         packages/db-context/
COPY packages/dashboard-api/package.json      packages/dashboard-api/
COPY apps/dashboard/package.json              apps/dashboard/

# Install all workspace deps (frontend + backend)
RUN pnpm install --frozen-lockfile

# Copy source for packages needed by the builds
COPY packages/ packages/
COPY apps/dashboard/ apps/dashboard/

# Build backend packages in dependency order
RUN pnpm --filter "@ia-framework/core" build && \
    pnpm --filter "@ia-framework/observability" build && \
    pnpm --filter "@ia-framework/benchmark" build && \
    pnpm --filter "@ia-framework/embedding" build && \
    pnpm --filter "@ia-framework/vector-store" build && \
    pnpm --filter "@ia-framework/ast-parser" build && \
    pnpm --filter "@ia-framework/indexer" build && \
    pnpm --filter "@ia-framework/retrieval" build && \
    pnpm --filter "@ia-framework/db-context" build && \
    pnpm --filter "@ia-framework/dashboard-api" build

# Build React frontend (outputs to apps/dashboard/dist)
RUN pnpm --filter "@ia-framework/dashboard" build

# ─── Stage 2: Production runtime ─────────────────────────────────────────────
FROM node:22-slim AS runtime

# Install build tools needed for native modules (tree-sitter requires node-gyp)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ curl \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace definition files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy only the package.json files needed for production deps
COPY packages/core/package.json               packages/core/
COPY packages/observability/package.json      packages/observability/
COPY packages/benchmark/package.json          packages/benchmark/
COPY packages/embedding/package.json          packages/embedding/
COPY packages/vector-store/package.json       packages/vector-store/
COPY packages/indexer/package.json            packages/indexer/
COPY packages/retrieval/package.json          packages/retrieval/
COPY packages/ast-parser/package.json         packages/ast-parser/
COPY packages/mcp-server/package.json         packages/mcp-server/
COPY packages/cli/package.json                packages/cli/
COPY packages/project-detector/package.json   packages/project-detector/
COPY packages/db-context/package.json         packages/db-context/
COPY packages/dashboard-api/package.json      packages/dashboard-api/

# Install production deps only (--prod prunes devDependencies)
RUN pnpm install --frozen-lockfile --prod

# Copy built package dist directories from build stage
COPY --from=build-frontend /app/packages/core/dist              packages/core/dist/
COPY --from=build-frontend /app/packages/observability/dist     packages/observability/dist/
COPY --from=build-frontend /app/packages/benchmark/dist         packages/benchmark/dist/
COPY --from=build-frontend /app/packages/embedding/dist         packages/embedding/dist/
COPY --from=build-frontend /app/packages/vector-store/dist      packages/vector-store/dist/
COPY --from=build-frontend /app/packages/ast-parser/dist        packages/ast-parser/dist/
COPY --from=build-frontend /app/packages/indexer/dist           packages/indexer/dist/
COPY --from=build-frontend /app/packages/retrieval/dist         packages/retrieval/dist/
COPY --from=build-frontend /app/packages/db-context/dist        packages/db-context/dist/
COPY --from=build-frontend /app/packages/dashboard-api/dist     packages/dashboard-api/dist/

# Copy React build into dashboard-api's public directory
# server.ts serves static files from DASHBOARD_PUBLIC_DIR
COPY --from=build-frontend /app/apps/dashboard/dist             packages/dashboard-api/public/

# Environment variable defaults
ENV DASHBOARD_PORT=3000
ENV DASHBOARD_PUBLIC_DIR=/app/packages/dashboard-api/public

# IA_FRAMEWORK_DIR MUST be provided at runtime (bind-mounted from host)
# Set via docker-compose environment: IA_FRAMEWORK_DIR=/ia-framework-data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=15s \
  CMD node -e "fetch('http://localhost:3000/api/status').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "packages/dashboard-api/dist/server.js"]
