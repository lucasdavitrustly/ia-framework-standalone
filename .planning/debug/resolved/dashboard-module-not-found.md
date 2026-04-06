---
status: resolved
trigger: 'Dashboard fails to load after ./install.sh — Node throws ERR_MODULE_NOT_FOUND for @ia-framework/db-context'
created: 2026-04-06T00:00:00.000Z
updated: 2026-04-06T00:08:00.000Z
---

## Current Focus

<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED AND FIXED — @ia-framework/db-context was missing from three sections of the Dockerfile
test: Human confirmed dashboard loads successfully after rebuild
expecting: N/A — resolved
next_action: Archive session

## Symptoms

<!-- Written during gathering, then IMMUTABLE -->

expected: Dashboard loads at http://localhost:3000 after ./install.sh
actual: Browser shows nothing / connection refused. Docker container crashes on startup.
errors: Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@ia-framework/db-context' imported from /app/packages/dashboard-api/dist/server.js
reproduction: Run ./install.sh, then open http://localhost:3000
started: Used to work, broke after a change

## Eliminated

<!-- APPEND only - prevents re-investigating -->

## Evidence

<!-- APPEND only - facts discovered -->

- timestamp: 2026-04-06T00:01:00.000Z
  checked: packages/db-context — does the package exist?
  found: Yes. packages/db-context/package.json exists with name "@ia-framework/db-context", has a build script, exports ./dist/index.js, and packages/db-context/dist/ has a built index.js (4.7 KB)
  implication: Package is real and locally built — problem is not a missing package but missing Docker config

- timestamp: 2026-04-06T00:02:00.000Z
  checked: packages/dashboard-api/dist/server.js imports
  found: server.js (390 lines) has `import { loadDbConfig, PostgresSource, DbConfigNotFoundError } from "@ia-framework/db-context"` as an EXTERNAL import (not inlined), alongside all other @ia-framework/\* and hono packages
  implication: tsup externalizes all non-Node-stdlib deps. Runtime container MUST have @ia-framework/db-context resolvable in node_modules via pnpm workspace symlink

- timestamp: 2026-04-06T00:03:00.000Z
  checked: packages/dashboard-api/Dockerfile — all references to db-context
  found: ZERO occurrences of "db-context" anywhere in the 113-line Dockerfile. Three critical omissions:
  1. BUILD STAGE (lines 19-31): packages/db-context/package.json is not COPY'd — pnpm workspace install doesn't know the package exists
  2. BUILD STEP (lines 41-49): pnpm --filter "@ia-framework/db-context" build is absent — package never compiled in Docker
  3. RUNTIME STAGE: packages/db-context/package.json NOT copied (lines 70-82) AND packages/db-context/dist NOT copied (lines 87-95)
     implication: At Docker runtime, @ia-framework/db-context does not exist in /app at all. Node.js resolves the ESM import, fails to find the package, throws ERR_MODULE_NOT_FOUND

- timestamp: 2026-04-06T00:04:00.000Z
  checked: Cross-reference all 8 dashboard-api workspace deps against fixed Dockerfile
  found: All 8 deps (benchmark, core, db-context, embedding, indexer, observability, retrieval, vector-store) now present in runtime package.json COPY and dist COPY sections
  implication: Fix is complete and consistent

- timestamp: 2026-04-06T00:08:00.000Z
  checked: Human verification
  found: Dashboard loads successfully at http://localhost:3000 after rebuild
  implication: Fix confirmed working end-to-end

## Resolution

<!-- OVERWRITE as understanding evolves -->

root_cause: The @ia-framework/db-context package was added to dashboard-api's dependencies and source code (routes/db.ts) but was never added to the Dockerfile. The Dockerfile was missing it in three places: (1) build-stage package.json COPY so pnpm workspace could resolve it, (2) build-step pnpm filter command so the package gets compiled, (3) runtime-stage package.json COPY and dist COPY so Node.js can resolve the ESM import at startup. Since tsup externalizes all workspace packages (not inlining them), Node.js cannot resolve @ia-framework/db-context at container runtime.
fix: Added packages/db-context to all three missing sections of packages/dashboard-api/Dockerfile — build-stage package.json copy (line 30), build step (line 50), runtime-stage package.json copy (line 83), and runtime-stage dist copy (line 98).
verification: Human confirmed — dashboard loads at http://localhost:3000 after ./install.sh rebuild.
files_changed: ["packages/dashboard-api/Dockerfile"]
