---
phase: 14-llm-chunking-implementation-cli
plan: 03
subsystem: cli
tags: [ollama, llm-chunking, cli, qdrant, collection-routing]

# Dependency graph
requires:
  - phase: 14-llm-chunking-implementation-cli (plan 01)
    provides: CodeChunk description/semantic fields, LlmConfigSchema, description-aware text embedding
  - phase: 14-llm-chunking-implementation-cli (plan 02)
    provides: LlmChunkingStrategy, ollama-client (isOllamaReachable, getModelInfo), content-hash cache
provides:
  - "--strategy llm" CLI flag for LLM chunking invocation
  - Ollama connectivity fail-fast verification at CLI level
  - Chunking model availability check with interactive pull/selection prompt
  - Collection routing: ast→{project}, llm→{project}-llm
  - Per-file chunking progress display during LLM strategy execution
  - Cache load/save lifecycle management at CLI level
  - Strategy field in indexing progress JSON for dashboard awareness
affects: [dashboard, mcp-server, retrieval]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Collection routing by strategy suffix (-llm)"
    - "CLI-level Ollama health check before LLM operations"
    - "Interactive model pull/selection fallback flow"

key-files:
  created: []
  modified:
    - packages/cli/src/commands/index.command.ts
    - packages/indexer/src/index.ts
    - packages/indexer/src/strategies/index.ts

key-decisions:
  - "Collection routing uses suffix pattern ({project}-llm) to keep AST and LLM chunks separate"
  - "Ollama verification happens before any LLM work — fail-fast with clear instructions"
  - "Chunking model defaults to llama3.2:latest when not configured in project.json"

patterns-established:
  - "Strategy-based collection routing: base collection for AST, suffixed for alternative strategies"
  - "Pre-flight infrastructure checks: verify external services before starting long operations"

requirements-completed: [CLIE-01, CLIE-02, CLIE-03, RETR-07]

# Metrics
duration: 5min
completed: 2026-04-10
---

# Phase 14 Plan 03: CLI LLM Strategy Integration Summary

**`--strategy llm` CLI flag wiring LlmChunkingStrategy with Ollama verification, model management, collection routing, and per-file progress**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-10T20:22:59Z
- **Completed:** 2026-04-10T20:27:59Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Wired `--strategy ast|llm` flag into the CLI index command with full LLM chunking lifecycle
- Ollama connectivity verification with fail-fast error before any LLM work begins
- Chunking model availability check with interactive pull prompt and fallback selection from available models
- Collection routing: AST chunks → `{project}`, LLM chunks → `{project}-llm` for separate storage
- Per-file chunking progress bar during LLM strategy execution via `onFileProgress` callback
- Cache load/save lifecycle at CLI boundary — loads before pipeline, saves after
- Strategy field added to all indexing progress JSON objects for dashboard awareness

## Task Commits

Each task was committed atomically:

1. **Task 1: Add --strategy flag with LLM chunking integration** - `ea64103` (feat)
2. **Task 2: Integration verification** - No commit (verification-only — all workspace typecheck/build/test passed clean)

**Plan metadata:** pending

## Files Created/Modified

- `packages/cli/src/commands/index.command.ts` - Added `--strategy` option, Ollama verification, model management, collection routing, LlmChunkingStrategy creation with progress callback, cache lifecycle
- `packages/indexer/src/index.ts` - Added `isOllamaReachable` to barrel exports (deviation fix)
- `packages/indexer/src/strategies/index.ts` - Added `isOllamaReachable` re-export from ollama-client

## Decisions Made

- **Collection routing uses suffix pattern**: `{project}-llm` keeps AST and LLM chunks in separate Qdrant collections, enabling independent querying and avoiding chunk type confusion
- **Ollama verification is fail-fast**: CLI checks connectivity before any work, exiting with clear "Start it with: ollama serve" message
- **Default chunking model is llama3.2:latest**: Falls back when no `indexing.llm.model` configured in project.json — matches Plan 02's default
- **Reused existing model management patterns**: pullModel and promptModelSelection functions reused for chunking model management, maintaining consistent UX

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added isOllamaReachable to barrel exports**

- **Found during:** Task 1 (Add --strategy flag)
- **Issue:** `isOllamaReachable` was implemented in Plan 02 but not exported from `@ia-framework/indexer` barrel — CLI import would fail
- **Fix:** Added export to `packages/indexer/src/strategies/index.ts` and re-export in `packages/indexer/src/index.ts`
- **Files modified:** packages/indexer/src/index.ts, packages/indexer/src/strategies/index.ts
- **Verification:** `pnpm turbo typecheck --filter=@ia-framework/cli` passes
- **Committed in:** ea64103 (Task 1 commit)

**2. [Rule 3 - Blocking] Hoisted BAR_WIDTH constant before LLM strategy block**

- **Found during:** Task 1 (Add --strategy flag)
- **Issue:** Plan suggested using `BAR_WIDTH` in the LLM progress callback, but the constant was declared inside `renderProgress` closure — would be undefined in the LLM block
- **Fix:** Hoisted `const BAR_WIDTH = 20` to before the LLM strategy setup block so both the LLM progress callback and renderProgress closure can use it
- **Files modified:** packages/cli/src/commands/index.command.ts
- **Verification:** Typecheck and build pass
- **Committed in:** ea64103 (Task 1 commit)

**3. [Rule 3 - Blocking] Added ChunkingStrategy type import**

- **Found during:** Task 1 (Add --strategy flag)
- **Issue:** `let chunkingStrategy: ChunkingStrategy | undefined` needed the type import which wasn't in the existing imports
- **Fix:** Added `ChunkingStrategy` to the type import from `@ia-framework/indexer`
- **Files modified:** packages/cli/src/commands/index.command.ts
- **Verification:** Typecheck passes
- **Committed in:** ea64103 (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (3 blocking)
**Impact on plan:** All auto-fixes were necessary for the code to compile. No scope creep — purely mechanical fixes for missing exports and type imports.

## Issues Encountered

None — integration verification (Task 2) passed cleanly on the first run. All 24 typecheck targets, 14 build targets, and 23 test targets passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Phase 14 complete**: All three plans delivered — core types & pipeline (01), LlmChunkingStrategy & cache (02), and CLI integration (03)
- **LLM chunking is end-to-end functional**: `ia-framework index --strategy llm` works with Ollama verification, model management, separate collection storage, and caching
- **Ready for retrieval-side work**: The `{project}-llm` collection can be queried by updating the MCP server/retrieval layer to support multi-collection search
- **Dashboard already aware**: Strategy field in progress JSON means the dashboard can distinguish AST vs LLM indexing runs

---

_Phase: 14-llm-chunking-implementation-cli_
_Completed: 2026-04-10_
