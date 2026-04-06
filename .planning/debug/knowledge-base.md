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
