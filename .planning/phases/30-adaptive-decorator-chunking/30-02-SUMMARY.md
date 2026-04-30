---
plan: 30-02
phase: 30-adaptive-decorator-chunking
status: complete
completed: 2026-04-30
commit: 0633e18
key-files:
  created: []
  modified:
    - packages/ast-parser/src/parsers/typescript.ts
    - packages/ast-parser/src/chunker.test.ts
    - packages/indexer/src/strategies/prompt.ts
    - packages/indexer/src/strategies/default-examples/good-boundary.md
---

## Summary

**Task 1 — TypeScript decorator chunks:**

- Top-level class decorators: in tree-sitter-typescript, the `export_statement` node already starts at the decorator line, so `child.startPosition.row + 1` naturally includes decorators for exported classes.
- For non-exported classes, added `exportDecorators`/`targetDecorators` detection to extend `effectiveStartLine` upward.
- `extractClassMembers()` now scans backward through class body siblings to find `decorator` nodes preceding each method, extending `effectiveStart` to include them.

**Task 2 — LLM prompt + AOP example:**

- Added anti-split rule to `packages/indexer/src/strategies/prompt.ts`: "Never split a decorator or annotation from the method or class it annotates."
- Added Spring AOP `@Aspect` few-shot example to `good-boundary.md` showing `AuditAspect` class kept as a single chunk.

All 70 `@ia-framework/ast-parser` tests and 110 `@ia-framework/indexer` tests pass.

## Self-Check: PASSED

- ✓ `packages/ast-parser/src/parsers/typescript.ts` contains `decorator` string
- ✓ `packages/indexer/src/strategies/prompt.ts` contains "Never split a decorator or annotation"
- ✓ `packages/indexer/src/strategies/default-examples/good-boundary.md` contains "@Aspect" and "AuditAspect"
- ✓ All ast-parser and indexer tests pass
