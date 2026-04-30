---
phase: 30-adaptive-decorator-chunking
verified: 2026-04-30T14:39:30Z
status: passed
score: 5/5 must-haves verified
---

# Phase 30: Adaptive Decorator Chunking — Verification Report

**Phase Goal:** Ensure that Java annotations and TypeScript/JavaScript decorators are preserved in code chunks produced by the AST parser, so that AI agents retrieving chunks always see the annotations alongside the code they annotate.

**Verified:** 2026-04-30T14:39:30Z
**Status:** ✅ passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                      | Status     | Evidence                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `'aspect'` added to `chunkType` union in both packages                                     | ✓ VERIFIED | `packages/ast-parser/src/types.ts` line 24; `packages/core/src/types/index.ts` line 25                                                                                            |
| 2   | Java `@Aspect` class → single `aspect` chunk containing annotation                         | ✓ VERIFIED | `java.ts` `hasAspectAnnotation()` + `aspect` branch at line 233; chunker integration test line 842 asserts `chunks[0].content` contains `@Aspect`                                 |
| 3   | Java method annotations (`@Transactional`, etc.) included in method chunk                  | ✓ VERIFIED | `java.ts` backward-sibling scan lines 258–287; `buildPreamble(includeClassAnnotations)` logic; chunker test line 838 asserts `@Transactional` in chunk content                    |
| 4   | TypeScript/JS decorators (`@Injectable`, `@Get`, etc.) included in class and method chunks | ✓ VERIFIED | `typescript.ts` `export_statement` span logic lines 211–233; `extractClassMembers` backward decorator scan lines 158–161; tests at lines 886, 905, 927–967 all pass               |
| 5   | LLM prompt rule prevents future annotation splits                                          | ✓ VERIFIED | `packages/indexer/src/strategies/prompt.ts` line 112: explicit "Never split a decorator or annotation…" rule; `good-boundary.md` Spring AOP `@Aspect` few-shot example at line 54 |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact                                                            | Purpose                                                                        | Status     | Details                                                                       |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------- | ----------------------------------------------------------------------------- |
| `packages/ast-parser/src/types.ts`                                  | `'aspect'` in `chunkType` union                                                | ✓ VERIFIED | Line 24 confirmed                                                             |
| `packages/core/src/types/index.ts`                                  | `'aspect'` in `chunkType` union                                                | ✓ VERIFIED | Line 25 confirmed                                                             |
| `packages/ast-parser/src/parsers/java.ts`                           | `hasAspectAnnotation()`, backward-sibling scan, `includeClassAnnotations` flag | ✓ VERIFIED | Lines 105–287 substantive implementation                                      |
| `packages/ast-parser/src/parsers/typescript.ts`                     | Decorator-inclusive class/method chunks                                        | ✓ VERIFIED | Lines 134–272 substantive; export_statement unwrapping + decorator collection |
| `packages/ast-parser/src/parsers/java.test.ts`                      | 5 Java annotation unit tests                                                   | ✓ VERIFIED | File exists, all 75 tests pass                                                |
| `packages/ast-parser/src/chunker.test.ts`                           | 5 integration tests in `decorator and annotation preservation` describe block  | ✓ VERIFIED | Lines 820–925 confirmed, all pass                                             |
| `packages/indexer/src/strategies/prompt.ts`                         | Anti-split annotation rule                                                     | ✓ VERIFIED | Line 112                                                                      |
| `packages/indexer/src/strategies/default-examples/good-boundary.md` | Spring AOP `@Aspect` few-shot example                                          | ✓ VERIFIED | Lines 54–93                                                                   |

---

### Commits

| Commit    | Plan  | Content                                                                         |
| --------- | ----- | ------------------------------------------------------------------------------- |
| `e530887` | 30-01 | `'aspect'` type + Java annotation-inclusive method chunking                     |
| `0633e18` | 30-02 | TS decorators in chunks + LLM annotation-preservation rule                      |
| `192f368` | 30-03 | Integration tests for decorator/annotation preservation + pre-existing test fix |

---

### Test Results

```
Test Files  4 passed (4)
     Tests  75 passed (75)
  Duration  394ms
```

All tests pass including 5 new integration tests in `describe('decorator and annotation preservation')` and 3 new unit tests in `describe('parseFile - TypeScript decorator inclusion')`.

---

### Anti-Patterns Found

None. Implementation is substantive throughout — no stubs, placeholders, or TODO comments found in changed files.

---

### Human Verification Required

None required for automated checks. Optionally, a developer could manually index a real Spring AOP or NestJS codebase and inspect the retrieved chunks to confirm end-to-end decorator fidelity in production Qdrant payloads — but this is not blocking.

---

## Summary

Phase 30 goal is **fully achieved**. Java annotations (method-level and class-level `@Aspect`) and TypeScript/JavaScript decorators are now preserved in AST chunks via:

1. **Backward-sibling scanning** in both Java and TypeScript parsers, pulling annotations/decorators into the same content span as their annotated node.
2. **`@Aspect` class detection** that emits a single unified `aspect` chunk instead of splitting the class body.
3. **LLM guardrails** in the indexer prompt strategy to prevent future regressions via chunking boundary instructions.
4. **Full test coverage** (75 passing tests across 4 files) including dedicated integration tests verifying annotation/decorator content in emitted chunks.

---

_Verified: 2026-04-30T14:39:30Z_
_Verifier: the agent (gsd-verifier)_
