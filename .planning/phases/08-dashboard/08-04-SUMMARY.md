---
phase: 08-dashboard
plan: "04"
subsystem: docker
tags: [docker, container, install, dashboard]
dependency_graph:
  requires: [08-01, 08-02, 08-03]
  provides: [DASH-01]
  affects: [install.sh, docker-compose.yml]
tech_stack:
  added: [Docker multi-stage build, node-gyp native build tools]
  patterns: [multi-stage Dockerfile, bind mount volumes, env var fallback]
key_files:
  created:
    - packages/dashboard-api/Dockerfile
  modified:
    - docker-compose.yml
    - install.sh
    - .env.example
    - packages/dashboard-api/tsup.config.ts
    - packages/dashboard-api/src/config-watcher.ts
    - packages/dashboard-api/src/server.ts
    - apps/dashboard/src/pages/Config.tsx
decisions:
  - "Add python3/make/g++ to Dockerfile stages for tree-sitter native node-gyp compilation"
  - "Copy tsconfig.base.json into Docker build stage — all packages extend ../../tsconfig.base.json"
  - "tsup split into two configs: library entry (splitting allowed) and server entry (splitting:false) so import.meta.url guard works when node runs server.js directly"
  - "IA_FRAMEWORK_DIR derived from SCRIPT_DIR/.ia-framework after init_config completes; written to .env for docker-compose"
  - "Dashboard started after qdrant in install.sh with 60s health poll (2s intervals)"
  - "Qdrant image has no curl/wget/nc — removed healthcheck entirely, depends_on uses service_started (no condition)"
  - "QDRANT_HOST=qdrant set in docker-compose environment so server.ts can reach Qdrant inside Docker network without project.json"
  - "ConfigWatcher.start() catches ConfigNotFoundError and runs in unconfigured mode rather than crashing"
  - "ConfigWatcher watches for project.json 'add' event (via chokidar ignoreInitial:true) to hot-reload when file is created"
  - "server.ts falls back to QDRANT_HOST/QDRANT_PORT env vars when no config is available"
  - "Config page shows friendly unconfigured UI instead of red error when /api/config returns 503"
metrics:
  duration: "~95min (including post-verification fixes)"
  completed: "2026-04-01"
  tasks: 4
  files: 8
---

# Phase 8 Plan 04: Docker Container Summary

**One-liner:** Multi-stage Dockerfile builds React+Node.js into a single container with IA_FRAMEWORK_DIR bind mount, auto-start in install.sh, and graceful handling of unconfigured state.

## What Was Built

### Task 1: Multi-stage Dockerfile (`packages/dashboard-api/Dockerfile`)
- Stage 1 (`build-frontend`): installs build tools (python3/make/g++ for tree-sitter), enables pnpm via corepack, copies all workspace `package.json` files + `tsconfig.base.json`, runs `pnpm install --frozen-lockfile`, builds all packages in dependency order, builds React frontend via `vite build`
- Stage 2 (`runtime`): installs same build tools (for native module compilation), copies only production `package.json` files, runs `pnpm install --frozen-lockfile --prod`, copies all `dist/` directories from Stage 1, copies React build to `packages/dashboard-api/public/`
- HEALTHCHECK polls `fetch('http://localhost:3000/api/status')` every 30s
- CMD: `node packages/dashboard-api/dist/server.js`

### Task 2: docker-compose.yml update
- `dashboard` service added: builds from repo root with `packages/dashboard-api/Dockerfile`
- Volume mount: `${IA_FRAMEWORK_DIR}:/ia-framework-data` (bind mount for SQLite files)
- Container sets `IA_FRAMEWORK_DIR=/ia-framework-data` so server.ts reads from mounted path
- `depends_on: qdrant` (simple, no healthcheck condition — Qdrant image has no curl/wget/nc)
- `QDRANT_HOST=qdrant` and `QDRANT_PORT=6333` set so status check reaches Qdrant inside Docker network
- `.env.example` updated to document `IA_FRAMEWORK_DIR` and `DASHBOARD_PORT`

### Task 3: install.sh update
- After `init_config`: derives `IA_FRAMEWORK_DIR="${SCRIPT_DIR}/.ia-framework"`, exports it, writes `.env` file with all docker-compose variables
- After `start_qdrant`: starts dashboard via `docker compose up -d --build dashboard`, polls up to 60s for `/api/status` to respond
- Success summary now prints real URL: `http://localhost:${DASHBOARD_PORT:-3000}` (replaced placeholder)

### Task 4: Integration smoke test + workspace verify
- Docker image built successfully
- Container started standalone with test `IA_FRAMEWORK_DIR`
- `GET /api/status` → HTTP 200, JSON `{"qdrant":"error","indexingInProgress":false,"lastIndexedCommit":null,"timestamp":"..."}`
- `GET /` and `GET /index.html` → HTTP 200 (React static files served)
- `pnpm build && pnpm typecheck && pnpm test` → 20/20 tasks successful

## Deviations from Plan

### Auto-fixed Issues (during execution)

**1. [Rule 1 - Bug] tree-sitter native module requires build tools in Docker**
- **Found during:** Task 4 (first docker build attempt)
- **Issue:** `node:22-slim` doesn't include python3/make/g++ needed by tree-sitter's node-gyp compilation
- **Fix:** Added `apt-get install python3 make g++ curl` to both build-frontend and runtime stages
- **Files modified:** `packages/dashboard-api/Dockerfile`
- **Commit:** `062f19e`

**2. [Rule 1 - Bug] tsup code-splitting broke import.meta.url guard in server.js**
- **Found during:** Task 4 (container started but immediately exited with code 0)
- **Issue:** When tsup builds both `index.ts` and `server.ts` together with splitting enabled, it extracts shared code into a chunk file. The main guard `if (import.meta.url === file://${process.argv[1]})` is in the chunk file, but `import.meta.url` in the chunk evaluates to the chunk's URL, not `server.js`. So running `node server.js` silently exited (guard was false).
- **Fix:** Split tsup into two configs — library config (splitting allowed) and server config (`splitting: false`). Server entry now produces a self-contained 9.8KB `server.js` where the main guard works correctly.
- **Files modified:** `packages/dashboard-api/tsup.config.ts`
- **Commit:** `062f19e`

**3. [Rule 1 - Bug] tsconfig.base.json not copied into Docker build stage**
- **Found during:** Task 4 (second docker build attempt after fixing native tools)
- **Issue:** All packages extend `../../tsconfig.base.json` from monorepo root. The Dockerfile only copied `package.json pnpm-workspace.yaml pnpm-lock.yaml` — missing `tsconfig.base.json`. tsup's DTS build failed with `TS5083: Cannot read file '/app/tsconfig.base.json'`.
- **Fix:** Added `tsconfig.base.json` to the root file COPY line in the build stage
- **Files modified:** `packages/dashboard-api/Dockerfile`
- **Commit:** `062f19e`

### Post-Verification Fixes (discovered during human review)

**4. [Rule 1 - Bug] Qdrant healthcheck fails — image has no curl, wget, or nc**
- **Found during:** Human verification (`docker compose up` hung indefinitely)
- **Issue:** `depends_on: condition: service_healthy` + a healthcheck using `curl` caused the dashboard to wait forever. The `qdrant/qdrant:latest` image ships no `curl`, `wget`, `nc`, or bash `/dev/tcp` support.
- **Fix:** Removed the Qdrant `healthcheck` block entirely. Changed `depends_on` to a simple list (`- qdrant`) without a condition. Dashboard starts immediately alongside Qdrant.
- **Files modified:** `docker-compose.yml`
- **Commit:** `78e46ff`

**5. [Rule 1 - Bug] Dashboard crashes when project.json does not exist**
- **Found during:** Human verification (dashboard container exited with code 1 in a loop)
- **Issue:** `ConfigWatcher.start()` called `loadConfig()` which throws `ConfigNotFoundError` when `project.json` is absent. The error propagated up and crashed the Node.js process.
- **Fix:** Wrapped `loadConfig()` in a try/catch in `ConfigWatcher.start()`. If `ConfigNotFoundError`, log a warning and set `this.config = null` (unconfigured mode). Also added a chokidar `'add'` event listener so when `project.json` is created later, config is hot-loaded automatically.
- **Files modified:** `packages/dashboard-api/src/config-watcher.ts`
- **Commit:** `78e46ff`

**6. [Rule 1 - Bug] server.ts crashes when config is null (embedding/vector store init)**
- **Found during:** Human verification (same crash as above, same root cause path)
- **Issue:** `server.ts` used `getConfig()!` (non-null assertion) and immediately called `createEmbeddingProvider(config.embedding)` — crashing when config was null.
- **Fix:** Made all config-dependent initialization conditional. `embeddingProvider` and `vectorStore` are `null` when no config. `triggerIndexing` throws a descriptive error if called with no config. Qdrant host/port fall back to `QDRANT_HOST`/`QDRANT_PORT` env vars (set to `qdrant`/`6333` in docker-compose).
- **Files modified:** `packages/dashboard-api/src/server.ts`
- **Commit:** `78e46ff`

**7. [Rule 1 - Bug] Config page shows red error instead of friendly message when unconfigured**
- **Found during:** Human verification (saw "Failed to load config: API error 503" in browser)
- **Issue:** `/api/config` intentionally returns 503 when no `project.json` exists. The frontend treated any non-200 as a hard error and rendered a red `<div>`.
- **Fix:** Config page now renders a styled "No project configured yet" panel with a hint to run `./install.sh` when an error occurs, instead of the red error message.
- **Files modified:** `apps/dashboard/src/pages/Config.tsx`
- **Commit:** `78e46ff`

## Commits

| Hash | Message |
|------|---------|
| `0725cd0` | `feat(08-04): update install.sh to start dashboard and set IA_FRAMEWORK_DIR` |
| `062f19e` | `fix(08-04): fix Dockerfile build tools and tsup splitting for server entry` |
| `78e46ff` | `fix(08): graceful startup without project.json and Docker healthcheck fixes` |

## Known Stubs

None — all API endpoints return real data from SQLite/Qdrant. Static files served from React build artifacts.

## Self-Check: PASSED (human-verified)

- `packages/dashboard-api/Dockerfile` ✅ exists
- `docker-compose.yml` ✅ contains dashboard service, no broken healthcheck
- `install.sh` ✅ exports IA_FRAMEWORK_DIR, writes .env, starts dashboard
- `.env.example` ✅ documents IA_FRAMEWORK_DIR
- `packages/dashboard-api/tsup.config.ts` ✅ updated with split configs
- `ConfigWatcher` ✅ tolerates missing project.json, hot-reloads on creation
- `server.ts` ✅ handles null config, falls back to QDRANT_HOST env var
- `Config.tsx` ✅ friendly unconfigured state instead of red error
- Docker smoke test ✅ `docker compose up` starts both containers without hanging
- `GET /api/status` ✅ HTTP 200 JSON with qdrant:ok (when QDRANT_HOST=qdrant)
- `GET /` ✅ HTTP 200 React app loads in browser
- All 4 nav pages ✅ render without blank screens or console errors
