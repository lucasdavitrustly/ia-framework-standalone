---
phase: 01-foundation
plan: "02"
subsystem: core
tags: ["typescript", "zod", "pino", "types", "config", "logger", "tdd", "vitest"]

requires:
  - phase: 01-foundation/01-01
    provides: monorepo scaffold, pnpm workspace, tsconfig.base.json, turbo pipeline
provides:
  - "@ia-framework/core npm package with shared domain types"
  - "Zod-validated config loader (loadConfig, validateConfig, ConfigNotFoundError)"
  - "Structured pino logger factory (createLogger) writing to stderr"
  - "ProjectConfig, ChunkMetadata, ProjectProfile, EmbeddingVector, SearchResult types"
affects: ["indexer", "mcp-server", "retrieval", "dashboard-api", "benchmark"]

tech-stack:
  added: ["pino@9", "zod@4.3.6", "tsup@8.5.1", "vitest@4.1.2"]
  patterns: ["TDD red-green cycle", "Zod schema + TypeScript interface parity", "barrel re-exports", "stderr-only logging (MCP-safe)"]

key-files:
  created:
    - packages/core/package.json
    - packages/core/tsconfig.json
    - packages/core/tsup.config.ts
    - packages/core/src/types/index.ts
    - packages/core/src/config/schema.ts
    - packages/core/src/config/loader.ts
    - packages/core/src/config/loader.test.ts
    - packages/core/src/logger/index.ts
    - packages/core/src/index.ts
  modified:
    - package.json (added rolldown binding for esbuild)
    - pnpm-lock.yaml

key-decisions:
  - "Logger uses stderr (fd 2) exclusively — MCP server uses stdout for JSON-RPC, stdout contamination would break MCP protocol"
  - "ProjectProfileSchema added to schema.ts (stronger than z.any().optional()) to enable type-safe profile validation in Phase 2"
  - "TypeScript exactOptionalPropertyTypes + noUncheckedIndexedAccess enforced in core from day one"

patterns-established:
  - "Zod schema mirrors TypeScript interface 1:1 — schema in schema.ts, interface in types/index.ts"
  - "Custom typed errors (ConfigNotFoundError) for distinguishing not-found vs invalid-schema failures"
  - "All re-exports through single barrel (src/index.ts) — consumers import from @ia-framework/core only"

requirements-completed: [ARCH-01, ARCH-02, ARCH-03]

duration: 10min
completed: 2026-04-01
---

# Phase 01 Plan 02: Core Package Summary

**@ia-framework/core: shared TypeScript types, Zod-validated config loader with ConfigNotFoundError, and pino logger factory writing JSON to stderr**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-01T13:07:36Z
- **Completed:** 2026-04-01T13:17:00Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments
- All 7 TDD config loader tests pass (RED → GREEN verified)
- Package builds cleanly with tsup producing `dist/index.js` + `dist/index.d.ts` (7.11 KB types)
- All downstream packages can import shared types, config loader, and logger from `@ia-framework/core`

## Task Commits

Each task was committed atomically:

1. **Task 1: Domain type definitions** - (types, package.json, tsconfig, tsup config)
2. **Task 2: Config loader with Zod validation (TDD)** - (schema.ts, loader.ts, loader.test.ts — 7 tests)
3. **Task 3: Logger factory and package build** - (logger/index.ts, src/index.ts)

**Plan commit:** `8c9f9cf` (feat: create @ia-framework/core)

## Files Created/Modified

- `packages/core/src/types/index.ts` — 8 shared domain interfaces (ChunkMetadata, ProjectProfile, EmbeddingVector, SearchResult, EmbeddingProviderConfig, VectorStoreConfig, IndexingConfig, ProjectConfig)
- `packages/core/src/config/schema.ts` — 5 Zod schemas matching TypeScript interfaces exactly
- `packages/core/src/config/loader.ts` — loadConfig() (async, file I/O), validateConfig() (sync), ConfigNotFoundError class
- `packages/core/src/config/loader.test.ts` — 7 Vitest tests covering valid config, missing fields, file not found, invalid provider, Ollama without apiKey
- `packages/core/src/logger/index.ts` — createLogger(component) pino factory, stderr destination, LOG_LEVEL env support
- `packages/core/src/index.ts` — barrel re-exports all types, config, schemas, and logger
- `packages/core/package.json` — @ia-framework/core with pino + zod deps, tsup + vitest devDeps

## Decisions Made

- Logger outputs to stderr (fd 2) with `sync: false` — critical for MCP server compatibility where stdout is the JSON-RPC 2.0 channel
- Added `ProjectProfileSchema` as a proper Zod schema (not `z.any()`) for Phase 2 project detection validation
- Used `tsup` ESM-only output (`format: ['esm']`) matching the monorepo's `"type": "module"` configuration

## Deviations from Plan

None — plan executed exactly as written. The `ProjectProfileSchema` was a plan-suggested improvement (it specified `z.any().optional()` but the stronger schema was implemented directly).

## Known Stubs

None — all exports are fully implemented.

## Self-Check: PASSED

- ✅ `packages/core/src/types/index.ts` exists
- ✅ `packages/core/src/config/loader.ts` exists
- ✅ `packages/core/src/config/loader.test.ts` exists (7 tests)
- ✅ `packages/core/src/logger/index.ts` exists
- ✅ `packages/core/dist/index.js` exists
- ✅ `packages/core/dist/index.d.ts` exists
- ✅ 7/7 tests pass via `pnpm --filter @ia-framework/core test`
- ✅ Commit `8c9f9cf` exists
