---
phase: 05-installer
plan: "03"
subsystem: installer
tags: [installer, opencode, mcp, cli, tests, typecheck]
dependency_graph:
  requires: [05-01-installer, 05-02-cli, 04-02-mcp-server]
  provides: [configure-opencode.sh, opencode-setup.md, cli-smoke-tests, full-phase-5-integration]
  affects: [06-observability]
tech_stack:
  added: []
  patterns: [JSON merge via node -e for shell scripts, idempotent MCP config injection, Vitest smoke tests for CLI command structure]
key_files:
  created:
    - scripts/configure-opencode.sh
    - docs/opencode-setup.md
    - packages/cli/src/cli.test.ts
  modified:
    - packages/indexer/src/pipeline.test.ts
    - packages/retrieval/src/search-engine.test.ts
    - packages/vector-store/src/qdrant.test.ts
decisions:
  - "configure-opencode.sh uses 'node -e' for JSON merge in bash to avoid jq dependency — keeps installer self-contained"
  - "install.sh wires configure_opencode() + initial indexing as Steps 6+7 — initial index soft-fails with warning if Qdrant not ready"
  - "CLI test file (cli.test.ts) added as smoke tests for commander structure — Vitest exits code 1 with no test files, breaking pnpm test"
  - "EmbeddingProvider interface requires 'name' and 'model' readonly string fields — pre-existing test mocks were missing these"
metrics:
  duration: "~14 minutes"
  completed: "2026-04-01"
  tasks_completed: 3
  files_created: 3
  files_modified: 3
---

# Phase 05 Plan 03: Integration & OpenCode Config Summary

**One-liner:** OpenCode MCP auto-configuration via merge-safe JSON shell script, CLI smoke tests, and pre-existing typecheck fixes to make all 15 packages build + test cleanly.

## What Was Done

Completed Phase 5 integration:
- `scripts/configure-opencode.sh`: Writes `ia-framework` MCP entry to `~/.config/opencode/config.json` — creates if absent, merges if exists, skips if already present (idempotent)
- `docs/opencode-setup.md`: Manual OpenCode MCP setup guide with JSON snippets, env var reference, and verification steps
- `install.sh` updated: Sources configure-opencode.sh and runs initial indexing as Steps 6+7
- `packages/cli/src/cli.test.ts`: 6 smoke tests verifying commander command structure
- Fixed pre-existing typecheck errors in 3 test files (EmbeddingProvider mock fields, array null assertions, out-of-scope variable)

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | configure-opencode.sh + docs/opencode-setup.md | 0c74c0f |
| 2 | Wire OpenCode config + initial indexing into install.sh | 0c74c0f |
| 3 | CLI smoke tests + typecheck fixes + full build verification | 0c74c0f |

## Phase 5 ROADMAP Success Criteria

1. **./install.sh detects missing prerequisites and installs them** ✅ — from 05-01
2. **Installer skips tools already present** ✅ — idempotent checks in check-prerequisites.sh
3. **Developer can search via OpenCode MCP tools after install** ✅ — configure-opencode.sh writes MCP entry; restart OpenCode to load
4. **Developer can run ia-framework index/search/status** ✅ — CLI binary at packages/cli/dist/bin.js with all 3 subcommands
5. **Qdrant container uses named volumes** ✅ — docker-compose.yml with `qdrant_data` volume from 05-01

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] CLI test file required for pnpm test**
- **Found during:** Task 3 (running pnpm test)
- **Issue:** Vitest exits with code 1 when no test files found — `packages/cli` had no tests, causing `pnpm test` to fail
- **Fix:** Added `packages/cli/src/cli.test.ts` with 6 smoke tests for commander structure
- **Files modified:** `packages/cli/src/cli.test.ts`
- **Commit:** 0c74c0f

**2. [Rule 1 - Bug] EmbeddingProvider mock missing required interface fields**
- **Found during:** Task 3 (running pnpm typecheck)
- **Issue:** `EmbeddingProvider` interface requires `name: string` and `model: string` readonly fields — pre-existing test mocks in pipeline.test.ts and search-engine.test.ts were missing these, causing typecheck errors
- **Fix:** Added `name: 'mock'` and `model: 'mock-model'` to all mock provider objects
- **Files modified:** `packages/indexer/src/pipeline.test.ts`, `packages/retrieval/src/search-engine.test.ts`
- **Commit:** 0c74c0f

**3. [Rule 1 - Bug] Array indexing without null assertion in test assertions**
- **Found during:** Task 3 (running pnpm typecheck)
- **Issue:** TypeScript strict mode flags `results[0]` as possibly undefined after `toHaveLength()` checks
- **Fix:** Added `!` non-null assertions (`results[0]!`) after length assertions
- **Files modified:** `packages/retrieval/src/search-engine.test.ts`, `packages/vector-store/src/qdrant.test.ts`
- **Commit:** 0c74c0f

**4. [Rule 1 - Bug] Out-of-scope `tmpDir` variable in afterAll**
- **Found during:** Task 3 (running pnpm typecheck)
- **Issue:** `afterAll` cleanup referenced `tmpDir` from a different describe scope — unreachable variable
- **Fix:** Removed the out-of-scope afterAll block
- **Files modified:** `packages/vector-store/src/qdrant.test.ts`
- **Commit:** 0c74c0f

## Known Stubs

None — all Phase 5 functionality wired to real implementations.

## Self-Check: PASSED

- `scripts/configure-opencode.sh` → FOUND ✅
- `docs/opencode-setup.md` → FOUND ✅
- `packages/cli/src/cli.test.ts` → FOUND ✅
- All 15 packages: build ✅, typecheck ✅, tests ✅
- Commit 0c74c0f → FOUND ✅
