---
phase: 19-baseline-score-filtering
plan: '03'
subsystem: indexer
tags: [prompt-versioning, llm-cache, cache-invalidation, cli]

requires: []
provides:
  - Prompt version included in LLM cache keys (auto-invalidates on version change)
  - PROMPT_CONTENT_HASH exported for tracking prompt changes
  - LlmChunkingStrategy.getMetadata() returns version + content hash
  - ia-framework prompt bump CLI command increments promptVersion in project.json
affects: [indexer, cli, llm-chunking]

tech-stack:
  added: []
  patterns:
    - 'Cache key format: {contentHash}:{model}:{promptVersion} — three-segment key for per-version isolation'
    - "Prompt content hash computed at module load time via sha256(buildPrompt('','').trim()).slice(0,8)"

key-files:
  created:
    - packages/indexer/src/__tests__/prompt-versioning.test.ts
    - packages/cli/src/commands/prompt.command.ts
  modified:
    - packages/indexer/src/strategies/prompt.ts
    - packages/indexer/src/strategies/llm-cache.ts
    - packages/indexer/src/strategies/llm-strategy.ts
    - packages/indexer/src/strategies/llm-cache.test.ts
    - packages/indexer/src/strategies/llm-strategy.test.ts
    - packages/cli/src/bin.ts
    - packages/cli/src/index.ts

key-decisions:
  - 'Cache key format changed to {hash}:{model}:{version} — existing caches auto-miss (desired)'
  - 'promptVersion defaults to 1 when not set in config — backward compatible'
  - 'PROMPT_CONTENT_HASH computed at module load time, not passed as param — stable within a process'

patterns-established:
  - 'Three-segment cache key: hash:model:version for compound cache isolation'
  - 'getMetadata() pattern on strategy classes for collection-level metadata'

requirements-completed:
  - BASE-03

duration: 6min
completed: 2026-04-22
---

# Phase 19 Plan 03: Prompt Versioning Summary

**Prompt version added to LLM cache key (hash:model:version format) with PROMPT_CONTENT_HASH export and `ia-framework prompt bump` CLI command**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-22T23:20:70Z
- **Completed:** 2026-04-22T23:27:00Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- LlmChunkCache now includes promptVersion as third cache key segment — changing version causes cache miss
- PROMPT_CONTENT_HASH exported from prompt.ts as 8-char sha256 of the prompt template text
- LlmChunkingStrategy.getMetadata() returns {promptVersion, promptContentHash} for Qdrant collection metadata
- `ia-framework prompt bump` CLI command reads/writes promptVersion in project.json

## Task Commits

1. **Task 1 RED: Failing tests** - `9dd01a1` (test)
2. **Task 1 GREEN: Implementation** - `455478f` (feat)
3. **Task 2: CLI prompt bump command** - `6fdcff1` (feat)

## Files Created/Modified

- `packages/indexer/src/strategies/prompt.ts` — Added PROMPT_CONTENT_HASH export
- `packages/indexer/src/strategies/llm-cache.ts` — Updated makeKey/get/set to include promptVersion
- `packages/indexer/src/strategies/llm-strategy.ts` — Added promptVersion to options, getMetadata() method
- `packages/indexer/src/__tests__/prompt-versioning.test.ts` — New test file for versioning behavior
- `packages/indexer/src/strategies/llm-cache.test.ts` — Updated to use new 3-arg API
- `packages/indexer/src/strategies/llm-strategy.test.ts` — Updated to use new 3-arg API
- `packages/cli/src/commands/prompt.command.ts` — New CLI command
- `packages/cli/src/bin.ts` — Registered promptCommand
- `packages/cli/src/index.ts` — Exported promptCommand

## Decisions Made

- Cache key format changed from `hash:model` to `hash:model:version` — existing caches auto-miss (intentional, desired behavior)
- `promptVersion` defaults to 1 when absent from config — backward compatible with existing project.json files
- PROMPT_CONTENT_HASH computed at module load time (not passed as parameter) — deterministic within a process, changes when prompt template changes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated existing llm-cache and llm-strategy tests to match new 3-arg API**

- **Found during:** Task 1 GREEN (implementation)
- **Issue:** llm-cache.test.ts and llm-strategy.test.ts used old 2-argument get/set API which broke after signature change
- **Fix:** Updated all calls to pass promptVersion=1 as third argument
- **Files modified:** packages/indexer/src/strategies/llm-cache.test.ts, packages/indexer/src/strategies/llm-strategy.test.ts
- **Verification:** All 77 tests pass
- **Committed in:** 455478f (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary fix — existing tests used old API. No scope creep.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Prompt versioning complete — cache auto-invalidates when promptVersion changes in project.json
- PROMPT_CONTENT_HASH available for Qdrant collection metadata (actual write is for indexer orchestration layer)
- Ready for remaining Phase 19 plans

---

_Phase: 19-baseline-score-filtering_
_Completed: 2026-04-22_
