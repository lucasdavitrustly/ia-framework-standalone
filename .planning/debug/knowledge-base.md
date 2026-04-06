# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## dashboard-module-not-found — ERR_MODULE_NOT_FOUND for workspace package in Docker container

- **Date:** 2026-04-06
- **Error patterns:** ERR_MODULE_NOT_FOUND, Cannot find package, dist/server.js, workspace, Docker, container, pnpm, tsup, external
- **Root cause:** A new workspace package (@ia-framework/db-context) was added as a dependency and imported in source, but was never added to the Dockerfile. tsup externalizes all workspace packages (does not inline them), so Node.js must resolve them from node_modules at runtime via pnpm workspace symlinks. The package was absent from the container in three ways: (1) its package.json was not COPY'd in the build stage so pnpm workspace didn't know it existed, (2) it was not included in the pnpm build step so it was never compiled inside Docker, (3) its package.json and dist/ were not COPY'd in the runtime stage.
- **Fix:** Add the missing package to all three sections of the Dockerfile: build-stage package.json COPY block, the pnpm --filter build chain, and the runtime-stage package.json COPY + COPY --from=build dist/ block.
- **Files changed:** packages/dashboard-api/Dockerfile

---

## qdrant-unreachable-dashboard — Dashboard shows Qdrant unreachable despite Docker running

- **Date:** 2026-04-06
- **Error patterns:** Qdrant unreachable, Docker running, localhost, vectorStore host, qdrant status error, readyz, dashboard, container, QDRANT_HOST
- **Root cause:** Two compounding bugs: (1) All install code paths (persister.ts DEFAULT_VECTOR_STORE, init-config.sh fallback template) defaulted vectorStore.host to "localhost", which is unreachable from inside Docker containers. (2) qdrantHost was captured once at server startup from config.vectorStore.host and frozen into the app closure — making it immune to both file-system config changes and the correct QDRANT_HOST=qdrant env var in docker-compose.yml, which was only used as a fallback when config was null.
- **Fix:** (1) Changed default vectorStore.host to "qdrant" in persister.ts and init-config.sh. (2) Refactored status route to derive qdrantHost per-request (QDRANT_HOST env var > config.vectorStore.host > "localhost") instead of capturing it once at startup — removed static qdrantHost/qdrantPort from AppDependencies and passed configWatcher to the status route instead.
- **Files changed:** packages/project-detector/src/persister.ts, scripts/init-config.sh, .ia-framework/project.json, packages/dashboard-api/src/routes/status.ts, packages/dashboard-api/src/app.ts, packages/dashboard-api/src/server.ts

---
