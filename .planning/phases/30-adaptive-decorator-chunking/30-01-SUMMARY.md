---
plan: 30-01
phase: 30-adaptive-decorator-chunking
status: complete
completed: 2026-04-30
commit: e530887
key-files:
  created:
    - packages/ast-parser/src/parsers/java.test.ts
  modified:
    - packages/ast-parser/src/types.ts
    - packages/core/src/types/index.ts
    - packages/ast-parser/src/parsers/java.ts
---

## Summary

Added `'aspect'` to the `chunkType` union in both `packages/ast-parser/src/types.ts` and `packages/core/src/types/index.ts`.

Updated the Java parser (`java.ts`) with two major behaviours:

1. **Annotation-inclusive method chunks**: `collectDeclarations()` now scans backward through sibling nodes to find `marker_annotation` and `annotation` nodes preceding each method/constructor. The `effectiveStartLine` is extended upward to include them, so annotation text appears at the start of method chunk content.
2. **@Aspect class detection**: New `hasAspectAnnotation()` function checks a `class_declaration`'s `modifiers` children for `@Aspect`. When detected, the entire class is emitted as a single chunk with `chunkType: 'aspect'` and recursion is skipped.
3. **buildPreamble enhancement**: Accepts `includeClassAnnotations` flag; when methods are extracted from an `@Aspect` class (if class is large enough to split), class-level annotations appear in the preamble.

Created `java.test.ts` with 5 tests covering all behaviours. All 67 ast-parser tests pass.

## Self-Check: PASSED

- ✓ `packages/ast-parser/src/types.ts` contains `| 'aspect'`
- ✓ `packages/core/src/types/index.ts` contains `| 'aspect'`
- ✓ `hasAspectAnnotation` function present in `java.ts`
- ✓ `marker_annotation` string present in `java.ts`
- ✓ All 67 `@ia-framework/ast-parser` tests pass
