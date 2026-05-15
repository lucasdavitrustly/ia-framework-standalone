# Context — Phase 38: Line-Number-Aware Chunking

## Phase Goal

Surface line-number metadata in MCP search responses so LLM consumers can cite exact source locations (e.g., `EntryController.java:51-78`).

## Key Discovery

**LNC-01, LNC-02, LNC-03 are already satisfied by existing code.** Line numbers flow end-to-end:

- `CodeChunk.startLine/endLine` — `packages/ast-parser/src/types.ts:29-32`
- AST chunker emits them from tree-sitter ranges
- LLM chunker requires them in its JSON schema
- `ChunkPayload.startLine/endLine` — `packages/vector-store/src/interface.ts:14-15`
- Pipeline copies them — `packages/indexer/src/pipeline.ts:142-143`
- `RetrievalResult.startLine/endLine` — `packages/retrieval/src/search-engine.ts:24-25,50-51`

**The only gap is `formatResult()` in `packages/mcp-server/src/tools/search-codebase.ts:183-194`** — it has access to line numbers but does not render them in the output.

## Scope

This phase is **small** — primarily a formatting change in one function, plus optional validation in the indexer.

## Decisions

### D-01: LNC-01/02/03 Pre-Met

LNC-01 (AST chunker emits lines), LNC-02 (LLM chunker preserves lines), and LNC-03 (Qdrant payload includes lines) are already implemented. No work needed. Phase execution should verify with tests but not re-implement.

### D-02: Line Number Display Format (LNC-04)

**Decision:** Header suffix format — append `:startLine-endLine` to the file path in the result header.

**Before:**

```
### 1. src/Foo.ts (FooClass) — score: 0.85 [semantic]
```

**After:**

```
### 1. src/Foo.ts:10-25 (FooClass) — score: 0.85 [semantic]
```

**Rationale:** Compact, mimics IDE/compiler conventions (`file:line`), no extra lines consuming tokens, immediately parseable by LLMs for citation.

**Location:** `formatResult()` in `packages/mcp-server/src/tools/search-codebase.ts:183-194`

### D-03: Line Number Validation (LNC-05)

**Decision:** Warn and index. When `endLine > actual file line count`, log a structured warning via pino but still index the chunk.

**Rationale:** Bad line numbers are rare (tree-sitter is reliable). Blocking/skipping risks data loss. Warnings surface issues for debugging without disrupting indexing.

**Location:** Validation should be added in `packages/indexer/src/pipeline.ts` after chunk creation, before upsert.

### D-04: No Re-Index Required

**Decision:** Existing indexed data already contains `startLine`/`endLine` in Qdrant payloads. Deploying the `formatResult()` change is sufficient — results will immediately include line numbers.

**Rationale:** The pipeline has stored line numbers since initial implementation. No migration or re-index needed.

## Canonical References

| Ref   | File                                               | Lines        | What                                    |
| ----- | -------------------------------------------------- | ------------ | --------------------------------------- |
| CR-01 | `packages/ast-parser/src/types.ts`                 | 29-32        | CodeChunk startLine/endLine definition  |
| CR-02 | `packages/vector-store/src/interface.ts`           | 14-15        | ChunkPayload startLine/endLine          |
| CR-03 | `packages/indexer/src/pipeline.ts`                 | 142-143      | Pipeline copies line numbers to payload |
| CR-04 | `packages/retrieval/src/search-engine.ts`          | 24-25, 50-51 | RetrievalResult carries line numbers    |
| CR-05 | `packages/mcp-server/src/tools/search-codebase.ts` | 183-194      | formatResult() — THE GAP                |

## Requirements Mapping

| Requirement | Status       | Decision                                           |
| ----------- | ------------ | -------------------------------------------------- |
| LNC-01      | Pre-met      | D-01 — AST chunker already emits startLine/endLine |
| LNC-02      | Pre-met      | D-01 — LLM chunker already preserves line numbers  |
| LNC-03      | Pre-met      | D-01 — Qdrant payload already includes fields      |
| LNC-04      | To implement | D-02 — Header suffix format in formatResult()      |
| LNC-05      | To implement | D-03 — Warn and index on mismatch                  |
