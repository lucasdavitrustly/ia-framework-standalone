---
phase: quick-260402-j1g
plan: 01
subsystem: embedding, cli, installer
tags: [ollama, embedding-model, dimension-discovery, interactive-cli, qdrant]

# Dependency graph
requires:
  - phase: 03-indexing-pipeline
    provides: IndexingPipeline, incremental state, embedding provider factory
  - phase: 05-installer
    provides: install-ollama.sh, init-config.sh, detect-project.mjs
provides:
  - discoverDimensions() utility for runtime embedding dimension discovery
  - deleteCollection() on VectorStore for model change re-indexing
  - embeddingModel tracking in indexing-state.json
  - --model CLI flag for embedding model override at index time
  - Interactive model selection during install.sh
  - embeddingDimensions support in PersistOptions
affects: [indexing, installer, cli]

# Tech tracking
tech-stack:
  added: []
  patterns: [dimension-discovery-priority-chain, model-mismatch-detection, interactive-cli-readline]

key-files:
  created: []
  modified:
    - packages/embedding/src/factory.ts
    - packages/embedding/src/factory.test.ts
    - packages/embedding/src/index.ts
    - packages/vector-store/src/interface.ts
    - packages/vector-store/src/qdrant.ts
    - packages/indexer/src/incremental.ts
    - packages/indexer/src/index.ts
    - packages/project-detector/src/persister.ts
    - packages/cli/src/commands/index.command.ts
    - scripts/install-ollama.sh
    - scripts/init-config.sh
    - scripts/detect-project.mjs

key-decisions:
  - "discoverDimensions uses 3-tier strategy: DEFAULT_DIMENSIONS map → /api/show → /api/embed probe"
  - "Model mismatch detection checks both dimensions AND model name (semantically incompatible vectors)"
  - "Interactive model selection uses node:readline/promises for proper signal handling"
  - "saveLastIndexedCommit extended with optional 4th arg for backward compatibility"
  - "Install-time model selection shows all models with [embed] hint, not filtered to embedding-only"

patterns-established:
  - "Dimension discovery priority chain: known map → API metadata → embed probe"
  - "Model mismatch detection: dimension + model name comparison before indexing"

requirements-completed: [OLLAMA-MODEL-SELECT]

# Metrics
duration: 7min
completed: 2026-04-02
---

# Quick Task 260402-j1g: Ollama Embedding Model Selection Summary

**Interactive Ollama model selection at install + index time with dimension discovery, auto-pull, and mismatch-safe re-indexing**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-02T17:22:08Z
- **Completed:** 2026-04-02T17:29:39Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments
- Exported `discoverDimensions()` with 3-tier strategy (known map → /api/show → /api/embed probe) and comprehensive test coverage
- Added `--model` flag to CLI index command with auto-pull, dimension discovery, and mismatch detection with user confirmation
- Replaced hardcoded `nomic-embed-text` in installer with interactive model selection menu showing locally available models
- Added `deleteCollection()` to VectorStore interface for safe re-indexing on model change
- Extended indexing state to track embedding model name for mismatch detection across sessions

## Task Commits

Each task was committed atomically:

1. **Task 1: Core infrastructure — discoverDimensions, deleteCollection, embeddingModel state** - `08735e5` (feat)
2. **Task 2: CLI index command — --model flag, auto-pull, mismatch detection, re-index** - `a0eacc9` (feat)
3. **Task 3: Install-time model selection — bash scripts + detect-project wiring** - `6d5b611` (feat)

## Files Created/Modified
- `packages/embedding/src/factory.ts` — Added `discoverDimensions()`, exported `DEFAULT_DIMENSIONS`
- `packages/embedding/src/factory.test.ts` — 8 new tests for discoverDimensions
- `packages/embedding/src/index.ts` — Re-export discoverDimensions and DEFAULT_DIMENSIONS
- `packages/vector-store/src/interface.ts` — Added `deleteCollection()` to VectorStore interface
- `packages/vector-store/src/qdrant.ts` — Implemented `deleteCollection()` via client.deleteCollection()
- `packages/indexer/src/incremental.ts` — Added `embeddingModel` to IndexingState, `getLastEmbeddingModel()` getter, extended `saveLastIndexedCommit` with optional 4th arg
- `packages/indexer/src/index.ts` — Re-export getLastEmbeddingModel
- `packages/project-detector/src/persister.ts` — Added `embeddingDimensions` to PersistOptions
- `packages/cli/src/commands/index.command.ts` — Full `--model` override with auto-pull, dimension discovery, mismatch detection, re-index confirmation, interactive selection fallback
- `scripts/install-ollama.sh` — Replaced hardcoded pull with `select_embedding_model()` interactive menu
- `scripts/init-config.sh` — Consumes SELECTED_EMBED_MODEL/SELECTED_EMBED_DIMS env vars
- `scripts/detect-project.mjs` — Accepts optional embedModel/embedDims args, passes to persistProfile

## Decisions Made
- discoverDimensions uses 3-tier priority: DEFAULT_DIMENSIONS (instant) → /api/show (metadata) → /api/embed probe (always works). This avoids unnecessary API calls for known models while handling arbitrary custom models.
- Model mismatch detection compares both dimensions AND model name — even same-dimension models produce semantically incompatible vectors.
- Used node:readline/promises for interactive CLI prompts (built-in, handles Ctrl-C properly) instead of raw process.stdin.
- saveLastIndexedCommit accepts optional 4th parameter for backward compatibility — existing callers don't need to change.
- Install-time menu shows all locally available models (not filtered to embedding-only) with [embed] hints on known embedding models.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None — all features are fully wired and functional.

## Next Phase Readiness
- Feature complete — users can select, switch, and manage Ollama embedding models
- No blockers for future work

## Self-Check: PASSED

- All 12 files verified present
- All 3 task commits verified in git log (08735e5, a0eacc9, 6d5b611)
- Full monorepo test suite: 22/22 tasks passed
- Full monorepo build: 14/14 tasks passed
- `--model` flag verified in CLI help output
- All scripts pass syntax validation (bash -n, node --check)
