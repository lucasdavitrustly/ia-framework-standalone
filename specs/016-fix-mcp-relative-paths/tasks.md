# Tasks: Fix MCP Node 26+ Compatibility

## User Stories (from spec.md)

| Story | Description | Priority |
|-------|-------------|----------|
| US1 | Full SQLite functionality on Node 26+ via built-in `node:sqlite` (FR-1, FR-2) | P1 |
| US2 | File retrieval works regardless of CWD (FR-3, FR-4) | P1 |
| US3 | Clear diagnostics and robust fallback (FR-5, FR-6) | P2 |

---

## Phase 1: Setup

- [X] T001 Create SQLite adapter directory structure and barrel export in packages/core/src/sqlite/index.ts
- [X] T002 Create ServerCapabilities type and degradation utility in packages/mcp-server/src/capabilities.ts

---

## Phase 2: Foundational

- [X] T003 Define SqliteDatabase and SqliteStatement interfaces (exec, prepare, pragma, transaction, close / run, all, get) in packages/core/src/sqlite/adapter.ts
- [X] T004 Extend McpServerConfig interface to accept capabilities parameter in packages/mcp-server/src/server.ts

---

## Phase 3: US1 — Full SQLite Functionality on Node 26+

**Goal**: Dependency graph AND metrics collection work fully on Node 26+ using the built-in `node:sqlite` module, with `better-sqlite3` fallback for Node 22.0-22.4.

**Independent Test Criteria**: On Node 22.5+ with `better-sqlite3` uninstalled/unavailable, start the server and verify both `search_codebase` with `expand_hops=2` (dependency graph) and metrics recording work correctly.

- [X] T005 [US1] Implement `createDatabase(path)` factory that tries `node:sqlite` DatabaseSync first via dynamic import in packages/core/src/sqlite/adapter.ts
- [X] T006 [US1] Add `better-sqlite3` fallback in the factory when `node:sqlite` import fails (Node 22.0-22.4) in packages/core/src/sqlite/adapter.ts
- [X] T007 [US1] Implement node:sqlite adapter wrapper mapping DatabaseSync to SqliteDatabase interface, including pragma→exec('PRAGMA ...') and manual BEGIN/COMMIT/ROLLBACK transaction handling in packages/core/src/sqlite/adapter.ts
- [X] T008 [US1] Implement better-sqlite3 adapter wrapper mapping Database to SqliteDatabase interface (delegates pragma/transaction to native methods) in packages/core/src/sqlite/adapter.ts
- [X] T009 [US1] Add backend-selection detection that reports which backend was chosen (for diagnostics) in packages/core/src/sqlite/adapter.ts
- [X] T010 [P] [US1] Refactor DependencyGraph to use the SqliteDatabase adapter instead of direct better-sqlite3 import in packages/retrieval/src/dependency-graph.ts
- [X] T011 [P] [US1] Refactor MetricsStore to use the SqliteDatabase adapter instead of direct better-sqlite3 import in packages/observability/src/metrics-store.ts
- [X] T012 [US1] Update bin.ts to construct DB instances via the adapter and populate ServerCapabilities with the selected backend in packages/mcp-server/src/bin.ts
- [X] T013 [US1] Add final try/catch around DB construction in bin.ts for the edge case where BOTH backends are unavailable in packages/mcp-server/src/bin.ts
- [X] T014 [US1] Log detected runtime version and selected SQLite backend at startup in packages/mcp-server/src/bin.ts

---

## Phase 4: US2 — CWD-Independent Path Resolution

**Goal**: File reads succeed regardless of the process's current working directory at launch time.

**Independent Test Criteria**: Set `IA_FRAMEWORK_CONFIG` to an absolute path, launch the server from `/tmp`, and verify `get_file` returns file content correctly.

- [X] T015 [US2] Add import.meta.url-based config discovery fallback function in packages/mcp-server/src/bin.ts
- [X] T016 [US2] Implement config path resolution order: env var → import.meta.url walk-up → process.cwd() in packages/mcp-server/src/bin.ts
- [X] T017 [US2] Log which config discovery method was used at startup in packages/mcp-server/src/bin.ts
- [X] T018 [P] [US2] Add path validation in repoPathMap construction — call stat() on each resolved repo path in packages/mcp-server/src/server.ts
- [X] T019 [P] [US2] Store repo accessibility map (name → {path, accessible, error}) alongside repoPathMap in packages/mcp-server/src/server.ts
- [X] T020 [US2] Update readFileFn closures to check accessibility before attempting read and throw descriptive error for inaccessible repos in packages/mcp-server/src/server.ts

---

## Phase 5: US3 — Diagnostics and Robust Fallback

**Goal**: Developers see actionable diagnostic messages in tool responses when features are degraded or file reads fail.

**Independent Test Criteria**: Trigger a file read on an inaccessible repo and verify the response contains `warnings` array with the repo name, attempted path, and suggested fix.

- [X] T021 [P] [US3] Create shared utility function to inject warnings/degraded_features into structuredContent in packages/mcp-server/src/capabilities.ts
- [X] T022 [US3] Update get_file handler to include degraded_features from ServerCapabilities in response structuredContent in packages/mcp-server/src/tools/get-file.ts
- [X] T023 [P] [US3] Update search_codebase handler to include degraded_features from ServerCapabilities in response structuredContent in packages/mcp-server/src/tools/search-codebase.ts
- [X] T024 [US3] Enhance fallback error message in get_file when stored content is empty (lean-payload) — include attempted path, configured root, and suggested causes in packages/mcp-server/src/tools/get-file.ts
- [X] T025 [US3] Add startup summary log line with server mode (FULL / DEGRADED) and list of unavailable features in packages/mcp-server/src/bin.ts

---

## Phase 6: Polish & Cross-Cutting

- [X] T026 [P] Add unit tests for SQLite adapter — verify node:sqlite backend CRUD, pragma, and transaction (commit + rollback) operations in packages/core/src/sqlite/adapter.test.ts
- [X] T027 [P] Add unit tests for SQLite adapter fallback to better-sqlite3 when node:sqlite unavailable, plus named-parameter binding parity in packages/core/src/sqlite/adapter.test.ts
- [X] T028 Verify backward compatibility — existing Node 22+ configs with IA_FRAMEWORK_CONFIG set continue to work unchanged in packages/mcp-server/src/bin.ts
- [X] T029 (Superseded) Keep tsup target at `node22` — it already guarantees Node 22+ (incl. 26) compatibility; switching to `esnext` could emit syntax unsupported on Node 22. No change made in packages/mcp-server/tsup.config.ts
- [X] T030 Move better-sqlite3 to optionalDependencies in affected package.json files (node:sqlite is primary) in packages/retrieval/package.json and packages/observability/package.json

---

## Dependencies

```
Phase 1 (Setup)
  └── Phase 2 (Foundational)
        ├── Phase 3 (US1: SQLite Adapter + Full Functionality) — independent
        ├── Phase 4 (US2: Path Resolution) — independent
        └── Phase 5 (US3: Diagnostics) — depends on T012 from US1 (capabilities populated)
              └── Phase 6 (Polish)
```

- US1 and US2 are **independent** — can be implemented in parallel after Foundational completes
- US3 depends on US1 (needs ServerCapabilities populated with backend info) but not on US2
- Phase 6 depends on all prior phases

## Parallel Execution Opportunities

### Within US1:
- T005-T009 are sequential (same file: adapter.ts, building the factory incrementally)
- T010 and T011 can run in **parallel** (different packages: retrieval vs observability) once the adapter interface (T003) exists
- T012-T014 depend on T010/T011 (bin.ts wires everything together)

### Within US2:
- T015, T016, T017 are sequential (same file, same feature)
- T018 and T019 can run in parallel with T015-T017 (different file: server.ts vs bin.ts)
- T020 depends on T018/T019

### Within US3:
- T021 is independent (new utility)
- T022 and T023 can run in parallel after T021 (different files)
- T024 depends on T022 (same file)
- T025 depends on T012 (bin.ts, needs capabilities)

### Cross-story parallelism:
```
After Phase 2 completes:
  ┌─ US1 (T005-T014) ─────────────────────┐
  │                                         ├── US3 (T021-T025) ── Phase 6
  └─ US2 (T015-T020) ─────────────────────┘
```

## Implementation Strategy

**MVP Scope**: Phase 1 + Phase 2 + Phase 3 (US1: SQLite Adapter)

This delivers full MCP functionality on Node 26+ — the core requirement. Dependency graph expansion and metrics both work via the built-in `node:sqlite` module, with no native addon needed.

**Incremental Delivery**:
1. MVP: Full functionality on Node 26+ via adapter (US1) — commit and verify on Node 26
2. Path resolution fix (US2) — commit and verify
3. Diagnostics polish (US3) — commit and verify
4. Tests + cross-cutting polish (Phase 6) — final commit
