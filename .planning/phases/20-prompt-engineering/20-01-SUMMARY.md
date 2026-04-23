---
phase: 20-prompt-engineering
plan: 01
subsystem: indexer
tags: [prompt-engineering, llm-chunking, few-shot-examples, vitest, tdd]

requires: []
provides:
  - Enhanced LLM chunking prompt with class grouping rules and intent-focused guidance
  - Few-shot example loader with custom override and built-in Java defaults
  - Default Java OrderService examples illustrating good/bad chunk boundaries
affects:
  - llm-chunking
  - chunk-quality

tech-stack:
  added: []
  patterns:
    - 'TDD: RED-GREEN cycle for prompt enhancement tests'
    - 'Optional parameter extension for backward-compatible API evolution'
    - 'Module-level example caching via instance field in LlmChunkingStrategy'

key-files:
  created:
    - packages/indexer/src/strategies/prompt-examples.ts
    - packages/indexer/src/strategies/prompt-examples.test.ts
    - packages/indexer/src/strategies/prompt.test.ts
    - packages/indexer/src/strategies/default-examples/good-boundary.md
    - packages/indexer/src/strategies/default-examples/bad-boundary.md
  modified:
    - packages/indexer/src/strategies/prompt.ts
    - packages/indexer/src/strategies/llm-chunker.ts
    - packages/indexer/src/strategies/llm-strategy.ts

key-decisions:
  - 'Examples injected as optional third parameter to buildPrompt() for backward compatibility'
  - 'Example caching in LlmChunkingStrategy instance to avoid repeated disk reads per file'
  - 'Default examples use Java OrderService to illustrate class-boundary principle language-agnostically'

patterns-established:
  - 'Few-shot example injection pattern: optional parameter, no examples = no section in prompt'
  - 'LLM prompt rules follow class > method > size hierarchy'

requirements-completed:
  - PRMT-01
  - PRMT-02
  - PRMT-03

duration: 4min
completed: 2026-04-23
---

# Phase 20 Plan 01: Prompt Engineering — Chunk Boundary Rules Summary

**Enhanced LLM chunking prompt with class grouping rules, minimum 5-line size enforcement, domain terminology guidance, and few-shot Java boundary examples via configurable example loader**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-23T12:36:01Z
- **Completed:** 2026-04-23T12:40:57Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- `loadPromptExamples()` loads good/bad chunk boundary examples with fallback to built-in Java defaults
- `buildPrompt()` enhanced with class+method grouping, 100-line split, 5-line minimum, and domain terminology rules
- Few-shot examples injected when provided; backward compatible when not
- `LlmChunkingStrategy` accepts `examplesDir`, loads examples on first chunk call

## Task Commits

1. **Task 1 (RED):** `e9880f0` test — failing tests for prompt example loader
2. **Task 1 (GREEN):** `0ad123b` feat — implement prompt example loader with Java defaults
3. **Task 2 (RED):** `5c70e85` test — failing tests for enhanced buildPrompt
4. **Task 2 (GREEN):** `0ad446e` feat — enhance buildPrompt with class rules, intent guidance, and few-shot examples

## Files Created/Modified

- `packages/indexer/src/strategies/prompt-examples.ts` — example loader with configDir + defaults fallback
- `packages/indexer/src/strategies/prompt-examples.test.ts` — 6 tests: defaults, custom, fallback
- `packages/indexer/src/strategies/prompt.test.ts` — 10 tests: class rules, domain terminology, example injection
- `packages/indexer/src/strategies/default-examples/good-boundary.md` — Java OrderService correct single-chunk example
- `packages/indexer/src/strategies/default-examples/bad-boundary.md` — Java OrderService incorrect split example
- `packages/indexer/src/strategies/prompt.ts` — enhanced buildPrompt with new rules and optional examples param
- `packages/indexer/src/strategies/llm-chunker.ts` — chunkFile/chunkFileWithWindowing accept examples param
- `packages/indexer/src/strategies/llm-strategy.ts` — LlmChunkingStrategy examplesDir + cached examples loading

## Decisions Made

- Examples are optional (backward compatible) — callers that don't pass examples get the enhanced rules but no few-shot section
- Examples cached after first load in strategy instance to avoid N file reads for N files
- Java chosen for default examples: strongly-typed, class-heavy — best illustrates the class boundary principle

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Prompt enhancement complete — Phase 20 Plan 02 (summary quality evaluation) can proceed
- `LlmChunkingStrategy` constructor accepts `examplesDir` for project-specific customization

---

_Phase: 20-prompt-engineering_
_Completed: 2026-04-23_
