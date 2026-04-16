---
phase: 14-llm-chunking-implementation-cli
plan: 02
subsystem: indexer
tags: [llm-chunking, ollama, content-hash-cache, chunking-strategy, semantic-chunks]

# Dependency graph
requires:
  - phase: 14-llm-chunking-implementation-cli
    provides: CodeChunk with description field and semantic chunkType, LlmConfigSchema
provides:
  - LlmChunkingStrategy implementing ChunkingStrategy with name='llm'
  - Content-hash LLM chunk cache (SHA-256 + model key)
  - Ollama /api/generate wrapper with connectivity check
  - Core chunking with auto-windowing for large files
  - Prompt builder with line-numbered source
affects: [14-03-PLAN, mcp-server, cli]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      content-hash caching for LLM results,
      retry-once-then-skip for Ollama,
      slugified chunk names from summaries,
    ]

key-files:
  created:
    - packages/indexer/src/strategies/ollama-client.ts
    - packages/indexer/src/strategies/prompt.ts
    - packages/indexer/src/strategies/llm-chunker.ts
    - packages/indexer/src/strategies/llm-cache.ts
    - packages/indexer/src/strategies/llm-cache.test.ts
    - packages/indexer/src/strategies/llm-strategy.ts
    - packages/indexer/src/strategies/llm-strategy.test.ts
  modified:
    - packages/indexer/src/strategies/index.ts
    - packages/indexer/src/index.ts

key-decisions:
  - 'Content-hash cache key is SHA-256(fileContent):modelName — different models produce different chunks'
  - 'Retry-once on Ollama failure per file (D-19) — try, retry, throw; pipeline already skips on error'
  - 'Chunk names slugified from first 5 words of LLM summary for human readability'
  - 'Chunk IDs are UUID-formatted SHA-256 of filePath:startLine:endLine for determinism'

patterns-established:
  - 'Content-hash caching: hash file content + model key to skip expensive LLM calls on unchanged files'
  - 'Spike-to-production port: copy validated spike code with minimal import path adjustments'

requirements-completed: [INDX-10, INDX-11, INDX-12]

# Metrics
duration: 3min
completed: 2026-04-10
---

# Phase 14 Plan 02: LlmChunkingStrategy & Content-Hash Cache Summary

**Ported spike LLM chunking code into production indexer strategies and implemented LlmChunkingStrategy with SHA-256 content-hash cache, producing semantic CodeChunks with LLM prose summaries**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-10T19:36:31Z
- **Completed:** 2026-04-10T19:39:35Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Ported 3 spike files (ollama-client, prompt, llm-chunker) into production `packages/indexer/src/strategies/` with validated logic preserved
- Implemented LlmChunkingStrategy: ChunkingStrategy with name='llm', producing CodeChunk[] with chunkType='semantic' and description from LLM summaries
- Content-hash cache (LlmChunkCache) prevents redundant Ollama calls — SHA-256 of file content + model name as key
- Auto-windowing for large files exceeding context window (ported from spike)
- 12 new tests (6 cache, 6 strategy) all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Port spike code into indexer strategies** - `171b641` (feat)
2. **Task 2: LlmChunkingStrategy class and content-hash cache** - `cec3e59` (feat)

## Files Created/Modified

- `packages/indexer/src/strategies/ollama-client.ts` - Ollama /api/generate wrapper with isOllamaReachable, generateChunks, getModelInfo
- `packages/indexer/src/strategies/prompt.ts` - Prompt builder with line-numbered source for LLM chunking
- `packages/indexer/src/strategies/llm-chunker.ts` - Core chunking with auto-windowing and stitching for large files
- `packages/indexer/src/strategies/llm-cache.ts` - Content-hash LLM chunk cache with JSON persistence
- `packages/indexer/src/strategies/llm-cache.test.ts` - 6 tests for cache: miss, hit, model isolation, load/save, resilience
- `packages/indexer/src/strategies/llm-strategy.ts` - LlmChunkingStrategy implementing ChunkingStrategy interface
- `packages/indexer/src/strategies/llm-strategy.test.ts` - 6 tests for strategy: name, chunk output, cache hit/miss, naming, IDs
- `packages/indexer/src/strategies/index.ts` - Added LlmChunkingStrategy and LlmChunkCache exports
- `packages/indexer/src/index.ts` - Added LlmChunkingStrategy, LlmChunkCache, and type exports

## Decisions Made

- Content-hash cache key is `SHA-256(fileContent):modelName` — different models produce different chunk boundaries so cache must be per-model
- Retry-once on Ollama failure per file (D-19) — try once, if fails retry, if still fails throw (pipeline handles skip)
- Chunk names derived from first 5 words of LLM summary, slugified (e.g., "handles-user-authentication-and-session")
- Chunk IDs are UUID-formatted SHA-256 of `filePath:startLine:endLine` — deterministic and consistent with Phase 03 pattern

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- LlmChunkingStrategy is ready to be plugged into IndexingPipeline via CLI flag (`--strategy llm`)
- Plan 03 will implement CLI integration: strategy selection, Ollama connectivity check, and model selection
- Cache load/save lifecycle will be managed by CLI indexing command

---

## Self-Check: PASSED

All 9 key files verified present. Both task commits (171b641, cec3e59) verified in git log.

_Phase: 14-llm-chunking-implementation-cli_
_Completed: 2026-04-10_
