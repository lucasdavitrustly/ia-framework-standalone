---
phase: 22-ast-aware-java-chunking
plan: '02'
subsystem: ast-parser
tags: [java, tree-sitter, chunking, spring-boot, preamble, vitest]

requires:
  - phase: 22-ast-aware-java-chunking
    provides: Java AST parser with preamble support (22-01)

provides:
  - Spring Boot integration test validating preamble on annotated classes
  - Fix for buildPreamble to correctly handle annotation-prefixed class declarations

affects:
  - ast-parser
  - indexer

tech-stack:
  added: []
  patterns:
    - 'buildPreamble scans for class/interface keyword line rather than using first node line'

key-files:
  created: []
  modified:
    - packages/ast-parser/src/chunker.test.ts
    - packages/ast-parser/src/parsers/java.ts

key-decisions:
  - 'Fix buildPreamble to scan for class/interface/enum/record keyword line — annotations like @RestController precede the class declaration in the AST node but should not appear as the signature'

patterns-established:
  - 'Preamble extraction: always scan up to 10 lines from node start for keyword line rather than assume first line is signature'

requirements-completed: []

duration: 5min
completed: 2026-04-28
---

# Phase 22 Plan 02: Spring Boot Integration Test & Preamble Fix Summary

**Spring Boot OrderController integration test validates preamble on @RestController-annotated classes; fixed buildPreamble to correctly capture class signature when annotations precede the declaration**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-28T13:22:00Z
- **Completed:** 2026-04-28T13:27:00Z
- **Tasks:** 1 auto + 1 optional checkpoint
- **Files modified:** 2

## Accomplishments

- Added `describe('parseFile — Java Spring Boot integration')` with 7 test cases covering annotations, generics, parentName, and chunk count
- Fixed `buildPreamble` in `java.ts` to scan for the actual `class`/`interface` keyword line (instead of using the first line of the declaration node, which is an annotation when Spring-style `@RestController` etc. are present)
- All 48 tests pass (up from 41 in 22-01)

## Task Commits

1. **Task 1: Add Spring Boot integration test + fix annotated class preamble** - `04383c7` (feat)

## Files Created/Modified

- `packages/ast-parser/src/chunker.test.ts` — Added Spring Boot integration describe block (7 tests)
- `packages/ast-parser/src/parsers/java.ts` — Fixed buildPreamble to locate class signature line past annotations

## Decisions Made

- Fixed `buildPreamble` signature extraction: scan lines from node start looking for `\b(class|interface|enum|record)\b` rather than blindly using first line — handles all annotation patterns correctly

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed buildPreamble to handle annotation-prefixed class declarations**

- **Found during:** Task 1 (test execution)
- **Issue:** `buildPreamble` used `sourceLines[declStartRow]` which returned `@RestController` for annotated classes — the class signature line was never included in the preamble
- **Fix:** Scan lines from `declStartRow` up to `declStartRow + 10` looking for the line containing `class`/`interface`/`enum`/`record` keyword
- **Files modified:** packages/ast-parser/src/parsers/java.ts
- **Verification:** All 48 tests pass including the new Spring Boot tests asserting `public class OrderController` in preamble
- **Committed in:** 04383c7

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix — Spring Boot codebases universally use class-level annotations; without this fix preambles would omit the class signature.

## Issues Encountered

None beyond the auto-fixed bug above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 22 complete: Java AST chunking with preamble support fully tested including real-world Spring Boot patterns
- Ready for next phase

---

_Phase: 22-ast-aware-java-chunking_
_Completed: 2026-04-28_
