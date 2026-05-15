---
phase: 37-query-complexity-classifier
plan: 01
subsystem: mcp-server
tags: [classification, heuristics, regex, query-routing]

requires: []
provides:
  - classifyQuery function for routing queries to keyword vs semantic search
  - ClassificationRules config schema for user overrides
affects: [38-line-number-aware-chunking, 41-hybrid-retrieval-tuning]

tech-stack:
  added: []
  patterns: [pattern-based heuristic classification, ordered-regex priority matching]

key-files:
  created:
    - packages/mcp-server/src/classification/query-classifier.ts
    - packages/mcp-server/src/classification/query-classifier.test.ts
    - packages/mcp-server/src/classification/index.ts
  modified:
    - packages/core/src/config/schema.ts
    - packages/core/src/config/schema.test.ts

key-decisions:
  - 'Pattern order: camelCase before PascalCase to avoid false matches on getUserById-style names'
  - "maxKeywordWords default 6 (not 8) to prevent conceptual questions like 'what is the architecture of X' from being classified as keyword"

patterns-established:
  - 'Classification module: pure function, no side effects, configurable via rules object'

requirements-completed: [QCC-01, QCC-03, QCC-05]

duration: 5min
completed: 2026-05-15
---

# Phase 37 Plan 01: Query Complexity Classifier Summary

**Pure pattern-based query classifier (keyword vs semantic) with 18 test cases and configurable rules via RetrievalConfigSchema**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-15T16:10:53Z
- **Completed:** 2026-05-15T16:16:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- classifyQuery function classifies queries into keyword/semantic with confidence scores
- Handles PascalCase, camelCase, dot-notation, quoted strings, lookup verbs
- Config schema extended with optional classificationRules for user overrides
- Performance verified: 1000 classifications in <50ms

## Task Commits

Each task was committed atomically:

1. **Task 1: Classifier module with tests (TDD)** - `53975a2` (feat)
2. **Task 2: Extend config schema with classificationRules** - `c679ebb` (feat)

## Files Created/Modified

- `packages/mcp-server/src/classification/query-classifier.ts` - Core classifier function
- `packages/mcp-server/src/classification/query-classifier.test.ts` - 18 test cases
- `packages/mcp-server/src/classification/index.ts` - Barrel export
- `packages/core/src/config/schema.ts` - ClassificationRulesSchema added
- `packages/core/src/config/schema.test.ts` - 5 new schema validation tests

## Decisions Made

- Pattern order adjusted: camelCase checked before PascalCase multi-word to avoid false positives on camelCase identifiers
- maxKeywordWords set to 6 (plan suggested 8) — queries like "what is the architecture of the payment system" must remain semantic

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pattern matching order for symbol detection**

- **Found during:** Task 1
- **Issue:** PascalCase multi-word regex `/[A-Z][a-z]+[A-Z]/` matched camelCase identifiers like `getUserById`
- **Fix:** Reordered patterns: camelCase first, then dot-notation, then PascalCase
- **Files modified:** packages/mcp-server/src/classification/query-classifier.ts
- **Committed in:** 53975a2

**2. [Rule 1 - Bug] Adjusted maxKeywordWords default from 8 to 6**

- **Found during:** Task 1
- **Issue:** "what is the architecture of the payment system" (8 words) was classified as keyword due to "what is" being a lookup verb
- **Fix:** Reduced maxKeywordWords to 6 so longer conceptual questions fall through to semantic
- **Files modified:** packages/mcp-server/src/classification/query-classifier.ts
- **Committed in:** 53975a2

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Pattern ordering and threshold fixes ensure correct classification behavior per spec.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Classifier ready for integration in plan 37-02
- Config schema ready for runtime loading via loadConfig()

---

_Phase: 37-query-complexity-classifier_
_Completed: 2026-05-15_
