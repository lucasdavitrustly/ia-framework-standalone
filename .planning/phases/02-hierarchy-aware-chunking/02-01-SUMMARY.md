---
phase: 02-hierarchy-aware-chunking
plan: '01'
subsystem: ast-parser
tags: [tree-sitter, java, typescript, chunking, inheritance, hierarchy, tdd]

requires: []
provides:
  - CodeChunk interface with superclass, interfaces, and isInnerClass fields
  - Java parser extracts extends/implements hierarchy from class_declaration and interface_declaration
  - TypeScript parser extracts extends/implements hierarchy from class_heritage and extends_type_clause
  - Inner/nested Java classes marked with isInnerClass=true and parentName set to outer class
affects:
  - 02-hierarchy-aware-chunking
  - packages/mcp-server (uses CodeChunk type)
  - packages/core (indexer stores CodeChunk fields)

tech-stack:
  added: []
  patterns:
    - TDD RED-GREEN cycle for AST feature additions
    - Probe tree-sitter AST structure at runtime before implementing extraction

key-files:
  created:
    - packages/ast-parser/src/types.test.ts (extended)
    - packages/ast-parser/src/chunker.test.ts (extended)
  modified:
    - packages/ast-parser/src/types.ts
    - packages/ast-parser/src/parsers/java.ts
    - packages/ast-parser/src/parsers/typescript.ts

key-decisions:
  - 'Java interface extends: uses extends_interfaces → type_list node structure (not super_interfaces)'
  - 'TypeScript generic extends: identifier is a direct child of extends_clause, not wrapped in generic_type (unlike Java)'
  - 'Inner class parentName: set explicitly for top-level declarations inside another class (previously only methods got parentName)'

patterns-established:
  - 'Probe AST at runtime to confirm field names before implementing extraction'
  - 'Use spread operator with conditional object for optional chunk fields (avoids setting undefined values)'

requirements-completed:
  - HIER-01
  - HIER-03

duration: 5min
completed: 2026-04-29
---

# Phase 02 Plan 01: Hierarchy Fields Summary

**Class inheritance metadata (extends/implements) extracted from Java and TypeScript ASTs into CodeChunk fields — superclass, interfaces, isInnerClass**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-29T18:44:33Z
- **Completed:** 2026-04-29T18:49:32Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Extended `CodeChunk` interface with `superclass`, `interfaces`, `isInnerClass` optional fields
- Java parser extracts `extends` clause into `superclass`, `implements` into `interfaces`, handles generics
- TypeScript parser extracts `class_heritage` → `extends_clause` + `implements_clause`, interface `extends_type_clause`
- Inner/nested Java classes now carry `isInnerClass=true` and `parentName` pointing to outer class
- All 62 existing tests still pass (no regressions)

## Task Commits

1. **Task 1 RED: Type hierarchy tests** - `d513332` (test)
2. **Task 1 GREEN: Extend CodeChunk type** - `0e20740` (feat)
3. **Task 2 RED: Java hierarchy tests** - `a9c7ed1` (test)
4. **Task 2 GREEN: Java hierarchy extraction** - `d5c1c30` (feat)
5. **Task 3 RED: TypeScript hierarchy tests** - `185da5c` (test)
6. **Task 3 GREEN: TypeScript hierarchy extraction** - `fe6857d` (feat)

## Files Created/Modified

- `packages/ast-parser/src/types.ts` — Added superclass, interfaces, isInnerClass optional fields
- `packages/ast-parser/src/types.test.ts` — Added 4 tests for hierarchy fields
- `packages/ast-parser/src/parsers/java.ts` — Added extractSuperclass(), extractInterfaces(), inner class detection
- `packages/ast-parser/src/parsers/typescript.ts` — Added extractHeritage() for class and interface nodes
- `packages/ast-parser/src/chunker.test.ts` — Added 10 tests: 6 Java + 4 TypeScript hierarchy tests

## Decisions Made

- Java and TypeScript have different AST structures for generics: Java wraps in `generic_type` node, TypeScript uses `identifier` + sibling `type_arguments`. Each parser handles accordingly.
- Inner class `parentName` was previously only set for method members. Extended to also apply to top-level declarations nested inside another class.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript return type incompatibility with exactOptionalPropertyTypes**

- **Found during:** Task 3 (extractHeritage return type)
- **Issue:** Returning `{ superclass: string | undefined }` is incompatible with `{ superclass?: string }` under strict exactOptionalPropertyTypes
- **Fix:** Used explicit `result` object and only assigned properties when they have values
- **Files modified:** packages/ast-parser/src/parsers/typescript.ts
- **Verification:** LSP errors cleared, all tests pass
- **Committed in:** fe6857d (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Minor type compatibility fix. No scope creep.

## Issues Encountered

None.

## Next Phase Readiness

- Plan 02-01 complete — hierarchy fields ready for Phase 02 Plan 02 (retrieval weighting using these fields)
- All CodeChunk consumers (indexer, MCP server) are forward-compatible since fields are optional

---

_Phase: 02-hierarchy-aware-chunking_
_Completed: 2026-04-29_

## Self-Check: PASSED
- types.ts, java.ts, typescript.ts: FOUND
- All 6 task commits present
