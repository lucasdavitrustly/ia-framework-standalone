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

## dashboard-not-updating-during-index — Dashboard shows Idle while CLI indexing is running

- **Date:** 2026-04-06
- **Error patterns:** dashboard idle, indexing progress blank, no live updates, zero chunks, CLI index, separate process, Docker container, IndexingStateManager, in-memory state, shared state
- **Root cause:** The CLI runs as a separate OS process from the dashboard API (which runs in a Docker container / Lima VM via Rancher Desktop). Each had its own in-memory `IndexingStateManager` — they never shared state. The CLI's `onProgress` callback only wrote to stdout via `process.stdout.write()`. The dashboard API's `GET /api/indexing/status` returned `IndexingStateManager.getState()` which was always zero for CLI-triggered runs. The dashboard frontend correctly polled every 2 seconds but always received zeros.
- **Fix:** (1) Added `writeIndexingProgress()` helper to CLI that writes `.ia-framework/indexing-progress.json` on every progress event (walking → parsing → embedding → storing → done/error). Fire-and-forget, never throws. (2) Modified `GET /api/indexing/status` to read this file as a fallback when in-memory state shows idle — in-memory takes priority for dashboard-triggered runs. (3) Passed `frameworkDir` to `indexingRouter` so it can locate the file. The shared file works because `.ia-framework/` is already mounted into the Docker container as `/ia-framework-data`.
- **Files changed:** packages/cli/src/commands/index.command.ts, packages/dashboard-api/src/routes/indexing.ts, packages/dashboard-api/src/app.ts

---

## tree-sitter-32kb-limit — tree-sitter throws Invalid argument on files larger than 32KB causing 0 chunks

- **Date:** 2026-04-06
- **Error patterns:** Invalid argument, 0 chunks, tree-sitter, parseFile, large file, Java, minified JS, indexing skips files, silent failure, 32767 characters
- **Root cause:** `tree-sitter@0.21.1` has a hard **32,767-character (32KB - 1) internal buffer limit**. Any source file larger than that throws `Invalid argument` from `Parser.parse()`. The `parseFile` catch block logged the error and skipped the file — silently producing 0 chunks. ~17 out of every 500 real-world files hit this limit (large Java test classes, service files, minified JS). The limit is not documented; it was found via binary search on the failing file.
- **Fix:** Upgrade `tree-sitter` from `0.21.1` → `0.22.4`, `tree-sitter-java` from `0.21.0` → `0.23.5`, `tree-sitter-typescript` from `0.21.2` → `0.23.2`. Version 0.22.x removes the 32KB limit. Grammar APIs are backwards-compatible (same `{ typescript, tsx }` export shape). All 31 ast-parser tests continue to pass.
- **Files changed:** packages/ast-parser/package.json, pnpm-lock.yaml

---

## embedding-dimension-mismatch — Qdrant upserts silently fail due to wrong vector dimensions

- **Date:** 2026-04-06
- **Error patterns:** 0 vectors in Qdrant, silent upsert failure, dimension mismatch, qwen3-embedding, 768 dimensions, 1024 dimensions, 1536 dimensions, DEFAULT_DIMENSIONS, VectorStore.initialize, stale collection
- **Root cause:** Two compounding bugs: (1) `qwen3-embedding:0.6b` was not in the `DEFAULT_DIMENSIONS` map in `packages/embedding/src/factory.ts`, so it fell back to 1536d (OpenAI default) instead of the correct 1024d. (2) `VectorStore.initialize()` had `if (existence.exists) return;` — it skipped re-creation even when the existing collection had wrong dimensions (768d from old `nomic-embed-text` default), causing all upserts to silently fail with dimension mismatch.
- **Fix:** (1) Added `qwen3-embedding:0.6b`, `qwen3-embedding:1.7b`, `qwen3-embedding:4b` (all 1024d) to `DEFAULT_DIMENSIONS` in `factory.ts`. (2) Updated `VectorStore.initialize()` to fetch the existing collection's dimension config and compare — if mismatch detected, delete and recreate the collection before continuing.
- **Files changed:** packages/embedding/src/factory.ts, packages/vector-store/src/qdrant.ts

---

## indexing-silent-failure-empty-qdrant — CLI indexer uses Docker hostname "qdrant" on host machine, causing silent indexing failure

- **Date:** 2026-04-06
- **Error patterns:** empty Qdrant, 0 vectors, silent failure, fetch failed, ENOTFOUND, qdrant hostname, CLI indexer, install.sh, vectorStore.host
- **Root cause:** The CLI (`index.command.ts`, `search.command.ts`, `status.command.ts`) and MCP server (`bin.ts`) constructed QdrantVectorStore using `config.vectorStore.host` which is set to "qdrant" (Docker service name). This hostname only resolves inside Docker containers; the CLI and MCP server run on the host machine where only "localhost" resolves, causing `TypeError: fetch failed` (ENOTFOUND) at vectorStore.initialize(). The error appeared silent because carriage-return progress output overwrote the terminal line.
- **Fix:** Replace `config.vectorStore.host` with `process.env['QDRANT_HOST'] ?? 'localhost'` in all four host-side processes. This correctly defaults to localhost for host-machine use while remaining overridable via env var.
- **Files changed:** packages/cli/src/commands/index.command.ts, packages/cli/src/commands/search.command.ts, packages/cli/src/commands/status.command.ts, packages/mcp-server/src/bin.ts

---
