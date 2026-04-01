---
phase: "03-indexing-pipeline"
plan: "01"
subsystem: "ast-parser"
tags: ["tree-sitter", "ast", "chunking", "typescript", "parsing"]
dependency_graph:
  requires: ["01-02"]
  provides: ["CodeChunk[]", "parseFile()"]
  affects: ["03-04-indexer"]
tech_stack:
  added: ["tree-sitter@0.21.1", "tree-sitter-typescript@0.21.2"]
  patterns: ["per-language parser instance", "AST-aware chunking", "deterministic sha1 chunk IDs"]
key_files:
  created:
    - packages/ast-parser/src/types.ts
    - packages/ast-parser/src/parsers/typescript.ts
    - packages/ast-parser/src/chunker.ts
    - packages/ast-parser/src/chunker.test.ts
    - packages/ast-parser/src/index.ts
    - packages/ast-parser/package.json
    - packages/ast-parser/tsconfig.json
    - packages/ast-parser/tsup.config.ts
  modified:
    - package.json
    - pnpm-lock.yaml
decisions:
  - "Per-language parser instances (tsParser, tsxParser) to avoid shared state issues in Vitest test isolation"
  - "JavaScript files use TSX grammar (superset) for correct parsing"
  - "Files with only imports (no declarations) return a single 'module' chunk"
  - "Chunk IDs are sha1(filePath:startLine:endLine) for deterministic incremental re-indexing"
  - "onlyBuiltDependencies in root package.json updated to allow tree-sitter native module compilation"
metrics:
  duration: "8 minutes"
  completed: "2026-04-01"
  tasks_completed: 3
  files_created: 8
  tests_added: 8
---

# Phase 3 Plan 01: AST Parser Summary

**One-liner:** Tree-sitter AST-aware chunker extracting TypeScript/JS code at function/class/interface boundaries with deterministic IDs.

## What Was Built

The `@ia-framework/ast-parser` package provides `parseFile(filePath, config?)` which:
1. Reads and parses the source file using tree-sitter's TypeScript/TSX grammar
2. Walks the AST top-level nodes, extracting declarations (functions, classes, interfaces, types, enums)
3. Returns `CodeChunk[]` with content, metadata (startLine, endLine, imports, exports), and deterministic IDs
4. Falls back to a single 'module' chunk for files with only imports or unsupported languages

## Decisions Made

1. **Per-language parser instances** — Shared Parser instance caused state corruption in Vitest tests when grammar was switched between test files. Using separate `tsParser` and `tsxParser` instances fixes this.
2. **JavaScript uses TSX grammar** — TSX is a superset that handles both JS and TS syntax, making it appropriate for parsing JavaScript files.
3. **Module chunk for import-only files** — Files that only contain imports (no declarations) still need to be indexed so their import relationships are captured.
4. **SHA1 chunk IDs** — Deterministic IDs based on filePath + line numbers enable accurate incremental re-indexing (delete old chunk, insert new).
5. **tree-sitter in onlyBuiltDependencies** — Native module needs build scripts enabled in pnpm config.

## Test Results

All 8 TDD tests pass:
- ✅ Function declaration detection with name extraction
- ✅ Class declaration detection with name extraction  
- ✅ Interface declaration detection with name extraction
- ✅ Import extraction from import_statement nodes
- ✅ Module chunk for import-only files
- ✅ Non-empty IDs and correct 1-indexed line numbers
- ✅ JavaScript file parsing (.js extension → tsx grammar)
- ✅ Error thrown for non-existent files

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Shared parser instance caused state corruption in tests**
- **Found during:** Task 2 (GREEN phase) - 7/8 tests failed with "Cannot read properties of undefined"
- **Issue:** Single shared `parser` instance; when grammar was switched between parallel test runs, the tree-sitter C binding's internal state became inconsistent
- **Fix:** Replaced shared `parser` with per-language lazy-initialized instances (`tsParser` for TypeScript, `tsxParser` for TSX/JavaScript)
- **Files modified:** packages/ast-parser/src/parsers/typescript.ts
- **Commit:** 962778d

## Self-Check: PASSED

- [x] packages/ast-parser/src/types.ts — FOUND
- [x] packages/ast-parser/src/parsers/typescript.ts — FOUND
- [x] packages/ast-parser/src/chunker.ts — FOUND
- [x] packages/ast-parser/src/chunker.test.ts — FOUND
- [x] packages/ast-parser/src/index.ts — FOUND
- [x] packages/ast-parser/dist/index.js — FOUND
- [x] Commit 962778d — FOUND
